import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

type Payload = { email?: string; displayName?: string; temporaryPassword?: string };

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

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ email, display_name: displayName, role: "student", provisioned: true })
    .eq("id", created.user.id);

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: "Student profile could not be provisioned." }, 500);
  }

  return json({
    ok: true,
    student: { id: created.user.id, email, displayName },
    emailConfirmationRequired: false,
  }, 201);
});