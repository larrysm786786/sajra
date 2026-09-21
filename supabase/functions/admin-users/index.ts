// Supabase Edge Function: admin-users
//
// Lets a signed-in admin create / update / delete login accounts from the Sajra
// admin panel. The browser never sees the service-role key; this function checks
// the caller's session first and only then uses the admin API.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via Editor,
// name it "admin-users", paste this file, keep "Verify JWT" ON, then Deploy.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Roles are stored in each account's app_metadata.role ("admin" | "editor").
// Accounts with no role (e.g. created by hand in the dashboard) count as admins.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Role = "admin" | "editor";

interface RequestBody {
  action?: "create" | "update" | "delete";
  email?: string;
  password?: string;
  role?: string;
  name?: string;
}

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function fail(message: string, status = 400): Response {
  return respond({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return fail("Function is not configured.", 500);

  // 1. Who is calling? Use the caller's own token, never trust the request body.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }
  });
  const { data: callerData, error: callerError } = await caller.auth.getUser();
  const me = callerData?.user;
  if (callerError || !me) return fail("You must be signed in.", 401);
  if (me.app_metadata?.role === "editor") return fail("Only admins can manage users.", 403);

  // 2. Parse and validate the request.
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return fail("Enter a valid email address.");

  const role: Role = body.role === "admin" ? "admin" : "editor";
  const password = body.password ?? "";
  const name = (body.name ?? "").trim();

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  async function findByEmail(target: string) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.find((user) => user.email?.toLowerCase() === target) ?? null;
  }

  try {
    if (body.action === "create") {
      if (password.length < MIN_PASSWORD_LENGTH) {
        return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role },
        user_metadata: name ? { name } : {}
      });
      if (error) return fail(error.message);
      return respond({ ok: true, id: data.user?.id });
    }

    if (body.action === "update") {
      const target = await findByEmail(email);
      if (!target) return fail("No login account exists for that email yet.", 404);
      if (target.id === me.id && role === "editor") return fail("You cannot remove your own admin access.");
      if (password && password.length < MIN_PASSWORD_LENGTH) {
        return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        ...(password ? { password } : {}),
        app_metadata: { role }
      });
      if (error) return fail(error.message);
      return respond({ ok: true });
    }

    if (body.action === "delete") {
      const target = await findByEmail(email);
      if (!target) return respond({ ok: true, alreadyGone: true });
      if (target.id === me.id) return fail("You cannot delete your own account.");
      const { error } = await admin.auth.admin.deleteUser(target.id);
      if (error) return fail(error.message);
      return respond({ ok: true });
    }

    return fail("Unknown action.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Something went wrong.", 500);
  }
});
