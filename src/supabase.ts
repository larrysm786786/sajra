import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { createEmptyState, importJson } from "./lib";
import type { AppState } from "./types";

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

export function onSupabaseAuthChange(callback: (session: Session | null) => void): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
