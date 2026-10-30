// Supabase Edge Function: send-daily-events
//
// Checks the family tree for birthdays and death anniversaries falling on "today" (Pakistan
// time, UTC+5, since the family is based there) and pushes one combined notification if there
// are any. Meant to run once a day from a Supabase Cron Trigger, not from the app - there is no
// signed-in caller here, so it reads the family data with the service-role key instead of the
// anon key + caller JWT pattern the other functions use.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via Editor,
// name it "send-daily-events", paste this file, turn "Verify JWT" OFF (cron calls have no
// user JWT), then Deploy.
//
// Then add a Cron Trigger (Edge Functions -> send-daily-events -> Triggers -> Add cron trigger):
//   schedule: a time in the morning, Pakistan time - e.g. "0 2 * * *" (2am UTC = 7am PKT)
//   HTTP header: x-cron-secret: <the same value as the CRON_SECRET secret below>
// This header is required - without it the function refuses the request, so it can't be
// triggered by just anyone who finds the URL.
//
// Secrets needed (Edge Functions -> Manage secrets):
//   CRON_SECRET - any random string you choose; put the same value in the cron trigger's header.
//   FIREBASE_SERVICE_ACCOUNT_JSON - already set for send-announcement/send-live, reused here.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Sends to the "sajra_events" FCM topic - an opt-in toggle ("Family birthday & remembrance
// notifications" in Settings), unlike sajra_live which every install auto-subscribes to.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const FCM_TOPIC = "sajra_events";
const MAX_NAMES_IN_BODY = 3;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface Member {
  id: number;
  name: string;
  dob?: string | null;
  dod?: string | null;
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

/** "Today" in Pakistan time (UTC+5, no DST), as [month (0-11), day]. */
function todayInPakistan(): [number, number] {
  const shifted = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return [shifted.getUTCMonth(), shifted.getUTCDate()];
}

/** True when a "YYYY-MM-DD..." date string's month/day matches today's, in Pakistan time. */
function matchesToday(value: string | null | undefined, month: number, day: number): boolean {
  if (!value) return false;
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(value);
  if (!match) return false;
  return Number(match[1]) - 1 === month && Number(match[2]) === day;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!url || !serviceRoleKey || !cronSecret || !serviceAccountJson) return fail("Function is not configured.", 500);

  if (req.headers.get("x-cron-secret") !== cronSecret) return fail("Unauthorized.", 401);

  try {
    const admin = createClient(url, serviceRoleKey);
    const { data, error } = await admin.from("sajra_state").select("state").eq("id", "main").maybeSingle();
    if (error) return fail(`Could not read family data: ${error.message}`, 500);
    const members = Array.isArray((data?.state as { members?: unknown })?.members) ? ((data!.state as { members: Member[] }).members) : [];

    const [month, day] = todayInPakistan();
    const birthdays = members.filter((member) => matchesToday(member.dob, month, day));
    const anniversaries = members.filter((member) => matchesToday(member.dod, month, day));

    if (!birthdays.length && !anniversaries.length) return respond({ ok: true, sent: false, reason: "No events today." });

    const parts: string[] = [];
    if (birthdays.length) {
      const names = birthdays.slice(0, MAX_NAMES_IN_BODY).map((member) => member.name).join(", ");
      const rest = birthdays.length > MAX_NAMES_IN_BODY ? ` +${birthdays.length - MAX_NAMES_IN_BODY} more` : "";
      parts.push(`Birthday: ${names}${rest}`);
    }
    if (anniversaries.length) {
      const names = anniversaries.slice(0, MAX_NAMES_IN_BODY).map((member) => member.name).join(", ");
      const rest = anniversaries.length > MAX_NAMES_IN_BODY ? ` +${anniversaries.length - MAX_NAMES_IN_BODY} more` : "";
      parts.push(`In memory of: ${names}${rest}`);
    }
    const body = parts.join(" | ");

    const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
    const accessToken = await getGoogleAccessToken(serviceAccount, "https://www.googleapis.com/auth/firebase.messaging");

    const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          topic: FCM_TOPIC,
          data: { type: "events", title: "Today in the family", body }
        }
      })
    });
    if (!fcmResponse.ok) return fail(`FCM send failed: ${await fcmResponse.text()}`, 502);
    return respond({ ok: true, sent: true, birthdays: birthdays.length, anniversaries: anniversaries.length });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Something went wrong.", 500);
  }
});
