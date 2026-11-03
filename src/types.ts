export type Language = "en" | "ur";
export type Theme = "light" | "dark";
export type Gender = "male" | "female";
export type Role = "admin" | "editor" | "contributor";
export type ViewKey = "home" | "tree" | "gallery" | "admin" | "member" | "branch" | "calendar" | "about" | "guide" | "roots" | "settings" | "live" | "memory" | "dua" | "update";

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
  /** Free-form phone/WhatsApp/email, shown on the profile; set by the member themselves via the "update your own profile" link, or by an admin/editor. */
  contact?: string | null;
  fatherId?: number | null;
  motherId?: number | null;
  spouseIds: number[];
  createdAt: string;
}

/**
 * Extra abilities an admin can grant to a specific "editor" account, on top of what the editor
 * role gets by default. Admins and contributors are never affected by these - only checked when
 * the signed-in account's own directory entry (matched by email) has role "editor".
 */
export interface UserPermissions {
  addToSlider?: boolean;
  addAnnouncement?: boolean;
  addLiveStreaming?: boolean;
  addGallery?: boolean;
  addMember?: boolean;
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
  permissions?: UserPermissions;
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

/**
 * A member's self-submitted change to their own photo/bio/contact, via the no-login "update your
 * own profile" link an admin/editor sends them. Needs an admin/editor to apply it before it
 * changes the real member record - the link itself grants no direct write access.
 */
export interface MemberUpdateRequest {
  id: number;
  memberId: number;
  /** Snapshot of the member's name at submission time, kept even if the member is later renamed. */
  memberName: string;
  photo?: string | null;
  bio?: string | null;
  contact?: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

/** A prayer request posted when someone is ill or in difficulty - separate from Announcements, open to anyone to post. */
export interface DuaRequest {
  id: number;
  message: string;
  requesterName?: string | null;
  status: "open" | "fulfilled";
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
  duaRequests: DuaRequest[];
  memberUpdateRequests: MemberUpdateRequest[];
}

export interface TreeNode {
  member: Member;
  children: TreeNode[];
}
