import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fail(message: string, status = 400): Response { return respond({ error: message }, status); }

function hashToken(token: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((hash) =>
    Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, max) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return fail("Function is not configured.", 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Invalid request."); }
  const action = String(body.action ?? "");
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (action === "create_link") {
    const authorization = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await caller.auth.getUser();
    if (error || !user) return fail("Sign in with an account allowed to edit member profiles.", 401);
    const role = user.app_metadata?.role;
    if (role === "editor" || role === "contributor") {
      const directory = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data: archive, error: archiveError } = await directory.from("sajra_state").select("state").eq("id", "main").maybeSingle();
      const granted = !archiveError && archive?.state?.users?.some((entry: { email?: string; permissions?: { editMember?: boolean } }) =>
        entry.email?.trim().toLowerCase() === user.email?.trim().toLowerCase() &&
        (entry.permissions?.editMember === true || (role === "contributor" && entry.permissions?.editMember === undefined))
      );
      if (!granted) return fail("This account is not allowed to edit existing member profiles.", 403);
    }
    const memberId = Number(body.memberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) return fail("Invalid member.");

    const { data: archive, error: readError } = await admin.from("sajra_state").select("state").eq("id", "main").maybeSingle();
    if (readError || !archive) return fail("Could not load the Sajra archive.", 500);
    const exists = Array.isArray(archive.state?.members) && archive.state.members.some((member: { id?: number }) => member.id === memberId);
    if (!exists) return fail("Member not found.", 404);

    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const tokenHash = await hashToken(token);
    const now = new Date().toISOString();
    const { error: revokeError } = await admin.from("profile_update_links").update({ revoked_at: now }).eq("member_id", memberId).is("revoked_at", null).is("used_at", null);
    if (revokeError) return fail("Could not replace the previous profile link.", 500);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("profile_update_links").insert({ token_hash: tokenHash, member_id: memberId, created_by: user.id, expires_at: expiresAt });
    if (insertError) return fail("Could not create a secure profile link.", 500);
    return respond({ token, expiresAt });
  }

  if (action === "validate_link") {
    const memberId = Number(body.memberId);
    const token = typeof body.token === "string" ? body.token : "";
    if (!Number.isSafeInteger(memberId) || memberId <= 0 || token.length < 32 || token.length > 128) return respond({ valid: false });
    const tokenHash = await hashToken(token);
    const { data, error } = await admin.from("profile_update_links").select("member_id,expires_at,used_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
    const valid = !error && data?.member_id === memberId && !data.used_at && !data.revoked_at && new Date(data.expires_at).getTime() > Date.now();
    return respond({ valid });
  }

  if (action === "submit_update") {
    const memberId = Number(body.memberId);
    const token = typeof body.token === "string" ? body.token : "";
    if (!Number.isSafeInteger(memberId) || memberId <= 0 || token.length < 32 || token.length > 128) return fail("This profile link is invalid or expired.", 403);
    const photo = cleanText(body.photo, 1_500_000);
    if (photo && !(photo.startsWith("data:image/") || /^https:\/\//i.test(photo))) return fail("The profile photo must be an image.");
    const publications = Array.isArray(body.publications) ? body.publications.slice(0, 12).map((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        title: cleanText(item.title, 180) ?? "",
        publisher: cleanText(item.publisher, 120),
        year: cleanText(item.year, 12),
        url: cleanText(item.url, 500),
        coverUrl: cleanText(item.coverUrl, 1_500_000),
        fileUrl: cleanText(item.fileUrl, 1_500_000)
      };
    }).filter((item) => item.title) : [];
    const payload = {
      photo,
      bio: cleanText(body.bio, 5000),
      contact: cleanText(body.contact, 200),
      profession: cleanText(body.profession, 100),
      publications
    };
    const tokenHash = await hashToken(token);
    const { data, error } = await admin.rpc("append_public_sajra_action", {
      p_action: "profile_update", p_payload: { memberId, ...payload }, p_token_hash: tokenHash
    });
    if (error) return fail(error.message.includes("invalid") || error.message.includes("used") ? "This profile link is invalid, expired, or already used." : "Could not send the profile for review.", 403);
    return respond({ request: data });
  }

  if (["suggestion", "feedback", "dua", "guestbook"].includes(action)) {
    const message = cleanText(body.message, action === "feedback" ? 1200 : 2000);
    if (!message) return fail("Please enter a message.");
    const payload: Record<string, unknown> = { message };
    if (action === "suggestion") {
      const memberId = body.memberId == null ? null : Number(body.memberId);
      if (memberId !== null && (!Number.isSafeInteger(memberId) || memberId <= 0)) return fail("Invalid member.");
      payload.memberId = memberId;
      payload.submitterName = cleanText(body.submitterName, 100);
    }
    if (action === "dua") payload.requesterName = cleanText(body.requesterName, 100);
    if (action === "guestbook") {
      const memberId = Number(body.memberId);
      if (!Number.isSafeInteger(memberId) || memberId <= 0) return fail("Invalid member.");
      payload.memberId = memberId;
      payload.authorName = cleanText(body.authorName, 100);
    }
    if (action === "feedback") payload.submitterName = "Anis Ai visitor feedback";
    const { data, error } = await admin.rpc("append_public_sajra_action", { p_action: action, p_payload: payload, p_token_hash: null });
    if (error) return fail("Could not save your message.", 500);
    return respond({ item: data });
  }

  return fail("Unsupported action.");
});
