import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppState, GalleryImage, Gender, Language, Member, Role, Suggestion, User, ViewKey } from "./types";
import {
  buildTree,
  calculateAge,
  createEmptyState,
  displayName,
  exportJson,
  findRelation,
  formatDate,
  getChildren,
  getParents,
  getSpouses,
  importJson,
  isRoot,
  loadState,
  nextId,
  nextUniqueId,
  photoSrc,
  pushActivityLog,
  readFileAsCompressedDataUrl,
  saveState,
  sortMembers,
  treeDepth
} from "./lib";
import type { RelationType } from "./lib";
import {
  getSupabaseSession,
  isSupabaseConfigured,
  loadSupabaseState,
  manageAuthUser,
  onSupabaseAuthChange,
  publishInitialState,
  saveSupabaseState,
  sendPasswordResetEmail,
  signInWithPassword,
  signOutSupabase,
  StaleWriteError,
  updatePassword
} from "./supabase";
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
import type { StringKey } from "./i18n";

const NAV_LABELS: Record<Language, { home: string; tree: string; gallery: string; about: string; guide: string; roots: string }> = {
  en: { home: "Home", tree: "Tree", gallery: "Gallery", about: "About", guide: "Guide", roots: "Founding Branches" },
  ur: { home: "ہوم", tree: "شجرہ", gallery: "گیلری", about: "تعارف", guide: "رہنمائی", roots: "بانی شاخیں" }
};

type RouteState = { page: ViewKey; memberId?: number };

type AdminSection = "overview" | "members" | "users" | "gallery" | "suggestions" | "logs" | "backup" | "security";

// Supabase reports an expired / already-used reset link through the URL hash.
const STARTED_WITH_EXPIRED_LINK = typeof window !== "undefined" && window.location.hash.includes("error_code=otp_expired");

// Guards the visitor-count bump so a single browser tab only counts as one visit per session.
const VISIT_SESSION_KEY = "sajra-visit-counted";

// When this device last downloaded a backup — local only, since "did I back up" is per-device.
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
  professionChoice: string;
  professionOther: string;
  photo: string;
  bio: string;
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
    state.appName !== "Sajra" ||
    state.language !== "en" ||
    state.theme !== "light"
  );
}

function parseRoute(): RouteState {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw || raw === "/") return { page: "home" };
  const [page, id] = raw.split("/").filter(Boolean);
  if (page === "member" && id) return { page: "member", memberId: Number(id) || undefined };
  if (page === "home" || page === "tree" || page === "gallery" || page === "admin" || page === "about" || page === "guide" || page === "roots") {
    return { page };
  }
  return { page: "home" };
}

function routeHash(route: RouteState): string {
  if (route.page === "member" && route.memberId) return `#/member/${route.memberId}`;
  return `#/${route.page}`;
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
        ...professionDraftFields(member.profession),
        photo: member.photo ?? "",
        bio: member.bio ?? "",
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
        professionChoice: "",
        professionOther: "",
        photo: "",
        bio: "",
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
        role: user.role
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
  onClick
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`navlink ${active ? "active" : ""}`} onClick={onClick}>
      {children}
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
  logs: "M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  backup: "M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3",
  security: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5V11Zm7 4v2"
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
      <img className="avatar" src={photoSrc(member.photo)} alt={displayName(member, language)} />
      <div className="member-card-text">
        <div className="tree-name">{displayName(member, language)}</div>
        <div className="tree-sub">
          {member.birthplace || t(language, "noBirthplace")}
          {calculateAge(member.dob, member.dod) !== null ? ` • ${t(language, "ageWord")} ${calculateAge(member.dob, member.dod)}` : ""}
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
          <button type="button" className="close-btn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
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
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(STARTED_WITH_EXPIRED_LINK);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState(() =>
    STARTED_WITH_EXPIRED_LINK ? t(initialStateRef.current?.language ?? "en", "resetLinkExpired") : ""
  );
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
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
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [importError, setImportError] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_BACKUP_KEY);
    } catch {
      return null;
    }
  });
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const hydrationDoneRef = useRef(false);
  const remoteUpdatedAtRef = useRef<string | null>(null);
  // The archive as last confirmed in Supabase; used to skip no-op saves and as the base for merges.
  const syncedRef = useRef<{ json: string; state: AppState } | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const toastTimerRef = useRef<number | undefined>(undefined);
  const [saveToast, setSaveToast] = useState<{ tone: "ok" | "error"; key: StringKey } | null>(null);

  const isLoggedIn = Boolean(supabaseSession);
  const userRole = supabaseSession?.user.app_metadata?.role as Role | undefined;
  // Accounts made with the "editor" or "contributor" role can manage members and the gallery but not
  // users or backups. Accounts without a role (e.g. created by hand in the Supabase dashboard) count as admins.
  const isAdmin = isLoggedIn && userRole !== "editor" && userRole !== "contributor";
  // Contributors (and admins) may edit members that were already added; plain editors may only add new ones.
  const canEditMembers = isAdmin || userRole === "contributor";
  const language = state.language;
  const members = useMemo(() => [...state.members].sort(sortMembers), [state.members]);
  const memberMap = useMemo(() => new Map(state.members.map((member) => [member.id, member])), [state.members]);
  const roots = useMemo(() => state.members.filter(isRoot).sort(sortMembers), [state.members]);
  const selectedMember = route.page === "member" && route.memberId ? memberMap.get(route.memberId) : undefined;

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

        // Best-effort, once per browser session: bump the shared visitor counter through the
        // normal save pipeline, so a concurrent save is merged instead of clobbered or lost.
        if (remote && !sessionStorage.getItem(VISIT_SESSION_KEY)) {
          sessionStorage.setItem(VISIT_SESSION_KEY, "1");
          const bumped = { ...remote.state, visitorCount: (remote.state.visitorCount ?? 0) + 1 };
          setState((current) => ({ ...current, visitorCount: bumped.visitorCount }));
          void persistToSupabase(bumped);
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
    if (route.page === "member" && route.memberId && !memberMap.has(route.memberId)) {
      window.location.hash = "#/home";
    }
  }, [memberMap, route]);

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
      navigate({ page: "admin" });
      setLoginEmail("");
      setLoginPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : t(language, "invalidLogin"));
    } finally {
      setLoginBusy(false);
    }
  }

  function logout() {
    void signOutSupabase();
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
      if (recoveryMode) setAdminSection("security");
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

  // Editors may only add new members; contributors and admins may also edit existing ones.
  function openMemberEditor(member?: Member) {
    if (!isLoggedIn || (member && !canEditMembers)) return;
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
    if (!isLoggedIn || (image && !isAdmin)) return;
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

  // Open to anyone, logged in or not — that's the point of a suggestion box.
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
    const member = memberId ? state.members.find((candidate) => candidate.id === memberId) : undefined;

    setSuggestionBusy(true);
    try {
      let publishedState: AppState | null = null;
      updateState((current) => {
        const suggestion: Suggestion = {
          id: nextId(current.suggestions),
          memberId,
          memberName: member ? member.name : null,
          message: suggestionDraft.message.trim(),
          submitterName: suggestionDraft.submitterName.trim() || null,
          status: "pending",
          createdAt: new Date().toISOString()
        };
        const next = { ...current, suggestions: [suggestion, ...current.suggestions].slice(0, 200) };
        publishedState = next;
        return next;
      });
      // Anonymous visitors never trigger the normal (isLoggedIn-only) autosave, so this one write
      // is pushed straight to Supabase — the whole point of a suggestion box is that it reaches the admin.
      if (supabaseConfigured && publishedState) await persistToSupabase(publishedState);
      setSuggestionSent(true);
      setSuggestionDraft(null);
    } finally {
      setSuggestionBusy(false);
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

  function openLightbox(image: GalleryImage) {
    setLightboxImage(image);
    setZoomLevel(1);
  }

  function closeLightbox() {
    setLightboxImage(null);
    setZoomLevel(1);
  }

  function zoomInLightbox() {
    setZoomLevel((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100));
  }

  function zoomOutLightbox() {
    setZoomLevel((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
  }

  async function saveMember() {
    if (!memberDraft || !canSaveMember) return;
    const id = memberDraft.id ?? nextId(state.members);
    const existingMember = state.members.find((member) => member.id === id);

    // Same names recur a lot in this family (see the unique-id feature), so this only warns
    // instead of blocking — but a genuine duplicate entry is a mistake worth catching early.
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

    const updated: Member = {
      id,
      uniqueId: existingMember?.uniqueId || nextUniqueId(state.members),
      name: memberDraft.name.trim(),
      nameUr: memberDraft.nameUr.trim() || null,
      gender: memberDraft.gender,
      dob,
      dod: memberDraft.dod || null,
      birthplace: memberDraft.birthplace.trim() || null,
      profession: normalizeProfession(memberDraft.professionChoice === PROFESSION_OTHER ? memberDraft.professionOther : memberDraft.professionChoice),
      photo: memberDraft.photo.trim() || null,
      bio: memberDraft.bio.trim() || null,
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
        { type: "member", action: exists ? "updated" : "added", label: `${updated.name} (${updated.uniqueId})`, actorEmail }
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
        actorEmail
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

  function resetToEmpty() {
    if (!window.confirm(t(language, "confirmResetArchive"))) return;
    const defaults = createEmptyState();
    setState(defaults);
    saveState(defaults);
  }

  const memberSearchResults = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 12);
    return members.filter((member) =>
      [member.name, member.nameUr, member.birthplace].some((value) => value?.toLowerCase().includes(q))
    ).slice(0, 24);
  }, [memberQuery, members]);

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
              <h2 className="section-title" style={{ marginTop: 12 }}>{forgotPasswordOpen ? t(language, "forgotPasswordTitle") : t(language, "signInTitle")}</h2>
              <p className="section-subtitle">{forgotPasswordOpen ? t(language, "forgotPasswordSubtitle") : t(language, "signInSubtitle")}</p>
            </div>
          </div>
          <div className="login-panel-single">
            {forgotPasswordOpen ? (
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
                </form>
              </Card>
            )}
          </div>
        </section>
      );
    }

    if (route.page === "member") {
      const member = selectedMember;
      return (
        <section className="section member-profile-section">
          {member ? (
            <>
              <div className="profile-layout member-profile-layout">
                <img className="member-photo hero-photo member-profile-photo" src={photoSrc(member.photo)} alt={displayName(member, language)} />
                <div>
                  <span className="eyebrow">{tGender(language, member.gender)}</span>
                  <h1 className="section-title" style={{ marginTop: 12 }}>
                    {member.profession?.trim() ? `${professionShortLabel(language, member.profession.trim())} ` : ""}
                    {displayName(member, language)}
                  </h1>
                  <p className="section-subtitle" style={{ marginTop: 12 }}>
                    {member.birthplace || t(language, "noBirthplace")}
                    {member.dod ? ` • ${t(language, "diedWord")} ${formatDate(member.dod, language)}` : ""}
                    {calculateAge(member.dob, member.dod) !== null ? ` • ${t(language, "ageWord")} ${calculateAge(member.dob, member.dod)}` : ""}
                  </p>
                  <div className="profile-meta no-print">
                    <button className="btn" type="button" onClick={() => navigate({ page: "tree" })}>{t(language, "openTreeButton")}</button>
                    {canEditMembers ? <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>{t(language, "editMemberButton")}</button> : null}
                    <button className="btn-ghost" type="button" onClick={() => window.print()}>{t(language, "printProfileButton")}</button>
                    <button className="btn-ghost" type="button" onClick={() => openSuggestionEditor(member)}>{t(language, "suggestCorrectionButton")}</button>
                  </div>
                  {suggestionSent ? <p className="hint no-print">{t(language, "suggestionSentMessage")}</p> : null}
                  {member.bio ? <p style={{ marginTop: 16, lineHeight: 1.8 }}>{member.bio}</p> : null}
                </div>
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
            {isLoggedIn ? <button className="btn" type="button" onClick={() => openGalleryEditor()}>{t(language, "addPhotoButton")}</button> : null}
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

    if (route.page === "admin") {
      const sortedUsers = [...state.users].sort((a, b) => a.username.localeCompare(b.username));
      const sections: { key: AdminSection; label: string; subtitle: string }[] = [
        { key: "overview", label: t(language, "adminNavOverview"), subtitle: t(language, "adminOverviewSubtitle") },
        { key: "members", label: t(language, "membersLabel"), subtitle: t(language, "membersCardSubtitle") },
        ...(isAdmin ? [{ key: "users" as const, label: t(language, "usersLabel"), subtitle: t(language, "usersCardSubtitle") }] : []),
        { key: "gallery", label: t(language, "adminNavGallery"), subtitle: t(language, "galleryAdminSubtitle") },
        ...(isAdmin ? [{ key: "suggestions" as const, label: t(language, "adminNavSuggestions"), subtitle: t(language, "suggestionsSubtitle") }] : []),
        ...(isAdmin ? [{ key: "logs" as const, label: t(language, "adminNavLogs"), subtitle: t(language, "logHistorySubtitle") }] : []),
        ...(isAdmin ? [{ key: "backup" as const, label: t(language, "backupCardTitle"), subtitle: t(language, "backupCardSubtitle") }] : []),
        { key: "security", label: t(language, "adminNavSecurity"), subtitle: t(language, "changePasswordSubtitle") }
      ];
      const activeSection = sections.find((section) => section.key === adminSection) ?? sections[0];

      let sectionActions: ReactNode = null;
      if (activeSection.key === "members") {
        sectionActions = <button className="btn" type="button" onClick={() => openMemberEditor()}>{t(language, "addMemberButton")}</button>;
      } else if (activeSection.key === "users") {
        sectionActions = <button className="btn" type="button" onClick={() => openUserEditor()}>{t(language, "addUserButton")}</button>;
      } else if (activeSection.key === "gallery") {
        sectionActions = <button className="btn" type="button" onClick={() => openGalleryEditor()}>{t(language, "addGalleryPhotoButton")}</button>;
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
              <Card title={t(language, "quickActionsTitle")} subtitle={t(language, "quickActionsSubtitle")}>
                <div className="actions-row">
                  <button className="btn" type="button" onClick={() => openMemberEditor()}>{t(language, "addMemberButton")}</button>
                  {isAdmin ? <button className="btn-ghost" type="button" onClick={() => openUserEditor()}>{t(language, "addUserButton")}</button> : null}
                  <button className="btn-ghost" type="button" onClick={() => openGalleryEditor()}>{t(language, "addGalleryPhotoButton")}</button>
                  {isAdmin ? <button className="btn-ghost" type="button" onClick={exportState}>{t(language, "downloadBackupButton")}</button> : null}
                </div>
              </Card>
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
      } else if (activeSection.key === "members") {
        sectionBody = (
          <>
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
                        {member.profession?.trim() ? ` • ${professionLabel(language, member.profession.trim())}` : ""}
                      </div>
                    </div>
                    <div className="actions-row">
                      <button className="btn-ghost" type="button" onClick={() => navigate({ page: "member", memberId: member.id })}>{t(language, "openButton")}</button>
                      {canEditMembers ? <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>{t(language, "editButton")}</button> : null}
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
                      {t(language, "userIdPrefix")}: {user.id} • {user.name || t(language, "noName")} • {t(language, user.role === "admin" ? "adminOption" : user.role === "contributor" ? "contributorOption" : "editorOption")}
                    </div>
                  </div>
                  <div className="actions-row">
                    <button className="btn-ghost" type="button" onClick={() => openUserEditor(user)}>{t(language, "editButton")}</button>
                    <button className="btn-ghost danger" type="button" onClick={() => deleteUser(user.id)}>{t(language, "deleteButton")}</button>
                  </div>
                </div>
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
              <div key={suggestion.id} className="card" style={{ padding: 14, opacity: suggestion.status === "resolved" ? 0.6 : 1 }}>
                <div className="tree-head">
                  <div>
                    <div className="tree-name">
                      {suggestion.memberName ? `${t(language, "aboutPrefix")} ${suggestion.memberName}` : t(language, "generalSuggestionLabel")}
                    </div>
                    <p style={{ marginTop: 6, lineHeight: 1.6 }}>{suggestion.message}</p>
                    <div className="tree-sub" style={{ marginTop: 6 }}>
                      {formatDate(suggestion.createdAt, language)} • {suggestion.submitterName || t(language, "anonymousSubmitter")}
                      {suggestion.status === "resolved" ? ` • ${t(language, "suggestionResolvedLabel")}` : ""}
                    </div>
                  </div>
                  <div className="actions-row">
                    {suggestion.status === "pending" ? (
                      <button className="btn-ghost" type="button" onClick={() => resolveSuggestion(suggestion.id)}>{t(language, "markResolvedButton")}</button>
                    ) : null}
                    <button className="btn-ghost danger" type="button" onClick={() => deleteSuggestion(suggestion.id)}>{t(language, "deleteButton")}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{t(language, "noSuggestionsYet")}</div>
        );
      } else if (activeSection.key === "logs") {
        const typeLabelKeys = { member: "logTypeMember", user: "logTypeUser", gallery: "logTypeGallery" } as const;
        const actionLabelKeys = { added: "logActionAdded", updated: "logActionUpdated", deleted: "logActionDeleted" } as const;
        sectionBody = state.activityLog.length ? (
          <div className="list">
            {state.activityLog.map((entry) => (
              <div key={entry.id} className="card" style={{ padding: 14 }}>
                <div className="tree-head">
                  <div>
                    <div className="tree-name">
                      {t(language, actionLabelKeys[entry.action])} {t(language, typeLabelKeys[entry.type])}: {entry.label}
                    </div>
                    <div className="tree-sub">
                      {formatDate(entry.createdAt, language)} • {entry.actorEmail || t(language, "systemActor")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            <button className="btn-ghost danger" type="button" onClick={resetToEmpty}>{t(language, "resetArchiveButton")}</button>
            {importError ? <div className="notice danger">{importError}</div> : null}
            <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(e) => handleImportFile(e.target.files?.[0])} />
          </div>
        );
      } else {
        sectionBody = (
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
          </div>
        );
      }

      return (
        <div className="admin-layout">
          <aside className="admin-sidebar" aria-label={t(language, "adminSidebarAria")}>
            <div className="admin-sidebar-title">{t(language, "adminPanelTitle")}</div>
            <nav className="admin-sidebar-nav">
              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className={`admin-nav-item${section.key === activeSection.key ? " active" : ""}`}
                  aria-current={section.key === activeSection.key ? "page" : undefined}
                  onClick={() => { setAdminSection(section.key); setPasswordChangeError(""); setPasswordChangeSuccess(false); }}
                >
                  <AdminIcon section={section.key} />
                  <span>{section.label}</span>
                </button>
              ))}
            </nav>
            <div className="admin-sidebar-group">
              <div className="admin-sidebar-label">{t(language, "adminNavWebsite")}</div>
              <button type="button" className="admin-nav-item" onClick={() => navigate({ page: "home" })}><span>{NAV_LABELS[language].home}</span></button>
              <button type="button" className="admin-nav-item" onClick={() => navigate({ page: "tree" })}><span>{NAV_LABELS[language].tree}</span></button>
              <button type="button" className="admin-nav-item" onClick={() => navigate({ page: "gallery" })}><span>{NAV_LABELS[language].gallery}</span></button>
              <button type="button" className="admin-nav-item" onClick={() => navigate({ page: "about" })}><span>{NAV_LABELS[language].about}</span></button>
              <button type="button" className="admin-nav-item danger" onClick={logout}><span>{t(language, "logoutButton")}</span></button>
            </div>
          </aside>

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

    return (
      <>
        <section className="hero">
          <span className="eyebrow">{t(language, "eyebrowHero")}</span>
          <h1>{t(language, "heroTitle")}</h1>
          <p>
            {t(language, "heroParagraph")}
          </p>
          <div className="hero-actions">
            <button className="btn" type="button" onClick={() => navigate({ page: "tree" })}>{t(language, "openFamilyTreeButton")}</button>
            <button className="btn-ghost" type="button" onClick={() => openSuggestionEditor()}>{t(language, "suggestEditButton")}</button>
          </div>
          {suggestionSent ? <p className="hint">{t(language, "suggestionSentMessage")}</p> : null}
          <div className="hero-search" style={{ position: "relative" }}>
            <input
              className="field"
              placeholder={t(language, "searchMembersPlaceholder")}
              value={homeSearchQuery}
              onChange={(e) => setHomeSearchQuery(e.target.value)}
              onFocus={() => setHomeSearchOpen(true)}
              onBlur={() => setHomeSearchOpen(false)}
            />
            {homeSearchOpen && homeSearchQuery.trim() ? (
              <div className="autocomplete-list">
                {state.members
                  .filter((member) => fullLabel(member, language).toLowerCase().includes(homeSearchQuery.trim().toLowerCase()))
                  .slice(0, 8)
                  .map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="autocomplete-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setHomeSearchQuery("");
                        navigate({ page: "member", memberId: member.id });
                      }}
                    >
                      {fullLabel(member, language)}
                      {member.uniqueId ? <span className="autocomplete-id">{member.uniqueId}</span> : null}
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
              <StatCard value={familyInsights.female} label={t(language, "genderFemale")} />
              {familyInsights.oldestLiving ? (
                <StatCard
                  value={calculateAge(familyInsights.oldestLiving.dob, familyInsights.oldestLiving.dod) ?? "—"}
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/home">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2v20M12 6c-3 0-5 2-5 4.5S9 14 12 14s5-1.5 5-3.5S15 6 12 6ZM12 14c-3.5 0-6 2-6 4.5V20h12v-1.5c0-2.5-2.5-4.5-6-4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="brand-title">
            <strong>{state.appName}</strong>
            <span>{t(language, "brandSubtitle")}</span>
          </div>
        </a>
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
        <nav className={`topnav${mobileNavOpen ? " open" : ""}`}>
          {isLoggedIn ? <NavLink active={route.page === "admin"} onClick={() => navigate({ page: "admin" })}>{t(language, "navDashboardLabel")}</NavLink> : null}
          <NavLink active={route.page === "home"} onClick={() => navigate({ page: "home" })}>{NAV_LABELS[language].home}</NavLink>
          <NavLink active={route.page === "tree"} onClick={() => navigate({ page: "tree" })}>{NAV_LABELS[language].tree}</NavLink>
          <NavLink active={route.page === "roots"} onClick={() => navigate({ page: "roots" })}>{NAV_LABELS[language].roots}</NavLink>
          <NavLink active={route.page === "gallery"} onClick={() => navigate({ page: "gallery" })}>{NAV_LABELS[language].gallery}</NavLink>
          <NavLink active={route.page === "guide"} onClick={() => navigate({ page: "guide" })}>{NAV_LABELS[language].guide}</NavLink>
          <NavLink active={route.page === "about"} onClick={() => navigate({ page: "about" })}>{NAV_LABELS[language].about}</NavLink>
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

      <p className="footer-note">
        {supabaseConfigured
          ? syncStatus === "error"
            ? `${t(language, "syncIssuePrefix")} ${t(language, syncMessageKey)} ${t(language, "syncIssueSuffix")}`
            : syncStatus === "conflict"
              ? t(language, syncMessageKey)
              : `${t(language, "syncOnPrefix")} ${t(language, syncMessageKey)}`
          : t(language, "localOnlyFooter")}
      </p>

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
              <span className="sr-only">{t(language, "professionLabel")}</span>
              <select className="select" aria-label={t(language, "professionLabel")} value={memberDraft.professionChoice} onChange={(e) => setMemberDraft((current) => current ? { ...current, professionChoice: e.target.value } : current)}>
                <option value="">{t(language, "professionLabel")} — {t(language, "professionNone")}</option>
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
            <label className="span-12">
              <span className="sr-only">{t(language, "bioLabel")}</span>
              <textarea className="textarea" placeholder={t(language, "bioLabel")} value={memberDraft.bio} onChange={(e) => setMemberDraft((current) => current ? { ...current, bio: e.target.value } : current)} />
            </label>
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
                        {fullLabel(father, language)} {father.uniqueId ? `(${father.uniqueId})` : ""} ✕
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
                        {fullLabel(mother, language)} {mother.uniqueId ? `(${mother.uniqueId})` : ""} ✕
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
                      {fullLabel(member, language)} ✕
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
                <option value="contributor">{t(language, "contributorOption")}</option>
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

      {lightboxImage ? (
        <div className="lightbox-backdrop" onClick={closeLightbox}>
          <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn" aria-label={t(language, "zoomOutLabel")} onClick={zoomOutLightbox}>−</button>
            <button type="button" className="icon-btn" onClick={() => setZoomLevel(1)}>{Math.round(zoomLevel * 100)}%</button>
            <button type="button" className="icon-btn" aria-label={t(language, "zoomInLabel")} onClick={zoomInLightbox}>+</button>
            <button type="button" className="close-btn" aria-label={t(language, "closeLabel")} onClick={closeLightbox}>✕</button>
          </div>
          <div
            className="lightbox-viewport"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.preventDefault();
              setZoomLevel((z) => Math.min(4, Math.max(0.5, Math.round((z - e.deltaY * 0.001) * 100) / 100)));
            }}
          >
            <img
              src={photoSrc(lightboxImage.src)}
              alt={lightboxImage.caption ?? t(language, "galleryImageAlt")}
              style={{ transform: `scale(${zoomLevel})` }}
            />
          </div>
          {lightboxImage.caption ? (
            <div className="lightbox-caption" onClick={(e) => e.stopPropagation()}>{lightboxImage.caption}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
