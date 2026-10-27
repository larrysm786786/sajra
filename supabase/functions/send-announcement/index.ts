// Supabase Edge Function: send-announcement
//
// Called right after an admin posts an announcement (see submitAnnouncement in src/App.tsx), so
// it reaches everyone's phone as a real push notification, not just something you see if you open
// the Notifications page. The Firebase service account never reaches the browser, this function
// checks the caller is a signed-in admin, then signs its own Google OAuth token and calls FCM.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via Editor,
// name it "send-announcement", paste this file, keep "Verify JWT" ON, then Deploy.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.
//
// One extra secret is needed (Edge Functions -> Manage secrets):
//   FIREBASE_SERVICE_ACCOUNT_JSON - the same service account JSON already used by the
//   "Build Sajra Android APK" GitHub Actions workflow (secrets.FIREBASE_SERVICE_ACCOUNT_JSON there).
//   Paste the whole JSON file's contents as the secret's value.
//
// Sends to the "sajra_announcements" FCM topic - a separate opt-in from app-update notifications,
// see the "Family announcement notifications" toggle in AppUpdater.tsx.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const FCM_TOPIC = "sajra_announcements";
const MAX_BODY_LENGTH = 180;

interface RequestBody {
  message?: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
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

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Signs a short-lived Google OAuth access token with the service account's own key (RS256 JWT), so this function never needs a long-lived API key sitting in the browser. */
async function getGoogleAccessToken(serviceAccount: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(
    encoder.encode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600
      })
    )
  );
  const signingInput = `${header}.${claims}`;

  const pem = serviceAccount.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signingInput));
  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!tokenResponse.ok) throw new Error(`Google token exchange failed: ${await tokenResponse.text()}`);
  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("Google token exchange returned no access_token.");
  return tokenJson.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!url || !anonKey || !serviceAccountJson) return fail("Function is not configured.", 500);

  // Who is calling? Use the caller's own token, never trust the request body.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }
  });
  const { data: callerData, error: callerError } = await caller.auth.getUser();
  const me = callerData?.user;
  if (callerError || !me) return fail("You must be signed in.", 401);
  if (me.app_metadata?.role === "editor" || me.app_metadata?.role === "contributor") {
    return fail("Only admins can send announcement notifications.", 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.");
  }
  const message = (body.message ?? "").trim();
  if (!message) return fail("A message is required.");

  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
    const accessToken = await getGoogleAccessToken(serviceAccount, "https://www.googleapis.com/auth/firebase.messaging");

    // Sent as a data-only message (no top-level "notification" field) on purpose: with a
    // "notification" field, Android auto-displays it when the app is backgrounded and never
    // calls into the app at all, which is why the badge/sound couldn't be made reliable before.
    // A data-only message always reaches AppMessagingService.java (android/app/src/main/java/
    // com/sajra/familytree/AppMessagingService.java), which builds the notification itself and
    // bumps the app icon badge, whether the app is open, backgrounded, or fully closed.
    const fcmResponse = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            topic: FCM_TOPIC,
            data: {
              type: "announcement",
              title: "Sajra announcement",
              body: message.length > MAX_BODY_LENGTH ? `${message.slice(0, MAX_BODY_LENGTH - 1)}…` : message
            }
          }
        })
      }
    );

    if (!fcmResponse.ok) return fail(`FCM send failed: ${await fcmResponse.text()}`, 502);
    return respond({ ok: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Something went wrong.", 500);
  }
});
