import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

type CreateStudentPayload = {
  email?: string;
  displayName?: string;
  temporaryPassword?: string;
  redirectOrigin?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function readNamedKey(envName: string): string | null {
  const raw = Deno.env.get(envName);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = readNamedKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = readNamedKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Server configuration is incomplete." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  const { data: callerProfile, error: callerError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (callerError || callerProfile?.role !== "admin") {
    return json({ error: "Admin access required." }, 403);
  }

  let payload: CreateStudentPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const displayName = String(payload.displayName ?? "").trim();
  const temporaryPassword = String(payload.temporaryPassword ?? "");
  const redirectOrigin = String(payload.redirectOrigin ?? "").replace(/\/$/, "");

  if (!email || !email.includes("@") || email.length > 320) {
    return json({ error: "Enter a valid student email address." }, 400);
  }
  if (displayName.length < 2 || displayName.length > 120) {
    return json({ error: "Student name must be between 2 and 120 characters." }, 400);
  }
  if (temporaryPassword.length < 8 || temporaryPassword.length > 128) {
    return json({ error: "Temporary password must be between 8 and 128 characters." }, 400);
  }
  if (!/^https?:\/\//i.test(redirectOrigin)) {
    return json({ error: "Invalid redirect origin." }, 400);
  }

  const redirectTo = `${redirectOrigin}/login?verified=1`;
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { display_name: displayName },
  });

  if (inviteError || !inviteData.user) {
    const message = inviteError?.message ?? "Unable to create student account.";
    const status = /already|registered|exists/i.test(message) ? 409 : 400;
    return json({ error: message }, status);
  }

  const studentId = inviteData.user.id;
  const appMetadata = {
    ...(inviteData.user.app_metadata ?? {}),
    account_type: "student",
    provisioned: true,
    provisioned_by: authData.user.id,
  };

  const { error: passwordError } = await adminClient.auth.admin.updateUserById(studentId, {
    password: temporaryPassword,
    app_metadata: appMetadata,
  });

  if (passwordError) {
    await adminClient.auth.admin.deleteUser(studentId);
    return json({ error: "Student account could not be finalized." }, 500);
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      email,
      display_name: displayName,
      role: "student",
      provisioned: true,
    })
    .eq("id", studentId);

  if (profileError) {
    await adminClient.auth.admin.deleteUser(studentId);
    return json({ error: "Student profile could not be provisioned." }, 500);
  }

  return json({
    ok: true,
    student: { id: studentId, email, displayName },
    verificationSent: true,
  }, 201);
});
