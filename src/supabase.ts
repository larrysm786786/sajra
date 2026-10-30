import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from "@supabase/supabase-js";
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
export async function sendAdminAlertNotification(kind: "suggestion" | "guestbook", message: string, authorName: string | null): Promise<void> {
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
