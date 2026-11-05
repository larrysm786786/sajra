// Reads aggregate, city-level active-user counts from GA4. The Google service
// account key stays in Supabase secrets and is never included in web/APK bundles.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

interface ServiceAccount { client_email: string; private_key: string; }
function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(encoder.encode(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  })));
  const input = `${header}.${claims}`;
  const pem = account.private_key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(input));
  const assertion = `${input}.${base64url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const result = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Google sign-in failed.");
  return result.access_token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceAccountJson = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON") || Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!url || !anonKey || !serviceAccountJson) return respond({ error: "Live map needs the Google Analytics service account configured in Supabase Edge Function secrets." }, 503);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } } });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return respond({ error: "Sign in to Sajra admin first." }, 401);
  const role = data.user.app_metadata?.role;
  if (role === "editor" || role === "contributor") return respond({ error: "Only admins can view live visitor locations." }, 403);

  try {
    const account = JSON.parse(serviceAccountJson) as ServiceAccount;
    const token = await getGoogleToken(account);
    const response = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/560778321:runRealtimeReport", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dimensions: [{ name: "city" }, { name: "country" }],
        metrics: [{ name: "activeUsers" }],
        limit: "100",
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }]
      })
    });
    const report = await response.json().catch(() => ({})) as {
      rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
      error?: { message?: string; details?: { reason?: string }[] };
    };
    if (!response.ok) {
      const detail = report.error?.message || "Google Analytics rejected the live report.";
      if (response.status === 403) {
        const apiDisabled = report.error?.details?.some((item) => item.reason === "SERVICE_DISABLED");
        const help = apiDisabled
          ? `Enable the Google Analytics Data API in Google Cloud project ${account.project_id}.`
          : `In GA4 Property 560778321, add ${account.client_email} under Admin → Property access management and assign Viewer role.`;
        return respond({ error: `GA4 access is not ready. ${help}` }, 424);
      }
      return respond({ error: detail }, 502);
    }
    const cities = (report.rows ?? []).map((row) => ({
      city: row.dimensionValues?.[0]?.value ?? "Unknown",
      country: row.dimensionValues?.[1]?.value ?? "Unknown",
      activeUsers: Number(row.metricValues?.[0]?.value ?? 0)
    })).filter((row) => row.city !== "Unknown" && row.city !== "(not set)" && row.country !== "Unknown" && row.activeUsers > 0);
    return respond({ cities, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("GA4 realtime request failed:", error);
    return respond({ error: error instanceof Error ? error.message : "Unable to fetch Google Analytics realtime data." }, 502);
  }
});
