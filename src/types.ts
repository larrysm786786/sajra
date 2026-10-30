export type Language = "en" | "ur";
export type Theme = "light" | "dark";
export type Gender = "male" | "female";
export type Role = "admin" | "editor" | "contributor";
export type ViewKey = "home" | "tree" | "gallery" | "admin" | "member" | "branch" | "calendar" | "about" | "guide" | "roots" | "settings" | "live";

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
  /** Whether an admin selected this member for the homepage professional photo slider. */
  showInHeroSlider?: boolean;
  /** How many daughters this member had, recorded as a count only (Sajra records sons individually but not daughters by name). */
  daughtersCount?: number | null;
  photo?: string | null;
  bio?: string | null;
  fatherId?: number | null;
  motherId?: number | null;
  spouseIds: number[];
  createdAt: string;
}

/**
 * A directory label only, it does NOT grant login access. Real
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
  memberBefore?: Member | null;
  memberAfter?: Member | null;
  memberRelatedBefore?: Member[];
  createdAt: string;
}

/** A correction or addition proposed by anyone (no login needed), for an admin to review. */
export interface Suggestion {
  id: number;
  memberId?: number | null;
  /** Snapshot of the member's name at submission time, kept even if the member is later renamed/removed. */
  memberName?: string | null;
  message: string;
  submitterName?: string | null;
  status: "pending" | "resolved";
  createdAt: string;
}

/** A notice posted by an admin or any visitor, shown to everyone on the home page. */
export interface Announcement {
  id: number;
  message: string;
  authorName?: string | null;
  /** True when the poster was signed in as admin at the time, shown as an "Admin" badge. */
  fromAdmin: boolean;
  /** ISO date; the announcement stops showing after this day if set. */
  expiresAt?: string | null;
  createdAt: string;
}

/** A message left on a member's profile (a memory, a birthday wish). Anyone can post one; only admins can remove one. */
export interface ProfileComment {
  id: number;
  memberId: number;
  message: string;
  authorName?: string | null;
  createdAt: string;
}

/** The current live video link (e.g. a YouTube stream of a family function), admin-only to set. */
export interface LiveStream {
  url: string | null;
  /** "youtube" embeds url as a YouTube player; "upload" plays it directly as a video file. */
  kind?: "youtube" | "upload" | null;
  title?: string | null;
  updatedAt: string | null;
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
  suggestions: Suggestion[];
  announcements: Announcement[];
  liveStream: LiveStream;
  profileComments: ProfileComment[];
}

export interface TreeNode {
  member: Member;
  children: TreeNode[];
}
