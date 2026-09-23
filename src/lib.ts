import type { ActivityAction, ActivityType, AppState, GalleryImage, Member, TreeNode, User } from "./types";
import { SAJRA_SEED_STATE } from "./seedState";

export const STORAGE_KEY = "sajra-react-state-v1";

export function createEmptyState(): AppState {
  return {
    appName: "Sajra",
    language: "en",
    theme: "light",
    members: [],
    users: [
      {
        id: 1,
        username: "admin",
        name: "Administrator",
        email: null,
        role: "admin",
        createdAt: new Date().toISOString()
      }
    ],
    gallery: [],
    activityLog: [],
    visitorCount: 0,
    suggestions: []
  };
}

function finalizeState(state: AppState): AppState {
  return {
    ...state,
    members: assignMissingUniqueIds(state.members),
    activityLog: Array.isArray(state.activityLog) ? state.activityLog : [],
    visitorCount: typeof state.visitorCount === "number" ? state.visitorCount : 0,
    suggestions: Array.isArray(state.suggestions) ? state.suggestions : []
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return finalizeState(cloneState(SAJRA_SEED_STATE));
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return finalizeState({
      ...cloneState(SAJRA_SEED_STATE),
      ...parsed,
      members: Array.isArray(parsed.members) ? parsed.members.map(normalizeMember) : [],
      users: Array.isArray(parsed.users) ? parsed.users.map(normalizeUser) : cloneState(SAJRA_SEED_STATE).users,
      gallery: Array.isArray(parsed.gallery) ? parsed.gallery.map(normalizeGalleryImage) : []
    });
  } catch {
    return finalizeState(cloneState(SAJRA_SEED_STATE));
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function nextId<T extends { id: number }>(items: T[]): number {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

export function formatDate(value?: string | null, language: AppState["language"] = "en"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(language === "ur" ? "ur" : "en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function calculateAge(dob?: string | null, dod?: string | null): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  const end = dod ? new Date(dod) : new Date();
  if (Number.isNaN(born.getTime()) || Number.isNaN(end.getTime())) return null;
  let age = end.getFullYear() - born.getFullYear();
  const month = end.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && end.getDate() < born.getDate())) age -= 1;
  return age;
}

export function displayName(member: Member, language: AppState["language"] = "en"): string {
  if (language === "en") return member.name;
  return member.nameUr?.trim() ? member.nameUr : member.name;
}

function uniqueIdNumber(uniqueId?: string | null): number {
  const match = /^S(\d+)$/.exec(uniqueId ?? "");
  return match ? Number(match[1]) : 0;
}

export function formatUniqueId(n: number): string {
  return `S${String(n).padStart(5, "0")}`;
}

export function nextUniqueId(members: Member[]): string {
  const max = members.reduce((acc, member) => Math.max(acc, uniqueIdNumber(member.uniqueId)), 0);
  return formatUniqueId(max + 1);
}

/** Backfills a stable S00001-style id for any member that doesn't have one yet, in id order. */
export function assignMissingUniqueIds(members: Member[]): Member[] {
  let next = members.reduce((acc, member) => Math.max(acc, uniqueIdNumber(member.uniqueId)), 0);
  const missingIds = [...members]
    .filter((member) => !member.uniqueId)
    .sort((a, b) => a.id - b.id)
    .map((member) => member.id);
  if (!missingIds.length) return members;

  const assigned = new Map<number, string>();
  missingIds.forEach((id) => {
    next += 1;
    assigned.set(id, formatUniqueId(next));
  });

  return members.map((member) => (assigned.has(member.id) ? { ...member, uniqueId: assigned.get(member.id) } : member));
}

/** Appends an entry to the activity log, keeping only the most recent 200. */
export function pushActivityLog(
  state: AppState,
  entry: { type: ActivityType; action: ActivityAction; label: string; actorEmail?: string | null }
): AppState {
  const id = nextId(state.activityLog);
  const activityLog = [{ id, createdAt: new Date().toISOString(), ...entry }, ...state.activityLog].slice(0, 200);
  return { ...state, activityLog };
}

export function photoSrc(value?: string | null): string {
  return value?.trim() ? value : "https://placehold.co/240x240?text=Sajra";
}

export function isRoot(member: Member): boolean {
  return !member.fatherId && !member.motherId;
}

export function getParents(members: Member[], member: Member): Member[] {
  return [member.fatherId, member.motherId]
    .filter((id): id is number => Boolean(id))
    .map((id) => members.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Member => Boolean(candidate));
}

export function getSpouses(members: Member[], member: Member): Member[] {
  return member.spouseIds
    .map((id) => members.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Member => Boolean(candidate));
}

export function getChildren(members: Member[], memberId: number): Member[] {
  return members.filter((member) => member.fatherId === memberId || member.motherId === memberId);
}

export type RelationType =
  | "same"
  | "spouse"
  | "parent"
  | "child"
  | "sibling"
  | "grandparent"
  | "grandchild"
  | "auntUncle"
  | "nieceNephew"
  | "cousin"
  | "ancestor"
  | "descendant"
  | "none";

/**
 * Blood/marriage relation of `idB` to `idA` (read as "B is <type> of A"), found via their nearest
 * common ancestor. Only walks father/mother links, so in-law relationships beyond a direct spouse
 * aren't detected.
 */
export function findRelation(members: Member[], idA: number, idB: number): RelationType {
  if (idA === idB) return "same";
  const byId = new Map(members.map((member) => [member.id, member]));
  const a = byId.get(idA);
  const b = byId.get(idB);
  if (!a || !b) return "none";
  if (a.spouseIds.includes(idB) || b.spouseIds.includes(idA)) return "spouse";

  function ancestorDistances(id: number): Map<number, number> {
    const distances = new Map<number, number>();
    let frontier = [id];
    let dist = 0;
    while (frontier.length) {
      const next: number[] = [];
      for (const current of frontier) {
        if (distances.has(current)) continue;
        distances.set(current, dist);
        const member = byId.get(current);
        if (member?.fatherId) next.push(member.fatherId);
        if (member?.motherId) next.push(member.motherId);
      }
      frontier = next;
      dist += 1;
    }
    return distances;
  }

  const ancestorsOfA = ancestorDistances(idA);
  const ancestorsOfB = ancestorDistances(idB);

  let closest: { dA: number; dB: number } | null = null;
  for (const [id, dA] of ancestorsOfA) {
    const dB = ancestorsOfB.get(id);
    if (dB === undefined) continue;
    if (!closest || dA + dB < closest.dA + closest.dB) closest = { dA, dB };
  }
  if (!closest) return "none";
  const { dA, dB } = closest;

  if (dB === 0) return dA === 1 ? "parent" : dA === 2 ? "grandparent" : "ancestor";
  if (dA === 0) return dB === 1 ? "child" : dB === 2 ? "grandchild" : "descendant";
  if (dA === 1 && dB === 1) return "sibling";
  if (dA === 1 && dB === 2) return "nieceNephew";
  if (dA === 2 && dB === 1) return "auntUncle";
  return "cousin";
}

export function buildTree(members: Member[]): TreeNode[] {
  const byParent = new Map<number, Member[]>();
  const roots: Member[] = [];

  members.forEach((member) => {
    const parentId = member.fatherId || member.motherId;
    if (parentId) {
      const list = byParent.get(parentId) ?? [];
      list.push(member);
      byParent.set(parentId, list);
    } else {
      roots.push(member);
    }
  });

  const walk = (member: Member): TreeNode => ({
    member,
    children: (byParent.get(member.id) ?? []).map(walk)
  });

  return roots.sort(sortMembers).map(walk);
}

/** Number of generations in the tree (root = 1). */
export function treeDepth(nodes: TreeNode[]): number {
  if (!nodes.length) return 0;
  return 1 + Math.max(...nodes.map((node) => treeDepth(node.children)));
}

export function sortMembers(a: Member, b: Member): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

export function normalizeMember(member: Member): Member {
  return {
    ...member,
    spouseIds: Array.isArray(member.spouseIds) ? [...new Set(member.spouseIds)] : []
  };
}

export function normalizeUser(user: User): User {
  return {
    ...user
  };
}

export function normalizeGalleryImage(image: GalleryImage): GalleryImage {
  return {
    ...image
  };
}

export function exportJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importJson(raw: string): AppState {
  const parsed = JSON.parse(raw) as Partial<AppState>;
  const defaults = createEmptyState();
  return finalizeState({
    ...defaults,
    ...parsed,
    members: Array.isArray(parsed.members) ? parsed.members.map(normalizeMember) : [],
    users: Array.isArray(parsed.users) ? parsed.users.map(normalizeUser) : defaults.users,
    gallery: Array.isArray(parsed.gallery) ? parsed.gallery.map(normalizeGalleryImage) : []
  });
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes and re-encodes an image to keep the whole app-state JSON blob
 * (stored as one Supabase row) from growing unbounded as photos are added.
 */
export async function readFileAsCompressedDataUrl(file: File, maxDimension = 800, quality = 0.82): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return dataUrl;
  }

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}
