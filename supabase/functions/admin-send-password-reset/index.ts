import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import nodemailer from "npm:nodemailer@10.0.13";

type Payload = { studentId?: string; redirectOrigin?: string };
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
  const secretKey = readNamedKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !secretKey) return json({ error: "Server configuration is incomplete." }, 500);

  const userClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(authHeader.slice(7));
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  const { data: caller } = await adminClient.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (caller?.role !== "admin") return json({ error: "Admin access required." }, 403);

  const payload = await req.json().catch(() => null) as Payload | null;
  const studentId = String(payload?.studentId ?? "");
  const redirectOrigin = String(payload?.redirectOrigin ?? "").replace(/\/$/, "");
  if (!studentId || !/^https?:\/\//i.test(redirectOrigin)) {
    return json({ error: "Invalid reset request." }, 400);
  }

  const { data: student } = await adminClient
    .from("profiles")
    .select("id,email,display_name,role,provisioned")
    .eq("id", studentId)
    .maybeSingle();

  if (!student || student.role !== "student" || !student.provisioned || !student.email) {
    return json({ error: "Student account not found." }, 404);
  }

  const { data: recovery, error: recoveryError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: student.email,
    options: { redirectTo: `${redirectOrigin}/account/recover` },
  });

  const actionLink = recovery?.properties?.action_link;
  if (recoveryError || !actionLink) {
    return json({ error: "Password recovery link could not be generated." }, 500);
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

    const name = student.display_name || "Student";
    await transport.sendMail({
      from: `ExamCore <${config.from}>`,
      to: student.email,
      subject: "Reset your ExamCore password",
      text: `Hello ${name},

An examination administrator initiated a password reset for your ExamCore account.

Open this secure link to choose a new password:
${actionLink}

If you did not expect this reset, contact your administrator.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>ExamCore password reset</h2>
        <p>Hello ${escapeHtml(name)},</p>
        <p>An examination administrator initiated a password reset for your account.</p>
        <p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Choose a new password</a></p>
        <p>If you did not expect this reset, contact your administrator.</p>
      </div>`,
    });
  } catch {
    return json({ error: "Password reset email could not be delivered." }, 502);
  }

  return json({ ok: true, emailSent: true });
});