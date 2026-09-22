export type Language = "en" | "ur";
export type Theme = "light" | "dark";
export type Gender = "male" | "female";
export type Role = "admin" | "editor" | "contributor";
export type ViewKey = "home" | "tree" | "gallery" | "admin" | "member" | "about" | "guide" | "roots";

export interface Member {
  id: number;
  /** Stable, human-shareable identifier (e.g. "S00001"). Assigned once at creation and never reused. */
  uniqueId?: string | null;
  name: string;
  nameUr?: string | null;
  gender: Gender;
  dob?: string | null;
  dod?: string | null;
  birthplace?: string | null;
  /** A preset key from professions.ts (e.g. "doctor") or free text for anything else. */
  profession?: string | null;
  photo?: string | null;
  bio?: string | null;
  fatherId?: number | null;
  motherId?: number | null;
  spouseIds: number[];
  createdAt: string;
}

/**
 * A directory label only — it does NOT grant login access. Real
 * authentication is handled entirely by Supabase Auth (see supabase.ts).
 * This just records who is considered an admin/editor for display purposes.
 */
export interface User {
  id: number;
  username: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  createdAt: string;
}

export interface GalleryImage {
  id: number;
  src: string;
  caption?: string | null;
  uploadedAt: string;
}

export type ActivityType = "member" | "user" | "gallery";
export type ActivityAction = "added" | "updated" | "deleted";

export interface ActivityLogEntry {
  id: number;
  type: ActivityType;
  action: ActivityAction;
  label: string;
  actorEmail?: string | null;
  createdAt: string;
}

export interface AppState {
  appName: string;
  language: Language;
  theme: Theme;
  members: Member[];
  users: User[];
  gallery: GalleryImage[];
  activityLog: ActivityLogEntry[];
  visitorCount: number;
}

export interface TreeNode {
  member: Member;
  children: TreeNode[];
}
