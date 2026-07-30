import { createEmptyState, importJson } from "./lib";
import type { AppState } from "./types";

type SupabaseRow = {
  id: string;
  state: unknown;
  updated_at?: string;
};

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  table: string;
  rowId: string;
};

const DEFAULT_TABLE = "sajra_state";
const DEFAULT_ROW_ID = "main";

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return null;

  return {
    url: trimTrailingSlash(url),
    anonKey,
    table: DEFAULT_TABLE,
    rowId: DEFAULT_ROW_ID
  };
}

function createHeaders(config: SupabaseConfig): HeadersInit {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}

function stateFromRaw(raw: unknown): AppState {
  try {
    if (typeof raw === "string") {
      return importJson(raw);
    }

    if (raw && typeof raw === "object") {
      return importJson(JSON.stringify(raw));
    }
  } catch {
    // Fall through to the default state.
  }

  return createEmptyState();
}

export async function loadSupabaseState(config = getSupabaseConfig()): Promise<AppState | null> {
  if (!config) return null;

  const response = await fetch(
    `${config.url}/rest/v1/${config.table}?select=state&id=eq.${encodeURIComponent(config.rowId)}&limit=1`,
    {
      headers: createHeaders(config)
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase read failed with status ${response.status}`);
  }

  const rows = (await response.json()) as SupabaseRow[];
  const row = rows[0];

  if (!row) return null;

  return stateFromRaw(row.state);
}

export async function saveSupabaseState(state: AppState, config = getSupabaseConfig()): Promise<void> {
  if (!config) return;

  const response = await fetch(`${config.url}/rest/v1/${config.table}`, {
    method: "POST",
    headers: {
      ...createHeaders(config),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify([{ id: config.rowId, state }])
  });

  if (!response.ok) {
    throw new Error(`Supabase write failed with status ${response.status}`);
  }
}
