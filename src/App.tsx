import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import { Badge } from "@capawesome/capacitor-badge";
import QRCode from "qrcode";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { trackNativeScreenView, trackWebPageView } from "./analytics";
import LiveVisitorMap from "./LiveVisitorMap";
import type { FormEvent, ReactNode, TouchEvent as ReactTouchEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Announcement, AppState, BookPublication, DuaRequest, GalleryImage, Gender, Language, Member, MemberUpdateRequest, Role, Suggestion, User, ViewKey } from "./types";
import {
  buildMembersFromImportRows,
  buildTree,
  calculateAge,
  createEmptyState,
  displayName,
  exportJson,
  findRelation,
  formatDate,
  getAncestorChain,
  getChildren,
  findDataQualityIssues,
  formatHijriDate,
  getFamilyCalendarEvents,
  getTodayFamilyMemories,
  getParents,
  getSpouses,
  groupMembersByGeneration,
  importJson,
  isRoot,
  loadState,
  membersCsvTemplate,
  nextId,
  nextUniqueId,
  parseMembersCsv,
  photoSrc,
  publicPageUrl,
  pushActivityLog,
  readFileAsCompressedDataUrl,
  saveState,
  sortMembers,
  treeDepth
} from "./lib";
import type { RelationType } from "./lib";
import {
  confirmMfaEnrollment,
  createProfileUpdateLink,
  enrollMfa,
  fetchVisitStats,
  fetchLiveVisitorCities,
  getSupabaseSession,
  isSupabaseConfigured,
  listMfaFactors,
  loadSupabaseState,
  logVisit,
  manageAuthUser,
  mfaStepUpRequired,
  onSupabaseAuthChange,
  publishInitialState,
  saveSupabaseState,
  sendAnnouncementNotification,
  MAX_VIDEO_UPLOAD_BYTES,
  sendAdminAlertNotification,
  sendLiveNotification,
  sendPresenceHeartbeat,
  submitProfileUpdateLink,
  submitPublicSajraAction,
  uploadLiveVideo,
  sendPasswordResetEmail,
  signInWithPassword,
  signOutSupabase,
  StaleWriteError,
  uploadPublicationAsset,
  unenrollMfa,
  updatePassword,
  validateProfileUpdateLink,
  verifyMfaChallenge
} from "./supabase";
import type { MfaFactor, VisitStats } from "./supabase";
import FamilyTreeD3 from "./FamilyTreeD3";
import { mergeStates } from "./merge";
import {
  groupByProfession,
  isProfessionKey,
  normalizeProfession,
  PROFESSION_KEYS,
  PROFESSION_OTHER,
  professionLabel,
  professionShortLabel
} from "./professions";
import { t, tGender } from "./i18n";
import SajraChat from "./SajraChat";
import AppUpdaterCard, { appBiometric, appNotifications, appPrint, BIOMETRIC_LOCK_STORAGE_KEY, checkForAppUpdate } from "./AppUpdater";
import { BranchPage } from "./FamilyTools";
import type { StringKey } from "./i18n";

const NAV_LABELS: Record<Language, { home: string; tree: string; gallery: string; about: string; guide: string; roots: string }> = {
  en: { home: "Home", tree: "Tree", gallery: "Gallery", about: "About", guide: "Guide", roots: "Founding Branches" },
  ur: { home: "ہوم", tree: "شجرہ", gallery: "گیلری", about: "تعارف", guide: "رہنمائی", roots: "بانی شاخیں" }
};

type RouteState = { page: ViewKey; memberId?: number; updateToken?: string };

type AdminSection = "overview" | "members" | "users" | "gallery" | "suggestions" | "profileUpdates" | "logs" | "backup" | "quality" | "analytics";

const EDITOR_PERMISSION_OPTIONS: { key: keyof NonNullable<User["permissions"]>; labelKey: StringKey }[] = [
  { key: "addMember", labelKey: "permAddMemberLabel" },
  { key: "editMember", labelKey: "permEditMemberLabel" },
  { key: "reviewProfileUpdates", labelKey: "permReviewProfileUpdatesLabel" },
  { key: "addGallery", labelKey: "permAddGalleryLabel" },
  { key: "addToSlider", labelKey: "permAddToSliderLabel" },
  { key: "addAnnouncement", labelKey: "permAddAnnouncementLabel" },
  { key: "addLiveStreaming", labelKey: "permAddLiveStreamingLabel" }
];

// Supabase reports an expired / already-used reset link through the URL hash.
const STARTED_WITH_EXPIRED_LINK = typeof window !== "undefined" && window.location.hash.includes("error_code=otp_expired");

// Guards the visitor-count bump so a single browser tab only counts as one visit per session.
const VISIT_SESSION_KEY = "sajra-visit-counted";
const MY_MEMBER_ID_KEY = "sajra-my-member-id";

// When this device last downloaded a backup, local only, since "did I back up" is per-device.
const LAST_BACKUP_KEY = "sajra-last-backup-at";
const BACKUP_REMINDER_DAYS = 30;

type MemberDraft = {
  id?: number;
  name: string;
  nameUr: string;
  gender: Gender;
  age: string;
  dod: string;
  birthplace: string;
  daughtersCount: string;
  professionChoice: string;
  professionOther: string;
  showInHeroSlider: boolean;
  photo: string;
  bio: string;
  contact: string;
  publications: BookPublication[];
  fatherId: string;
  motherId: string;
  spouseIds: number[];
};

type UserDraft = {
  id?: number;
  username: string;
  name: string;
  email: string;
  password: string;
  role: Role;
};

type GalleryDraft = {
  id?: number;
  src: string;
  caption: string;
};

type SuggestionDraft = {
  memberId: string;
  memberSearch: string;
  message: string;
  submitterName: string;
};

type AnnouncementDraft = {
  message: string;
  authorName: string;
  expiresAt: string;
};

type DuaDraft = {
  message: string;
  requesterName: string;
};

/** Name prefixed with profession, so people who share a name (common in this family) can be told apart in search lists. */
function fullLabel(member: Member, language: Language): string {
  const name = displayName(member, language);
  const profession = member.profession?.trim();
  return profession ? `${professionShortLabel(language, profession)} ${name}` : name;
}

function hasMeaningfulData(state: AppState): boolean {
  return Boolean(
    state.members.length ||
    state.gallery.length ||
    state.users.length > 1 ||
    state.appName !== "Apna Sajra" ||
    state.language !== "en" ||
    state.theme !== "light"
  );
}

function parseRoute(): RouteState {
  const [raw, query = ""] = window.location.hash.replace(/^#/, "").split("?");
  if (!raw || raw === "/") return { page: "home" };
  const [page, id] = raw.split("/").filter(Boolean);
  if ((page === "member" || page === "branch" || page === "update") && id) return { page, memberId: Number(id) || undefined, ...(page === "update" ? { updateToken: new URLSearchParams(query).get("token") ?? undefined } : {}) };
  if (page === "home" || page === "tree" || page === "gallery" || page === "admin" || page === "about" || page === "guide" || page === "roots" || page === "calendar" || page === "settings" || page === "live" || page === "memory" || page === "dua" || page === "familyBook") {
    return { page };
  }
  return { page: "home" };
}

function routeHash(route: RouteState): string {
  if ((route.page === "member" || route.page === "branch") && route.memberId) return `#/${route.page}/${route.memberId}`;
  return `#/${route.page}`;
}

/** Turns a youtube.com/watch, youtu.be, /live/ or /embed/ link into an embeddable player URL, or null if it isn't a recognizable YouTube link. */
function getYouTubeEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.replace(/^www\./, "");
    let videoId: string | null = null;
    if (host === "youtu.be") {
      videoId = url.pathname.slice(1).split("/")[0] || null;
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else if (url.pathname.startsWith("/live/")) videoId = url.pathname.split("/")[2] || null;
      else if (url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/")[2] || null;
    }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=0`;
  } catch {
    return null;
  }
}

function professionDraftFields(profession?: string | null): Pick<MemberDraft, "professionChoice" | "professionOther"> {
  const value = profession?.trim() ?? "";
  if (!value) return { professionChoice: "", professionOther: "" };
  return isProfessionKey(value)
    ? { professionChoice: value, professionOther: "" }
    : { professionChoice: PROFESSION_OTHER, professionOther: value };
}

function emptyMemberDraft(member?: Member): MemberDraft {
  return member
    ? {
        id: member.id,
        name: member.name,
        nameUr: member.nameUr ?? "",
        gender: member.gender,
        age: calculateAge(member.dob, member.dod) !== null ? String(calculateAge(member.dob, member.dod)) : "",
        dod: member.dod ?? "",
        birthplace: member.birthplace ?? "",
        daughtersCount: member.daughtersCount != null ? String(member.daughtersCount) : "",
        ...professionDraftFields(member.profession),
        showInHeroSlider: member.showInHeroSlider === true,
        photo: member.photo ?? "",
        bio: member.bio ?? "",
        contact: member.contact ?? "",
        publications: member.publications ?? [],
        fatherId: member.fatherId ? String(member.fatherId) : "",
        motherId: member.motherId ? String(member.motherId) : "",
        spouseIds: [...member.spouseIds]
      }
    : {
        name: "",
        nameUr: "",
        gender: "male",
        age: "",
        dod: "",
        birthplace: "",
        daughtersCount: "",
        professionChoice: "",
        professionOther: "",
        showInHeroSlider: false,
        photo: "",
        bio: "",
        contact: "",
        publications: [],
        fatherId: "",
        motherId: "",
        spouseIds: []
      };
}

function emptyUserDraft(user?: User): UserDraft {
  return user
    ? {
        id: user.id,
        username: user.username,
        name: user.name ?? "",
        email: user.email ?? "",
        password: "",
        role: user.role === "contributor" ? "editor" : user.role
      }
    : {
        username: "",
        name: "",
        email: "",
        password: "",
        role: "editor"
      };
}

function emptyGalleryDraft(image?: GalleryImage): GalleryDraft {
  return image
    ? { id: image.id, src: image.src, caption: image.caption ?? "" }
    : { src: "", caption: "" };
}

function Card({
  title,
  subtitle,
  children,
  actions
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="card">
      <div className="section-head" style={{ marginBottom: 10 }}>
        <div>
          <h3 className="tree-name" style={{ margin: 0 }}>{title}</h3>
          {subtitle ? <p className="section-subtitle" style={{ margin: "6px 0 0" }}>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </article>
  );
}

function NavLink({
  active,
  children,
  onClick,
  badge
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button type="button" className={`navlink ${active ? "active" : ""}`} onClick={onClick}>
      <span>{children}</span>{badge ? <span className="nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

function StatCard({ value, label, hint, icon }: { value: string | number; label: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="stat-card">
      {icon ? <div className="stat-card-icon">{icon}</div> : null}
      <span className="stat-value">{value}</span>
      <div className="muted" style={{ fontWeight: 700 }}>{label}</div>
      {hint ? <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  autoComplete,
  language
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  language: Language;
}) {
  const [visible, setVisible] = useState(false);
  const label = t(language, visible ? "passwordHide" : "passwordShow");
  return (
    <div className="password-field">
      <input
        type={visible ? "text" : "password"}
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
      />
      <button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={label} aria-pressed={visible} title={label}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? null : <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}

const RELATION_LABEL_KEYS: Record<RelationType, StringKey> = {
  same: "relationSameLabel",
  none: "relationNoPathLabel",
  spouse: "relationSpouseLabel",
  parent: "relationParentLabel",
  child: "relationChildLabel",
  sibling: "relationSiblingLabel",
  grandparent: "relationGrandparentLabel",
  grandchild: "relationGrandchildLabel",
  auntUncle: "relationAuntUncleLabel",
  nieceNephew: "relationNieceNephewLabel",
  cousin: "relationCousinLabel",
  ancestor: "relationAncestorLabel",
  descendant: "relationDescendantLabel"
};

const ADMIN_ICONS: Record<AdminSection, string> = {
  overview: "M3 3h8v8H3V3Zm10 0h8v5h-8V3ZM3 13h8v8H3v-8Zm10-3h8v11h-8V10Z",
  members: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21c0-4 3.6-6 8-6s8 2 8 6",
  users: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3Z",
  gallery: "M3 5h18v14H3V5Zm0 11 5-5 4 4 3-3 6 6M15.5 9.5h.01",
  suggestions: "M12 22s-8-4.5-8-11a8 8 0 0 1 16 0c0 6.5-8 11-8 11ZM12 8v5M12 16h.01",
  profileUpdates: "M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  logs: "M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  backup: "M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3",
  quality: "M12 3 3 20h18L12 3Zm0 6v5m0 3h.01",
  analytics: "M4 20V10m6 10V4m6 16v-7"
};

const EYE_ICON_PATH = "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={EYE_ICON_PATH} />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function AdminIcon({ section }: { section: AdminSection }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ADMIN_ICONS[section]} />
    </svg>
  );
}

function MemberCard({
  member,
  language,
  onOpen
}: {
  member: Member;
  language: AppState["language"];
  onOpen: (id: number) => void;
}) {
  return (
    <button type="button" className="member-card" onClick={() => onOpen(member.id)}>
      <img className={`avatar${member.dod ? " avatar-in-memory" : ""}`} src={photoSrc(member.photo)} alt={displayName(member, language)} />
      <div className="member-card-text">
        <div className="tree-name">{displayName(member, language)}</div>
        <div className="tree-sub">
          {member.birthplace || t(language, "noBirthplace")}
          {calculateAge(member.dob, member.dod) !== null ? ` | ${t(language, "ageWord")} ${calculateAge(member.dob, member.dod)}` : ""}
        </div>
      </div>
    </button>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 className="section-title">{title}</h2>
            {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="close-btn" onClick={onClose}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function isSliderProfession(profession?: string | null) {
  return Boolean(profession?.trim());
}

function safePublicationUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function bookDownloadUrl(publication: BookPublication): string | null {
  const url = safePublicationUrl(publication.fileUrl);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("download", publication.fileName || publication.title + ".pdf");
    return parsed.toString();
  } catch {
    return null;
  }
}

function PublicationFields({ item, language, onChange, onRemove, onUploadAsset }: { item: BookPublication; language: Language; onChange: (item: BookPublication) => void; onRemove: () => void; onUploadAsset?: (file: File, kind: "book" | "cover") => Promise<string> }) {
  const [uploading, setUploading] = useState<"book" | "cover" | null>(null);
  const [uploadError, setUploadError] = useState("");
  async function upload(file: File | undefined, kind: "book" | "cover") {
    if (!file || !onUploadAsset) return;
    setUploading(kind);
    setUploadError("");
    try {
      const url = await onUploadAsset(file, kind);
      onChange(kind === "book" ? { ...item, fileUrl: url, fileName: file.name } : { ...item, coverUrl: url });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t(language, "publicationUploadFailed"));
    } finally {
      setUploading(null);
    }
  }
  return <div className="publication-fields card">
    <label><span>{t(language, "publicationNameLabel")}</span><input className="field" maxLength={180} value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} /></label>
    <label><span>{t(language, "publicationPublisherLabel")}</span><input className="field" maxLength={120} value={item.publisher ?? ""} onChange={(event) => onChange({ ...item, publisher: event.target.value })} /></label>
    <label><span>{t(language, "publicationYearLabel")}</span><input className="field" maxLength={12} value={item.year ?? ""} onChange={(event) => onChange({ ...item, year: event.target.value })} /></label>
    <label><span>{t(language, "publicationUrlLabel")}</span><input className="field" type="url" maxLength={500} value={item.url ?? ""} onChange={(event) => onChange({ ...item, url: event.target.value })} /></label>
    {onUploadAsset ? <>
      <label><span>{t(language, "uploadBookFileLabel")}</span><input className="field" type="file" accept="application/pdf,.pdf" disabled={Boolean(uploading)} onChange={(event) => { void upload(event.target.files?.[0], "book"); event.currentTarget.value = ""; }} /><small className="muted">{t(language, "bookUploadHint")}</small></label>
      <label><span>{t(language, "uploadBookCoverLabel")}</span><input className="field" type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploading)} onChange={(event) => { void upload(event.target.files?.[0], "cover"); event.currentTarget.value = ""; }} /><small className="muted">{t(language, "bookCoverUploadHint")}</small></label>
      {item.fileName ? <div className="publication-asset-status"><span>{t(language, "bookFileAttachedLabel")}: {item.fileName}</span><button className="btn-ghost danger" type="button" onClick={() => onChange({ ...item, fileUrl: null, fileName: null })}>{t(language, "removeBookFileButton")}</button></div> : null}
      {item.coverUrl ? <div className="publication-cover-preview"><img src={safePublicationUrl(item.coverUrl) ?? ""} alt={t(language, "bookCoverPreviewAlt")} /><button className="btn-ghost danger" type="button" onClick={() => onChange({ ...item, coverUrl: null })}>{t(language, "removeBookCoverButton")}</button></div> : null}
      {uploading ? <small className="muted">{uploading === "book" ? t(language, "uploadingBookFile") : t(language, "uploadingBookCover")}</small> : null}
      {uploadError ? <small className="publication-upload-error" role="alert">{uploadError}</small> : null}
    </> : null}
    <button className="btn-ghost danger" type="button" onClick={onRemove}>{t(language, "removePublicationButton")}</button>
  </div>;
}

function cleanSuggestionMessage(message: string): string {
  const prefixes = ["Chatbot feedback (helpful): ", "Chatbot feedback (not helpful): "];
  let text = message;
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }
  return text
    .replace(/\\\*\\\*/g, "")
    .replace(/\*\*/g, "")
    .replace(/&#x20;|&#32;|&nbsp;/gi, " ")
    .replace(/&#xA0;/gi, " ")
    .replace(/\\-/g, "• ")
    .replace(/^\s*-\s+/gm, "• ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function ProfessionPhotoBio({ bio, language, onOpen }: { bio: string; language: Language; onOpen: () => void }) {
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph) return;
    const checkOverflow = () => {
      const parent = paragraph.parentElement;
      if (!parent) return;
      const fullParagraph = paragraph.cloneNode(true) as HTMLParagraphElement;
      fullParagraph.classList.remove("is-collapsed");
      fullParagraph.setAttribute("aria-hidden", "true");
      Object.assign(fullParagraph.style, {
        position: "absolute",
        visibility: "hidden",
        display: "block",
        width: `${paragraph.clientWidth}px`,
        height: "auto",
        maxHeight: "none",
        overflow: "visible",
        pointerEvents: "none",
      });
      parent.appendChild(fullParagraph);
      const hasOverflow = fullParagraph.getBoundingClientRect().height > paragraph.getBoundingClientRect().height + 1;
      fullParagraph.remove();
      setHasMore(hasOverflow);
    };
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [bio]);

  return <div className="profession-photo-bio">
    <p ref={paragraphRef} className="is-collapsed">{bio}</p>
    {hasMore ? <button type="button" className="profession-photo-read-more" onClick={onOpen}>{`…${t(language, "readMoreLabel")}`}</button> : null}
  </div>;
}

function ProfessionPhotoSlider({ members, language, onOpen }: { members: Member[]; language: Language; onOpen: (memberId: number) => void }) {
  const photoMembers = useMemo(() => members.filter((member) => {
    return member.showInHeroSlider === true && Boolean(member.photo?.trim()) && isSliderProfession(member.profession);
  }).sort(sortMembers), [members]);
  const [slideIndex, setSlideIndex] = useState(0);
  useEffect(() => {
    if (photoMembers.length < 2) return;
    const timer = window.setInterval(() => setSlideIndex((index) => (index + 1) % photoMembers.length), 6500);
    return () => window.clearInterval(timer);
  }, [photoMembers.length]);
  if (!photoMembers.length) return null;
  const member = photoMembers[slideIndex % photoMembers.length];
  const bio = member.bio?.trim() ?? "";
  return <div className="profession-photo-slider" aria-label="Family members with professional roles">
    <button key={`photo-${member.id}`} type="button" className="profession-photo-image" onClick={() => onOpen(member.id)} aria-label={"Open " + displayName(member, language) + " profile"}>
      <img src={photoSrc(member.photo)} alt={displayName(member, language)} decoding="async" />
    </button>
    <div key={`details-${member.id}`} className="profession-photo-content">
      <div className="profession-photo-caption">
        <span>{professionLabel(language, member.profession ?? "")}</span>
        <strong>{displayName(member, language)}</strong>
        {member.uniqueId ? <small>{member.uniqueId}</small> : null}
      </div>
      {bio ? <ProfessionPhotoBio key={member.id} bio={bio} language={language} onOpen={() => onOpen(member.id)} /> : null}
    </div>
    {photoMembers.length > 1 ? <div className="profession-photo-controls"><button type="button" aria-label={t(language, "previousProfileLabel")} onClick={() => setSlideIndex((index) => (index - 1 + photoMembers.length) % photoMembers.length)}>{t(language, "previousButtonLabel")}</button><span>{slideIndex + 1} / {photoMembers.length}</span><button type="button" aria-label={t(language, "nextProfileLabel")} onClick={() => setSlideIndex((index) => (index + 1) % photoMembers.length)}>{t(language, "nextButtonLabel")}</button></div> : null}
  </div>;
}
export default function App() {
  const initialStateRef = useRef<AppState | null>(null);
  const [state, setState] = useState<AppState>(() => {
    const initial = loadState();
    initialStateRef.current = initial;
    return initial;
  });
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<RouteState>(() => parseRoute());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const supabaseConfigured = useMemo(() => isSupabaseConfigured(), []);
  const [memberQuery, setMemberQuery] = useState("");
  const [homeSearchQuery, setHomeSearchQuery] = useState("");
  const [homeSearchOpen, setHomeSearchOpen] = useState(false);
  const [relativeAId, setRelativeAId] = useState("");
  const [relativeBId, setRelativeBId] = useState("");
  const [relativeASearch, setRelativeASearch] = useState("");
  const [relativeBSearch, setRelativeBSearch] = useState("");
  const [spouseSearchQuery, setSpouseSearchQuery] = useState("");
  const [fatherSearchQuery, setFatherSearchQuery] = useState("");
  const [motherSearchQuery, setMotherSearchQuery] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaEnrollment, setMfaEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [mfaSetupCode, setMfaSetupCode] = useState("");
  const [mfaSetupError, setMfaSetupError] = useState("");
  const [mfaSetupBusy, setMfaSetupBusy] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(STARTED_WITH_EXPIRED_LINK);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState(() =>
    STARTED_WITH_EXPIRED_LINK ? t(initialStateRef.current?.language ?? "en", "resetLinkExpired") : ""
  );
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [logsPage, setLogsPage] = useState(0);
  const [visitStats, setVisitStats] = useState<VisitStats | null>(null);
  const [visitStatsLoading, setVisitStatsLoading] = useState(false);
  const [visitStatsError, setVisitStatsError] = useState("");
  const [liveCities, setLiveCities] = useState<{ city: string; country: string; activeUsers: number }[]>([]);
  const [liveCitiesLoading, setLiveCitiesLoading] = useState(false);
  const [liveCitiesError, setLiveCitiesError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeBusy, setPasswordChangeBusy] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState("");
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "ready" | "error" | "conflict">("loading");
  const [syncMessageKey, setSyncMessageKey] = useState<StringKey>("checkingLocalData");
  const [memberDraft, setMemberDraft] = useState<MemberDraft | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null);
  const [selectedProfession, setSelectedProfession] = useState<string | null>(null);
  const [userBusy, setUserBusy] = useState(false);
  const [userError, setUserError] = useState("");
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraft | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState<SuggestionDraft | null>(null);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [suggestionSent, setSuggestionSent] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft | null>(null);
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [announcementNotice, setAnnouncementNotice] = useState("");
  const [duaDraft, setDuaDraft] = useState<DuaDraft | null>(null);
  const [duaBusy, setDuaBusy] = useState(false);
  const [duaSent, setDuaSent] = useState(false);
  const [updateRequestDraft, setUpdateRequestDraft] = useState<{ memberId: number; photo: string; bio: string; contact: string; profession: string; publications: BookPublication[] } | null>(null);
  const [updateRequestBusy, setUpdateRequestBusy] = useState(false);
  const [updateRequestSent, setUpdateRequestSent] = useState(false);
  const [updateLinkValid, setUpdateLinkValid] = useState(false);
  const [updateLinkNotice, setUpdateLinkNotice] = useState("");
  const [liveUrlInput, setLiveUrlInput] = useState("");
  const [liveTitleInput, setLiveTitleInput] = useState("");
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveNotice, setLiveNotice] = useState("");
  const [guestbookMessage, setGuestbookMessage] = useState("");
  const [guestbookAuthorName, setGuestbookAuthorName] = useState("");
  const [qrCodeMember, setQrCodeMember] = useState<Member | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);
  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("sajra-seen-announcements") || "[]") as number[]; } catch { return []; }
  });
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [biometricUnlockError, setBiometricUnlockError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [myMemberId, setMyMemberId] = useState<number | null>(() => {
    const stored = localStorage.getItem(MY_MEMBER_ID_KEY);
    return stored ? Number(stored) : null;
  });
  const [myFamilyHint, setMyFamilyHint] = useState("");
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [importError, setImportError] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_BACKUP_KEY);
    } catch {
      return null;
    }
  });
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const bulkImportInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkImportResult, setBulkImportResult] = useState<{ addedCount: number; errors: string[] } | null>(null);
  const [bulkImportBusy, setBulkImportBusy] = useState(false);
  const silsilaRowRef = useRef<HTMLDivElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const hydrationDoneRef = useRef(false);
  const remoteUpdatedAtRef = useRef<string | null>(null);
  // The archive as last confirmed in Supabase; used to skip no-op saves and as the base for merges.
  const syncedRef = useRef<{ json: string; state: AppState } | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const toastTimerRef = useRef<number | undefined>(undefined);
  const [saveToast, setSaveToast] = useState<{ tone: "ok" | "error"; key: StringKey } | null>(null);
  const lightboxTouchRef = useRef<{
    mode: "pinch" | "swipe" | "pan";
    startDistance: number;
    startZoom: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullReadyRef = useRef(false);
  const [pullStatus, setPullStatus] = useState<"idle" | "refreshing" | "done" | "error">("idle");
  const [pullDistance, setPullDistance] = useState(0);

  // mfaPending keeps the admin area locked while a 2-step verification code is still owed,
  // even though signInWithPassword already issued a session (just one not yet at aal2).
  const isLoggedIn = Boolean(supabaseSession) && !mfaPending;
  const userRole = supabaseSession?.user.app_metadata?.role as Role | undefined;
  // Accounts without a role (e.g. created by hand in the Supabase dashboard) count as admins.
  const isAdmin = isLoggedIn && userRole !== "editor" && userRole !== "contributor";
  const canUseBiometric = isLoggedIn && (isAdmin || userRole === "editor");
  // Legacy contributor accounts are treated as editors. Their old fixed access remains enabled
  // until an admin changes the corresponding toggles in the Users list.
  const myUser = state.users.find((user) => user.email?.trim().toLowerCase() === supabaseSession?.user.email?.trim().toLowerCase());
  const myPermissions = userRole === "editor" || userRole === "contributor"
    ? userRole === "contributor"
      ? { addMember: true, editMember: true, reviewProfileUpdates: true, addGallery: true, addAnnouncement: true, ...myUser?.permissions }
      : myUser?.permissions
    : undefined;
  function editorPermission(key: keyof NonNullable<User["permissions"]>, allowedForNonEditor: boolean): boolean {
    if (!isLoggedIn) return false;
    if (isAdmin) return allowedForNonEditor;
    return myPermissions?.[key] === true;
  }
  const canEditMembers = editorPermission("editMember", isAdmin);
  const canReviewProfileUpdates = editorPermission("reviewProfileUpdates", isAdmin);
  const canAddToSlider = editorPermission("addToSlider", isAdmin);
  const canAddAnnouncement = editorPermission("addAnnouncement", true);
  const canAddLiveStreaming = editorPermission("addLiveStreaming", isAdmin);
  const canAddGalleryPhoto = editorPermission("addGallery", true);
  const canAddMember = editorPermission("addMember", true);
  // A locally-set preference (see Settings), not synced to other devices - gates the Admin
  // Dashboard behind the device's own fingerprint/face/PIN prompt, on top of the normal login.
  const biometricLockRequired = Capacitor.isNativePlatform() && canUseBiometric && localStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY) === "1";
  const language = state.language;
  const members = useMemo(() => [...state.members].sort(sortMembers), [state.members]);
  const memberMap = useMemo(() => new Map(state.members.map((member) => [member.id, member])), [state.members]);
  const roots = useMemo(() => state.members.filter(isRoot).sort(sortMembers), [state.members]);
  const selectedMember = (route.page === "member" || route.page === "branch") && route.memberId ? memberMap.get(route.memberId) : undefined;
  const qualityIssues = useMemo(() => findDataQualityIssues(state.members), [state.members]);
  const familyCalendarEvents = useMemo(() => getFamilyCalendarEvents(state.members), [state.members]);
  const todayMemories = useMemo(() => getTodayFamilyMemories(state.members, state.gallery), [state.members, state.gallery]);
  const deceasedMembers = useMemo(
    () => state.members.filter((member) => member.dod).sort((a, b) => (b.dod ?? "").localeCompare(a.dod ?? "")),
    [state.members]
  );
  const openDuaRequests = useMemo(
    () => state.duaRequests.filter((request) => request.status === "open").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.duaRequests]
  );
  const fulfilledDuaRequests = useMemo(
    () => state.duaRequests.filter((request) => request.status === "fulfilled").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.duaRequests]
  );
  const familyBookGroups = useMemo(() => groupMembersByGeneration(state.members), [state.members]);

  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      allowNestedScroll: true,
      smoothWheel: true,
      syncTouch: true,
      touchInertiaExponent: 1.2,
      touchMultiplier: 1.25,
      stopInertiaOnNavigate: true
    });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
    trackWebPageView(route.page);
    trackNativeScreenView(route.page);
  }, [route.page, route.memberId]);

  // Resets only on navigating to a (possibly new) update link, not on every members-array change,
  // so a background sync tick doesn't wipe the just-submitted "thank you" state back to the form.
  useEffect(() => {
    if (route.page !== "update") return;
    setUpdateRequestSent(false);
    setUpdateLinkValid(false);
    setUpdateLinkNotice("");
  }, [route.page, route.memberId, route.updateToken]);

  useEffect(() => {
    if (route.page !== "update" || !route.memberId || !route.updateToken) {
      setUpdateLinkValid(false);
      return;
    }
    let cancelled = false;
    void validateProfileUpdateLink(route.memberId, route.updateToken)
      .then((valid) => { if (!cancelled) setUpdateLinkValid(valid); })
      .catch(() => { if (!cancelled) setUpdateLinkValid(false); });
    return () => { cancelled = true; };
  }, [route.page, route.memberId, route.updateToken]);

  // Seeds the draft once the target member's real data is available. Kept on state.members too
  // (not just route) because on a cold load the member a brand-new link points to - e.g. one just
  // added via bulk import - may not be in the locally-cached state yet, only after Supabase syncs
  // in; the functional guard stops that later sync from re-seeding and wiping what was typed.
  useEffect(() => {
    if (route.page !== "update" || !route.memberId || !updateLinkValid) return;
    const member = state.members.find((candidate) => candidate.id === route.memberId);
    if (!member) return;
    setUpdateRequestDraft((current) =>
      current && current.memberId === member.id ? current : { memberId: member.id, photo: member.photo ?? "", bio: member.bio ?? "", contact: member.contact ?? "", profession: member.profession ?? "", publications: member.publications ?? [] }
    );
  }, [route.page, route.memberId, route.updateToken, updateLinkValid, state.members]);

  useEffect(() => {
    if (adminSection !== "logs") setLogsPage(0);
  }, [adminSection]);

  useEffect(() => {
    if (adminSection !== "analytics" || !isLoggedIn || !supabaseConfigured) return;
    let cancelled = false;
    setVisitStatsLoading(true);
    setVisitStatsError("");
    fetchVisitStats()
      .then((stats) => { if (!cancelled) setVisitStats(stats); })
      .catch((error) => { if (!cancelled) setVisitStatsError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setVisitStatsLoading(false); });
    return () => { cancelled = true; };
  }, [adminSection, isLoggedIn, supabaseConfigured]);

  useEffect(() => {
    if (adminSection !== "analytics" || !isLoggedIn || !supabaseConfigured) return;
    let cancelled = false;
    const refresh = async () => {
      setLiveCitiesLoading(true);
      setLiveCitiesError("");
      try {
        const cities = await fetchLiveVisitorCities();
        if (!cancelled) setLiveCities(cities);
      } catch (error) {
        if (!cancelled) setLiveCitiesError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLiveCitiesLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [adminSection, isLoggedIn, supabaseConfigured]);

  // Scrolls the Silsila chain to its end (the current member) by default, so on a long lineage
  // the most relevant part is visible without the visitor having to scroll it themselves first.
  useEffect(() => {
    if (route.page !== "member") return;
    const row = silsilaRowRef.current;
    if (row) row.scrollLeft = row.scrollWidth;
  }, [route.page, route.memberId]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute());
      setMobileNavOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "#/home";
    // Expired reset link: land on the admin page, where the "request a new link" UI lives.
    // (A valid recovery link is left alone so Supabase can read its tokens from the hash;
    // the PASSWORD_RECOVERY event below then takes the user to the admin page.)
    if (STARTED_WITH_EXPIRED_LINK) window.location.hash = "#/admin";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    saveState(state);
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  }, [state, language]);

  useEffect(() => {
    void getSupabaseSession().then(setSupabaseSession);
    return onSupabaseAuthChange((session, event) => {
      setSupabaseSession(session);
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        navigate({ page: "admin" });
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSupabase() {
      if (!supabaseConfigured) {
        setSyncStatus("ready");
        setSyncMessageKey("localOnlyMode");
        hydrationDoneRef.current = true;
        // Local-only mode: track visits per device since there's no shared counter to bump.
        if (!sessionStorage.getItem(VISIT_SESSION_KEY)) {
          sessionStorage.setItem(VISIT_SESSION_KEY, "1");
          updateState((current) => ({ ...current, visitorCount: (current.visitorCount ?? 0) + 1 }));
          void logVisit();
        }
        return;
      }

      const localSnapshot = initialStateRef.current ?? loadState();
      const localHasData = hasMeaningfulData(localSnapshot);

      try {
        const remote = await loadSupabaseState();
        if (cancelled) return;

        const remoteHasData = remote ? hasMeaningfulData(remote.state) : false;

        // Remember the row's version whenever one exists, so a later save updates it instead of trying to insert a second row.
        if (remote) remoteUpdatedAtRef.current = remote.updatedAt;

        if (remote && remoteHasData) {
          setState(remote.state);
          saveState(remote.state);
          syncedRef.current = { json: JSON.stringify(remote.state), state: remote.state };
          setSyncMessageKey("loadedShared");
        } else if (localHasData) {
          setSyncMessageKey("sharedEmpty");
        } else {
          setSyncMessageKey("connectedWaiting");
        }

        setSyncStatus("ready");

        // Best-effort, once per browser session: bump the shared visitor counter. Only touch
        // local state here and let the normal debounced autosave (below) persist it through the
        // save queue - an extra direct save here used a snapshot from page-load time, so if it
        // landed after some other save (e.g. a freshly posted announcement), it could silently
        // overwrite that newer data with this stale one.
        if (remote && !sessionStorage.getItem(VISIT_SESSION_KEY)) {
          sessionStorage.setItem(VISIT_SESSION_KEY, "1");
          setState((current) => ({ ...current, visitorCount: (current.visitorCount ?? 0) + 1 }));
          void logVisit();
        }
      } catch {
        if (cancelled) return;
        setSyncStatus("error");
        setSyncMessageKey(supabaseConfigured ? "cloudUnavailable" : "localOnlyMode");
      } finally {
        if (!cancelled) hydrationDoneRef.current = true;
      }
    }

    void hydrateSupabase();
    return () => {
      cancelled = true;
    };
  }, [supabaseConfigured]);

  // Keeps this device's "last seen" fresh for the admin Analytics section's "active now" count,
  // for as long as the app stays open - not tied to the once-per-session visit log above.
  useEffect(() => {
    if (!supabaseConfigured) return;
    void sendPresenceHeartbeat();
    const interval = window.setInterval(() => void sendPresenceHeartbeat(), 45000);
    return () => window.clearInterval(interval);
  }, [supabaseConfigured]);

  function showSaveToast(tone: "ok" | "error", key: StringKey, hideAfterMs?: number) {
    window.clearTimeout(toastTimerRef.current);
    setSaveToast({ tone, key });
    if (hideAfterMs) toastTimerRef.current = window.setTimeout(() => setSaveToast(null), hideAfterMs);
  }

  /**
   * Writes `next` to Supabase. If someone else saved first, their version is loaded and our
   * changes are merged on top of it (see merge.ts) instead of being thrown away.
   */
  async function persistToSupabase(next: AppState) {
    let attempt = next;

    for (let tries = 0; tries < 3; tries += 1) {
      const json = JSON.stringify(attempt);
      if (json === syncedRef.current?.json) return;

      showSaveToast("ok", "savingChanges");
      try {
        const updatedAt =
          remoteUpdatedAtRef.current === null
            ? await publishInitialState(attempt)
            : await saveSupabaseState(attempt, remoteUpdatedAtRef.current);
        remoteUpdatedAtRef.current = updatedAt;
        syncedRef.current = { json, state: attempt };
        setSyncStatus("ready");
        setSyncMessageKey(tries > 0 ? "conflictMerged" : "changesSaved");
        showSaveToast("ok", tries > 0 ? "conflictMerged" : "changesSaved", tries > 0 ? 6000 : 2500);
        return;
      } catch (error) {
        if (!(error instanceof StaleWriteError)) {
          setSyncStatus("error");
          setSyncMessageKey("saveFailed");
          showSaveToast("error", "saveFailed");
          return;
        }
      }

      try {
        setSyncStatus("conflict");
        setSyncMessageKey("conflictReloading");
        const remote = await loadSupabaseState();
        if (!remote) {
          remoteUpdatedAtRef.current = null;
          continue;
        }
        const merged = mergeStates(syncedRef.current?.state ?? remote.state, attempt, remote.state);
        const previous = attempt;
        remoteUpdatedAtRef.current = remote.updatedAt;
        syncedRef.current = { json: JSON.stringify(remote.state), state: remote.state };
        // Show the merged archive here too, keeping anything typed while this save was running.
        setState((current) => mergeStates(previous, current, merged));
        attempt = merged;
      } catch {
        setSyncStatus("error");
        setSyncMessageKey("saveFailed");
        showSaveToast("error", "saveFailed");
        return;
      }
    }

    setSyncStatus("error");
    setSyncMessageKey("saveFailed");
    showSaveToast("error", "saveFailed");
  }

  /** Pull-to-refresh: re-fetches the shared archive and merges it the same way a save conflict does, so anything typed locally but not yet saved isn't lost. */
  async function refreshFromSupabase() {
    if (!supabaseConfigured || pullStatus === "refreshing") return;
    setPullStatus("refreshing");
    try {
      const remote = await loadSupabaseState();
      if (remote) {
        const merged = mergeStates(syncedRef.current?.state ?? remote.state, state, remote.state);
        remoteUpdatedAtRef.current = remote.updatedAt;
        syncedRef.current = { json: JSON.stringify(remote.state), state: remote.state };
        setState(merged);
      }
      setPullStatus("done");
    } catch {
      setPullStatus("error");
    } finally {
      window.setTimeout(() => setPullStatus("idle"), 1400);
    }
  }

  function handlePullTouchStart(e: ReactTouchEvent) {
    const scrollTop = lenisRef.current?.actualScroll ?? window.scrollY;
    pullStartYRef.current = scrollTop <= 1 && e.touches.length === 1 && pullStatus === "idle" ? e.touches[0].clientY : null;
  }

  function handlePullTouchMove(e: ReactTouchEvent) {
    if (pullStartYRef.current === null) return;
    const dy = e.touches[0].clientY - pullStartYRef.current;
    if (dy <= 0) { setPullDistance(0); pullReadyRef.current = false; return; }
    setPullDistance(Math.min(70, dy * 0.54));
    pullReadyRef.current = dy >= 130;
  }

  function handlePullTouchEnd() {
    if (pullReadyRef.current) void refreshFromSupabase();
    setPullDistance(0);
    pullStartYRef.current = null;
    pullReadyRef.current = false;
  }

  useEffect(() => {
    if (!hydrationDoneRef.current || !supabaseConfigured || !isLoggedIn) return;
    // Only write when the archive really changed since it was last synced (logging in must not touch the shared row).
    if (JSON.stringify(state) === syncedRef.current?.json) return;

    const handle = window.setTimeout(() => {
      // One save at a time, so a slow save is never overtaken by the next one.
      saveChainRef.current = saveChainRef.current.then(() => persistToSupabase(state));
    }, 600);

    return () => window.clearTimeout(handle);
  }, [state, supabaseConfigured, isLoggedIn]);

  useEffect(() => {
    // Wait until cloud hydration finishes before treating a missing local member as invalid.
    // Otherwise a refresh on a deep link briefly sees the empty initial cache and redirects home.
    if (syncStatus === "ready" && (route.page === "member" || route.page === "branch") && route.memberId && !memberMap.has(route.memberId)) {
      window.location.hash = "#/home";
    }
  }, [memberMap, route, syncStatus]);

  // Android's hardware/gesture back button otherwise just exits the app from any page. This
  // steps back through the app's own hash history instead, only exiting once there's nowhere
  // left to go back to (same as the Home page having no "back").
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      if (route.page !== "home" && window.history.length > 1) {
        window.history.back();
      } else {
        void CapacitorApp.exitApp();
      }
    });
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [route.page]);

  // Asks for the Android notification permission up front (the system's own one-time prompt),
  // instead of only when the user later finds the "Turn on notifications" toggle in About.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void PushNotifications.checkPermissions().then((status) => {
      if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
        void PushNotifications.requestPermissions();
      }
    });
  }, []);

  // One-time prompt for the official Android battery-optimization exemption, so push
  // notifications keep arriving in the background on OEMs (Xiaomi, Oppo, Vivo, Huawei) that
  // otherwise kill closed apps. Gated on localStorage since the system dialog would otherwise
  // reappear every launch if the user dismisses it - they can still do this later from Settings.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (localStorage.getItem("sajra-battery-exemption-prompted")) return;
    void appNotifications.isIgnoringBatteryOptimizations().then((result) => {
      if (!result.ignoring) void appNotifications.requestIgnoreBatteryOptimizations();
      localStorage.setItem("sajra-battery-exemption-prompted", "1");
    }).catch(() => {});
  }, []);

  // Every install auto-subscribes to the "sajra_live" FCM topic once, so a live family event
  // reaches everyone who has the app - unlike announcement/update notifications, this is not an
  // opt-in toggle. Gated on localStorage so it's only attempted once; a failure (e.g. permission
  // not yet granted) just retries on the next launch since the flag is never set on error.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (localStorage.getItem("sajra-live-subscribed")) return;
    (async () => {
      try {
        await PushNotifications.createChannel({ id: "sajra_live", name: "Sajra live", description: "Live video links posted by the Sajra admin", importance: 4 });
        await PushNotifications.register();
        await appNotifications.subscribeToTopic({ topic: "sajra_live" });
        localStorage.setItem("sajra-live-subscribed", "1");
      } catch {
        // Retried on the next launch.
      }
    })();
  }, []);

  // Seeds the admin's live-link editor fields when they land on the Live page, without
  // clobbering what they're typing if liveStream changes elsewhere while they're still on it.
  useEffect(() => {
    if (route.page === "live" && canAddLiveStreaming) {
      setLiveUrlInput(state.liveStream?.url ?? "");
      setLiveTitleInput(state.liveStream?.title ?? "");
      setLiveNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page, canAddLiveStreaming]);

  // Forwards unhandled JS errors to Crashlytics (native crashes are caught automatically, but
  // most real-world failures here are in the WebView, not native code).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    function reportError(message: string, stack?: string) {
      void appNotifications.logException({ message, stack }).catch(() => {});
    }
    function onError(event: ErrorEvent) {
      reportError(event.message, event.error instanceof Error ? event.error.stack : undefined);
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      reportError(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Load account security settings when an authenticated user opens Settings.
  useEffect(() => {
    if (!isLoggedIn || route.page !== "settings") return;
    void listMfaFactors().then(setMfaFactors).catch(() => {});
  }, [isLoggedIn, route.page]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || route.page !== "calendar") return;
    void Badge.clear().catch(() => {});
  }, [route.page]);

  function navigate(next: RouteState): void {
    window.location.hash = routeHash(next);
  }

  async function handleLoginSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabaseConfigured) {
      setLoginError(t(language, "loginNotConfigured"));
      return;
    }
    setLoginBusy(true);
    setLoginError("");
    try {
      await signInWithPassword(loginEmail.trim(), loginPassword);
      if (await mfaStepUpRequired()) {
        const factors = await listMfaFactors();
        const factor = factors.find((f) => f.status === "verified");
        if (factor) {
          setMfaFactorId(factor.id);
          setMfaPending(true);
          setMfaError("");
          setMfaCode("");
        } else {
          navigate({ page: "admin" });
        }
      } else {
        navigate({ page: "admin" });
      }
      setLoginEmail("");
      setLoginPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : t(language, "invalidLogin"));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleMfaChallengeSubmit(event: FormEvent) {
    event.preventDefault();
    setMfaBusy(true);
    setMfaError("");
    try {
      await verifyMfaChallenge(mfaFactorId, mfaCode.trim());
      setMfaPending(false);
      setMfaFactorId("");
      setMfaCode("");
      navigate({ page: "admin" });
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : t(language, "mfaInvalidCode"));
    } finally {
      setMfaBusy(false);
    }
  }

  function logout() {
    void signOutSupabase();
    setMfaPending(false);
    setMfaFactorId("");
    setBiometricUnlocked(false);
    navigate({ page: "home" });
  }

  async function handleForgotPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabaseConfigured) {
      setForgotError(t(language, "loginNotConfigured"));
      return;
    }
    setForgotBusy(true);
    setForgotError("");
    setForgotMessage("");
    try {
      await sendPasswordResetEmail(forgotEmail.trim());
      setForgotMessage(t(language, "forgotPasswordSent"));
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : t(language, "forgotPasswordFailed"));
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleChangePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordChangeError("");
    setPasswordChangeSuccess(false);
    if (newPassword.length < 6) {
      setPasswordChangeError(t(language, "passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError(t(language, "passwordsDontMatch"));
      return;
    }
    setPasswordChangeBusy(true);
    try {
      await updatePassword(newPassword);
      setPasswordChangeSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      if (recoveryMode) navigate({ page: "settings" });
      setRecoveryMode(false);
    } catch (error) {
      setPasswordChangeError(error instanceof Error ? error.message : t(language, "passwordChangeFailed"));
    } finally {
      setPasswordChangeBusy(false);
    }
  }

  function updateState(next: (current: AppState) => AppState) {
    setState((current) => next(current));
  }

  async function startMfaEnrollment() {
    setMfaSetupError("");
    setMfaSetupCode("");
    try {
      setMfaEnrollment(await enrollMfa());
    } catch (error) {
      setMfaSetupError(error instanceof Error ? error.message : t(language, "mfaInvalidCode"));
    }
  }

  function cancelMfaSetup() {
    setMfaEnrollment(null);
    setMfaSetupCode("");
    setMfaSetupError("");
  }

  async function confirmMfaSetup() {
    if (!mfaEnrollment) return;
    setMfaSetupBusy(true);
    setMfaSetupError("");
    try {
      await confirmMfaEnrollment(mfaEnrollment.factorId, mfaSetupCode.trim());
      setMfaEnrollment(null);
      setMfaSetupCode("");
      setMfaFactors(await listMfaFactors());
    } catch (error) {
      setMfaSetupError(error instanceof Error ? error.message : t(language, "mfaInvalidCode"));
    } finally {
      setMfaSetupBusy(false);
    }
  }

  async function disableMfa(factorId: string) {
    setMfaSetupBusy(true);
    setMfaSetupError("");
    try {
      await unenrollMfa(factorId);
      setMfaFactors(await listMfaFactors());
    } catch (error) {
      setMfaSetupError(error instanceof Error ? error.message : t(language, "mfaInvalidCode"));
    } finally {
      setMfaSetupBusy(false);
    }
  }

  function renderAccountSecuritySettings(): ReactNode {
    return (
      <div className="card" style={{ marginTop: 24, padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t(language, "adminNavSecurity")}</h3>
        <p className="hint">{t(language, "changePasswordSubtitle")}</p>
        <div className="admin-form-narrow">
          <form className="form-stack" onSubmit={handleChangePasswordSubmit}>
            <label>
              {t(language, "newPasswordLabel")}
              <PasswordField value={newPassword} onChange={setNewPassword} autoComplete="new-password" language={language} />
            </label>
            <label>
              {t(language, "confirmPasswordLabel")}
              <PasswordField value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" language={language} />
            </label>
            {passwordChangeError ? <div className="notice danger">{passwordChangeError}</div> : null}
            {passwordChangeSuccess ? <div className="notice">{t(language, "passwordChangedSuccess")}</div> : null}
            <button className="btn" type="submit" disabled={passwordChangeBusy}>{passwordChangeBusy ? t(language, "savingPassword") : t(language, "savePasswordButton")}</button>
          </form>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <strong>{t(language, "mfaSectionTitle")}</strong>
            <p className="hint" style={{ marginTop: 6 }}>
              {mfaFactors.some((factor) => factor.status === "verified") ? t(language, "mfaSectionSubtitleOn") : t(language, "mfaSectionSubtitleOff")}
            </p>
            {mfaEnrollment ? (
              <div style={{ marginTop: 12 }}>
                <p className="hint">{t(language, "mfaScanInstruction")}</p>
                {mfaEnrollment.qrCode.startsWith("data:") ? (
                  <img src={mfaEnrollment.qrCode} alt="" style={{ width: 180, height: 180, margin: "10px 0" }} />
                ) : (
                  <div style={{ width: 180, margin: "10px 0" }} dangerouslySetInnerHTML={{ __html: mfaEnrollment.qrCode }} />
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  className="field"
                  value={mfaSetupCode}
                  onChange={(event) => setMfaSetupCode(event.target.value)}
                  maxLength={6}
                  style={{ maxWidth: 160 }}
                />
                {mfaSetupError ? <div className="notice danger" style={{ marginTop: 8 }}>{mfaSetupError}</div> : null}
                <div className="actions-row" style={{ marginTop: 10 }}>
                  <button className="btn" type="button" disabled={mfaSetupBusy || mfaSetupCode.trim().length < 6} onClick={() => void confirmMfaSetup()}>
                    {mfaSetupBusy ? t(language, "verifyingCode") : t(language, "mfaConfirmButton")}
                  </button>
                  <button className="btn-ghost" type="button" onClick={cancelMfaSetup}>{t(language, "mfaCancelButton")}</button>
                </div>
              </div>
            ) : mfaFactors.some((factor) => factor.status === "verified") ? (
              <div style={{ marginTop: 12 }}>
                {mfaSetupError ? <div className="notice danger" style={{ marginBottom: 8 }}>{mfaSetupError}</div> : null}
                <button
                  className="btn-ghost danger"
                  type="button"
                  disabled={mfaSetupBusy}
                  onClick={() => {
                    const factor = mfaFactors.find((item) => item.status === "verified");
                    if (factor) void disableMfa(factor.id);
                  }}
                >
                  {t(language, "mfaDisableButton")}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                {mfaSetupError ? <div className="notice danger" style={{ marginBottom: 8 }}>{mfaSetupError}</div> : null}
                <button className="btn-ghost" type="button" onClick={() => void startMfaEnrollment()}>{t(language, "mfaEnableButton")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Existing profiles are editable only when an admin grants the permission.
  function openMemberEditor(member?: Member) {
    if (member ? !canEditMembers : !canAddMember) return;
    setMemberDraft(emptyMemberDraft(member));
    setSpouseSearchQuery("");
    setFatherSearchQuery("");
    setMotherSearchQuery("");
  }

  function openUserEditor(user?: User) {
    if (!isAdmin) return;
    setUserError("");
    setUserDraft(user ? emptyUserDraft(user) : emptyUserDraft());
  }

  function openGalleryEditor(image?: GalleryImage) {
    if (image ? !isAdmin : !canAddGalleryPhoto) return;
    setGalleryDraft(emptyGalleryDraft(image));
  }

  function closeEditors() {
    setMemberDraft(null);
    setUserDraft(null);
    setUserError("");
    setGalleryDraft(null);
    setSpouseSearchQuery("");
    setFatherSearchQuery("");
    setMotherSearchQuery("");
  }

  // Open to anyone, logged in or not, that's the point of a suggestion box.
  function openSuggestionEditor(member?: Member) {
    setSuggestionSent(false);
    setSuggestionDraft({
      memberId: member ? String(member.id) : "",
      memberSearch: member ? fullLabel(member, language) : "",
      message: "",
      submitterName: ""
    });
  }

  function closeSuggestionEditor() {
    setSuggestionDraft(null);
  }

  async function submitSuggestion() {
    if (!suggestionDraft || !suggestionDraft.message.trim() || suggestionBusy) return;
    const memberId = suggestionDraft.memberId ? Number(suggestionDraft.memberId) : null;
    setSuggestionBusy(true);
    try {
      let suggestion: Suggestion;
      if (supabaseConfigured) {
        suggestion = await submitPublicSajraAction("suggestion", { memberId, message: suggestionDraft.message.trim(), submitterName: suggestionDraft.submitterName.trim() || null }) as unknown as Suggestion;
        setState((current) => ({ ...current, suggestions: [suggestion, ...current.suggestions].slice(0, 200) }));
      } else {
        const member = memberId ? state.members.find((candidate) => candidate.id === memberId) : undefined;
        suggestion = { id: nextId(state.suggestions), memberId, memberName: member?.name ?? null, message: suggestionDraft.message.trim(), submitterName: suggestionDraft.submitterName.trim() || null, status: "pending", createdAt: new Date().toISOString() };
        updateState((current) => ({ ...current, suggestions: [suggestion, ...current.suggestions].slice(0, 200) }));
      }
      if (supabaseConfigured) void sendAdminAlertNotification("suggestion", suggestionDraft.message.trim(), suggestionDraft.submitterName.trim() || null);
      setSuggestionSent(true);
      setSuggestionDraft(null);
    } finally {
      setSuggestionBusy(false);
    }
  }

  async function submitChatFeedback(answer: string, helpful: boolean): Promise<void> {
    const message = `Chatbot feedback (${helpful ? "helpful" : "not helpful"}): ${answer.slice(0, 280)}`;
    if (supabaseConfigured) {
      const suggestion = await submitPublicSajraAction("feedback", { message }) as unknown as Suggestion;
      setState((current) => ({ ...current, suggestions: [suggestion, ...current.suggestions].slice(0, 200) }));
    } else {
      const suggestion: Suggestion = { id: nextId(state.suggestions), memberId: null, memberName: null, message, submitterName: "Anis Ai visitor feedback", status: "pending", createdAt: new Date().toISOString() };
      updateState((current) => ({ ...current, suggestions: [suggestion, ...current.suggestions].slice(0, 200) }));
    }
  }
  function resolveSuggestion(id: number) {
    if (!isAdmin) return;
    updateState((current) => ({
      ...current,
      suggestions: current.suggestions.map((suggestion) => (suggestion.id === id ? { ...suggestion, status: "resolved" } : suggestion))
    }));
  }

  function deleteSuggestion(id: number) {
    if (!isAdmin) return;
    updateState((current) => ({ ...current, suggestions: current.suggestions.filter((suggestion) => suggestion.id !== id) }));
  }

  // Open to anyone, logged in or not - a dua request is meant to reach the family quickly when
  // someone is ill or in difficulty, not gated behind the editor permissions Announcements use.
  function openDuaEditor() {
    setDuaSent(false);
    setDuaDraft({ message: "", requesterName: "" });
  }

  function closeDuaEditor() {
    setDuaDraft(null);
  }

  async function submitDuaRequest() {
    if (!duaDraft || !duaDraft.message.trim() || duaBusy) return;
    setDuaBusy(true);
    try {
      if (supabaseConfigured) {
        const duaRequest = await submitPublicSajraAction("dua", { message: duaDraft.message.trim(), requesterName: duaDraft.requesterName.trim() || null }) as unknown as DuaRequest;
        setState((current) => ({ ...current, duaRequests: [duaRequest, ...current.duaRequests].slice(0, 200) }));
      } else {
        const duaRequest: DuaRequest = { id: nextId(state.duaRequests), message: duaDraft.message.trim(), requesterName: duaDraft.requesterName.trim() || null, status: "open", createdAt: new Date().toISOString() };
        updateState((current) => ({ ...current, duaRequests: [duaRequest, ...current.duaRequests].slice(0, 200) }));
      }
      if (supabaseConfigured) void sendAdminAlertNotification("dua", duaDraft.message.trim(), duaDraft.requesterName.trim() || null);
      setDuaSent(true);
      setDuaDraft(null);
    } finally {
      setDuaBusy(false);
    }
  }

  function markDuaFulfilled(id: number) {
    if (!isAdmin) return;
    updateState((current) => ({
      ...current,
      duaRequests: current.duaRequests.map((request) => (request.id === id ? { ...request, status: "fulfilled" } : request))
    }));
  }

  function deleteDuaRequest(id: number) {
    if (!isAdmin) return;
    updateState((current) => ({ ...current, duaRequests: current.duaRequests.filter((request) => request.id !== id) }));
  }

  // The link an admin/editor sends a member so they can confirm/update their own photo, bio and
  // contact without seeing (or being able to edit) anyone else's profile or the rest of the tree.
  async function copyUpdateLink(member: Member) {
    setUpdateLinkNotice("");
    try {
      const token = await createProfileUpdateLink(member.id);
      const url = publicPageUrl(`/update/${member.id}?token=${encodeURIComponent(token)}`);
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: displayName(member, language), url });
      } else if (navigator.share) {
        await navigator.share({ title: displayName(member, language), url });
      } else {
        await navigator.clipboard.writeText(url);
        setUpdateLinkNotice(t(language, "updateLinkCopied"));
      }
    } catch {
      setUpdateLinkNotice("Could not create a secure profile link. Please sign in and try again.");
    }
  }

  async function submitMemberUpdateRequest() {
    if (!updateRequestDraft || updateRequestBusy || !route.memberId || !route.updateToken || !updateLinkValid) return;
    const member = state.members.find((candidate) => candidate.id === updateRequestDraft.memberId);
    if (!member) return;
    setUpdateRequestBusy(true);
    try {
      const request = await submitProfileUpdateLink({
        memberId: member.id,
        token: route.updateToken,
        photo: updateRequestDraft.photo.trim(),
        bio: updateRequestDraft.bio.trim(),
        contact: updateRequestDraft.contact.trim(),
        profession: normalizeProfession(updateRequestDraft.profession) ?? "",
        publications: updateRequestDraft.publications.filter((item) => item.title.trim()).map((item) => ({ ...item, title: item.title.trim().slice(0, 180), publisher: item.publisher?.trim().slice(0, 120) || null, year: item.year?.trim().slice(0, 12) || null, url: item.url?.trim().slice(0, 500) || null }))
      });
      setState((current) => ({ ...current, memberUpdateRequests: [request, ...current.memberUpdateRequests.filter((item) => item.id !== request.id)].slice(0, 200) }));
      setUpdateLinkValid(false);
      setUpdateRequestSent(true);
    } catch (error) {
      setUpdateLinkValid(false);
      setUpdateLinkNotice(error instanceof Error ? error.message : "This profile link is invalid or has expired.");
    } finally {
      setUpdateRequestBusy(false);
    }
  }

  function approveMemberUpdateRequest(id: number) {
    if (!canReviewProfileUpdates) return;
    const actorEmail = supabaseSession?.user.email ?? null;
    updateState((current) => {
      const request = current.memberUpdateRequests.find((item) => item.id === id);
      if (!request) return current;
      const existingMember = current.members.find((member) => member.id === request.memberId);
      if (!existingMember) {
        return { ...current, memberUpdateRequests: current.memberUpdateRequests.map((item) => (item.id === id ? { ...item, status: "rejected" } : item)) };
      }
      const updatedMember: Member = {
        ...existingMember,
        photo: request.photo !== undefined ? request.photo : existingMember.photo,
        bio: request.bio !== undefined ? request.bio : existingMember.bio,
        contact: request.contact !== undefined ? request.contact : existingMember.contact,
        profession: request.profession !== undefined ? request.profession : existingMember.profession,
        publications: request.publications !== undefined ? request.publications : existingMember.publications
      };
      const next = {
        ...current,
        members: current.members.map((member) => (member.id === existingMember.id ? updatedMember : member)),
        memberUpdateRequests: current.memberUpdateRequests.map((item) => (item.id === id ? { ...item, status: "approved" as const } : item))
      };
      return pushActivityLog(next, { type: "member", action: "updated", label: `${updatedMember.name} (${updatedMember.uniqueId})`, actorEmail, memberBefore: existingMember, memberAfter: updatedMember });
    });
  }

  function rejectMemberUpdateRequest(id: number) {
    if (!canReviewProfileUpdates) return;
    updateState((current) => ({
      ...current,
      memberUpdateRequests: current.memberUpdateRequests.map((item) => (item.id === id ? { ...item, status: "rejected" } : item))
    }));
  }

  function deleteMemberUpdateRequest(id: number) {
    if (!canReviewProfileUpdates) return;
    updateState((current) => ({ ...current, memberUpdateRequests: current.memberUpdateRequests.filter((item) => item.id !== id) }));
  }

  // Editors need the "Post an announcement" permission granted in the Users admin section.
  function openAnnouncementEditor() {
    if (!canAddAnnouncement) return;
    setAnnouncementNotice("");
    setAnnouncementDraft({ message: "", authorName: "", expiresAt: "" });
  }

  function closeAnnouncementEditor() {
    setAnnouncementDraft(null);
  }

  async function submitAnnouncement() {
    if (!canAddAnnouncement || !announcementDraft || !announcementDraft.message.trim() || announcementBusy) return;
    const messageText = announcementDraft.message.trim();
    setAnnouncementBusy(true);
    try {
      let publishedState: AppState | null = null;
      updateState((current) => {
        const announcement: Announcement = {
          id: nextId(current.announcements),
          message: messageText,
          authorName: announcementDraft.authorName.trim() || null,
          fromAdmin: isAdmin,
          expiresAt: announcementDraft.expiresAt || null,
          createdAt: new Date().toISOString()
        };
        const next = { ...current, announcements: [announcement, ...current.announcements].slice(0, 200) };
        publishedState = next;
        return next;
      });
      // Push immediately rather than waiting for the normal debounced autosave, so the
      // announcement reaches everyone else's browser right away instead of after ~600ms.
      if (supabaseConfigured && publishedState) await persistToSupabase(publishedState);
      closeAnnouncementEditor();
      // The announcement is already saved at this point, so a failure here (e.g. the
      // send-announcement function isn't deployed yet) doesn't undo the post, it just means
      // nobody's phone buzzed, they'd still see it if they open Notifications.
      if (supabaseConfigured) {
        try {
          await sendAnnouncementNotification(messageText);
          setAnnouncementNotice(t(language, "announcementNotificationSent"));
        } catch (error) {
          setAnnouncementNotice(`${t(language, "announcementNotificationFailed")} ${error instanceof Error ? error.message : ""}`);
        }
      }
    } finally {
      setAnnouncementBusy(false);
    }
  }

  function deleteAnnouncement(id: number) {
    if (!isAdmin) return;
    updateState((current) => ({ ...current, announcements: current.announcements.filter((announcement) => announcement.id !== id) }));
  }

  // Only admins may set the live link - an editor needs the granted live-stream permission.
  // announcement, but a live family event notification going to literally every install
  // (see the sajra_live auto-subscribe effect below) needs tighter control than that.
  async function publishLive(url: string, kind: "youtube" | "upload", title: string) {
    setLiveBusy(true);
    setLiveNotice("");
    try {
      let publishedState: AppState | null = null;
      updateState((current) => {
        const next = { ...current, liveStream: { url, kind, title: title || null, updatedAt: new Date().toISOString() } };
        publishedState = next;
        return next;
      });
      if (supabaseConfigured && publishedState) await persistToSupabase(publishedState);
      if (supabaseConfigured) {
        try {
          await sendLiveNotification(title || null);
          setLiveNotice(t(language, "liveNotificationSent"));
        } catch (error) {
          setLiveNotice(`${t(language, "liveNotificationFailed")} ${error instanceof Error ? error.message : ""}`);
        }
      } else {
        setLiveNotice(t(language, "liveLinkSaved"));
      }
    } finally {
      setLiveBusy(false);
    }
  }

  async function publishLiveStream() {
    if (!canAddLiveStreaming || liveBusy) return;
    const url = liveUrlInput.trim();
    const title = liveTitleInput.trim();
    if (!getYouTubeEmbedUrl(url)) {
      setLiveNotice(t(language, "liveInvalidUrl"));
      return;
    }
    await publishLive(url, "youtube", title);
  }

  async function uploadLiveVideoFile(file?: File) {
    if (!canAddLiveStreaming || !file || liveBusy) return;
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      setLiveNotice(t(language, "liveVideoTooLarge"));
      return;
    }
    setLiveBusy(true);
    setLiveNotice("");
    try {
      const url = await uploadLiveVideo(file);
      await publishLive(url, "upload", liveTitleInput.trim());
    } catch (error) {
      setLiveBusy(false);
      setLiveNotice(`${t(language, "liveVideoUploadFailed")} ${error instanceof Error ? error.message : ""}`);
    }
  }

  function clearLiveStream() {
    if (!canAddLiveStreaming) return;
    updateState((current) => ({ ...current, liveStream: { url: null, title: null, updatedAt: new Date().toISOString() } }));
    setLiveUrlInput("");
    setLiveTitleInput("");
    setLiveNotice("");
  }

  // Anyone (no login needed) can leave a message on a member's profile, like Suggestions; only
  // an admin can remove one.
  async function submitGuestbookComment(memberId: number) {
    const message = guestbookMessage.trim();
    if (!message) return;
    const authorName = guestbookAuthorName.trim() || null;
    if (supabaseConfigured) {
      const comment = await submitPublicSajraAction("guestbook", { memberId, message, authorName });
      setState((current) => ({ ...current, profileComments: [comment as unknown as AppState["profileComments"][number], ...current.profileComments].slice(0, 2000) }));
    } else {
      updateState((current) => ({ ...current, profileComments: [{ id: nextId(current.profileComments), memberId, message, authorName, createdAt: new Date().toISOString() }, ...current.profileComments].slice(0, 2000) }));
    }
    if (supabaseConfigured) void sendAdminAlertNotification("guestbook", message, authorName);
    setGuestbookMessage("");
    setGuestbookAuthorName("");
  }

  function deleteGuestbookComment(id: number) {
    if (!isAdmin) return;
    updateState((current) => ({ ...current, profileComments: current.profileComments.filter((comment) => comment.id !== id) }));
  }

  function printPage() {
    if (Capacitor.isNativePlatform()) { void appPrint.print().catch(() => {}); return; }
    window.print();
  }

  async function shareMember(member: Member) {
    setShareNotice("");
    const url = publicPageUrl(`/member/${member.id}`);
    const title = displayName(member, language);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title, url });
      } else if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareNotice(t(language, "profileLinkCopied"));
      }
    } catch {
      // User cancelled the native share sheet - not an error worth showing.
    }
  }

  async function openQrCode(member: Member) {
    const url = publicPageUrl(`/member/${member.id}`);
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#2e5185", light: "#ffffff" } });
      setQrCodeDataUrl(dataUrl);
      setQrCodeMember(member);
    } catch {
      // Generation failed (shouldn't happen offline) - just don't open the modal.
    }
  }

  function closeQrCode() {
    setQrCodeMember(null);
    setQrCodeDataUrl("");
  }

  // "My Family" is a pure per-device preference (not tied to login or synced) - whoever is
  // using this phone/browser picks their own profile once, then gets a one-tap shortcut back to
  // their immediate family instead of searching the whole tree every time.
  function setAsMyFamily(memberId: number) {
    localStorage.setItem(MY_MEMBER_ID_KEY, String(memberId));
    setMyMemberId(memberId);
  }

  function clearMyFamily() {
    localStorage.removeItem(MY_MEMBER_ID_KEY);
    setMyMemberId(null);
  }

  function goToMyFamily() {
    if (myMemberId && state.members.some((member) => member.id === myMemberId)) {
      navigate({ page: "member", memberId: myMemberId });
      return;
    }
    setMyFamilyHint(t(language, "myFamilyNotSetHint"));
    navigate({ page: "home" });
    window.setTimeout(() => setMyFamilyHint(""), 5000);
  }

  async function unlockAdminDashboard() {
    setBiometricUnlockError("");
    try {
      await appBiometric.authenticate({ title: t(language, "unlockAdminButton"), subtitle: t(language, "biometricLockSubtitle") });
      setBiometricUnlocked(true);
    } catch {
      setBiometricUnlockError(t(language, "biometricUnlockFailed"));
    }
  }

  // Prompts automatically on arrival, so the user isn't forced to tap a button first - the
  // button below is only needed if they cancel or the prompt errors.
  useEffect(() => {
    if (isLoggedIn && route.page === "admin" && biometricLockRequired && !biometricUnlocked) {
      void unlockAdminDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page, biometricLockRequired, isLoggedIn]);

  function openLightbox(image: GalleryImage) {
    setLightboxImage(image);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }

  function closeLightbox() {
    setLightboxImage(null);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }

  function zoomInLightbox() {
    setZoomLevel((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100));
  }

  function zoomOutLightbox() {
    setZoomLevel((z) => {
      const next = Math.max(0.5, Math.round((z - 0.25) * 100) / 100);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function goToAdjacentImage(direction: 1 | -1) {
    if (!lightboxImage) return;
    const list = state.gallery;
    const index = list.findIndex((image) => image.id === lightboxImage.id);
    if (index === -1) return;
    const nextIndex = (index + direction + list.length) % list.length;
    setLightboxImage(list[nextIndex]);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }

  function lightboxTouchDistance(touches: ReactTouchEvent["touches"]) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function handleLightboxTouchStart(e: ReactTouchEvent) {
    if (e.touches.length === 2) {
      lightboxTouchRef.current = {
        mode: "pinch", startDistance: lightboxTouchDistance(e.touches), startZoom: zoomLevel,
        startX: 0, startY: 0, startPanX: panOffset.x, startPanY: panOffset.y
      };
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      lightboxTouchRef.current = {
        mode: "pan", startDistance: 0, startZoom: zoomLevel,
        startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: panOffset.x, startPanY: panOffset.y
      };
    } else if (e.touches.length === 1) {
      lightboxTouchRef.current = {
        mode: "swipe", startDistance: 0, startZoom: zoomLevel,
        startX: e.touches[0].clientX, startY: 0, startPanX: 0, startPanY: 0
      };
    } else {
      lightboxTouchRef.current = null;
    }
  }

  function handleLightboxTouchMove(e: ReactTouchEvent) {
    const touch = lightboxTouchRef.current;
    if (!touch) return;
    if (touch.mode === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const scale = lightboxTouchDistance(e.touches) / touch.startDistance;
      const nextZoom = Math.min(4, Math.max(0.5, Math.round(touch.startZoom * scale * 100) / 100));
      setZoomLevel(nextZoom);
      if (nextZoom <= 1) setPanOffset({ x: 0, y: 0 });
    } else if (touch.mode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      setPanOffset({
        x: touch.startPanX + (e.touches[0].clientX - touch.startX),
        y: touch.startPanY + (e.touches[0].clientY - touch.startY)
      });
    }
  }

  function handleLightboxTouchEnd(e: ReactTouchEvent) {
    const touch = lightboxTouchRef.current;
    lightboxTouchRef.current = null;
    if (!touch || touch.mode !== "swipe") return;
    const dx = e.changedTouches[0].clientX - touch.startX;
    if (Math.abs(dx) > 60) goToAdjacentImage(dx < 0 ? 1 : -1);
  }

  async function saveMember() {
    if (!memberDraft || !canSaveMember) return;
    const id = memberDraft.id ?? nextId(state.members);
    const existingMember = state.members.find((member) => member.id === id);

    // Same names recur a lot in this family (see the unique-id feature), so this only warns
    // instead of blocking, but a genuine duplicate entry is a mistake worth catching early.
    if (!memberDraft.id) {
      const duplicate = state.members.find((member) => member.name.trim().toLowerCase() === memberDraft.name.trim().toLowerCase());
      if (duplicate) {
        const label = `${duplicate.name}${duplicate.uniqueId ? ` (${duplicate.uniqueId})` : ""}`;
        if (!window.confirm(`${t(language, "duplicateNameConfirmPrefix")} "${label}" ${t(language, "duplicateNameConfirmSuffix")}`)) return;
      }
    }

    const spouseIds = [...new Set(memberDraft.spouseIds.filter((value) => value !== id))];

    // The age box is a convenience for an unknown exact birth date: keep the original date if the
    // displayed age wasn't touched, otherwise derive an approximate one (Jan 1 of the birth year)
    // so the rest of the app (which reads dob) keeps working without needing a separate field.
    const typedAge = memberDraft.age.trim() ? Number(memberDraft.age.trim()) : null;
    const currentAgeFromDob = existingMember ? calculateAge(existingMember.dob, existingMember.dod) : null;
    const dob =
      typedAge === null
        ? null
        : existingMember && currentAgeFromDob === typedAge
        ? existingMember.dob ?? null
        : `${new Date().getFullYear() - typedAge}-01-01`;

    // Sajra records sons as individual member profiles but, per the family's own convention,
    // daughters only as a count on their parent's profile - never by name.
    const typedDaughters = memberDraft.daughtersCount.trim() ? Number(memberDraft.daughtersCount.trim()) : null;
    const daughtersCount = typedDaughters !== null && Number.isFinite(typedDaughters) ? Math.max(0, Math.round(typedDaughters)) : null;

    const updated: Member = {
      id,
      uniqueId: existingMember?.uniqueId || nextUniqueId(state.members),
      name: memberDraft.name.trim(),
      nameUr: memberDraft.nameUr.trim() || null,
      gender: memberDraft.gender,
      dob,
      dod: memberDraft.dod || null,
      birthplace: memberDraft.birthplace.trim() || null,
      daughtersCount,
      profession: normalizeProfession(memberDraft.professionChoice === PROFESSION_OTHER ? memberDraft.professionOther : memberDraft.professionChoice),
      showInHeroSlider: canAddToSlider ? memberDraft.showInHeroSlider : Boolean(existingMember?.showInHeroSlider),
      photo: memberDraft.photo.trim() || null,
      bio: memberDraft.bio.trim() || null,
      contact: memberDraft.contact.trim() || null,
      publications: memberDraft.publications.filter((item) => item.title.trim()).map((item) => ({ ...item, title: item.title.trim().slice(0, 180), publisher: item.publisher?.trim().slice(0, 120) || null, year: item.year?.trim().slice(0, 12) || null, url: item.url?.trim().slice(0, 500) || null })),
      fatherId: memberDraft.fatherId ? Number(memberDraft.fatherId) : null,
      motherId: memberDraft.motherId ? Number(memberDraft.motherId) : null,
      spouseIds,
      createdAt: existingMember?.createdAt || new Date().toISOString()
    };
    const actorEmail = supabaseSession?.user.email ?? null;

    updateState((current) => {
      const exists = current.members.some((member) => member.id === id);
      let membersNext = exists
        ? current.members.map((member) => (member.id === id ? updated : member))
        : [...current.members, updated];

      membersNext = membersNext.map((member) => {
        if (member.id === id) return updated;
        const hadCurrent = member.spouseIds.includes(id);
        const shouldHave = spouseIds.includes(member.id);
        const nextSpouses = member.spouseIds.filter((sid) => sid !== id);
        if (shouldHave && !nextSpouses.includes(id)) nextSpouses.push(id);
        if (!shouldHave && hadCurrent) {
          return { ...member, spouseIds: nextSpouses };
        }
        if (shouldHave || hadCurrent) {
          return { ...member, spouseIds: [...new Set(nextSpouses)] };
        }
        return member;
      });

      return pushActivityLog(
        { ...current, members: membersNext },
        { type: "member", action: exists ? "updated" : "added", label: `${updated.name} (${updated.uniqueId})`, actorEmail, memberBefore: existingMember ?? null, memberAfter: updated, memberRelatedBefore: current.members.filter((member) => member.id !== id && (member.spouseIds.includes(id) || spouseIds.includes(member.id))) }
      );
    });

    closeEditors();
  }

  function deleteMember(id: number) {
    if (!isAdmin) return;
    if (!window.confirm(t(language, "confirmDeleteMember"))) return;
    const target = state.members.find((member) => member.id === id);
    const actorEmail = supabaseSession?.user.email ?? null;
    updateState((current) => {
      const next = {
        ...current,
        members: current.members
          .filter((member) => member.id !== id)
          .map((member) => ({
            ...member,
            fatherId: member.fatherId === id ? null : member.fatherId,
            motherId: member.motherId === id ? null : member.motherId,
            spouseIds: member.spouseIds.filter((sid) => sid !== id)
          }))
      };
      if (!target) return next;
      return pushActivityLog(next, {
        type: "member",
        action: "deleted",
        label: `${target.name}${target.uniqueId ? ` (${target.uniqueId})` : ""}`,
        actorEmail,
        memberBefore: target,
        memberRelatedBefore: current.members.filter((member) => member.id !== id && (member.fatherId === id || member.motherId === id || member.spouseIds.includes(id)))
      });
    });
  }

  async function saveUser() {
    if (!userDraft || !isAdmin || userBusy) return;
    const email = userDraft.email.trim();
    const password = userDraft.password;
    const username = userDraft.username.trim() || email.split("@")[0];
    if (!username) return;

    const id = userDraft.id ?? nextId(state.users);
    const existing = state.users.find((user) => user.id === id);
    // A login account is needed when this entry gets an email it did not have (or a different one).
    const needsNewLogin = Boolean(email) && (!existing?.email || existing.email.toLowerCase() !== email.toLowerCase());

    setUserError("");
    if (needsNewLogin && !password) {
      setUserError(t(language, "userLoginRequired"));
      return;
    }
    if (!email && password) {
      setUserError(t(language, "userEmailNeededForPassword"));
      return;
    }
    if (password && password.length < 6) {
      setUserError(t(language, "passwordTooShort"));
      return;
    }

    if (email && (needsNewLogin || password || existing?.role !== userDraft.role)) {
      const request = { email, password: password || undefined, role: userDraft.role, name: userDraft.name.trim() || undefined };
      setUserBusy(true);
      try {
        try {
          await manageAuthUser({ action: needsNewLogin ? "create" : "update", ...request });
        } catch (error) {
          // The entry already had an email, but no login account was ever created for it.
          if (!needsNewLogin && password && error instanceof Error && error.message.startsWith("No login account")) {
            await manageAuthUser({ action: "create", ...request });
          } else {
            throw error;
          }
        }
      } catch (error) {
        setUserError(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        setUserBusy(false);
      }
    }

    const updated: User = {
      id,
      username,
      name: userDraft.name.trim() || null,
      email: email || null,
      role: userDraft.role,
      permissions: userDraft.role === "editor"
        ? existing?.role === "editor" || existing?.role === "contributor"
          ? existing.role === "contributor"
            ? { addMember: true, editMember: true, reviewProfileUpdates: true, addGallery: true, addAnnouncement: true, ...existing.permissions }
            : existing.permissions
          : { addToSlider: false, addAnnouncement: false, addLiveStreaming: false, addGallery: false, addMember: false, editMember: false, reviewProfileUpdates: false }
        : undefined,
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    const actorEmail = supabaseSession?.user.email ?? null;

    updateState((current) => {
      const exists = current.users.some((user) => user.id === id);
      const next = {
        ...current,
        users: exists
          ? current.users.map((user) => (user.id === id ? updated : user))
          : [...current.users, updated]
      };
      return pushActivityLog(next, { type: "user", action: exists ? "updated" : "added", label: updated.username, actorEmail });
    });
    closeEditors();
  }

  function setEditorPermission(userId: number, permission: keyof NonNullable<User["permissions"]>, enabled: boolean) {
    if (!isAdmin) return;
    const actorEmail = supabaseSession?.user.email ?? null;
    updateState((current) => {
      const target = current.users.find((user) => user.id === userId && (user.role === "editor" || user.role === "contributor"));
      if (!target) return current;
      const permissions = { ...target.permissions, [permission]: enabled };
      const next = {
        ...current,
        users: current.users.map((user) => user.id === userId ? { ...user, permissions } : user)
      };
      return pushActivityLog(next, { type: "user", action: "updated", label: `${target.username} permissions`, actorEmail });
    });
  }

  async function deleteUser(id: number) {
    if (!isAdmin) return;
    if (!window.confirm(t(language, "confirmDeleteUser"))) return;
    const target = state.users.find((user) => user.id === id);
    if (target?.email) {
      try {
        await manageAuthUser({ action: "delete", email: target.email });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    const actorEmail = supabaseSession?.user.email ?? null;
    updateState((current) => {
      const next = { ...current, users: current.users.filter((user) => user.id !== id) };
      if (!target) return next;
      return pushActivityLog(next, { type: "user", action: "deleted", label: target.username, actorEmail });
    });
  }

  async function handleMemberPhoto(file?: File) {
    if (!file || !memberDraft) return;
    const src = await readFileAsCompressedDataUrl(file);
    setMemberDraft((current) => current ? { ...current, photo: src } : current);
  }

  async function handleUpdateRequestPhoto(file?: File) {
    if (!file || !updateRequestDraft) return;
    const src = await readFileAsCompressedDataUrl(file);
    setUpdateRequestDraft((current) => current ? { ...current, photo: src } : current);
  }

  async function handleGalleryFile(file?: File) {
    if (!file || !galleryDraft) return;
    const src = await readFileAsCompressedDataUrl(file, 1400, 0.85);
    setGalleryDraft((current) => current ? { ...current, src } : current);
  }

  function saveGallery() {
    if (!galleryDraft || !galleryDraft.src.trim()) return;
    const id = galleryDraft.id ?? nextId(state.gallery);
    const item: GalleryImage = {
      id,
      src: galleryDraft.src.trim(),
      caption: galleryDraft.caption.trim() || null,
      uploadedAt: state.gallery.find((image) => image.id === id)?.uploadedAt || new Date().toISOString()
    };
    const actorEmail = supabaseSession?.user.email ?? null;
    updateState((current) => {
      const exists = current.gallery.some((image) => image.id === id);
      const next = {
        ...current,
        gallery: exists
          ? current.gallery.map((image) => (image.id === id ? item : image))
          : [item, ...current.gallery]
      };
      return pushActivityLog(next, {
        type: "gallery",
        action: exists ? "updated" : "added",
        label: item.caption || t(language, "untitledPhoto"),
        actorEmail
      });
    });
    closeEditors();
  }

  function deleteGalleryItem(id: number) {
    if (!isAdmin) return;
    if (!window.confirm(t(language, "confirmDeleteGallery"))) return;
    const target = state.gallery.find((image) => image.id === id);
    const actorEmail = supabaseSession?.user.email ?? null;
    updateState((current) => {
      const next = { ...current, gallery: current.gallery.filter((item) => item.id !== id) };
      if (!target) return next;
      return pushActivityLog(next, {
        type: "gallery",
        action: "deleted",
        label: target.caption || t(language, "untitledPhoto"),
        actorEmail
      });
    });
  }

  function restoreMemberVersion(entry: AppState["activityLog"][number]) {
    if (!isAdmin || !entry.memberBefore) return;
    if (!window.confirm(`Restore ${entry.memberBefore.name} to the saved version from ${formatDate(entry.createdAt, language)}?`)) return;
    updateState((current) => {
      const restoredIds = new Set([entry.memberBefore!.id, ...(entry.memberRelatedBefore ?? []).map((member) => member.id)]);
      const members = current.members.filter((member) => !restoredIds.has(member.id));
      members.push(entry.memberBefore!, ...(entry.memberRelatedBefore ?? []));
      return pushActivityLog({ ...current, members }, { type: "member", action: "updated", label: `Restored ${entry.memberBefore!.name}`, actorEmail: supabaseSession?.user.email ?? null, memberBefore: current.members.find((member) => member.id === entry.memberBefore!.id) ?? null, memberAfter: entry.memberBefore! });
    });
  }

  function exportState() {
    const blob = new Blob([exportJson(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sajra-backup.json";
    a.click();
    URL.revokeObjectURL(url);

    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now);
    } catch {
      // Best-effort only; the reminder just won't persist across sessions if storage is blocked.
    }
    setLastBackupAt(now);
  }

  function triggerImport() {
    importInputRef.current?.click();
  }

  async function handleImportFile(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const next = importJson(text);
      updateState(() => next);
      setImportError("");
    } catch {
      setImportError(t(language, "invalidBackupFile"));
    }
  }

  function triggerBulkImport() {
    setBulkImportResult(null);
    bulkImportInputRef.current?.click();
  }

  function downloadMembersCsvTemplate() {
    const blob = new Blob([membersCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sajra-members-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkImportFile(file?: File) {
    if (!file || !canAddMember) return;
    setBulkImportBusy(true);
    try {
      const text = await file.text();
      const rows = parseMembersCsv(text);
      const actorEmail = supabaseSession?.user.email ?? null;
      // Resolved from current.members inside the updater (not the outer state.members closure),
      // so a concurrent edit/sync landing while this file was being read isn't clobbered.
      let result: { addedCount: number; errors: string[] } | null = null;
      updateState((current) => {
        const built = buildMembersFromImportRows(rows, current.members);
        result = { addedCount: built.addedCount, errors: built.errors };
        if (!built.addedCount) return current;
        return pushActivityLog(
          { ...current, members: built.members },
          { type: "member", action: "added", label: `${t(language, "bulkImportActivityLabel")} (${built.addedCount})`, actorEmail }
        );
      });
      if (result) setBulkImportResult(result);
    } catch {
      setBulkImportResult({ addedCount: 0, errors: [t(language, "invalidBackupFile")] });
    } finally {
      setBulkImportBusy(false);
      if (bulkImportInputRef.current) bulkImportInputRef.current.value = "";
    }
  }

  function resetToEmpty() {
    if (!window.confirm(t(language, "confirmResetArchive"))) return;
    const defaults = createEmptyState();
    setState(defaults);
    saveState(defaults);
  }

  const memberSearchResults = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    const newestFirst = [...state.members].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    const matches = q ? newestFirst.filter((member) =>
      [member.name, member.nameUr, member.birthplace].some((value) => value?.toLowerCase().includes(q))
    ) : newestFirst;
    return matches.slice(0, 12);
  }, [memberQuery, state.members]);

  const professionGroups = useMemo(() => groupByProfession(state.members, language), [state.members, language]);
  const activeProfessionGroup = professionGroups.find((group) => group.id === selectedProfession);

  // New members need a father already in the tree; editing an existing (e.g. root) member doesn't.
  const canSaveMember = Boolean(memberDraft?.name.trim()) && (Boolean(memberDraft?.id) || Boolean(memberDraft?.fatherId));

  const stats = useMemo(() => ({
    members: state.members.length,
    roots: roots.length,
    gallery: state.gallery.length,
    users: state.users.length,
    visitors: state.visitorCount ?? 0
  }), [roots.length, state.gallery.length, state.members.length, state.users.length, state.visitorCount]);

  const familyInsights = useMemo(() => {
    const living = state.members.filter((member) => !member.dod);
    const oldestLiving = living.reduce<Member | null>((oldest, member) => {
      const age = calculateAge(member.dob, member.dod);
      if (age === null) return oldest;
      const oldestAge = oldest ? calculateAge(oldest.dob, oldest.dod) : null;
      return oldestAge === null || age > oldestAge ? member : oldest;
    }, null);
    return {
      generations: treeDepth(buildTree(state.members)),
      male: state.members.filter((member) => member.gender === "male").length,
      female: state.members.filter((member) => member.gender === "female").length,
      oldestLiving
    };
  }, [state.members]);

  const activeAnnouncements = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return state.announcements.filter((announcement) => !announcement.expiresAt || announcement.expiresAt >= today);
  }, [state.announcements]);
  const pendingProfileUpdateCount = canReviewProfileUpdates ? state.memberUpdateRequests.filter((request) => request.status === "pending").length : 0;
  const unseenAnnouncementCount = activeAnnouncements.filter((announcement) => !seenAnnouncementIds.includes(announcement.id)).length;
  const notificationBadgeCount = unseenAnnouncementCount + pendingProfileUpdateCount;
  const adminNavMenuItems: { key: AdminSection; label: string; badge?: number }[] = isLoggedIn ? [
    { key: "overview", label: t(language, "adminNavOverview") },
    { key: "members", label: t(language, "membersLabel") },
    ...(isAdmin ? [{ key: "users" as const, label: t(language, "usersLabel") }] : []),
    { key: "gallery", label: t(language, "adminNavGallery") },
    { key: "suggestions", label: t(language, "adminNavSuggestions") },
    ...(canReviewProfileUpdates ? [{ key: "profileUpdates" as const, label: t(language, "adminNavProfileUpdates"), badge: pendingProfileUpdateCount }] : []),
    ...(isAdmin ? [{ key: "logs" as const, label: t(language, "adminNavLogs") }] : []),
    { key: "quality", label: t(language, "adminNavQuality") },
    ...(isAdmin ? [{ key: "backup" as const, label: t(language, "backupCardTitle") }] : []),
    { key: "analytics", label: t(language, "adminNavAnalytics") }
  ] : [];

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const check = () => { void checkForAppUpdate().then((available) => { if (!cancelled) setAppUpdateAvailable(available); }); };
    check();
    const interval = window.setInterval(check, 30 * 60 * 1000);
    window.addEventListener("focus", check);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (route.page !== "calendar") return;
    const ids = activeAnnouncements.map((announcement) => announcement.id);
    setSeenAnnouncementIds((previous) => {
      const next = [...new Set([...previous, ...ids])].slice(-500);
      localStorage.setItem("sajra-seen-announcements", JSON.stringify(next));
      return next;
    });
  }, [route.page, activeAnnouncements]);

  const content = (() => {
    // A recovery link signs the user in with a temporary session, so this must not depend on !isLoggedIn.
    if (route.page === "admin" && recoveryMode) {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "signInEyebrow")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "recoveryModeTitle")}</h2>
              <p className="section-subtitle">{t(language, "recoveryModeSubtitle")}</p>
            </div>
          </div>
          <div className="login-panel-single">
            <Card title={t(language, "recoveryModeTitle")}>
              <form className="form-stack" onSubmit={handleChangePasswordSubmit}>
                <label>
                  {t(language, "newPasswordLabel")}
                  <PasswordField value={newPassword} onChange={setNewPassword} autoComplete="new-password" language={language} />
                </label>
                <label>
                  {t(language, "confirmPasswordLabel")}
                  <PasswordField value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" language={language} />
                </label>
                {passwordChangeError ? <div className="notice danger">{passwordChangeError}</div> : null}
                <button className="btn" type="submit" disabled={passwordChangeBusy}>{passwordChangeBusy ? t(language, "savingPassword") : t(language, "savePasswordButton")}</button>
              </form>
            </Card>
          </div>
        </section>
      );
    }

    if (!isLoggedIn && route.page === "admin") {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "signInEyebrow")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{mfaPending ? t(language, "mfaChallengeTitle") : forgotPasswordOpen ? t(language, "forgotPasswordTitle") : t(language, "signInTitle")}</h2>
              <p className="section-subtitle">{mfaPending ? t(language, "mfaChallengeSubtitle") : forgotPasswordOpen ? t(language, "forgotPasswordSubtitle") : t(language, "signInSubtitle")}</p>
            </div>
          </div>
          <div className="login-panel-single">
            {mfaPending ? (
              <Card title={t(language, "mfaChallengeTitle")}>
                <form className="form-stack" onSubmit={handleMfaChallengeSubmit}>
                  <label>
                    {t(language, "mfaCodeLabel")}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="field"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      maxLength={6}
                    />
                  </label>
                  {mfaError ? <div className="notice danger">{mfaError}</div> : null}
                  <button className="btn" type="submit" disabled={mfaBusy || mfaCode.trim().length < 6}>
                    {mfaBusy ? t(language, "verifyingCode") : t(language, "verifyCodeButton")}
                  </button>
                </form>
              </Card>
            ) : forgotPasswordOpen ? (
              <Card title={t(language, "forgotPasswordTitle")}>
                <form className="form-stack" onSubmit={handleForgotPasswordSubmit}>
                  <label>
                    {t(language, "emailLabel")}
                    <input type="email" className="field" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoComplete="username" />
                  </label>
                  {forgotError ? <div className="notice danger">{forgotError}</div> : null}
                  {forgotMessage ? <div className="notice">{forgotMessage}</div> : null}
                  <button className="btn" type="submit" disabled={forgotBusy}>{forgotBusy ? t(language, "sendingResetLink") : t(language, "sendResetLinkButton")}</button>
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() => { setForgotPasswordOpen(false); setForgotError(""); setForgotMessage(""); }}
                  >
                    {t(language, "backToLoginButton")}
                  </button>
                </form>
              </Card>
            ) : (
              <Card title={t(language, "loginCardTitle")} subtitle={t(language, "loginCardSubtitle")}>
                <form className="form-stack" onSubmit={handleLoginSubmit}>
                  <label>
                    {t(language, "emailLabel")}
                    <input type="email" className="field" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoComplete="username" />
                  </label>
                  <label>
                    {t(language, "passwordLabel")}
                    <PasswordField value={loginPassword} onChange={setLoginPassword} autoComplete="current-password" language={language} />
                  </label>
                  <button
                    className="link-btn"
                    type="button"
                    onClick={() => { setForgotPasswordOpen(true); setForgotEmail(loginEmail); setForgotError(""); setForgotMessage(""); }}
                  >
                    {t(language, "forgotPasswordLink")}
                  </button>
                  {loginError ? <div className="notice danger">{loginError}</div> : null}
                  <button className="btn" type="submit" disabled={loginBusy}>{loginBusy ? t(language, "signingIn") : t(language, "loginButton")}</button>
                  {Capacitor.isNativePlatform() && localStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY) === "1" ? <div className="login-biometric-hint">Fingerprint unlock will appear after an Admin or Editor signs in.</div> : null}
                </form>
              </Card>
            )}
          </div>
        </section>
      );
    }

    if (route.page === "branch" && selectedMember) return <BranchPage member={selectedMember} members={state.members} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />;
    if (route.page === "calendar") {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowAnnouncements")}</span>
              <h1 className="section-title">{t(language, "announcementsTitle")}</h1>
            </div>
            {canAddAnnouncement ? <button className="btn-ghost" type="button" onClick={openAnnouncementEditor}>{t(language, "postAnnouncementButton")}</button> : null}
          </div>
          {announcementNotice ? <p className="hint">{announcementNotice}</p> : null}
          {activeAnnouncements.length || familyCalendarEvents.length ? (
            <div className="list">
              {activeAnnouncements.map((announcement) => (
                <div key={`announcement-${announcement.id}`} className="card announcement-card">
                  <div className="announcement-card-body">
                    {announcement.fromAdmin ? <span className="chip announcement-admin-badge">{t(language, "adminOption")}</span> : null}
                    <p className="announcement-message">{announcement.message}</p>
                    <div className="tree-sub">
                      {formatDate(announcement.createdAt, language)} | {announcement.authorName || t(language, "anonymousSubmitter")}
                    </div>
                  </div>
                  {isAdmin ? (
                    <button className="btn-ghost danger" type="button" onClick={() => deleteAnnouncement(announcement.id)}>{t(language, "deleteButton")}</button>
                  ) : null}
                </div>
              ))}
              {familyCalendarEvents.map((event) => (
                <button key={`calendar-${event.id}`} type="button" className="card announcement-card calendar-notification-card" onClick={() => navigate({ page: "member", memberId: event.member.id })}>
                  <div className="announcement-card-body">
                    <span className={`chip announcement-admin-badge calendar-event-chip ${event.kind}`}>
                      {event.kind === "birthday" ? t(language, "calendarBirthdayLabel") : t(language, "calendarRemembranceLabel")}
                    </span>
                    <p className="announcement-message">
                      {event.kind === "birthday"
                        ? `${displayName(event.member, language)} ${t(language, "calendarBirthdayMessage")}`
                        : `${displayName(event.member, language)} ${t(language, "calendarRemembranceMessage")}`}
                    </p>
                    <div className="tree-sub">
                      {event.date.toLocaleDateString(language === "ur" ? "ur-PK" : "en", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">{t(language, "noAnnouncementsYet")}</div>
          )}
        </section>
      );
    }
    if (route.page === "member") {
      const member = selectedMember;
      const ancestorChain = member ? getAncestorChain(state.members, member.id) : [];
      return (
        <section className="section member-profile-section">
          {member ? (
            <>
              <div className="profile-layout member-profile-layout">
                <img className={`member-photo hero-photo member-profile-photo${member.dod ? " avatar-in-memory" : ""}`} src={photoSrc(member.photo)} alt={displayName(member, language)} />
                <div>
                  <span className="eyebrow">{tGender(language, member.gender)}</span>
                  {member.dod ? <span className="in-memory-badge">{t(language, "inLovingMemoryLabel")}</span> : null}
                  <h1 className="section-title" style={{ marginTop: 12 }}>
                    {member.profession?.trim() ? `${professionShortLabel(language, member.profession.trim())} ` : ""}
                    {displayName(member, language)}
                  </h1>
                  <p className="section-subtitle" style={{ marginTop: 12 }}>
                    {member.birthplace || t(language, "noBirthplace")}
                    {member.dob ? ` | ${t(language, "bornWord")} ${formatDate(member.dob, language)} (${formatHijriDate(member.dob, language)})` : ""}
                    {member.dod ? ` | ${t(language, "diedWord")} ${formatDate(member.dod, language)} (${formatHijriDate(member.dod, language)})` : ""}
                    {calculateAge(member.dob, member.dod) !== null ? ` | ${t(language, "ageWord")} ${calculateAge(member.dob, member.dod)}` : ""}
                    {member.daughtersCount != null ? ` | ${t(language, "daughtersCountLabel")}: ${member.daughtersCount}` : ""}
                  </p>
                </div>
              </div>

              {ancestorChain.length > 1 ? (
                <div className="silsila-chain no-print">
                  <span className="silsila-label">{t(language, "silsilaLabel")}</span>
                  <div className="silsila-chain-row" ref={silsilaRowRef}>
                    {ancestorChain.map((ancestor, index) => (
                      <span key={ancestor.id} className="silsila-chain-item">
                        {ancestor.id === member.id ? (
                          <strong className="silsila-chain-current">{displayName(ancestor, language)}</strong>
                        ) : (
                          <button type="button" className="silsila-chain-link" onClick={() => navigate({ page: "member", memberId: ancestor.id })}>
                            {displayName(ancestor, language)}
                          </button>
                        )}
                        {index < ancestorChain.length - 1 ? <span className="silsila-chain-arrow" aria-hidden="true">{"→"}</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="profile-actions-bio">
                <div className="profile-meta no-print">
                  <button className="btn" type="button" onClick={() => navigate({ page: "tree" })}>{t(language, "openTreeButton")}</button>
                  {canEditMembers ? <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>{t(language, "editMemberButton")}</button> : null}
                  <button className="btn-ghost" type="button" onClick={printPage}>{t(language, "printProfileButton")}</button>
                  <button className="btn-ghost" type="button" onClick={() => openSuggestionEditor(member)}>{t(language, "suggestCorrectionButton")}</button><button className="btn-ghost" type="button" onClick={() => navigate({ page: "branch", memberId: member.id })}>{t(language, "shareFamilyBranchButton")}</button>
                  <button className="btn-ghost" type="button" onClick={() => void shareMember(member)}>{t(language, "shareProfileButton")}</button>
                  <button className="btn-ghost" type="button" onClick={() => void openQrCode(member)}>{t(language, "showQrCodeButton")}</button>
                  {canEditMembers ? <button className="btn-ghost" type="button" onClick={() => void copyUpdateLink(member)}>{t(language, "copyUpdateLinkButton")}</button> : null}
                  {myMemberId === member.id ? (
                    <button className="btn-ghost active" type="button" onClick={clearMyFamily}>{t(language, "thisIsMeLabel")}</button>
                  ) : (
                    <button className="btn-ghost" type="button" onClick={() => setAsMyFamily(member.id)}>{t(language, "setAsMyFamilyButton")}</button>
                  )}
                </div>
                {suggestionSent ? <p className="hint no-print">{t(language, "suggestionSentMessage")}</p> : null}
                {shareNotice ? <p className="hint no-print">{shareNotice}</p> : null}
                {updateLinkNotice ? <p className="hint no-print">{updateLinkNotice}</p> : null}
                {member.bio ? <p style={{ marginTop: 16, lineHeight: 1.8 }}>{member.bio}</p> : null}
                {member.contact ? <p className="tree-sub" style={{ marginTop: 8 }}>{t(language, "contactLabel")}: {member.contact}</p> : null}
                {member.publications?.length ? <section className="member-publications" aria-labelledby="member-publications-title">
                  <h2 id="member-publications-title">{t(language, "publicationsTitle")}</h2>
                  <div className="member-publications-list">{member.publications.filter((item) => item.title?.trim()).map((item, index) => <article className="member-publication-card" key={item.title + "-" + index}>
                    <div className="member-publication-cover">{safePublicationUrl(item.coverUrl) ? <img src={safePublicationUrl(item.coverUrl)!} alt={item.title + " " + t(language, "bookCoverPreviewAlt")} loading="lazy" /> : <span aria-hidden="true">📖</span>}</div>
                    <div className="member-publication-details"><strong>{item.title}</strong>
                      {(item.publisher || item.year) ? <span>{[item.publisher, item.year].filter(Boolean).join(" · ")}</span> : null}
                      {safePublicationUrl(item.url) ? <a href={safePublicationUrl(item.url)!} target="_blank" rel="noreferrer">{t(language, "publicationViewLink")}</a> : null}
                      {bookDownloadUrl(item) ? <a className="btn publication-download-button" href={bookDownloadUrl(item)!} download>{t(language, "downloadBookButton")}</a> : null}
                    </div>
                  </article>)}</div>
                </section> : null}
              </div>

              <div className="card-grid profile-relations-grid" style={{ marginTop: 20 }}>
                <Card title={t(language, "parentsTitle")} subtitle={t(language, "parentsSubtitle")}>
                  {getParents(state.members, member).length ? (
                    <div className="member-grid profile-relations-inner">
                      {getParents(state.members, member).map((parent) => (
                        <MemberCard key={parent.id} member={parent} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
                      ))}
                    </div>
                  ) : <div className="empty">{t(language, "noParents")}</div>}
                </Card>
                <Card title={t(language, "spousesTitle")} subtitle={t(language, "spousesSubtitle")}>
                  {getSpouses(state.members, member).length ? (
                    <div className="member-grid profile-relations-inner">
                      {getSpouses(state.members, member).map((spouse) => (
                        <MemberCard key={spouse.id} member={spouse} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
                      ))}
                    </div>
                  ) : <div className="empty">{t(language, "noSpouses")}</div>}
                </Card>
                <Card title={t(language, "childrenTitle")} subtitle={t(language, "childrenSubtitle")}>
                  {getChildren(state.members, member.id).length ? (
                    <div className="member-grid profile-relations-inner">
                      {getChildren(state.members, member.id).sort(sortMembers).map((child) => (
                        <MemberCard key={child.id} member={child} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
                      ))}
                    </div>
                  ) : <div className="empty">{t(language, "noChildren")}</div>}
                </Card>
              </div>

              <div className="no-print" style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border, #ddd)" }}>
                <span className="eyebrow">{t(language, "eyebrowGuestbook")}</span>
                <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "guestbookTitle")}</h2>
                <p className="section-subtitle" style={{ marginTop: 12 }}>{t(language, "guestbookSubtitle")}</p>
                <div className="form-grid" style={{ marginTop: 14 }}>
                  <label className="span-12">
                    <span className="sr-only">{t(language, "guestbookMessageLabel")}</span>
                    <textarea
                      className="textarea"
                      placeholder={t(language, "guestbookMessagePlaceholder")}
                      value={guestbookMessage}
                      onChange={(e) => setGuestbookMessage(e.target.value)}
                    />
                  </label>
                  <label className="span-6">
                    <span className="sr-only">{t(language, "suggestionNameLabel")}</span>
                    <input
                      className="field"
                      placeholder={t(language, "suggestionNamePlaceholder")}
                      value={guestbookAuthorName}
                      onChange={(e) => setGuestbookAuthorName(e.target.value)}
                    />
                  </label>
                </div>
                <div className="actions-row" style={{ marginTop: 12 }}>
                  <button className="btn" type="button" disabled={!guestbookMessage.trim()} onClick={() => submitGuestbookComment(member.id)}>
                    {t(language, "guestbookPostButton")}
                  </button>
                </div>

                {state.profileComments.filter((comment) => comment.memberId === member.id).length ? (
                  <div className="list" style={{ marginTop: 18 }}>
                    {state.profileComments.filter((comment) => comment.memberId === member.id).map((comment) => (
                      <div key={comment.id} className="card announcement-card">
                        <div className="announcement-card-body">
                          <p className="announcement-message">{comment.message}</p>
                          <div className="tree-sub">
                            {formatDate(comment.createdAt, language)} | {comment.authorName || t(language, "anonymousSubmitter")}
                          </div>
                        </div>
                        {isAdmin ? (
                          <button className="btn-ghost danger" type="button" onClick={() => deleteGuestbookComment(comment.id)}>{t(language, "deleteButton")}</button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty" style={{ marginTop: 18 }}>{t(language, "noGuestbookEntries")}</div>
                )}
              </div>
            </>
          ) : (
            <div className="empty">
              {t(language, "memberNotFound")}
            </div>
          )}
        </section>
      );
    }

    if (route.page === "tree") {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowFamilyTree")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "exploreLineageTitle")}</h2>
              <p className="section-subtitle">{t(language, "exploreLineageSubtitle")}</p>
            </div>
          </div>

          {state.members.length ? (
            <FamilyTreeD3
              members={state.members}
              language={language}
              onOpenMember={(id) => navigate({ page: "member", memberId: id })}
            />
          ) : (
            <div className="empty">{t(language, "noMembersYet")}</div>
          )}
        </section>
      );
    }

    if (route.page === "gallery") {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowGallery")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "capturedMemoriesTitle")}</h2>
              <p className="section-subtitle">{t(language, "gallerySubtitle")}</p>
            </div>
            {canAddGalleryPhoto ? <button className="btn" type="button" onClick={() => openGalleryEditor()}>{t(language, "addPhotoButton")}</button> : null}
          </div>
          {state.gallery.length ? (
            <div className="gallery-grid">
              {state.gallery.map((image) => (
                <article className="gallery-card" key={image.id}>
                  <button type="button" className="gallery-thumb-btn" onClick={() => openLightbox(image)}>
                    <img className="gallery-photo" src={photoSrc(image.src)} alt={image.caption ?? t(language, "galleryImageAlt")} />
                  </button>
                  <div className="gallery-meta">
                    <div className="tree-name">{image.caption || t(language, "untitledPhoto")}</div>
                    <div className="tree-sub">{formatDate(image.uploadedAt, language)}</div>
                  </div>
                  {isAdmin ? (
                    <div className="actions-row">
                      <button className="btn-ghost" type="button" onClick={() => openGalleryEditor(image)}>{t(language, "editButton")}</button>
                      <button className="btn-ghost danger" type="button" onClick={() => deleteGalleryItem(image.id)}>{t(language, "deleteButton")}</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">{t(language, "noPhotosYet")}</div>
          )}
        </section>
      );
    }

    if (isLoggedIn && route.page === "admin" && biometricLockRequired && !biometricUnlocked) {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowSettings")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "biometricLockTitle")}</h2>
              <p className="section-subtitle">{t(language, "biometricLockSubtitle")}</p>
            </div>
          </div>
          <div className="notice" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={() => void unlockAdminDashboard()}>{t(language, "unlockAdminButton")}</button>
            {biometricUnlockError ? <p className="hint" style={{ marginTop: 10 }}>{biometricUnlockError}</p> : null}
          </div>
        </section>
      );
    }

    if (route.page === "admin") {
      const sortedUsers = [...state.users].sort((a, b) => a.username.localeCompare(b.username));
      const sectionSubtitles: Record<AdminSection, string> = {
        overview: t(language, "adminOverviewSubtitle"),
        members: t(language, "membersCardSubtitle"),
        users: t(language, "usersCardSubtitle"),
        gallery: t(language, "galleryAdminSubtitle"),
        suggestions: t(language, "suggestionsSubtitle"),
        profileUpdates: t(language, "profileUpdatesSubtitle"),
        logs: t(language, "logHistorySubtitle"),
        quality: t(language, "adminQualitySubtitle"),
        backup: t(language, "backupCardSubtitle"),
        analytics: t(language, "analyticsSubtitle")
      };
      const sections = adminNavMenuItems.map((item) => ({ ...item, subtitle: sectionSubtitles[item.key] }));
      const activeSection = sections.find((section) => section.key === adminSection) ?? sections[0];

      let sectionActions: ReactNode = null;
      if (activeSection.key === "members") {
        sectionActions = canAddMember ? (
          <div className="actions-row">
            <button className="btn" type="button" onClick={() => openMemberEditor()}>{t(language, "addMemberButton")}</button>
            <button className="btn-ghost" type="button" onClick={triggerBulkImport}>{t(language, "bulkImportButton")}</button>
          </div>
        ) : null;
      } else if (activeSection.key === "users") {
        sectionActions = <button className="btn" type="button" onClick={() => openUserEditor()}>{t(language, "addUserButton")}</button>;
      } else if (activeSection.key === "gallery") {
        sectionActions = canAddGalleryPhoto ? <button className="btn" type="button" onClick={() => openGalleryEditor()}>{t(language, "addGalleryPhotoButton")}</button> : null;
      }

      let sectionBody: ReactNode = null;
      if (activeSection.key === "overview") {
        sectionBody = (
          <>
            <div className="stat-grid">
              <StatCard value={stats.members} label={t(language, "membersLabel")} />
              <StatCard value={stats.roots} label={t(language, "rootsLabel")} />
              <StatCard value={stats.gallery} label={t(language, "galleryItemsLabel")} />
              <StatCard value={stats.users} label={t(language, "usersLabel")} />
              {isAdmin ? <StatCard value={stats.visitors} label={t(language, "totalVisitorsLabel")} icon={<EyeIcon />} /> : null}
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="section-head">
                <div>
                  <span className="eyebrow">{t(language, "eyebrowFamilyTree")}</span>
                  <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "exploreLineageTitle")}</h2>
                  <p className="section-subtitle">{t(language, "exploreLineageSubtitle")}</p>
                </div>
              </div>
              {state.members.length ? (
                <FamilyTreeD3
                  members={state.members}
                  language={language}
                  onOpenMember={(id) => navigate({ page: "member", memberId: id })}
                />
              ) : (
                <div className="empty">{t(language, "noMembersYet")}</div>
              )}
            </div>
          </>
        );
      } else if (activeSection.key === "quality") {
        sectionBody = qualityIssues.length ? <div className="list">{qualityIssues.map((issue) => <div className="card data-quality-item" key={issue.id}><div><strong>{issue.kind.replace(/-/g, " ")}</strong><p>{issue.detail}</p></div><button className="btn-ghost" type="button" onClick={() => navigate({ page: "member", memberId: issue.memberId })}>{t(language, "openMemberButton")}</button></div>)}</div> : <div className="empty">{t(language, "noDataQualityIssues")}</div>;
      } else if (activeSection.key === "members") {
        sectionBody = (
          <>
            <input ref={bulkImportInputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void handleBulkImportFile(e.target.files?.[0])} />
            {updateLinkNotice ? <p className="hint">{updateLinkNotice}</p> : null}
            {canAddMember ? (
              <div className="notice" style={{ marginBottom: 16 }}>
                <div className="actions-row">
                  <button className="btn-ghost" type="button" onClick={downloadMembersCsvTemplate}>{t(language, "bulkImportTemplateButton")}</button>
                </div>
                {bulkImportBusy ? <p className="hint">{t(language, "loadingLabel")}</p> : null}
                {bulkImportResult ? (
                  <div className={`notice ${bulkImportResult.errors.length ? "danger" : "success"}`} style={{ marginTop: 10 }}>
                    <p>{t(language, "bulkImportResultPrefix")} {bulkImportResult.addedCount}</p>
                    {bulkImportResult.errors.length ? (
                      <ul className="bulk-import-errors">
                        {bulkImportResult.errors.map((message, index) => <li key={index}>{message}</li>)}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <input className="field admin-search" placeholder={t(language, "searchMembersPlaceholder")} value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
            <div className="list">
              {memberSearchResults.map((member) => (
                <div key={member.id} className="card" style={{ padding: 14 }}>
                  <div className="tree-head">
                    <div>
                      <div className="tree-name">
                        {displayName(member, language)}
                        {member.uniqueId ? <span className="id-badge">{member.uniqueId}</span> : null}
                      </div>
                      <div className="tree-sub">
                        {member.birthplace || t(language, "noBirthplace")}
                        {member.profession?.trim() ? ` | ${professionLabel(language, member.profession.trim())}` : ""}
                      </div>
                    </div>
                    <div className="actions-row">
                      <button className="btn-ghost" type="button" onClick={() => navigate({ page: "member", memberId: member.id })}>{t(language, "openButton")}</button>
                      {canEditMembers ? <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>{t(language, "editButton")}</button> : null}
                      {canEditMembers ? <button className="btn-ghost" type="button" onClick={() => void copyUpdateLink(member)}>{t(language, "copyUpdateLinkButton")}</button> : null}
                      {isAdmin ? <button className="btn-ghost danger" type="button" onClick={() => deleteMember(member.id)}>{t(language, "deleteButton")}</button> : null}
                    </div>
                  </div>
                </div>
              ))}
              {!memberSearchResults.length ? <div className="empty">{t(language, "noMemberMatches")}</div> : null}
            </div>
          </>
        );
      } else if (activeSection.key === "users") {
        sectionBody = (
          <div className="list">
            {sortedUsers.map((user) => (
              <div key={user.id} className="card" style={{ padding: 14 }}>
                <div className="tree-head">
                  <div>
                    <button type="button" className="tree-name tree-name-btn" onClick={() => openUserEditor(user)} title={t(language, "clickToEditHint")}>
                      {user.username}
                    </button>
                    <div className="tree-sub">
                      {t(language, "userIdPrefix")}: {user.id} | {user.name || t(language, "noName")} | {t(language, user.role === "admin" ? "adminOption" : "editorOption")}
                    </div>
                  </div>
                  <div className="actions-row">
                    <button className="btn-ghost" type="button" onClick={() => openUserEditor(user)}>{t(language, "editButton")}</button>
                    <button className="btn-ghost danger" type="button" onClick={() => deleteUser(user.id)}>{t(language, "deleteButton")}</button>
                  </div>
                </div>
                {isAdmin && (user.role === "editor" || user.role === "contributor") ? (
                  <div className="editor-permissions-grid admin-user-permissions">
                    <strong>{t(language, "editorPermissionsTitle")}</strong>
                    <div className="admin-user-permissions-options">
                      {EDITOR_PERMISSION_OPTIONS.map(({ key, labelKey }) => (
                        <label key={key} className="editor-permission-row">
                          <input type="checkbox" checked={user.permissions?.[key] === true || (user.role === "contributor" && user.permissions?.[key] === undefined && ["addMember", "editMember", "reviewProfileUpdates", "addGallery", "addAnnouncement"].includes(key))} onChange={(event) => setEditorPermission(user.id, key, event.target.checked)} />
                          <span>{t(language, labelKey)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        );
      } else if (activeSection.key === "gallery") {
        sectionBody = state.gallery.length ? (
          <div className="list">
            {state.gallery.map((image) => (
              <div key={image.id} className="card" style={{ padding: 14 }}>
                <div className="tree-head">
                  <div className="admin-gallery-item">
                    <img className="admin-thumb" src={photoSrc(image.src)} alt={image.caption ?? t(language, "galleryImageAlt")} />
                    <div>
                      <div className="tree-name">{image.caption || t(language, "untitledPhoto")}</div>
                      <div className="tree-sub">{formatDate(image.uploadedAt, language)}</div>
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="actions-row">
                      <button className="btn-ghost" type="button" onClick={() => openGalleryEditor(image)}>{t(language, "editButton")}</button>
                      <button className="btn-ghost danger" type="button" onClick={() => deleteGalleryItem(image.id)}>{t(language, "deleteButton")}</button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{t(language, "noPhotosYet")}</div>
        );
      } else if (activeSection.key === "suggestions") {
        sectionBody = state.suggestions.length ? (
          <div className="list">
            {state.suggestions.map((suggestion) => (
              <div key={suggestion.id} className="card admin-suggestion-card" style={{ opacity: suggestion.status === "resolved" ? 0.6 : 1 }}>
                <div className="admin-suggestion-content">
                  <div className="tree-name">
                    {suggestion.memberName ? `${t(language, "aboutPrefix")} ${suggestion.memberName}` : t(language, "generalSuggestionLabel")}
                  </div>
                  {suggestion.message.startsWith("Chatbot feedback (helpful): ") ? <span className="admin-suggestion-kind is-helpful">Chatbot feedback · Helpful</span> : null}
                  {suggestion.message.startsWith("Chatbot feedback (not helpful): ") ? <span className="admin-suggestion-kind is-unhelpful">Chatbot feedback · Not helpful</span> : null}
                  <p className="admin-suggestion-message">{cleanSuggestionMessage(suggestion.message)}</p>
                  <div className="tree-sub admin-suggestion-meta">
                    {formatDate(suggestion.createdAt, language)} | {suggestion.submitterName || t(language, "anonymousSubmitter")}
                    {suggestion.status === "resolved" ? ` | ${t(language, "suggestionResolvedLabel")}` : ""}
                  </div>
                </div>
                <div className="actions-row admin-suggestion-actions">
                    {suggestion.status === "pending" ? (
                      <button className="btn-ghost" type="button" onClick={() => resolveSuggestion(suggestion.id)}>{t(language, "markResolvedButton")}</button>
                    ) : null}
                    <button className="btn-ghost danger" type="button" onClick={() => deleteSuggestion(suggestion.id)}>{t(language, "deleteButton")}</button>
                  </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{t(language, "noSuggestionsYet")}</div>
        );
      } else if (activeSection.key === "profileUpdates") {
        sectionBody = state.memberUpdateRequests.length ? (
          <div className="list">
            {state.memberUpdateRequests.map((request) => (
              <div key={request.id} className="card admin-suggestion-card admin-profile-update-card" style={{ opacity: request.status === "pending" ? 1 : 0.6 }}>
                <div className="admin-suggestion-content">
                  <div className="tree-name">{request.memberName}</div>
                  <div className={`admin-profile-update-body${request.photo ? "" : " no-photo"}`}>
                    {request.photo ? <img className="avatar admin-profile-update-avatar" src={photoSrc(request.photo)} alt={request.memberName} /> : null}
                    <div className="admin-profile-update-details">
                      {request.bio ? <p className="admin-suggestion-message">{request.bio}</p> : null}
                      {request.contact ? <p className="tree-sub">{t(language, "contactLabel")}: {request.contact}</p> : null}
                      {request.profession ? <p className="tree-sub">{t(language, "professionLabel")}: {professionLabel(language, request.profession)}</p> : null}
                      {request.publications?.filter((item) => item.title?.trim()).map((item, index) => <div className="admin-publication-review admin-profile-update-publication" key={item.title + "-" + index}>
                        {safePublicationUrl(item.coverUrl) ? <img src={safePublicationUrl(item.coverUrl)!} alt={item.title + " " + t(language, "bookCoverPreviewAlt")} loading="lazy" /> : null}
                        <div><p className="tree-sub"><strong>{item.title}</strong>{[item.publisher, item.year].filter(Boolean).length ? ` — ${[item.publisher, item.year].filter(Boolean).join(" · ")}` : ""}</p>
                          {safePublicationUrl(item.url) ? <a href={safePublicationUrl(item.url)!} target="_blank" rel="noreferrer">{t(language, "publicationViewLink")}</a> : null}
                          {safePublicationUrl(item.fileUrl) ? <a href={bookDownloadUrl(item)!} target="_blank" rel="noreferrer">{t(language, "downloadBookButton")}</a> : null}
                        </div>
                      </div>)}
                    </div>
                  </div>
                  <div className="tree-sub admin-suggestion-meta">
                    {formatDate(request.createdAt, language)}
                    {request.status !== "pending" ? ` | ${request.status === "approved" ? t(language, "updateRequestApprovedLabel") : t(language, "updateRequestRejectedLabel")}` : ""}
                  </div>
                </div>
                <div className="actions-row admin-suggestion-actions admin-profile-update-actions">
                  {request.status === "pending" ? (
                    <>
                      <button className="btn-ghost" type="button" onClick={() => approveMemberUpdateRequest(request.id)}>{t(language, "approveButton")}</button>
                      <button className="btn-ghost" type="button" onClick={() => rejectMemberUpdateRequest(request.id)}>{t(language, "rejectButton")}</button>
                    </>
                  ) : null}
                  <button className="btn-ghost danger" type="button" onClick={() => deleteMemberUpdateRequest(request.id)}>{t(language, "deleteButton")}</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{t(language, "noProfileUpdatesYet")}</div>
        );
      } else if (activeSection.key === "logs") {
        const typeLabelKeys = { member: "logTypeMember", user: "logTypeUser", gallery: "logTypeGallery" } as const;
        const actionLabelKeys = { added: "logActionAdded", updated: "logActionUpdated", deleted: "logActionDeleted" } as const;
        const LOGS_PAGE_SIZE = 15;
        const logsTotalPages = Math.max(1, Math.ceil(state.activityLog.length / LOGS_PAGE_SIZE));
        const logsCurrentPage = Math.min(logsPage, logsTotalPages - 1);
        const pagedLogs = state.activityLog.slice(logsCurrentPage * LOGS_PAGE_SIZE, (logsCurrentPage + 1) * LOGS_PAGE_SIZE);
        sectionBody = state.activityLog.length ? (
          <>
          <div className="list">
            {pagedLogs.map((entry) => (
              <div key={entry.id} className="card" style={{ padding: 14 }}>
                <div className="tree-head">
                  <div>
                    <div className="tree-name">
                      {t(language, actionLabelKeys[entry.action])} {t(language, typeLabelKeys[entry.type])}: {entry.label}
                    </div>
                    <div className="tree-sub">
                      {formatDate(entry.createdAt, language)} | {entry.actorEmail ? (state.users.find((user) => user.email?.trim().toLowerCase() === entry.actorEmail?.trim().toLowerCase())?.name || state.users.find((user) => user.email?.trim().toLowerCase() === entry.actorEmail?.trim().toLowerCase())?.username || entry.actorEmail) : t(language, "systemActor")}
                    </div>
                    {entry.type === "member" && entry.memberBefore ? <details className="activity-change-details"><summary>{t(language, "savedVersionPrefix")} {entry.memberBefore.name}</summary><ul>{["name", "profession", "birthplace", "dob", "dod", "fatherId", "motherId"].map((field) => { const before = String((entry.memberBefore as unknown as Record<string, unknown>)[field] ?? "-"); const after = String((entry.memberAfter as unknown as Record<string, unknown> | null)?.[field] ?? "-"); return before !== after ? <li key={field}><strong>{field}</strong>: {before} -&gt; {after}</li> : null; })}</ul><button className="btn-ghost" type="button" onClick={() => restoreMemberVersion(entry)}>{t(language, "restoreVersionButton")}</button></details> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {logsTotalPages > 1 ? (
            <div className="actions-row" style={{ marginTop: 14, justifyContent: "center" }}>
              <button className="btn-ghost" type="button" disabled={logsCurrentPage === 0} onClick={() => setLogsPage(logsCurrentPage - 1)}>{t(language, "previousButtonLabel")}</button>
              <span className="tree-sub">{logsCurrentPage + 1} / {logsTotalPages}</span>
              <button className="btn-ghost" type="button" disabled={logsCurrentPage >= logsTotalPages - 1} onClick={() => setLogsPage(logsCurrentPage + 1)}>{t(language, "nextButtonLabel")}</button>
            </div>
          ) : null}
          </>
        ) : (
          <div className="empty">{t(language, "noLogEntries")}</div>
        );
      } else if (activeSection.key === "backup") {
        const daysSinceBackup = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000) : null;
        const needsBackupReminder = daysSinceBackup === null || daysSinceBackup > BACKUP_REMINDER_DAYS;
        sectionBody = (
          <div className="list backup-actions">
            {needsBackupReminder ? (
              <div className="notice">
                {daysSinceBackup === null
                  ? t(language, "backupReminderNever")
                  : `${t(language, "backupReminderTitle")} ${t(language, "backupReminderPrefix")} ${formatDate(lastBackupAt, language)}`}
              </div>
            ) : null}
            <button className="btn" type="button" onClick={exportState}>{t(language, "downloadBackupButton")}</button>
            <button className="btn-ghost" type="button" onClick={triggerImport}>{t(language, "importBackupButton")}</button>
            <button className="btn-ghost" type="button" onClick={() => navigate({ page: "familyBook" })}>{t(language, "generateFamilyBookButton")}</button>
            <button className="btn-ghost danger" type="button" onClick={resetToEmpty}>{t(language, "resetArchiveButton")}</button>
            {importError ? <div className="notice danger">{importError}</div> : null}
            <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(e) => handleImportFile(e.target.files?.[0])} />
          </div>
        );
      } else if (activeSection.key === "analytics") {
        const maxDayCount = Math.max(1, ...(visitStats?.last7Days.map((day) => day.count) ?? [0]));
        sectionBody = !supabaseConfigured ? (
          <div className="empty">{t(language, "analyticsOfflineHint")}</div>
        ) : visitStatsLoading && !visitStats ? (
          <div className="empty">{t(language, "loadingLabel")}</div>
        ) : visitStatsError ? (
          <div className="notice danger">{visitStatsError}</div>
        ) : (
          <>
            <div className="stat-grid">
              <StatCard value={state.visitorCount ?? 0} label={t(language, "totalVisitorsLabel")} icon={<EyeIcon />} />
              <StatCard value={visitStats?.today ?? 0} label={t(language, "todayVisitsLabel")} />
              <StatCard value={visitStats?.activeNow ?? 0} label={t(language, "activeNowLabel")} />
            </div>
            <LiveVisitorMap
              cities={liveCities}
              loading={liveCitiesLoading}
              error={liveCitiesError}
              onRefresh={() => { void fetchLiveVisitorCities().then(setLiveCities).catch((error) => setLiveCitiesError(error instanceof Error ? error.message : String(error))); }}
            />
            <div className="card" style={{ marginTop: 18, padding: 18 }}>
              <strong>{t(language, "visitsLast7DaysLabel")}</strong>
              <div className="analytics-bar-chart">
                {(visitStats?.last7Days ?? []).map((day) => (
                  <div key={day.date} className="analytics-bar-col">
                    <span className="analytics-bar-value">{day.count}</span>
                    <div className="analytics-bar" style={{ height: `${Math.max(4, (day.count / maxDayCount) * 100)}%` }} />
                    <small>{new Date(`${day.date}T00:00:00`).toLocaleDateString(language === "ur" ? "ur-PK" : "en", { weekday: "short" })}</small>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      }

      return (
        <div className="admin-layout admin-layout-no-sidebar">
          <section className="section admin-main">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t(language, "eyebrowAdminConsole")}</span>
                <h2 className="section-title" style={{ marginTop: 12 }}>{activeSection.label}</h2>
                <p className="section-subtitle">{activeSection.subtitle}</p>
              </div>
              {sectionActions ? <div className="actions-row">{sectionActions}</div> : null}
            </div>
            {sectionBody}
          </section>
        </div>
      );
    }

    if (route.page === "about") {
      return (
        <section className="section">
          <span className="eyebrow">{t(language, "eyebrowAbout")}</span>
          <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "aboutTitle")}</h2>
          <p className="section-subtitle" style={{ marginTop: 12 }}>
            {t(language, "aboutParagraph")}
          </p>
          <div className="notice" style={{ marginTop: 18 }}>
            {t(language, "aboutNotice")}
          </div>
        </section>
      );
    }

    if (route.page === "settings") {
      return (
        <section className="section">
          <span className="eyebrow">{t(language, "eyebrowSettings")}</span>
          <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "settingsTitle")}</h2>
          <p className="section-subtitle" style={{ marginTop: 12 }}>{Capacitor.isNativePlatform() ? t(language, "settingsSubtitle") : t(language, "changePasswordSubtitle")}</p>
          {Capacitor.isNativePlatform() ? <AppUpdaterCard language={language} isAdmin={isAdmin} canUseBiometric={isLoggedIn && (isAdmin || userRole === "editor")} /> : null}
          {isLoggedIn ? renderAccountSecuritySettings() : null}
        </section>
      );
    }

    if (route.page === "live") {
      const isUploadedVideo = state.liveStream?.kind === "upload" && Boolean(state.liveStream.url);
      const embedUrl = !isUploadedVideo && state.liveStream?.url ? getYouTubeEmbedUrl(state.liveStream.url) : null;
      return (
        <section className="section">
          <span className="eyebrow">{t(language, "eyebrowLive")}</span>
          <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "liveTitle")}</h2>
          <p className="section-subtitle" style={{ marginTop: 12 }}>{t(language, "liveSubtitle")}</p>

          {embedUrl || isUploadedVideo ? (
            <div className="card" style={{ marginTop: 18 }}>
              {state.liveStream?.title ? <h3 style={{ marginTop: 0 }}>{state.liveStream.title}</h3> : null}
              <div className="live-video-wrap">
                {isUploadedVideo ? (
                  <video src={state.liveStream!.url!} controls playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                ) : (
                  <iframe
                    src={embedUrl!}
                    title={state.liveStream?.title || t(language, "liveTitle")}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
              {state.liveStream?.updatedAt ? <div className="tree-sub" style={{ marginTop: 10 }}>{formatDate(state.liveStream.updatedAt, language)}</div> : null}
              {canAddLiveStreaming ? (
                <button className="btn-ghost danger" type="button" style={{ marginTop: 10 }} onClick={clearLiveStream}>{t(language, "liveRemoveButton")}</button>
              ) : null}
            </div>
          ) : (
            <div className="empty" style={{ marginTop: 18 }}>{t(language, "liveNoStreamBody")}</div>
          )}

          {canAddLiveStreaming ? (
            <div className="notice" style={{ marginTop: 18 }}>
              <strong>{t(language, "liveAdminSectionTitle")}</strong>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="span-12">
                  <span className="sr-only">{t(language, "liveTitleLabel")}</span>
                  <input
                    className="field"
                    placeholder={t(language, "liveTitlePlaceholder")}
                    value={liveTitleInput}
                    onChange={(e) => setLiveTitleInput(e.target.value)}
                  />
                </label>
                <label className="span-12">
                  <span className="sr-only">{t(language, "liveUrlLabel")}</span>
                  <input
                    className="field"
                    placeholder={t(language, "liveUrlPlaceholder")}
                    value={liveUrlInput}
                    onChange={(e) => setLiveUrlInput(e.target.value)}
                  />
                </label>
              </div>
              <div className="actions-row" style={{ marginTop: 12 }}>
                <button className="btn" type="button" disabled={!liveUrlInput.trim() || liveBusy} onClick={() => void publishLiveStream()}>
                  {liveBusy ? t(language, "sendingSuggestion") : t(language, "livePublishButton")}
                </button>
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border, #ddd)" }}>
                <strong style={{ fontSize: "0.9rem" }}>{t(language, "liveOrUploadTitle")}</strong>
                <p className="hint" style={{ margin: "4px 0 10px" }}>{t(language, "liveOrUploadHint")}</p>
                <input
                  className="field"
                  type="file"
                  accept="video/*"
                  disabled={liveBusy}
                  onChange={(e) => void uploadLiveVideoFile(e.target.files?.[0])}
                />
              </div>

              {liveNotice ? <p className="hint" style={{ marginTop: 10 }}>{liveNotice}</p> : null}
            </div>
          ) : null}
        </section>
      );
    }

    if (route.page === "guide") {
      return (
        <section className="section guide-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "guideEyebrow")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "guideTitle")}</h2>
            </div>
          </div>
          <div className="guide-grid">
            <div className="guide-step">
              <span className="guide-step-number">1</span>
              <div className="tree-name">{t(language, "guideStep1Title")}</div>
              <p className="guide-step-text">{t(language, "guideStep1Text")}</p>
            </div>
            <div className="guide-step">
              <span className="guide-step-number">2</span>
              <div className="tree-name">{t(language, "guideStep2Title")}</div>
              <p className="guide-step-text">{t(language, "guideStep2Text")}</p>
            </div>
            <div className="guide-step">
              <span className="guide-step-number">3</span>
              <div className="tree-name">{t(language, "guideStep3Title")}</div>
              <p className="guide-step-text">{t(language, "guideStep3Text")}</p>
            </div>
            <div className="guide-step">
              <span className="guide-step-number">4</span>
              <div className="tree-name">{t(language, "guideStep4Title")}</div>
              <p className="guide-step-text">{t(language, "guideStep4Text")}</p>
            </div>
            <div className="guide-step">
              <span className="guide-step-number">5</span>
              <div className="tree-name">{t(language, "guideStep5Title")}</div>
              <p className="guide-step-text">{t(language, "guideStep5Text")}</p>
            </div>
            <div className="guide-step">
              <span className="guide-step-number">6</span>
              <div className="tree-name">{t(language, "guideStep6Title")}</div>
              <p className="guide-step-text">{t(language, "guideStep6Text")}</p>
            </div>
          </div>
        </section>
      );
    }

    if (route.page === "roots") {
      return (
        <section className="section roots-elders-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowFounding")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "rootsEldersTitle")}</h2>
            </div>
            <button className="btn-ghost" type="button" onClick={() => navigate({ page: "tree" })}>{t(language, "openTreeLink")}</button>
          </div>
          {roots.length ? (
            <div className="roots-elders-grid">
              {roots.map((member) => (
                <MemberCard key={member.id} member={member} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
              ))}
            </div>
          ) : (
            <div className="empty">
              {t(language, "noRootsYet")}
            </div>
          )}
        </section>
      );
    }

    if (route.page === "memory") {
      return (
        <section className="section in-memory-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowInMemory")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "inMemoryTitle")}</h2>
              <p className="section-subtitle">{t(language, "inMemorySubtitle")}</p>
            </div>
          </div>
          {deceasedMembers.length ? (
            <div className="roots-elders-grid">
              {deceasedMembers.map((member) => (
                <MemberCard key={member.id} member={member} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
              ))}
            </div>
          ) : (
            <div className="empty">{t(language, "noInMemoryYet")}</div>
          )}
        </section>
      );
    }

    if (route.page === "dua") {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowDua")}</span>
              <h1 className="section-title">{t(language, "duaBoardTitle")}</h1>
              <p className="section-subtitle">{t(language, "duaBoardSubtitle")}</p>
            </div>
            <button className="btn" type="button" onClick={openDuaEditor}>{t(language, "postDuaButton")}</button>
          </div>
          {duaSent ? <p className="hint">{t(language, "duaSentMessage")}</p> : null}
          {openDuaRequests.length ? (
            <div className="list">
              {openDuaRequests.map((request) => (
                <div key={request.id} className="card announcement-card">
                  <div className="announcement-card-body">
                    <p className="announcement-message">{request.message}</p>
                    <div className="tree-sub">
                      {formatDate(request.createdAt, language)} | {request.requesterName || t(language, "anonymousSubmitter")}
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="actions-row">
                      <button className="btn-ghost" type="button" onClick={() => markDuaFulfilled(request.id)}>{t(language, "markDuaFulfilledButton")}</button>
                      <button className="btn-ghost danger" type="button" onClick={() => deleteDuaRequest(request.id)}>{t(language, "deleteButton")}</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">{t(language, "noDuaRequestsYet")}</div>
          )}
          {fulfilledDuaRequests.length ? (
            <>
              <h2 className="section-title" style={{ marginTop: 28, fontSize: "1.1rem" }}>{t(language, "duaFulfilledTitle")}</h2>
              <div className="list">
                {fulfilledDuaRequests.map((request) => (
                  <div key={request.id} className="card announcement-card dua-fulfilled-card">
                    <div className="announcement-card-body">
                      <p className="announcement-message">{request.message}</p>
                      <div className="tree-sub">
                        {formatDate(request.createdAt, language)} | {request.requesterName || t(language, "anonymousSubmitter")}
                      </div>
                    </div>
                    {isAdmin ? <button className="btn-ghost danger" type="button" onClick={() => deleteDuaRequest(request.id)}>{t(language, "deleteButton")}</button> : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
      );
    }

    if (route.page === "update") {
      const targetMember = route.memberId ? state.members.find((candidate) => candidate.id === route.memberId) : undefined;
      if (!targetMember || (!updateLinkValid && !updateRequestSent) || !updateRequestDraft || updateRequestDraft.memberId !== targetMember.id) {
        return (
          <section className="section">
            <div className="empty">{updateLinkNotice || t(language, "updateLinkInvalid")}</div>
          </section>
        );
      }
      return (
        <section className="section profile-update-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "updateYourProfileEyebrow")}</span>
              <h1 className="section-title">{displayName(targetMember, language)}</h1>
              <p className="section-subtitle">{t(language, "updateYourProfileSubtitle")}</p>
            </div>
          </div>
          {updateRequestSent ? (
            <div className="notice success">{t(language, "updateRequestSentMessage")}</div>
          ) : (
            <div className="profile-update-form">
              <div className="profile-update-photo card">
                <img className="profile-update-avatar" src={photoSrc(updateRequestDraft.photo)} alt={displayName(targetMember, language)} />
                <label className="profile-update-label">
                  <span>{t(language, "uploadPhotoLabel")}</span>
                  <input type="file" accept="image/*" aria-label={t(language, "uploadPhotoLabel")} onChange={(e) => void handleUpdateRequestPhoto(e.target.files?.[0])} />
                </label>
              </div>
              <label className="profile-update-label">
                <span>{t(language, "professionLabel")}</span>
                <select className="select" value={professionDraftFields(updateRequestDraft.profession).professionChoice} onChange={(e) => setUpdateRequestDraft((current) => current ? { ...current, profession: e.target.value === PROFESSION_OTHER ? (professionDraftFields(current.profession).professionChoice === PROFESSION_OTHER ? current.profession : "") : e.target.value } : current)}>
                  <option value="">{t(language, "professionLabel")}, {t(language, "professionNone")}</option>
                  {PROFESSION_KEYS.map((key) => {
                    const short = professionShortLabel(language, key);
                    const full = professionLabel(language, key);
                    return <option key={key} value={key}>{short !== full ? `${short}   ${full}` : full}</option>;
                  })}
                  <option value={PROFESSION_OTHER}>{t(language, "professionOther")}</option>
                </select>
                {professionDraftFields(updateRequestDraft.profession).professionChoice === PROFESSION_OTHER ? <input className="field" maxLength={80} placeholder={t(language, "professionOtherPlaceholder")} value={professionDraftFields(updateRequestDraft.profession).professionOther} onChange={(e) => setUpdateRequestDraft((current) => current ? { ...current, profession: e.target.value } : current)} /> : null}
              </label>

              <label className="profile-update-label profile-update-bio">
                <span>{t(language, "bioLabel")}</span>
                <textarea className="textarea" placeholder={t(language, "bioLabel")} value={updateRequestDraft.bio} onChange={(e) => setUpdateRequestDraft((current) => current ? { ...current, bio: e.target.value } : current)} />
              </label>
              <section className="profile-publications-editor profile-update-bio">
                <div className="section-head"><div><h2>{t(language, "publicationsTitle")}</h2></div>
                  <button className="btn-ghost" type="button" disabled={updateRequestDraft.publications.length >= 12} onClick={() => setUpdateRequestDraft((current) => current ? { ...current, publications: [...current.publications, { title: "" }] } : current)}>{t(language, "addPublicationButton")}</button>
                </div>
                {updateRequestDraft.publications.map((item, index) => <PublicationFields key={index} item={item} language={language} onChange={(next) => setUpdateRequestDraft((current) => current ? { ...current, publications: current.publications.map((publication, i) => i === index ? next : publication) } : current)} onRemove={() => setUpdateRequestDraft((current) => current ? { ...current, publications: current.publications.filter((_, i) => i !== index) } : current)} onUploadAsset={uploadPublicationAsset} />)}
              </section>
              <div className="profile-update-actions">
                <button className="btn" type="button" disabled={updateRequestBusy || !updateLinkValid} onClick={() => void submitMemberUpdateRequest()}>
                  {updateRequestBusy ? t(language, "sendingSuggestion") : t(language, "sendUpdateRequestButton")}
                </button>
                <p className="hint">{t(language, "updateRequestPendingHint")}</p>
              </div>
            </div>
          )}
        </section>
      );
    }

    if (route.page === "familyBook") {
      return (
        <section className="section family-book-section">
          <div className="section-head no-print">
            <div>
              <span className="eyebrow">{t(language, "familyBookEyebrow")}</span>
              <h1 className="section-title">{t(language, "familyBookTitle")}</h1>
              <p className="section-subtitle">{t(language, "familyBookHint")}</p>
            </div>
            <button className="btn" type="button" onClick={printPage}>{t(language, "printProfileButton")}</button>
          </div>

          <div className="family-book-cover">
            <h1>{state.appName}</h1>
            <p>{t(language, "familyBookTitle")}</p>
            <p className="family-book-cover-meta">{formatDate(new Date().toISOString(), language)} | {t(language, "membersLabel")}: {state.members.length}</p>
          </div>

          {familyBookGroups.map((group) => (
            <div key={group.generation} className="family-book-generation">
              <h2 className="family-book-generation-title">{t(language, "familyBookGenerationLabel")} {group.generation}</h2>
              <div className="family-book-entries">
                {group.members.map((member) => {
                  const parents = getParents(state.members, member);
                  const spouses = getSpouses(state.members, member);
                  const children = getChildren(state.members, member.id);
                  return (
                    <div key={member.id} className="family-book-entry">
                      <img className="avatar" src={photoSrc(member.photo)} alt={displayName(member, language)} />
                      <div className="family-book-entry-body">
                        <div className="tree-name">
                          {displayName(member, language)}
                          {member.uniqueId ? <span className="id-badge">{member.uniqueId}</span> : null}
                        </div>
                        <div className="tree-sub">
                          {member.birthplace || t(language, "noBirthplace")}
                          {member.profession?.trim() ? ` | ${professionLabel(language, member.profession.trim())}` : ""}
                        </div>
                        {member.dob ? <div className="tree-sub">{t(language, "bornWord")} {formatDate(member.dob, language)} ({formatHijriDate(member.dob, language)})</div> : null}
                        {member.dod ? <div className="tree-sub">{t(language, "diedWord")} {formatDate(member.dod, language)} ({formatHijriDate(member.dod, language)})</div> : null}
                        {parents.length ? <div className="tree-sub">{t(language, "parentsTitle")}: {parents.map((parent) => displayName(parent, language)).join(", ")}</div> : null}
                        {spouses.length ? <div className="tree-sub">{t(language, "spousesSuffix")}: {spouses.map((spouse) => displayName(spouse, language)).join(", ")}</div> : null}
                        {children.length ? <div className="tree-sub">{t(language, "childrenSuffix")}: {children.map((child) => displayName(child, language)).join(", ")}</div> : null}
                        {member.daughtersCount != null ? <div className="tree-sub">{t(language, "daughtersCountLabel")}: {member.daughtersCount}</div> : null}
                        {member.bio ? <p className="family-book-bio">{member.bio}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      );
    }

    return (
      <>
        <section className="hero">
          <span className="eyebrow">{t(language, "eyebrowHero")}</span>
          <h1 className="hero-legacy-title">{t(language, "heroLegacyTitleLine1")}<br />{t(language, "heroLegacyTitleLine2")}</h1>
          <p className="hero-legacy-copy">{t(language, "heroLegacyCopy")}</p>
          <ProfessionPhotoSlider members={state.members} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
        </section>

        {todayMemories.length ? <section className="section today-memories-section"><div className="section-head"><div><span className="eyebrow">{t(language, "familyMemoriesEyebrow")}</span><h2 className="section-title">{t(language, "onThisDayTitle")}</h2></div><button className="btn-ghost" onClick={() => navigate({ page: "calendar" })}>{t(language, "openFamilyCalendarButton")}</button></div><div className="today-memory-grid">{todayMemories.map((memory) => <button className="card today-memory-card" key={memory.id} onClick={() => memory.member ? navigate({ page: "member", memberId: memory.member.id }) : navigate({ page: "gallery" })}>{memory.image ? <img src={photoSrc(memory.image.src)} alt="" /> : null}<span><strong>{memory.title}</strong><small>{memory.kind.replace(/-/g, " ")}</small></span></button>)}</div></section> : null}
        {deceasedMembers.length ? (
          <section className="section in-memory-preview">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t(language, "eyebrowInMemory")}</span>
                <h2 className="section-title">{t(language, "inMemoryTitle")}</h2>
              </div>
              <button className="btn-ghost" onClick={() => navigate({ page: "memory" })}>{t(language, "viewAllButton")}</button>
            </div>
            <div className="member-grid">
              {deceasedMembers.slice(0, 6).map((member) => (
                <MemberCard key={member.id} member={member} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
              ))}
            </div>
          </section>
        ) : null}
        {openDuaRequests.length ? (
          <section className="section dua-preview">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t(language, "eyebrowDua")}</span>
                <h2 className="section-title">{t(language, "duaBoardTitle")}</h2>
              </div>
              <button className="btn-ghost" onClick={() => navigate({ page: "dua" })}>{t(language, "viewAllButton")}</button>
            </div>
            <div className="list">
              {openDuaRequests.slice(0, 3).map((request) => (
                <div key={request.id} className="card announcement-card">
                  <div className="announcement-card-body">
                    <p className="announcement-message">{request.message}</p>
                    <div className="tree-sub">
                      {formatDate(request.createdAt, language)} | {request.requesterName || t(language, "anonymousSubmitter")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="hero-tools section">
          <div className="hero-actions">
            <button className="btn" type="button" onClick={() => navigate({ page: "tree" })}>{t(language, "openFamilyTreeButton")}</button>
            <button className="btn-ghost" type="button" onClick={() => openSuggestionEditor()}>{t(language, "suggestEditButton")}</button>
            <button className="btn-ghost" type="button" onClick={openDuaEditor}>{t(language, "postDuaButton")}</button>
          </div>
          {suggestionSent ? <p className="hint">{t(language, "suggestionSentMessage")}</p> : null}
          {duaSent ? <p className="hint">{t(language, "duaSentMessage")}</p> : null}
          {myFamilyHint ? <p className="hint">{myFamilyHint}</p> : null}
          <div className="hero-search" style={{ position: "relative" }}>
            <input className="field" placeholder={t(language, "searchMembersPlaceholder")} value={homeSearchQuery} onChange={(e) => setHomeSearchQuery(e.target.value)} onFocus={() => setHomeSearchOpen(true)} onBlur={() => setHomeSearchOpen(false)} />
            {homeSearchOpen && homeSearchQuery.trim() ? (
              <div className="autocomplete-list">
                {state.members.filter((member) => fullLabel(member, language).toLowerCase().includes(homeSearchQuery.trim().toLowerCase())).slice(0, 8).map((member) => (
                  <button key={member.id} type="button" className="autocomplete-item" onMouseDown={(e) => { e.preventDefault(); setHomeSearchQuery(""); navigate({ page: "member", memberId: member.id }); }}>
                    {fullLabel(member, language)}{member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {state.members.length ? (
          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t(language, "eyebrowInsights")}</span>
                <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "insightsTitle")}</h2>
                <p className="section-subtitle">{t(language, "insightsSubtitle")}</p>
              </div>
            </div>
            <div className="stat-grid">
              <StatCard value={stats.members} label={t(language, "membersLabel")} />
              <StatCard value={familyInsights.generations} label={t(language, "generationsLabel")} />
              <StatCard value={familyInsights.male} label={t(language, "genderMale")} />
              <StatCard value={familyInsights.female} label={t(language, "genderFemale")} />
              {familyInsights.oldestLiving ? (
                <StatCard
                  value={calculateAge(familyInsights.oldestLiving.dob, familyInsights.oldestLiving.dod) ?? "-"}
                  label={t(language, "oldestLivingLabel")}
                  hint={displayName(familyInsights.oldestLiving, language)}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        {professionGroups.length ? (
          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t(language, "eyebrowProfessions")}</span>
                <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "professionsTitle")}</h2>
                <p className="section-subtitle">{t(language, "professionsSubtitle")}</p>
              </div>
            </div>
            <div className="profession-grid">
              {professionGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`stat-card profession-card${group.id === activeProfessionGroup?.id ? " active" : ""}`}
                  aria-pressed={group.id === activeProfessionGroup?.id}
                  onClick={() => setSelectedProfession((current) => (current === group.id ? null : group.id))}
                >
                  <span className="stat-value">{group.members.length}</span>
                  <span className="muted" style={{ fontWeight: 700 }}>{group.label}</span>
                </button>
              ))}
            </div>
            {activeProfessionGroup ? (
              <div className="member-grid profession-members">
                {[...activeProfessionGroup.members].sort(sortMembers).map((member) => (
                  <MemberCard key={member.id} member={member} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {state.members.length > 1 ? (
          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t(language, "eyebrowFamilyTree")}</span>
                <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "findSomeoneTitle")}</h2>
                <p className="section-subtitle">{t(language, "findSomeoneSubtitle")}</p>
              </div>
            </div>
            <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div style={{ position: "relative" }}>
                <div className="muted" style={{ marginBottom: 8, fontWeight: 700 }}>{t(language, "relativeALabel")}</div>
                <input
                  className="field"
                  placeholder={t(language, "searchMembersPlaceholder")}
                  value={relativeASearch}
                  onChange={(e) => { setRelativeASearch(e.target.value); setRelativeAId(""); }}
                />
                {relativeASearch.trim() && !relativeAId ? (
                  <div className="autocomplete-list">
                    {state.members
                      .filter((member) => fullLabel(member, language).toLowerCase().includes(relativeASearch.trim().toLowerCase()))
                      .slice(0, 8)
                      .map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="autocomplete-item"
                          onMouseDown={(e) => { e.preventDefault(); setRelativeAId(String(member.id)); setRelativeASearch(fullLabel(member, language)); }}
                        >
                          {fullLabel(member, language)}
                          {member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
              <div style={{ position: "relative" }}>
                <div className="muted" style={{ marginBottom: 8, fontWeight: 700 }}>{t(language, "relativeBLabel")}</div>
                <input
                  className="field"
                  placeholder={t(language, "searchMembersPlaceholder")}
                  value={relativeBSearch}
                  onChange={(e) => { setRelativeBSearch(e.target.value); setRelativeBId(""); }}
                />
                {relativeBSearch.trim() && !relativeBId ? (
                  <div className="autocomplete-list">
                    {state.members
                      .filter((member) => fullLabel(member, language).toLowerCase().includes(relativeBSearch.trim().toLowerCase()))
                      .slice(0, 8)
                      .map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="autocomplete-item"
                          onMouseDown={(e) => { e.preventDefault(); setRelativeBId(String(member.id)); setRelativeBSearch(fullLabel(member, language)); }}
                        >
                          {fullLabel(member, language)}
                          {member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
            {relativeAId && relativeBId ? (
              <div className="notice" style={{ marginTop: 16 }}>
                {(() => {
                  const idA = Number(relativeAId);
                  const idB = Number(relativeBId);
                  const memberA = memberMap.get(idA);
                  const memberB = memberMap.get(idB);
                  if (!memberA || !memberB) return null;
                  const relation = findRelation(state.members, idA, idB);
                  if (relation === "same" || relation === "none") {
                    return <p>{t(language, RELATION_LABEL_KEYS[relation])}</p>;
                  }
                  return <p>{displayName(memberB, language)} {t(language, RELATION_LABEL_KEYS[relation])} {displayName(memberA, language)}.</p>;
                })()}
              </div>
            ) : null}
          </section>
        ) : null}
      </>
    );
  })();

  // On mobile, the hamburger menu contains direct links to every admin section and the
  // permitted quick actions. The same section links live in the desktop navbar dropdown.
  const isNativeApp = Capacitor.isNativePlatform();
  const nativeAdminLabels: Partial<Record<AdminSection, string>> = {
    members: "Add Members",
    users: "Add Users",
    gallery: "Add Photos"
  };
  const mobileAdminLinks: { key: string; label: string; onClick: () => void; badge?: number }[] = isLoggedIn
    ? [
        ...adminNavMenuItems.map((item) => ({
          key: `admin-${item.key}`,
          label: isNativeApp ? nativeAdminLabels[item.key] ?? item.label : item.label,
          badge: item.badge,
          onClick: () => { navigate({ page: "admin" }); setAdminSection(item.key); setPasswordChangeError(""); setPasswordChangeSuccess(false); }
        })),
        ...(!isNativeApp && canAddMember ? [{ key: "addMember", label: t(language, "addMemberButton"), onClick: () => { navigate({ page: "admin" }); setAdminSection("members"); openMemberEditor(); } }] : []),
        ...(!isNativeApp && isAdmin ? [{ key: "addUser", label: t(language, "addUserButton"), onClick: () => { navigate({ page: "admin" }); setAdminSection("users"); openUserEditor(); } }] : []),
        ...(!isNativeApp && canAddAnnouncement ? [{ key: "postAnnouncement", label: t(language, "postAnnouncementButton"), onClick: () => { navigate({ page: "calendar" }); openAnnouncementEditor(); } }] : []),
        { key: "notifications", label: isNativeApp ? "Post Announcement" : t(language, "navNotificationsLabel"), badge: notificationBadgeCount, onClick: () => navigate({ page: "calendar" }) },
        { key: "live", label: canAddLiveStreaming ? t(language, "addLiveStreamingLabel") : t(language, "navLiveLabel"), onClick: () => navigate({ page: "live" }) },
        { key: "settings", label: t(language, "navSettingsLabel"), badge: isNativeApp && appUpdateAvailable ? 1 : 0, onClick: () => navigate({ page: "settings" }) }
      ]
    : [];

  return (
    <div className="app-shell" onTouchStart={handlePullTouchStart} onTouchMove={handlePullTouchMove} onTouchEnd={handlePullTouchEnd}>
      {pullStatus !== "idle" || pullDistance > 0 ? (
        <div
          className={`pull-refresh-indicator${pullStatus !== "idle" ? ` ${pullStatus}` : ""}`}
          style={pullStatus === "idle" ? { opacity: Math.min(1, pullDistance / 70), transform: `translateX(-50%) scale(${0.6 + Math.min(1, pullDistance / 70) * 0.4})` } : undefined}
        >
          <span className={`pull-refresh-spinner${pullStatus === "refreshing" ? " spinning" : ""}`} />
          {pullStatus === "done" ? t(language, "dataRefreshed") : pullStatus === "error" ? t(language, "saveFailed") : pullStatus === "refreshing" ? t(language, "refreshingData") : null}
        </div>
      ) : null}
      <header className="topbar">
        <a className="brand" href="#/home">
          <div className="brand-mark"><img src={import.meta.env.BASE_URL + "logo.jpg"} alt="" /></div>
          <div className="brand-title">
            <strong>{state.appName}</strong>
          </div>
        </a>
        <span className="visitor-counter visitor-counter-mobile" title={t(language, "totalVisitorsLabel")} aria-label={`${t(language, "totalVisitorsLabel")}: ${state.visitorCount ?? 0}`}>
          <EyeIcon />
          {state.visitorCount ?? 0}
        </span>
        <button
          type="button"
          className={`hamburger-btn${mobileNavOpen ? " open" : ""}`}
          aria-label={mobileNavOpen ? t(language, "ariaCloseMenu") : t(language, "ariaOpenMenu")}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={`topnav${mobileNavOpen ? " open" : ""}${isLoggedIn ? " topnav-authed" : ""}`}>
          {isLoggedIn ? (
            <details className="topnav-admin-dropdown">
              <summary className="navlink">{t(language, "adminNavMenuLabel")} <span aria-hidden="true">⌄</span></summary>
              <div className="topnav-admin-dropdown-menu" role="menu" aria-label={t(language, "adminSidebarAria")}>
                {adminNavMenuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    className={`navlink${route.page === "admin" && adminSection === item.key ? " active" : ""}`}
                    onClick={(event) => {
                      const dropdown = event.currentTarget.closest("details");
                      if (dropdown) dropdown.open = false;
                      navigate({ page: "admin" });
                      setAdminSection(item.key);
                      setPasswordChangeError("");
                      setPasswordChangeSuccess(false);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge > 99 ? "99+" : item.badge}</span> : null}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          {isLoggedIn ? (
            <div className="topnav-admin-links">
              {mobileAdminLinks.map((link) => (
                <button
                  key={link.key}
                  type="button"
                  className="navlink"
                  onClick={() => { link.onClick(); setMobileNavOpen(false); }}
                >
                  <span>{link.label}</span>{link.badge ? <span className="nav-badge">{link.badge > 99 ? "99+" : link.badge}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className="topnav-public-links">
            <NavLink active={route.page === "home"} onClick={() => navigate({ page: "home" })}>{NAV_LABELS[language].home}</NavLink>
            <NavLink active={route.page === "tree"} onClick={() => navigate({ page: "tree" })}>{NAV_LABELS[language].tree}</NavLink>
            <NavLink active={route.page === "member" && route.memberId === myMemberId} onClick={() => { goToMyFamily(); setMobileNavOpen(false); }}>{t(language, "myFamilyNavLabel")}</NavLink>
            <NavLink active={route.page === "roots"} onClick={() => navigate({ page: "roots" })}>{NAV_LABELS[language].roots}</NavLink>
            <NavLink active={route.page === "gallery"} onClick={() => navigate({ page: "gallery" })}>{NAV_LABELS[language].gallery}</NavLink>
            <NavLink active={route.page === "calendar"} badge={notificationBadgeCount} onClick={() => navigate({ page: "calendar" })}>{t(language, "navNotificationsLabel")}</NavLink>
            <NavLink active={route.page === "live"} onClick={() => navigate({ page: "live" })}>{canAddLiveStreaming ? t(language, "addLiveStreamingLabel") : t(language, "navLiveLabel")}</NavLink>
            <NavLink active={route.page === "guide"} onClick={() => navigate({ page: "guide" })}>{NAV_LABELS[language].guide}</NavLink>
            <NavLink active={route.page === "about"} onClick={() => navigate({ page: "about" })}>{NAV_LABELS[language].about}</NavLink>
            {isLoggedIn ? <NavLink active={route.page === "settings"} badge={isNativeApp && appUpdateAvailable ? 1 : 0} onClick={() => navigate({ page: "settings" })}>{t(language, "navSettingsLabel")}</NavLink> : null}
          </div>
          <div className="topnav-actions-mobile">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setState((current) => ({ ...current, language: current.language === "ur" ? "en" : "ur" }))}
            >
              {state.language === "ur" ? "EN" : "اردو"}
            </button>
            <button type="button" className="icon-btn" onClick={() => setState((current) => ({ ...current, theme: current.theme === "dark" ? "light" : "dark" }))}>
              {state.theme === "dark" ? "☾" : "☀"}
            </button>
            {isLoggedIn ? (
              <button type="button" className="toggle" onClick={logout}>{t(language, "logoutButton")}</button>
            ) : (
              <button type="button" className="toggle" onClick={() => navigate({ page: "admin" })}>{t(language, "navLoginLabel")}</button>
            )}
          </div>
        </nav>
        <div className="header-actions">
          <span className="visitor-counter" title={t(language, "totalVisitorsLabel")} aria-label={`${t(language, "totalVisitorsLabel")}: ${state.visitorCount ?? 0}`}>
            <EyeIcon />
            {state.visitorCount ?? 0}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setState((current) => ({ ...current, language: current.language === "ur" ? "en" : "ur" }))}
          >
            {state.language === "ur" ? "EN" : "اردو"}
          </button>
          <button type="button" className="icon-btn" onClick={() => setState((current) => ({ ...current, theme: current.theme === "dark" ? "light" : "dark" }))}>
            {state.theme === "dark" ? "☾" : "☀"}
          </button>
          {isLoggedIn ? (
            <button type="button" className="toggle" onClick={logout}>{t(language, "logoutButton")}</button>
          ) : (
            <button type="button" className="toggle" onClick={() => navigate({ page: "admin" })}>{t(language, "navLoginLabel")}</button>
          )}
        </div>
      </header>

      {mobileNavOpen ? <div className="nav-backdrop" onClick={() => setMobileNavOpen(false)} /> : null}

      {content}
      <SajraChat appName={state.appName} members={state.members} onOpenMember={(id) => navigate({ page: "member", memberId: id })} onFeedback={submitChatFeedback} />

      {supabaseConfigured && (syncStatus === "error" || syncStatus === "conflict") ? (
        <p className="footer-note">
          {syncStatus === "error"
            ? `${t(language, "syncIssuePrefix")} ${t(language, syncMessageKey)} ${t(language, "syncIssueSuffix")}`
            : t(language, syncMessageKey)}
        </p>
      ) : null}

      {isLoggedIn && saveToast ? (
        <div className={`sync-toast ${saveToast.tone}`} role="status" aria-live="polite">{t(language, saveToast.key)}</div>
      ) : null}

      {memberDraft ? (
        <Modal
          title={memberDraft.id ? t(language, "editMemberModalTitle") : t(language, "addMemberModalTitle")}
          subtitle={t(language, "memberModalSubtitle")}
          onClose={closeEditors}
        >
          <div className="form-grid">
            {memberDraft.id ? (
              <div className="span-12 muted" style={{ fontWeight: 700 }}>{t(language, "userIdPrefix")}: {state.members.find((m) => m.id === memberDraft.id)?.uniqueId}</div>
            ) : null}
            <label className="span-6">
              <span className="sr-only">{t(language, "nameLabel")}</span>
              <input className="field" placeholder={t(language, "nameLabel")} value={memberDraft.name} onChange={(e) => setMemberDraft((current) => current ? { ...current, name: e.target.value } : current)} />
            </label>
            <label className="span-6">
              <span className="sr-only">{t(language, "urduNameLabel")}</span>
              <input className="field" placeholder={t(language, "urduNameLabel")} value={memberDraft.nameUr} onChange={(e) => setMemberDraft((current) => current ? { ...current, nameUr: e.target.value } : current)} />
            </label>
            <label className="span-4">
              <span className="sr-only">{t(language, "genderLabel")}</span>
              <select className="select" aria-label={t(language, "genderLabel")} value={memberDraft.gender} onChange={(e) => setMemberDraft((current) => current ? { ...current, gender: e.target.value as Gender } : current)}>
                <option value="male">{t(language, "genderMale")}</option>
                <option value="female">{t(language, "genderFemale")}</option>
              </select>
            </label>
            <label className="span-4">
              <span className="sr-only">{t(language, "ageWord")}</span>
              <input
                className="field"
                type="number"
                min="0"
                max="130"
                placeholder={t(language, "ageWord")}
                aria-label={t(language, "ageWord")}
                value={memberDraft.age}
                onChange={(e) => setMemberDraft((current) => current ? { ...current, age: e.target.value } : current)}
              />
            </label>
            <label className="span-6">
              <span className="sr-only">{t(language, "birthplaceLabel")}</span>
              <input className="field" placeholder={t(language, "birthplaceLabel")} value={memberDraft.birthplace} onChange={(e) => setMemberDraft((current) => current ? { ...current, birthplace: e.target.value } : current)} />
            </label>
            <label className="span-6">
              <span className="sr-only">{t(language, "daughtersCountLabel")}</span>
              <input
                className="field"
                type="number"
                min="0"
                max="30"
                placeholder={t(language, "daughtersCountLabel")}
                aria-label={t(language, "daughtersCountLabel")}
                value={memberDraft.daughtersCount}
                onChange={(e) => setMemberDraft((current) => current ? { ...current, daughtersCount: e.target.value } : current)}
              />
              <small className="muted">{t(language, "daughtersCountHint")}</small>
            </label>
            <label className="span-6">
              <span className="sr-only">{t(language, "professionLabel")}</span>
              <select className="select" aria-label={t(language, "professionLabel")} value={memberDraft.professionChoice} onChange={(e) => setMemberDraft((current) => current ? { ...current, professionChoice: e.target.value } : current)}>
                <option value="">{t(language, "professionLabel")}, {t(language, "professionNone")}</option>
                {PROFESSION_KEYS.map((key) => {
                  const short = professionShortLabel(language, key);
                  const full = professionLabel(language, key);
                  return (
                    <option key={key} value={key}>{short !== full ? `${short}   ${full}` : full}</option>
                  );
                })}
                <option value={PROFESSION_OTHER}>{t(language, "professionOther")}</option>
              </select>
            </label>
            {memberDraft.professionChoice === PROFESSION_OTHER ? (
              <label className="span-6">
                <span className="sr-only">{t(language, "professionOtherPlaceholder")}</span>
                <input className="field" placeholder={t(language, "professionOtherPlaceholder")} value={memberDraft.professionOther} onChange={(e) => setMemberDraft((current) => current ? { ...current, professionOther: e.target.value } : current)} />
              </label>
            ) : null}
            <label className="span-6">
              <span className="sr-only">{t(language, "photoUrlLabel")}</span>
              <input className="field" placeholder={t(language, "photoUrlLabel")} value={memberDraft.photo} onChange={(e) => setMemberDraft((current) => current ? { ...current, photo: e.target.value } : current)} />
            </label>
            <label className="span-12">
              <span className="sr-only">{t(language, "uploadPhotoLabel")}</span>
              <input
                className="field"
                type="file"
                accept="image/*"
                aria-label={t(language, "uploadPhotoLabel")}
                onChange={(e) => handleMemberPhoto(e.target.files?.[0])}
              />
            </label>
            {canAddToSlider ? <label className="span-12 hero-slider-admin-toggle"><input type="checkbox" checked={memberDraft.showInHeroSlider} disabled={!memberDraft.showInHeroSlider && !(Boolean(memberDraft.photo.trim()) && isSliderProfession(normalizeProfession(memberDraft.professionChoice === PROFESSION_OTHER ? memberDraft.professionOther : memberDraft.professionChoice)))} onChange={(event) => setMemberDraft((current) => current ? { ...current, showInHeroSlider: event.target.checked } : current)} /><span><strong>{t(language, "heroSliderToggleLabel")}</strong></span></label> : null}
            <label className="span-12">
              <span className="sr-only">{t(language, "bioLabel")}</span>
              <textarea className="textarea" placeholder={t(language, "bioLabel")} value={memberDraft.bio} onChange={(e) => setMemberDraft((current) => current ? { ...current, bio: e.target.value } : current)} />
            </label>
            <section className="span-12 member-publications-editor">
              <div className="section-head"><div><h3>{t(language, "publicationsTitle")}</h3></div>
                <button className="btn-ghost" type="button" disabled={memberDraft.publications.length >= 12} onClick={() => setMemberDraft((current) => current ? { ...current, publications: [...current.publications, { title: "" }] } : current)}>{t(language, "addPublicationButton")}</button>
              </div>
              {memberDraft.publications.map((item, index) => <PublicationFields key={index} item={item} language={language} onChange={(next) => setMemberDraft((current) => current ? { ...current, publications: current.publications.map((publication, i) => i === index ? next : publication) } : current)} onRemove={() => setMemberDraft((current) => current ? { ...current, publications: current.publications.filter((_, i) => i !== index) } : current)} onUploadAsset={uploadPublicationAsset} />)}
            </section>

            <div className="span-6">
              <div className="muted" style={{ marginBottom: 10, fontWeight: 700 }}>{t(language, "fatherLabel")}</div>
              {memberDraft.fatherId ? (
                (() => {
                  const father = state.members.find((candidate) => candidate.id === Number(memberDraft.fatherId));
                  if (!father) return null;
                  return (
                    <div className="member-chip-list" style={{ marginBottom: 10 }}>
                      <button
                        type="button"
                        className="member-chip active"
                        onClick={() => setMemberDraft((current) => current ? { ...current, fatherId: "" } : current)}
                      >
                        {fullLabel(father, language)} {father.uniqueId ? `(${father.uniqueId})` : ""} x
                      </button>
                    </div>
                  );
                })()
              ) : null}
              <div style={{ position: "relative" }}>
                <input
                  className="field"
                  placeholder={t(language, "searchMembersPlaceholder")}
                  value={fatherSearchQuery}
                  onChange={(e) => setFatherSearchQuery(e.target.value)}
                />
                {fatherSearchQuery.trim() ? (
                  <div className="autocomplete-list">
                    {state.members
                      .filter((member) =>
                        member.gender === "male" &&
                        member.id !== memberDraft.id &&
                        fullLabel(member, language).toLowerCase().includes(fatherSearchQuery.trim().toLowerCase())
                      )
                      .slice(0, 8)
                      .map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="autocomplete-item"
                          onClick={() => {
                            setMemberDraft((current) => current ? { ...current, fatherId: String(member.id) } : current);
                            setFatherSearchQuery("");
                          }}
                        >
                          {fullLabel(member, language)}
                          {member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="span-6">
              <div className="muted" style={{ marginBottom: 10, fontWeight: 700 }}>{t(language, "motherLabel")}</div>
              {memberDraft.motherId ? (
                (() => {
                  const mother = state.members.find((candidate) => candidate.id === Number(memberDraft.motherId));
                  if (!mother) return null;
                  return (
                    <div className="member-chip-list" style={{ marginBottom: 10 }}>
                      <button
                        type="button"
                        className="member-chip active"
                        onClick={() => setMemberDraft((current) => current ? { ...current, motherId: "" } : current)}
                      >
                        {fullLabel(mother, language)} {mother.uniqueId ? `(${mother.uniqueId})` : ""} x
                      </button>
                    </div>
                  );
                })()
              ) : null}
              <div style={{ position: "relative" }}>
                <input
                  className="field"
                  placeholder={t(language, "searchMembersPlaceholder")}
                  value={motherSearchQuery}
                  onChange={(e) => setMotherSearchQuery(e.target.value)}
                />
                {motherSearchQuery.trim() ? (
                  <div className="autocomplete-list">
                    {state.members
                      .filter((member) =>
                        member.gender === "female" &&
                        member.id !== memberDraft.id &&
                        fullLabel(member, language).toLowerCase().includes(motherSearchQuery.trim().toLowerCase())
                      )
                      .slice(0, 8)
                      .map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="autocomplete-item"
                          onClick={() => {
                            setMemberDraft((current) => current ? { ...current, motherId: String(member.id) } : current);
                            setMotherSearchQuery("");
                          }}
                        >
                          {fullLabel(member, language)}
                          {member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="span-12">
              <div className="muted" style={{ marginBottom: 10, fontWeight: 700 }}>{t(language, "spousesFieldLabel")}</div>
              <div className="member-chip-list" style={{ marginBottom: memberDraft.spouseIds.length ? 10 : 0 }}>
                {memberDraft.spouseIds.map((id) => {
                  const member = state.members.find((candidate) => candidate.id === id);
                  if (!member) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="member-chip active"
                      onClick={() => setMemberDraft((current) => current ? {
                        ...current,
                        spouseIds: current.spouseIds.filter((sid) => sid !== id)
                      } : current)}
                    >
                      {fullLabel(member, language)} x
                    </button>
                  );
                })}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className="field"
                  placeholder={t(language, "searchMembersPlaceholder")}
                  value={spouseSearchQuery}
                  onChange={(e) => setSpouseSearchQuery(e.target.value)}
                />
                {spouseSearchQuery.trim() ? (
                  <div className="autocomplete-list">
                    {state.members
                      .filter((member) =>
                        member.id !== memberDraft.id &&
                        !memberDraft.spouseIds.includes(member.id) &&
                        fullLabel(member, language).toLowerCase().includes(spouseSearchQuery.trim().toLowerCase())
                      )
                      .slice(0, 8)
                      .map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="autocomplete-item"
                          onClick={() => {
                            setMemberDraft((current) => current ? { ...current, spouseIds: [...current.spouseIds, member.id] } : current);
                            setSpouseSearchQuery("");
                          }}
                        >
                          {fullLabel(member, language)}
                          {member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {!canSaveMember ? <p className="hint" style={{ marginTop: 10 }}>{t(language, memberDraft.id ? "nameRequiredHint" : "nameAndFatherRequiredHint")}</p> : null}
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" disabled={!canSaveMember} onClick={saveMember}>{t(language, "saveMemberButton")}</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>{t(language, "cancelButton")}</button>
            {memberDraft.id && isAdmin ? <button className="btn-ghost danger" type="button" onClick={() => { deleteMember(memberDraft.id!); closeEditors(); }}>{t(language, "deleteButton")}</button> : null}
          </div>
        </Modal>
      ) : null}

      {userDraft ? (
        <Modal
          title={userDraft.id ? t(language, "editUserModalTitle") : t(language, "addUserModalTitle")}
          subtitle={t(language, "userModalSubtitle")}
          onClose={closeEditors}
        >
          <div className="form-grid">
            <label className="span-6">
              {t(language, "usernameLabel")}
              <input className="field" value={userDraft.username} onChange={(e) => setUserDraft((current) => current ? { ...current, username: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "nameLabel")}
              <input className="field" value={userDraft.name} onChange={(e) => setUserDraft((current) => current ? { ...current, name: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "emailLabel")}
              <input type="email" className="field" autoComplete="off" value={userDraft.email} onChange={(e) => setUserDraft((current) => current ? { ...current, email: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "roleLabel")}
              <select className="select" value={userDraft.role} onChange={(e) => setUserDraft((current) => current ? { ...current, role: e.target.value as Role } : current)}>
                <option value="editor">{t(language, "editorOption")}</option>
                <option value="admin">{t(language, "adminOption")}</option>
              </select>
            </label>
            <label className="span-12">
              {t(language, userDraft.id ? "userPasswordEditLabel" : "userPasswordLabel")}
              <PasswordField
                value={userDraft.password}
                onChange={(value) => setUserDraft((current) => current ? { ...current, password: value } : current)}
                autoComplete="new-password"
                language={language}
              />
            </label>
            {userError ? <div className="notice danger span-12">{userError}</div> : null}
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" disabled={userBusy} onClick={() => void saveUser()}>{userBusy ? t(language, "savingUser") : t(language, "saveUserButton")}</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>{t(language, "cancelButton")}</button>
            {userDraft.id ? <button className="btn-ghost danger" type="button" disabled={userBusy} onClick={() => { void deleteUser(userDraft.id!); closeEditors(); }}>{t(language, "deleteButton")}</button> : null}
          </div>
        </Modal>
      ) : null}

      {galleryDraft ? (
        <Modal
          title={galleryDraft.id ? t(language, "editGalleryModalTitle") : t(language, "addGalleryModalTitle")}
          subtitle={t(language, "galleryModalSubtitle")}
          onClose={closeEditors}
        >
          <div className="form-grid">
            <label className="span-12">
              {t(language, "photoUrlDataLabel")}
              <input className="field" value={galleryDraft.src} onChange={(e) => setGalleryDraft((current) => current ? { ...current, src: e.target.value } : current)} />
            </label>
            <label className="span-12">
              {t(language, "uploadImageLabel")}
              <input className="field" type="file" accept="image/*" onChange={(e) => handleGalleryFile(e.target.files?.[0])} />
            </label>
            <label className="span-12">
              {t(language, "captionLabel")}
              <input className="field" value={galleryDraft.caption} onChange={(e) => setGalleryDraft((current) => current ? { ...current, caption: e.target.value } : current)} />
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={saveGallery}>{t(language, "savePhotoButton")}</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>{t(language, "cancelButton")}</button>
          </div>
        </Modal>
      ) : null}

      {suggestionDraft ? (
        <Modal title={t(language, "suggestEditModalTitle")} subtitle={t(language, "suggestEditModalSubtitle")} onClose={closeSuggestionEditor}>
          <div className="form-grid">
            <div className="span-12" style={{ position: "relative" }}>
              <div className="muted" style={{ marginBottom: 8, fontWeight: 700 }}>{t(language, "suggestionAboutLabel")}</div>
              <input
                className="field"
                placeholder={t(language, "suggestionAboutPlaceholder")}
                value={suggestionDraft.memberSearch}
                onChange={(e) => setSuggestionDraft((current) => current ? { ...current, memberSearch: e.target.value, memberId: "" } : current)}
              />
              {suggestionDraft.memberSearch.trim() && !suggestionDraft.memberId ? (
                <div className="autocomplete-list">
                  {state.members
                    .filter((member) => fullLabel(member, language).toLowerCase().includes(suggestionDraft.memberSearch.trim().toLowerCase()))
                    .slice(0, 8)
                    .map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="autocomplete-item"
                        onMouseDown={(e) => { e.preventDefault(); setSuggestionDraft((current) => current ? { ...current, memberId: String(member.id), memberSearch: fullLabel(member, language) } : current); }}
                      >
                        {fullLabel(member, language)}
                        {member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
            <label className="span-12">
              <span className="sr-only">{t(language, "suggestionMessageLabel")}</span>
              <textarea
                className="textarea"
                placeholder={t(language, "suggestionMessagePlaceholder")}
                value={suggestionDraft.message}
                onChange={(e) => setSuggestionDraft((current) => current ? { ...current, message: e.target.value } : current)}
              />
            </label>
            <label className="span-12">
              <span className="sr-only">{t(language, "suggestionNameLabel")}</span>
              <input
                className="field"
                placeholder={t(language, "suggestionNamePlaceholder")}
                value={suggestionDraft.submitterName}
                onChange={(e) => setSuggestionDraft((current) => current ? { ...current, submitterName: e.target.value } : current)}
              />
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" disabled={!suggestionDraft.message.trim() || suggestionBusy} onClick={() => void submitSuggestion()}>
              {suggestionBusy ? t(language, "sendingSuggestion") : t(language, "sendSuggestionButton")}
            </button>
            <button className="btn-ghost" type="button" onClick={closeSuggestionEditor}>{t(language, "cancelButton")}</button>
          </div>
        </Modal>
      ) : null}

      {duaDraft ? (
        <Modal title={t(language, "postDuaModalTitle")} subtitle={t(language, "postDuaModalSubtitle")} onClose={closeDuaEditor}>
          <div className="form-grid">
            <label className="span-12">
              <span className="sr-only">{t(language, "duaMessageLabel")}</span>
              <textarea
                className="textarea"
                placeholder={t(language, "duaMessagePlaceholder")}
                value={duaDraft.message}
                onChange={(e) => setDuaDraft((current) => current ? { ...current, message: e.target.value } : current)}
              />
            </label>
            <label className="span-12">
              <span className="sr-only">{t(language, "duaNameLabel")}</span>
              <input
                className="field"
                placeholder={t(language, "duaNamePlaceholder")}
                value={duaDraft.requesterName}
                onChange={(e) => setDuaDraft((current) => current ? { ...current, requesterName: e.target.value } : current)}
              />
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" disabled={!duaDraft.message.trim() || duaBusy} onClick={() => void submitDuaRequest()}>
              {duaBusy ? t(language, "sendingSuggestion") : t(language, "postDuaButton")}
            </button>
            <button className="btn-ghost" type="button" onClick={closeDuaEditor}>{t(language, "cancelButton")}</button>
          </div>
        </Modal>
      ) : null}

      {qrCodeMember ? (
        <Modal title={t(language, "qrCodeModalTitle")} subtitle={displayName(qrCodeMember, language)} onClose={closeQrCode}>
          <div style={{ textAlign: "center" }}>
            {qrCodeDataUrl ? <img src={qrCodeDataUrl} alt={t(language, "qrCodeModalTitle")} style={{ width: 220, height: 220, borderRadius: 12 }} /> : null}
            <p className="hint" style={{ marginTop: 12 }}>{t(language, "qrCodeModalSubtitle")}</p>
            {qrCodeDataUrl ? (
              <a
                className="btn-ghost"
                href={qrCodeDataUrl}
                download={`sajra-${qrCodeMember.uniqueId || qrCodeMember.id}.png`}
                style={{ marginTop: 10, display: "inline-block" }}
              >
                {t(language, "downloadQrButton")}
              </a>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {announcementDraft ? (
        <Modal title={t(language, "postAnnouncementModalTitle")} subtitle={t(language, "postAnnouncementModalSubtitle")} onClose={closeAnnouncementEditor}>
          <div className="form-grid">
            <label className="span-12">
              <span className="sr-only">{t(language, "announcementMessageLabel")}</span>
              <textarea
                className="textarea"
                placeholder={t(language, "announcementMessagePlaceholder")}
                value={announcementDraft.message}
                onChange={(e) => setAnnouncementDraft((current) => current ? { ...current, message: e.target.value } : current)}
              />
            </label>
            <label className="span-6">
              <span className="sr-only">{t(language, "suggestionNameLabel")}</span>
              <input
                className="field"
                placeholder={t(language, "suggestionNamePlaceholder")}
                value={announcementDraft.authorName}
                onChange={(e) => setAnnouncementDraft((current) => current ? { ...current, authorName: e.target.value } : current)}
              />
            </label>
            <label className="span-6">
              <span className="sr-only">{t(language, "announcementExpiryLabel")}</span>
              <input
                className="field"
                type="date"
                aria-label={t(language, "announcementExpiryLabel")}
                value={announcementDraft.expiresAt}
                onChange={(e) => setAnnouncementDraft((current) => current ? { ...current, expiresAt: e.target.value } : current)}
              />
              <small className="muted">{t(language, "announcementExpiryHint")}</small>
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" disabled={!announcementDraft.message.trim() || announcementBusy} onClick={() => void submitAnnouncement()}>
              {announcementBusy ? t(language, "sendingSuggestion") : t(language, "postAnnouncementButton")}
            </button>
            <button className="btn-ghost" type="button" onClick={closeAnnouncementEditor}>{t(language, "cancelButton")}</button>
          </div>
        </Modal>
      ) : null}

      {lightboxImage ? (
        <div className="lightbox-backdrop" onClick={closeLightbox}>
          <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn" aria-label={t(language, "zoomOutLabel")} onClick={zoomOutLightbox}>−</button>
            <button type="button" className="icon-btn" onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}>{Math.round(zoomLevel * 100)}%</button>
            <button type="button" className="icon-btn" aria-label={t(language, "zoomInLabel")} onClick={zoomInLightbox}>+</button>
            <button type="button" className="close-btn" aria-label={t(language, "closeLabel")} onClick={closeLightbox}>x</button>
          </div>
          {state.gallery.length > 1 ? (
            <button type="button" className="lightbox-nav lightbox-nav-prev" aria-label={t(language, "previousLabel")} onClick={(e) => { e.stopPropagation(); goToAdjacentImage(-1); }}>‹</button>
          ) : null}
          <div
            className="lightbox-viewport"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.preventDefault();
              setZoomLevel((z) => Math.min(4, Math.max(0.5, Math.round((z - e.deltaY * 0.001) * 100) / 100)));
            }}
            onTouchStart={handleLightboxTouchStart}
            onTouchMove={handleLightboxTouchMove}
            onTouchEnd={handleLightboxTouchEnd}
          >
            <img
              src={photoSrc(lightboxImage.src)}
              alt={lightboxImage.caption ?? t(language, "galleryImageAlt")}
              style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})` }}
            />
          </div>
          {state.gallery.length > 1 ? (
            <button type="button" className="lightbox-nav lightbox-nav-next" aria-label={t(language, "nextLabel")} onClick={(e) => { e.stopPropagation(); goToAdjacentImage(1); }}>›</button>
          ) : null}
          {lightboxImage.caption ? (
            <div className="lightbox-caption" onClick={(e) => e.stopPropagation()}>{lightboxImage.caption}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
