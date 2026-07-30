import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_DUMP_PATH = "C:/Users/ANIS/Downloads/sajra.sql";
const ROOT = process.cwd();

function parseScalar(raw) {
  const value = raw.trim();
  if (!value || value === "NULL") return null;
  if (value.startsWith("'") && value.endsWith("'")) {
    return value
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function extractInsertBlock(content, table) {
  const pattern = new RegExp(`INSERT INTO \`${table}\`[\\s\\S]*?VALUES\\s*([\\s\\S]*?);`, "m");
  const match = content.match(pattern);
  return match?.[1] ?? "";
}

function parseTuples(block) {
  const rows = [];
  let row = null;
  let field = "";
  let inString = false;
  let escape = false;

  const pushField = () => {
    if (!row) return;
    row.push(parseScalar(field));
    field = "";
  };

  for (const ch of block) {
    if (!row) {
      if (ch === "(") {
        row = [];
        field = "";
      }
      continue;
    }

    if (inString) {
      field += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "'") {
        inString = false;
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      field += ch;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === ")") {
      pushField();
      rows.push(row);
      row = null;
      field = "";
      continue;
    }

    field += ch;
  }

  return rows;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildState(content) {
  const memberRows = parseTuples(extractInsertBlock(content, "members"));
  const userRows = parseTuples(extractInsertBlock(content, "users"));
  const galleryRows = parseTuples(extractInsertBlock(content, "gallery_images"));
  const spouseRows = parseTuples(extractInsertBlock(content, "spouses"));

  const members = memberRows.map((row) => ({
    id: toNumber(row[0]) ?? 0,
    name: String(row[1] ?? ""),
    nameUr: row[2] ?? null,
    gender: row[3] === "female" ? "female" : "male",
    dob: row[4] ?? null,
    dod: row[5] ?? null,
    birthplace: row[6] ?? null,
    photo: row[7] ?? null,
    bio: row[8] ?? null,
    fatherId: toNumber(row[9]),
    motherId: toNumber(row[10]),
    spouseIds: [],
    createdAt: String(row[11] ?? new Date().toISOString())
  }));

  const membersById = new Map(members.map((member) => [member.id, member]));

  for (const row of spouseRows) {
    const memberId = toNumber(row[1]);
    const spouseId = toNumber(row[2]);
    if (!memberId || !spouseId) continue;
    const member = membersById.get(memberId);
    const spouse = membersById.get(spouseId);
    if (!member || !spouse) continue;
    if (!member.spouseIds.includes(spouseId)) member.spouseIds.push(spouseId);
    if (!spouse.spouseIds.includes(memberId)) spouse.spouseIds.push(memberId);
  }

  const users = userRows.map((row) => ({
    id: toNumber(row[0]) ?? 0,
    username: String(row[1] ?? ""),
    name: row[2] ?? null,
    email: row[3] ?? null,
    role: row[4] === "admin" ? "admin" : "editor",
    passwordHash: String(row[5] ?? ""),
    createdAt: String(row[6] ?? new Date().toISOString())
  }));

  const gallery = galleryRows.map((row) => ({
    id: toNumber(row[0]) ?? 0,
    src: String(row[1] ?? ""),
    caption: row[2] ?? null,
    uploadedAt: String(row[3] ?? new Date().toISOString())
  }));

  return {
    appName: "Sajra",
    language: "en",
    theme: "light",
    members: members.sort((a, b) => a.id - b.id),
    users: users.sort((a, b) => a.id - b.id),
    gallery: gallery.sort((a, b) => a.id - b.id)
  };
}

function generateSeedTs(state) {
  return `import type { AppState } from "./types";\n\nexport const SAJRA_SEED_STATE: AppState = ${JSON.stringify(state, null, 2)} as AppState;\n`;
}

function generateSupabaseSql(state) {
  const json = JSON.stringify(state, null, 2);
  return `create table if not exists public.sajra_state (\n  id text primary key,\n  state jsonb not null,\n  updated_at timestamptz not null default now()\n);\n\nalter table public.sajra_state enable row level security;\n\ndrop policy if exists "Allow public read" on public.sajra_state;\ndrop policy if exists "Allow public insert" on public.sajra_state;\ndrop policy if exists "Allow public update" on public.sajra_state;\n\ncreate policy "Allow public read" on public.sajra_state\n  for select using (true);\n\ncreate policy "Allow public insert" on public.sajra_state\n  for insert with check (true);\n\ncreate policy "Allow public update" on public.sajra_state\n  for update using (true) with check (true);\n\ninsert into public.sajra_state (id, state, updated_at)\nvalues ('main', $$${json}$$::jsonb, now())\non conflict (id)\ndo update set state = excluded.state,\n              updated_at = now();\n`;
}

async function main() {
  const dumpPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DUMP_PATH;
  const content = await fs.readFile(dumpPath, "utf8");
  const state = buildState(content);

  await fs.writeFile(path.join(ROOT, "src", "seedState.ts"), generateSeedTs(state), "utf8");
  await fs.writeFile(path.join(ROOT, "supabase_seed.sql"), generateSupabaseSql(state), "utf8");

  console.log(`Seed files generated from ${dumpPath}`);
  console.log(`Members: ${state.members.length}, users: ${state.users.length}, gallery: ${state.gallery.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
