import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import nodemailer from "npm:nodemailer@10.0.13";

type Payload = { action?: "status" | "verify" | "resend"; code?: string };
type SmtpConfig = { host: string; port: number; secure: boolean; username: string; password: string; from: string };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function readNamedKey(name: string): string | null {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
}

function fiveDigitCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 100000).padStart(5, "0");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char] ?? char));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = readNamedKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? readNamedKey("SUPABASE_SECRET_KEYS");
  if (!url || !publicKey || !secretKey) return json({ error: "Server configuration is incomplete." }, 500);

  const userClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id,email,display_name,role,provisioned,email_verified")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "student" || !profile.provisioned || !profile.email) {
    return json({ error: "Student access required." }, 403);
  }

  const payload = await req.json().catch(() => ({})) as Payload;
  const action = payload.action ?? "status";

  if (action === "status") {
    const { data, error } = await userClient.rpc("get_student_email_verification_status");
    if (error) return json({ error: error.message }, 400);
    return json(data as Record<string, unknown>);
  }

  if (action === "verify") {
    const code = String(payload.code ?? "").trim();
    if (!/^\d{5}$/.test(code)) return json({ error: "Enter the 5-digit verification code." }, 400);

    const { data, error } = await userClient.rpc("verify_student_email_otp", { p_code: code });
    if (error) return json({ error: error.message }, 400);
    return json(data as Record<string, unknown>, data?.ok ? 200 : 400);
  }

  if (profile.email_verified) return json({ ok: true, verified: true });

  const otp = fiveDigitCode();
  const { data: challenge, error: challengeError } = await adminClient.rpc("issue_student_email_otp", {
    p_user_id: profile.id,
    p_code: otp,
  });

  if (challengeError) return json({ error: "Verification code could not be issued." }, 500);
  if (!challenge?.ok) {
    return json({
      error: "A new code cannot be sent yet.",
      reason: challenge?.reason,
      retryAfter: challenge?.retryAfter ?? 150,
    }, 429);
  }

  try {
    const { data: configData, error: configError } = await adminClient.rpc("get_smtp_runtime_config");
    if (configError || !configData) throw new Error("SMTP configuration unavailable");
    const config = configData as SmtpConfig;
    const transport = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port),
      secure: Boolean(config.secure),
      auth: { user: config.username, pass: config.password },
    });

    const name = profile.display_name || "Student";
    await transport.sendMail({
      from: `ExamCore <${config.from}>`,
      to: profile.email,
      subject: "Your ExamCore verification code",
      text: `Hello ${name},

Your ExamCore email verification code is: ${otp}

The code expires in 5 minutes. Verification emails are limited to two per 5 minutes, with at least 2.5 minutes between sends.

If you did not request this code, contact your examination administrator.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>ExamCore email verification</h2>
        <p>Hello ${escapeHtml(name)},</p>
        <p>Your 5-digit verification code is:</p>
        <div style="font-size:30px;font-weight:700;letter-spacing:8px;margin:18px 0">${otp}</div>
        <p>The code expires in 5 minutes. Verification emails are limited to two per 5 minutes, with a minimum 2.5-minute gap.</p>
      </div>`,
    });
  } catch {
    if (challenge.challengeId) {
      await adminClient.rpc("cancel_student_email_otp", { p_challenge_id: challenge.challengeId });
    }
    return json({ error: "Verification email could not be delivered." }, 502);
  }

  return json({
    ok: true,
    retryAfter: challenge.retryAfter ?? 150,
    expiresIn: challenge.expiresIn ?? 300,
  });
});