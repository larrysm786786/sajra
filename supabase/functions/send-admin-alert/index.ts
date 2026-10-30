// Supabase Edge Function: send-admin-alert
//
// Pushes a notification to admins when a visitor quietly does something that previously only
// showed up if an admin happened to open the Suggestions section or a member's Guestbook - a new
// suggestion or a new guestbook comment. Unlike send-announcement/send-live, this is called by
// visitors who are NOT signed in (Suggestions and Guestbook both work without login), so it
// can't require a caller JWT; "Verify JWT" is OFF and there is no caller-auth check in the code
// below. Input is strictly bounded (short, fixed kinds) to limit what a spammy caller could do.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via Editor,
// name it "send-admin-alert", paste this file, turn "Verify JWT" OFF, then Deploy.
//
// Uses the same FIREBASE_SERVICE_ACCOUNT_JSON secret as the other send-* functions - no extra
// secret needed if that one is already set.
//
// Sends to the "sajra_admin_alerts" FCM topic - an opt-in toggle only shown to admin accounts
// in Settings (AppUpdater.tsx), not auto-subscribed and not visible to editors/contributors.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const FCM_TOPIC = "sajra_admin_alerts";
const MAX_BODY_LENGTH = 160;
const MAX_NAME_LENGTH = 60;

type AlertKind = "suggestion" | "guestbook";

interface RequestBody {
  kind?: string;
  message?: string;
  authorName?: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fail(message: string, status = 400): Response {
  return respond({ error: message }, status);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(serviceAccount: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(
    encoder.encode(
      JSON.stringify({ iss: serviceAccount.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })
    )
  );
  const signingInput = `${header}.${claims}`;

  const pem = serviceAccount.private_key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyBytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signingInput));
  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt })
  });
  if (!tokenResponse.ok) throw new Error(`Google token exchange failed: ${await tokenResponse.text()}`);
  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("Google token exchange returned no access_token.");
  return tokenJson.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) return fail("Function is not configured.", 500);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.");
  }
  const kind = body.kind === "suggestion" || body.kind === "guestbook" ? (body.kind as AlertKind) : null;
  const message = (body.message ?? "").trim();
  const authorName = (body.authorName ?? "").trim().slice(0, MAX_NAME_LENGTH);
  if (!kind || !message) return fail("A valid kind and message are required.");

  const title = kind === "suggestion" ? "New suggestion" : "New guestbook message";
  const truncated = message.length > MAX_BODY_LENGTH ? `${message.slice(0, MAX_BODY_LENGTH - 1)}…` : message;
  const body_ = authorName ? `${authorName}: ${truncated}` : truncated;

  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
    const accessToken = await getGoogleAccessToken(serviceAccount, "https://www.googleapis.com/auth/firebase.messaging");

    const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { topic: FCM_TOPIC, data: { type: "admin_alert", title, body: body_ } }
      })
    });
    if (!fcmResponse.ok) return fail(`FCM send failed: ${await fcmResponse.text()}`, 502);
    return respond({ ok: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Something went wrong.", 500);
  }
});
