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
    suggestions: [],
    announcements: [],
    liveStream: { url: null, title: null, updatedAt: null },
    profileComments: []
  };
}

function finalizeState(state: AppState): AppState {
  return {
    ...state,
    members: assignMissingUniqueIds(state.members),
    activityLog: Array.isArray(state.activityLog) ? state.activityLog : [],
    visitorCount: typeof state.visitorCount === "number" ? state.visitorCount : 0,
    suggestions: Array.isArray(state.suggestions) ? state.suggestions : [],
    announcements: Array.isArray(state.announcements) ? state.announcements : [],
    liveStream: state.liveStream && typeof state.liveStream === "object" ? state.liveStream : { url: null, title: null, updatedAt: null },
    profileComments: Array.isArray(state.profileComments) ? state.profileComments : []
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
  if (!value) return "-";
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
  entry: { type: ActivityType; action: ActivityAction; label: string; actorEmail?: string | null; memberBefore?: Member | null; memberAfter?: Member | null; memberRelatedBefore?: Member[] }
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

export type DataIssueKind = "duplicate-id" | "missing-parent" | "self-parent" | "same-parent" | "missing-spouse" | "self-spouse" | "invalid-dates" | "parent-cycle";
export interface DataQualityIssue { id: string; memberId: number; kind: DataIssueKind; detail: string; }

export function findDataQualityIssues(members: Member[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const add = (member: Member, kind: DataIssueKind, detail: string) => issues.push({ id: `${kind}-${member.id}-${issues.length}`, memberId: member.id, kind, detail });
  const ids = new Map<string, Member[]>();
  const byId = new Map(members.map((member) => [member.id, member]));
  for (const member of members) {
    const uniqueId = member.uniqueId?.trim().toUpperCase();
    if (uniqueId) ids.set(uniqueId, [...(ids.get(uniqueId) ?? []), member]);
  }
  for (const group of ids.values()) if (group.length > 1) for (const member of group) add(member, "duplicate-id", `Unique ID ${member.uniqueId} is shared by ${group.length} members.`);
  for (const member of members) {
    for (const [label, parentId] of [["father", member.fatherId], ["mother", member.motherId]] as const) {
      if (parentId && !byId.has(parentId)) add(member, "missing-parent", `${label === "father" ? "Father" : "Mother"} link points to a member that no longer exists.`);
      else if (parentId === member.id) add(member, "self-parent", `${label === "father" ? "Father" : "Mother"} cannot be the member themself.`);
    }
    if (member.fatherId && member.fatherId === member.motherId) add(member, "same-parent", "Father and mother link to the same person.");
    for (const spouseId of member.spouseIds ?? []) {
      if (spouseId === member.id) add(member, "self-spouse", "Member is linked as their own spouse.");
      else if (!byId.has(spouseId)) add(member, "missing-spouse", "Spouse link points to a member that no longer exists.");
    }
    if (member.dob && member.dod && member.dob > member.dod) add(member, "invalid-dates", "Date of birth is after date of death.");
    const seen = new Set<number>([member.id]);
    let frontier = [member.id];
    let cycleFound = false;
    while (frontier.length && !cycleFound) {
      const next: number[] = [];
      for (const currentId of frontier) {
        const current = byId.get(currentId);
        for (const parentId of [current?.fatherId, current?.motherId]) {
          if (!parentId || !byId.has(parentId)) continue;
          if (parentId === member.id) { add(member, "parent-cycle", "Parent links create a circular family-tree path."); cycleFound = true; break; }
          if (!seen.has(parentId)) { seen.add(parentId); next.push(parentId); }
        }
        if (cycleFound) break;
      }
      frontier = next;
    }
  }
  return issues;
}

export type FamilyEventKind = "birthday" | "death-anniversary";
export interface FamilyCalendarEvent { id: string; member: Member; kind: FamilyEventKind; date: Date; }
function nextAnnualDate(value: string, now: Date): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const makeDate = (year: number) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = makeDate(now.getFullYear());
  if (date < today) date = makeDate(now.getFullYear() + 1);
  return date;
}
export function getFamilyCalendarEvents(members: Member[], now = new Date(), days = 365): FamilyCalendarEvent[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const events: FamilyCalendarEvent[] = [];
  for (const member of members) {
    for (const [kind, value] of [["birthday", member.dob], ["death-anniversary", member.dod]] as const) {
      if (!value) continue;
      const date = nextAnnualDate(value, now);
      if (date && date <= end) events.push({ id: `${kind}-${member.id}`, member, kind, date });
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.member.name.localeCompare(b.member.name));
}
export function getTodayFamilyMemories(members: Member[], gallery: GalleryImage[], now = new Date()): Array<{ id: string; title: string; member?: Member; image?: GalleryImage; kind: FamilyEventKind | "photo-anniversary" }> {
  const month = now.getMonth();
  const day = now.getDate();
  const memories: Array<{ id: string; title: string; member?: Member; image?: GalleryImage; kind: FamilyEventKind | "photo-anniversary" }> = [];
  for (const member of members) {
    if (member.dob) { const date = nextAnnualDate(member.dob, now); if (date?.getMonth() === month && date.getDate() === day) memories.push({ id: `birthday-${member.id}`, title: `${member.name} - birthday`, member, kind: "birthday" }); }
    if (member.dod) { const date = nextAnnualDate(member.dod, now); if (date?.getMonth() === month && date.getDate() === day) memories.push({ id: `death-${member.id}`, title: `${member.name} - remembrance day`, member, kind: "death-anniversary" }); }
  }
  for (const image of gallery) {
    const date = new Date(image.uploadedAt);
    if (!Number.isNaN(date.getTime()) && date.getMonth() === month && date.getDate() === day) memories.push({ id: `photo-${image.id}`, title: image.caption || "Family photograph", image, kind: "photo-anniversary" });
  }
  return memories;
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

/**
 * The direct lineage ("silsila") from the family's founding ancestor down to this member,
 * following the same single-parent-per-generation link buildTree uses (fatherId, falling back
 * to motherId) rather than both parents, so it lines up with how the tree itself is structured.
 * Returns oldest ancestor first, the member themself last.
 */
export function getAncestorChain(members: Member[], memberId: number): Member[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const chain: Member[] = [];
  const seen = new Set<number>();
  let current = byId.get(memberId);
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    const parentId = current.fatherId || current.motherId;
    current = parentId ? byId.get(parentId) : undefined;
  }
  return chain.reverse();
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