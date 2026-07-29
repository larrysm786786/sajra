export type Language = "en";
export type Theme = "light" | "dark";
export type Gender = "male" | "female";
export type Role = "admin" | "editor";
export type ViewKey = "home" | "tree" | "gallery" | "admin" | "member" | "about";

export interface Member {
  id: number;
  name: string;
  nameUr?: string | null;
  gender: Gender;
  dob?: string | null;
  dod?: string | null;
  birthplace?: string | null;
  photo?: string | null;
  bio?: string | null;
  fatherId?: number | null;
  motherId?: number | null;
  spouseIds: number[];
  createdAt: string;
}

export interface User {
  id: number;
  username: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

export interface GalleryImage {
  id: number;
  src: string;
  caption?: string | null;
  uploadedAt: string;
}

export interface AppState {
  appName: string;
  language: Language;
  theme: Theme;
  members: Member[];
  users: User[];
  gallery: GalleryImage[];
}

export interface SessionUser {
  id: number;
  username: string;
  name?: string | null;
  role: Role;
}

export interface TreeNode {
  member: Member;
  children: TreeNode[];
}
