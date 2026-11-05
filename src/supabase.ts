import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { createEmptyState, importJson } from "./lib";
import type { AppState, Role } from "./types";

const TABLE = "sajra_state";
const ROW_ID = "main";

let client: SupabaseClient | null = null;
let clientChecked = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (clientChecked) return client;
  clientChecked = true;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

function stateFromRaw(raw: unknown): AppState {
  try {
    if (typeof raw === "string") return importJson(raw);
    if (raw && typeof raw === "object") return importJson(JSON.stringify(raw));
  } catch {
    // fall through
  }
  return createEmptyState();
}

export interface RemoteState {
  state: AppState;
  updatedAt: string;
}

export async function loadSupabaseState(): Promise<RemoteState | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("state, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  if (!data) return null;

  return { state: stateFromRaw(data.state), updatedAt: data.updated_at as string };
}

/**
 * Saves state only if nobody else has saved since `expectedUpdatedAt` was
 * read (optimistic concurrency). Throws a StaleWriteError if someone else's
 * save landed first, so the caller can reload and ask the user to retry
 * instead of silently clobbering their edit.
 */
export class StaleWriteError extends Error {
  constructor() {
    super("Someone else saved changes since you loaded this page. Reload and try again.");
    this.name = "StaleWriteError";
  }
}

export async function saveSupabaseState(state: AppState, expectedUpdatedAt: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const nextUpdatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ state, updated_at: nextUpdatedAt })
    .eq("id", ROW_ID)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at");

  if (error) throw new Error(`Supabase write failed: ${error.message}`);
  if (!data || data.length === 0) throw new StaleWriteError();

  return nextUpdatedAt;
}

/** First-ever publish, used only when no row exists in Supabase yet. */
export async function publishInitialState(state: AppState): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const nextUpdatedAt = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .insert({ id: ROW_ID, state, updated_at: nextUpdatedAt });

  if (error) throw new Error(`Supabase publish failed: ${error.message}`);
  return nextUpdatedAt;
}

async function invokeProfileUpdates(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("profile-updates", { body });
  if (error) {
    let message = error.message;
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      const result = await response.json().catch(() => null);
      if (result?.error) message = String(result.error);
    }
    throw new Error(message);
  }
  if (!data || typeof data !== "object") throw new Error("The profile update service returned an invalid response.");
  if ("error" in data && data.error) throw new Error(String(data.error));
  return data as Record<string, unknown>;
}

export async function createProfileUpdateLink(memberId: number): Promise<string> {
  const result = await invokeProfileUpdates({ action: "create_link", memberId });
  if (typeof result.token !== "string") throw new Error("Could not create the secure profile link.");
  return result.token;
}

export async function validateProfileUpdateLink(memberId: number, token: string): Promise<boolean> {
  const result = await invokeProfileUpdates({ action: "validate_link", memberId, token });
  return result.valid === true;
}

export async function submitProfileUpdateLink(payload: {
  memberId: number; token: string; photo: string; bio: string; contact: string; profession: string; publications: AppState["members"][number]["publications"];
}): Promise<AppState["memberUpdateRequests"][number]> {
  const result = await invokeProfileUpdates({ action: "submit_update", ...payload });
  if (!result.request || typeof result.request !== "object") throw new Error("Could not save the profile request.");
  return result.request as AppState["memberUpdateRequests"][number];
}

export async function submitPublicSajraAction(action: "suggestion" | "feedback" | "dua" | "guestbook", payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await invokeProfileUpdates({ action, ...payload });
  if (!result.item || typeof result.item !== "object") throw new Error("Could not save your message.");
  return result.item as Record<string, unknown>;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOutSupabase(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSupabaseSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onSupabaseAuthChange(
  callback: (session: Session | null, event: AuthChangeEvent) => void
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export interface ManageUserRequest {
  action: "create" | "update" | "delete";
  email: string;
  password?: string;
  role?: Role;
  name?: string;
}

/**
 * Creates / updates / deletes a login account through the `admin-users` Edge
 * Function (supabase/functions/admin-users). The function checks that the caller
 * is a signed-in admin, so the service-role key never reaches the browser.
 */
export async function manageAuthUser(request: ManageUserRequest): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("admin-users", { body: request });
  if (error) {
    let message = error.message;
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      if (response.status === 404) {
        message = "The admin-users function is not deployed in Supabase yet.";
      } else {
        const body = await response.json().catch(() => null);
        if (body?.error) message = String(body.error);
      }
    }
    throw new Error(message);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
}

/**
 * Pushes a real phone notification for an announcement through the `send-announcement` Edge
 * Function (supabase/functions/send-announcement). The function checks the caller is a signed-in
 * admin and uses its own Firebase service account, so that credential never reaches the browser.
 * Best-effort: the announcement itself is already saved by the time this is called, so a failure
 * here (e.g. the function isn't deployed yet) shouldn't be treated as the whole post having failed.
 */
export async function sendAnnouncementNotification(message: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("send-announcement", { body: { message } });
  if (error) {
    let errorMessage = error.message;
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      if (response.status === 404) {
        errorMessage = "The send-announcement function is not deployed in Supabase yet.";
      } else {
        const body = await response.json().catch(() => null);
        if (body?.error) errorMessage = String(body.error);
      }
    }
    throw new Error(errorMessage);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
}

/**
 * Pushes a real phone notification when an admin posts a new live video link, through the
 * `send-live` Edge Function (supabase/functions/send-live). Unlike announcements, that function
 * requires the caller to be an admin specifically (not just signed in), and sends to the
 * "sajra_live" topic, which every install is auto-subscribed to (see App.tsx) rather than being
 * an opt-in toggle, since a live family event is meant to reach everyone.
 */
export async function sendLiveNotification(title: string | null): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("send-live", { body: { title } });
  if (error) {
    let errorMessage = error.message;
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      if (response.status === 404) {
        errorMessage = "The send-live function is not deployed in Supabase yet.";
      } else {
        const body = await response.json().catch(() => null);
        if (body?.error) errorMessage = String(body.error);
      }
    }
    throw new Error(errorMessage);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
}

const VIDEO_BUCKET = "sajra-videos";
export const MAX_VIDEO_UPLOAD_BYTES = 95 * 1024 * 1024; // Comfortably under Supabase's free-tier 100MB request-body limit.
const MAX_BOOK_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_BOOK_COVER_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Upload a book PDF or cover image; only the public URL is stored in the shared state row. */
export async function uploadPublicationAsset(file: File, kind: "book" | "cover"): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Sajra storage is not configured.");
  if (kind === "book" && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please select a PDF file for the book.");
  if (file.size > (kind === "book" ? MAX_BOOK_UPLOAD_BYTES : MAX_BOOK_COVER_UPLOAD_BYTES)) throw new Error(kind === "book" ? "The book PDF must be 25 MB or smaller." : "The cover image must be 5 MB or smaller.");
  const allowedCovers = ["image/jpeg", "image/png", "image/webp"];
  if (kind === "cover" && !allowedCovers.includes(file.type)) throw new Error("Please select a JPG, PNG, or WebP image for the book cover.");
  const extension = kind === "book" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `books/${kind}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, file, { cacheControl: "31536000", contentType: kind === "book" ? "application/pdf" : file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads a video file (e.g. an important family moment that wasn't livestreamed) to Supabase
 * Storage and returns its public URL. Unlike gallery photos, video files are kept out of the
 * sajra_state JSONB row entirely - a single row's worth of base64-encoded video would bloat
 * every page load for every visitor and quickly blow past the free tier's database size limit,
 * so only the (small) resulting URL string ever enters that JSON blob.
 */
export async function uploadLiveVideo(file: File): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) throw new Error("That video is too large (max 95MB).");

  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, file, {
    contentType: file.type || "video/mp4",
    upsert: false
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Best-effort notification to admins through the `send-admin-alert` Edge Function when a visitor
 * (not signed in) submits a Suggestion or a Guestbook message - things that previously only
 * surfaced if an admin happened to open that section. Callers should not block the actual
 * submission on this; it's a convenience, not something the submission depends on succeeding.
 */
export async function sendAdminAlertNotification(kind: "suggestion" | "guestbook" | "dua", message: string, authorName: string | null): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.functions.invoke("send-admin-alert", { body: { kind, message, authorName } });
  } catch {
    // Best-effort only - the suggestion/comment itself is already saved either way.
  }
}

/** Sends a password-recovery email with a link back to this site. */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

/** Updates the password for the currently signed-in user (also used to finish a recovery-link flow). */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

// --- Two-step verification (TOTP), using Supabase Auth's own MFA support. ---

export interface MfaFactor {
  id: string;
  status: "verified" | "unverified";
}

/** Lists this account's TOTP factors, so the Security tab can show whether 2-step verification is already on. */
export async function listMfaFactors(): Promise<MfaFactor[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return (data?.totp ?? []).map((factor) => ({ id: factor.id, status: factor.status }));
}

/** Starts enrolling a new authenticator app; returns a QR code to scan and the id needed to confirm it. */
export async function enrollMfa(): Promise<{ factorId: string; qrCode: string; secret: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) throw new Error(error.message);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms a freshly-enrolled factor with the 6-digit code from the authenticator app. */
export async function confirmMfaEnrollment(factorId: string, code: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw new Error(challengeError.message);
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) throw new Error(error.message);
}

/** Turns two-step verification back off. */
export async function unenrollMfa(factorId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}

/** After a password sign-in, says whether a 6-digit code is still needed before the session is fully trusted. */
export async function mfaStepUpRequired(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(error.message);
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

/** Verifies the 6-digit code at login time, for an account with 2-step verification already on. */
export async function verifyMfaChallenge(factorId: string, code: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw new Error(challengeError.message);
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) throw new Error(error.message);
}

const VISITOR_ID_KEY = "sajra-visitor-id";

/** A stable per-device id (not tied to login) so the same visitor isn't double-counted as "active now" across tabs/heartbeats. */
function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

/** Logs one row for the in-app Analytics section (separate from state.visitorCount, which only ever counts up and has no date granularity). Best-effort - a visit that fails to log is not worth surfacing an error for. */
export async function logVisit(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from("sajra_visits").insert({
      visitor_id: getVisitorId(),
      platform: Capacitor.isNativePlatform() ? "android" : "web"
    });
  } catch {
    // Best-effort only.
  }
}

/** Upserts a liveness ping so the Analytics section can show how many people are on the site right now. Call this once, then on an interval, while the app is open. */
export async function sendPresenceHeartbeat(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from("sajra_presence").upsert({
      visitor_id: getVisitorId(),
      platform: Capacitor.isNativePlatform() ? "android" : "web",
      last_seen: new Date().toISOString()
    });
  } catch {
    // Best-effort only.
  }
}

export interface VisitStats {
  today: number;
  activeNow: number;
  last7Days: { date: string; count: number }[];
  liveCountries?: { country: string; activeUsers: number }[];
}

/** Admin-only reads (see RLS on sajra_visits/sajra_presence) for the Analytics admin section. */
export async function fetchVisitStats(): Promise<VisitStats> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgoStart = new Date(now.getTime() - 6 * 86400000);
  sevenDaysAgoStart.setHours(0, 0, 0, 0);
  const activeSince = new Date(now.getTime() - 2 * 60000).toISOString();

  const [todayResult, weekResult, activeResult] = await Promise.all([
    supabase.from("sajra_visits").select("id", { count: "exact", head: true }).gte("visited_at", todayStart),
    supabase.from("sajra_visits").select("visited_at").gte("visited_at", sevenDaysAgoStart.toISOString()),
    supabase.from("sajra_presence").select("visitor_id", { count: "exact", head: true }).gte("last_seen", activeSince)
  ]);
  if (todayResult.error) throw new Error(todayResult.error.message);
  if (weekResult.error) throw new Error(weekResult.error.message);
  if (activeResult.error) throw new Error(activeResult.error.message);

  const buckets = new Map<string, number>();
  for (const row of weekResult.data ?? []) {
    const day = (row.visited_at as string).slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sevenDaysAgoStart.getTime() + index * 86400000);
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: buckets.get(key) ?? 0 };
  });

  return { today: todayResult.count ?? 0, activeNow: activeResult.count ?? 0, last7Days };
}

export async function fetchLiveVisitorCountries(): Promise<{ country: string; activeUsers: number }[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("ga4-realtime", { body: {} });
  if (error) {
    let message = error.message;
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      const result = await response.json().catch(() => null);
      if (result?.error) message = String(result.error);
    }
    throw new Error(message);
  }
  if (!Array.isArray(data?.countries)) throw new Error("The live analytics service returned an invalid response.");
  return data.countries as { country: string; activeUsers: number }[];
}
