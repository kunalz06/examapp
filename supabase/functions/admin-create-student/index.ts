import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import nodemailer from "npm:nodemailer@10.0.13";

type Payload = { email?: string; displayName?: string; temporaryPassword?: string };
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

async function smtpConfig(adminClient: ReturnType<typeof createClient>): Promise<SmtpConfig> {
  const { data, error } = await adminClient.rpc("get_smtp_runtime_config");
  if (error || !data) throw new Error("SMTP configuration unavailable");
  return data as SmtpConfig;
}

async function sendWelcomeEmail(config: SmtpConfig, to: string, name: string, password: string, otp: string) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: Boolean(config.secure),
    auth: { user: config.username, pass: config.password },
  });

  const safeName = escapeHtml(name);
  const safePassword = escapeHtml(password);
  const safeOtp = escapeHtml(otp);

  await transport.sendMail({
    from: `ExamCore <${config.from}>`,
    to,
    subject: "Your ExamCore student account",
    text: `Hello ${name},

Your ExamCore student account has been created.

Email: ${to}
Temporary password: ${password}
Email verification code: ${otp}

The verification code expires in 5 minutes. A maximum of two verification emails may be sent in a 5-minute window, with at least 2.5 minutes between sends.

Sign in at https://examapp-seven.vercel.app/login and enter the verification code when prompted.

For security, change your temporary password after signing in.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2>ExamCore student account</h2>
      <p>Hello ${safeName},</p>
      <p>Your student account has been created.</p>
      <p><strong>Email:</strong> ${escapeHtml(to)}<br>
      <strong>Temporary password:</strong> <code>${safePassword}</code></p>
      <p>Your 5-digit email verification code is:</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:8px;margin:18px 0">${safeOtp}</div>
      <p>This code expires in 5 minutes. Verification emails are limited to two per 5 minutes, with a minimum 2.5-minute gap.</p>
      <p>Sign in at <strong>examapp-seven.vercel.app/login</strong> and enter this code when prompted.</p>
      <p>For security, change the temporary password after signing in.</p>
    </div>`,
  });
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

  const { data: caller } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (caller?.role !== "admin") return json({ error: "Admin access required." }, 403);

  const payload = await req.json().catch(() => null) as Payload | null;
  const email = String(payload?.email ?? "").trim().toLowerCase();
  const displayName = String(payload?.displayName ?? "").trim();
  const temporaryPassword = String(payload?.temporaryPassword ?? "");

  if (!email || !email.includes("@") || email.length > 320) return json({ error: "Enter a valid student email address." }, 400);
  if (displayName.length < 2 || displayName.length > 120) return json({ error: "Student name must be between 2 and 120 characters." }, 400);
  if (temporaryPassword.length < 8 || temporaryPassword.length > 128) return json({ error: "Temporary password must be between 8 and 128 characters." }, 400);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: {
      account_type: "student",
      provisioned: true,
      provisioned_by: authData.user.id,
    },
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "Unable to create student account.";
    return json({ error: message }, /already|registered|exists/i.test(message) ? 409 : 400);
  }

  const studentId = created.user.id;
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      email,
      display_name: displayName,
      role: "student",
      provisioned: true,
      email_verified: false,
      email_verified_at: null,
    })
    .eq("id", studentId);

  if (profileError) {
    await adminClient.auth.admin.deleteUser(studentId);
    return json({ error: "Student profile could not be provisioned." }, 500);
  }

  const otp = fiveDigitCode();
  const { data: challenge, error: challengeError } = await adminClient.rpc("issue_student_email_otp", {
    p_user_id: studentId,
    p_code: otp,
  });

  if (challengeError || !challenge?.ok) {
    await adminClient.auth.admin.deleteUser(studentId);
    return json({ error: "Verification code could not be issued." }, 500);
  }

  try {
    const config = await smtpConfig(adminClient);
    await sendWelcomeEmail(config, email, displayName, temporaryPassword, otp);
  } catch {
    if (challenge.challengeId) {
      await adminClient.rpc("cancel_student_email_otp", { p_challenge_id: challenge.challengeId });
    }
    await adminClient.auth.admin.deleteUser(studentId);
    return json({ error: "Account email could not be delivered. The account was not created." }, 502);
  }

  return json({
    ok: true,
    student: { id: studentId, email, displayName },
    emailConfirmationRequired: true,
    verificationRetryAfter: challenge.retryAfter ?? 150,
  }, 201);
});