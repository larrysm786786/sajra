import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppState, GalleryImage, Gender, Language, Member, Role, User, ViewKey } from "./types";
import {
  assignUniqueName,
  calculateAge,
  createEmptyState,
  displayName,
  exportJson,
  formatDate,
  getChildren,
  getParents,
  getSpouses,
  importJson,
  isRoot,
  loadState,
  nextId,
  photoSrc,
  readFileAsCompressedDataUrl,
  saveState,
  sortMembers
} from "./lib";
import {
  getSupabaseSession,
  isSupabaseConfigured,
  loadSupabaseState,
  onSupabaseAuthChange,
  publishInitialState,
  saveSupabaseState,
  signInWithPassword,
  signOutSupabase,
  StaleWriteError
} from "./supabase";
import FamilyTreeD3 from "./FamilyTreeD3";
import { t, tGender } from "./i18n";
import type { StringKey } from "./i18n";

const NAV_LABELS: Record<Language, { home: string; tree: string; gallery: string; admin: string; about: string }> = {
  en: { home: "Home", tree: "Tree", gallery: "Gallery", admin: "Admin", about: "About" },
  ur: { home: "ہوم", tree: "شجرہ", gallery: "گیلری", admin: "ایڈمن", about: "تعارف" }
};

type RouteState = { page: ViewKey; memberId?: number };

type MemberDraft = {
  id?: number;
  name: string;
  nameUr: string;
  gender: Gender;
  dob: string;
  dod: string;
  birthplace: string;
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
  role: Role;
};

type GalleryDraft = {
  id?: number;
  src: string;
  caption: string;
};

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
  if (page === "home" || page === "tree" || page === "gallery" || page === "admin" || page === "about") {
    return { page };
  }
  return { page: "home" };
}

function routeHash(route: RouteState): string {
  if (route.page === "member" && route.memberId) return `#/member/${route.memberId}`;
  return `#/${route.page}`;
}

function emptyMemberDraft(member?: Member): MemberDraft {
  return member
    ? {
        id: member.id,
        name: member.name,
        nameUr: member.nameUr ?? "",
        gender: member.gender,
        dob: member.dob ?? "",
        dod: member.dod ?? "",
        birthplace: member.birthplace ?? "",
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
        dob: "",
        dod: "",
        birthplace: "",
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
        role: user.role
      }
    : {
        username: "",
        name: "",
        email: "",
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

function StatCard({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <div className="muted" style={{ fontWeight: 700 }}>{label}</div>
      {hint ? <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
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
    <button type="button" className="member-card" onClick={() => onOpen(member.id)} style={{ textAlign: "left" }}>
      <img className="avatar" src={photoSrc(member.photo)} alt={displayName(member, language)} />
      <div style={{ marginTop: 12 }}>
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
  const [spouseSearchQuery, setSpouseSearchQuery] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "ready" | "error" | "conflict">("loading");
  const [syncMessageKey, setSyncMessageKey] = useState<StringKey>("checkingLocalData");
  const [memberDraft, setMemberDraft] = useState<MemberDraft | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null);
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraft | null>(null);
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const hydrationDoneRef = useRef(false);
  const remoteUpdatedAtRef = useRef<string | null>(null);

  const isLoggedIn = Boolean(supabaseSession);
  const isAdmin = isLoggedIn;
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
    return onSupabaseAuthChange(setSupabaseSession);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSupabase() {
      if (!supabaseConfigured) {
        setSyncStatus("ready");
        setSyncMessageKey("localOnlyMode");
        hydrationDoneRef.current = true;
        return;
      }

      const localSnapshot = initialStateRef.current ?? loadState();
      const localHasData = hasMeaningfulData(localSnapshot);

      try {
        const remote = await loadSupabaseState();
        if (cancelled) return;

        const remoteHasData = remote ? hasMeaningfulData(remote.state) : false;

        if (remote && remoteHasData) {
          setState(remote.state);
          saveState(remote.state);
          remoteUpdatedAtRef.current = remote.updatedAt;
          setSyncMessageKey("loadedShared");
        } else if (localHasData) {
          setSyncMessageKey("sharedEmpty");
        } else {
          setSyncMessageKey("connectedWaiting");
        }

        setSyncStatus("ready");
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

  useEffect(() => {
    if (!hydrationDoneRef.current || !supabaseConfigured || !isLoggedIn) return;

    const handle = window.setTimeout(() => {
      const save =
        remoteUpdatedAtRef.current === null
          ? publishInitialState(state)
          : saveSupabaseState(state, remoteUpdatedAtRef.current);

      void save
        .then((nextUpdatedAt) => {
          remoteUpdatedAtRef.current = nextUpdatedAt;
          setSyncStatus("ready");
          setSyncMessageKey("changesSaved");
        })
        .catch(async (error) => {
          if (error instanceof StaleWriteError) {
            setSyncStatus("conflict");
            setSyncMessageKey("conflictReloading");
            const remote = await loadSupabaseState();
            if (remote) {
              setState(remote.state);
              saveState(remote.state);
              remoteUpdatedAtRef.current = remote.updatedAt;
              setSyncMessageKey("conflictReloaded");
            }
            return;
          }
          setSyncStatus("error");
          setSyncMessageKey("saveFailed");
        });
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

  function updateState(next: (current: AppState) => AppState) {
    setState((current) => next(current));
  }

  function openMemberEditor(member?: Member) {
    if (!isLoggedIn) return;
    setMemberDraft(emptyMemberDraft(member));
    setSpouseSearchQuery("");
  }

  function openUserEditor(user?: User) {
    if (!isAdmin) return;
    setUserDraft(user ? emptyUserDraft(user) : emptyUserDraft());
  }

  function openGalleryEditor(image?: GalleryImage) {
    if (!isLoggedIn) return;
    setGalleryDraft(emptyGalleryDraft(image));
  }

  function closeEditors() {
    setMemberDraft(null);
    setUserDraft(null);
    setGalleryDraft(null);
    setSpouseSearchQuery("");
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
    if (!memberDraft || !memberDraft.name.trim()) return;
    const normalizedName = assignUniqueName(state.members, memberDraft.name.trim(), memberDraft.id);
    const id = memberDraft.id ?? nextId(state.members);
    const spouseIds = [...new Set(memberDraft.spouseIds.filter((value) => value !== id))];
    const updated: Member = {
      id,
      name: normalizedName,
      nameUr: memberDraft.nameUr.trim() || null,
      gender: memberDraft.gender,
      dob: memberDraft.dob || null,
      dod: memberDraft.dod || null,
      birthplace: memberDraft.birthplace.trim() || null,
      photo: memberDraft.photo.trim() || null,
      bio: memberDraft.bio.trim() || null,
      fatherId: memberDraft.fatherId ? Number(memberDraft.fatherId) : null,
      motherId: memberDraft.motherId ? Number(memberDraft.motherId) : null,
      spouseIds,
      createdAt: state.members.find((member) => member.id === id)?.createdAt || new Date().toISOString()
    };

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

      return { ...current, members: membersNext };
    });

    closeEditors();
  }

  function deleteMember(id: number) {
    if (!window.confirm(t(language, "confirmDeleteMember"))) return;
    updateState((current) => ({
      ...current,
      members: current.members
        .filter((member) => member.id !== id)
        .map((member) => ({
          ...member,
          fatherId: member.fatherId === id ? null : member.fatherId,
          motherId: member.motherId === id ? null : member.motherId,
          spouseIds: member.spouseIds.filter((sid) => sid !== id)
        }))
    }));
  }

  function saveUser() {
    if (!userDraft || !userDraft.username.trim()) return;
    if (!isAdmin) return;
    const id = userDraft.id ?? nextId(state.users);
    const existing = state.users.find((user) => user.id === id);

    const updated: User = {
      id,
      username: userDraft.username.trim(),
      name: userDraft.name.trim() || null,
      email: userDraft.email.trim() || null,
      role: userDraft.role,
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    updateState((current) => ({
      ...current,
      users: current.users.some((user) => user.id === id)
        ? current.users.map((user) => (user.id === id ? updated : user))
        : [...current.users, updated]
    }));
    closeEditors();
  }

  function deleteUser(id: number) {
    if (!isAdmin) return;
    if (!window.confirm(t(language, "confirmDeleteUser"))) return;
    updateState((current) => ({ ...current, users: current.users.filter((user) => user.id !== id) }));
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
    updateState((current) => ({
      ...current,
      gallery: current.gallery.some((image) => image.id === id)
        ? current.gallery.map((image) => (image.id === id ? item : image))
        : [item, ...current.gallery]
    }));
    closeEditors();
  }

  function deleteGalleryItem(id: number) {
    if (!window.confirm(t(language, "confirmDeleteGallery"))) return;
    updateState((current) => ({ ...current, gallery: current.gallery.filter((item) => item.id !== id) }));
  }

  function exportState() {
    const blob = new Blob([exportJson(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sajra-backup.json";
    a.click();
    URL.revokeObjectURL(url);
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

  const stats = useMemo(() => ({
    members: state.members.length,
    roots: roots.length,
    male: state.members.filter((member) => member.gender === "male").length,
    female: state.members.filter((member) => member.gender === "female").length,
    gallery: state.gallery.length,
    users: state.users.length
  }), [roots.length, state.gallery.length, state.members, state.users.length]);

  const content = (() => {
    if (!isLoggedIn && route.page === "admin") {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "signInEyebrow")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "signInTitle")}</h2>
              <p className="section-subtitle">{t(language, "signInSubtitle")}</p>
            </div>
          </div>
          <div className="profile-layout login-panels">
            <Card title={t(language, "loginCardTitle")} subtitle={t(language, "loginCardSubtitle")}>
              <form className="form-stack" onSubmit={handleLoginSubmit}>
                <label>
                  {t(language, "emailLabel")}
                  <input type="email" className="field" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoComplete="username" />
                </label>
                <label>
                  {t(language, "passwordLabel")}
                  <input type="password" className="field" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="current-password" />
                </label>
                {loginError ? <div className="notice danger">{loginError}</div> : null}
                <button className="btn" type="submit" disabled={loginBusy}>{loginBusy ? t(language, "signingIn") : t(language, "loginButton")}</button>
              </form>
            </Card>
            <Card title={t(language, "unlocksTitle")} subtitle={t(language, "unlocksSubtitle")}>
              <div className="list">
                <div className="notice">{t(language, "unlock1")}</div>
                <div className="notice">{t(language, "unlock2")}</div>
                <div className="notice">{t(language, "unlock3")}</div>
                <div className="notice">{t(language, "unlock4")}</div>
              </div>
            </Card>
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
                  <h1 className="section-title" style={{ marginTop: 12 }}>{displayName(member, language)}</h1>
                  <p className="section-subtitle" style={{ marginTop: 12 }}>
                    {member.birthplace || t(language, "noBirthplace")}
                    {member.dob ? ` • ${t(language, "bornWord")} ${formatDate(member.dob, language)}` : ""}
                    {member.dod ? ` • ${t(language, "diedWord")} ${formatDate(member.dod, language)}` : ""}
                    {calculateAge(member.dob, member.dod) !== null ? ` • ${t(language, "ageWord")} ${calculateAge(member.dob, member.dod)}` : ""}
                  </p>
                  <div className="profile-meta">
                    <button className="btn" type="button" onClick={() => navigate({ page: "tree" })}>{t(language, "openTreeButton")}</button>
                    {isLoggedIn ? <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>{t(language, "editMemberButton")}</button> : null}
                  </div>
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
                  <div style={{ marginTop: 12 }}>
                    <div className="tree-name">{image.caption || t(language, "untitledPhoto")}</div>
                    <div className="tree-sub">{formatDate(image.uploadedAt, language)}</div>
                  </div>
                  {isLoggedIn ? (
                    <div className="actions-row" style={{ marginTop: 12 }}>
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
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowAdminConsole")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "manageArchiveTitle")}</h2>
              <p className="section-subtitle">{t(language, "manageArchiveSubtitle")}</p>
            </div>
            <div className="actions-row">
              <button className="btn" type="button" onClick={() => openMemberEditor()}>{t(language, "addMemberButton")}</button>
              {isAdmin ? <button className="btn-ghost" type="button" onClick={() => openUserEditor()}>{t(language, "addUserButton")}</button> : null}
              <button className="btn-ghost" type="button" onClick={() => openGalleryEditor()}>{t(language, "addGalleryPhotoButton")}</button>
            </div>
          </div>

          <div className="stat-grid">
            <StatCard value={stats.members} label={t(language, "membersLabel")} />
            <StatCard value={stats.roots} label={t(language, "rootsLabel")} />
            <StatCard value={stats.gallery} label={t(language, "galleryItemsLabel")} />
            <StatCard value={stats.users} label={t(language, "usersLabel")} />
          </div>

          <div className="card-grid" style={{ marginTop: 18 }}>
            <Card
              title={t(language, "membersLabel")}
              subtitle={t(language, "membersCardSubtitle")}
              actions={<input className="field" style={{ maxWidth: 280 }} placeholder={t(language, "searchMembersPlaceholder")} value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />}
            >
              <div className="list">
                {memberSearchResults.map((member) => (
                  <div key={member.id} className="card" style={{ padding: 14 }}>
                    <div className="tree-head">
                      <div>
                        <div className="tree-name">{displayName(member, language)}</div>
                        <div className="tree-sub">{member.birthplace || t(language, "noBirthplace")}</div>
                      </div>
                      <div className="actions-row">
                        <button className="btn-ghost" type="button" onClick={() => navigate({ page: "member", memberId: member.id })}>{t(language, "openButton")}</button>
                        <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>{t(language, "editButton")}</button>
                        <button className="btn-ghost danger" type="button" onClick={() => deleteMember(member.id)}>{t(language, "deleteButton")}</button>
                      </div>
                    </div>
                  </div>
                ))}
                {!memberSearchResults.length ? <div className="empty">{t(language, "noMemberMatches")}</div> : null}
              </div>
            </Card>

            {isAdmin ? (
              <Card
                title={t(language, "usersLabel")}
                subtitle={t(language, "usersCardSubtitle")}
                actions={<button className="btn-ghost" type="button" onClick={() => openUserEditor()}>{t(language, "addUserButton")}</button>}
              >
                <div className="list">
                  {sortedUsers.map((user) => (
                    <div key={user.id} className="card" style={{ padding: 14 }}>
                      <div className="tree-head">
                        <div>
                          <div className="tree-name">{user.username}</div>
                          <div className="tree-sub">{user.name || t(language, "noName")} • {user.role}</div>
                        </div>
                        <div className="actions-row">
                          <button className="btn-ghost" type="button" onClick={() => openUserEditor(user)}>{t(language, "editButton")}</button>
                          <button className="btn-ghost danger" type="button" onClick={() => deleteUser(user.id)}>{t(language, "deleteButton")}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card title={t(language, "backupCardTitle")} subtitle={t(language, "backupCardSubtitle")}>
              <div className="list backup-actions">
                <button className="btn" type="button" onClick={exportState}>{t(language, "downloadBackupButton")}</button>
                <button className="btn-ghost" type="button" onClick={triggerImport}>{t(language, "importBackupButton")}</button>
                <button className="btn-ghost danger" type="button" onClick={resetToEmpty}>{t(language, "resetArchiveButton")}</button>
                {importError ? <div className="notice danger">{importError}</div> : null}
                <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(e) => handleImportFile(e.target.files?.[0])} />
              </div>
            </Card>
          </div>
        </section>
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
            <button className="btn-ghost" type="button" onClick={() => navigate({ page: "gallery" })}>{t(language, "viewGalleryButton")}</button>
            <button className="btn-ghost" type="button" onClick={() => navigate({ page: "about" })}>{t(language, "aboutSajraButton")}</button>
          </div>
          <div className="hero-kpis">
            <span className="kpi">{stats.members} {t(language, "kpiMembersSuffix")}</span>
            <span className="kpi">{stats.roots} {t(language, "kpiRootsSuffix")}</span>
            <span className="kpi">{stats.gallery} {t(language, "kpiPhotosSuffix")}</span>
            <span className="kpi">{stats.users} {t(language, "kpiAccountsSuffix")}</span>
          </div>
        </section>

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

        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t(language, "eyebrowSnapshot")}</span>
              <h2 className="section-title" style={{ marginTop: 12 }}>{t(language, "quickStatsTitle")}</h2>
            </div>
          </div>
          <div className="stat-grid">
            <StatCard value={stats.members} label={t(language, "membersLabel")} hint={t(language, "hintMembers")} />
            <StatCard value={stats.roots} label={t(language, "rootBranchesLabel")} hint={t(language, "hintRoots")} />
            <StatCard value={stats.male} label={t(language, "maleMembersLabel")} hint={t(language, "hintGender")} />
            <StatCard value={stats.female} label={t(language, "femaleMembersLabel")} hint={t(language, "hintGender")} />
          </div>
        </section>

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
              {roots.slice(0, 4).map((member) => (
                <MemberCard key={member.id} member={member} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
              ))}
            </div>
          ) : (
            <div className="empty">
              {t(language, "noRootsYet")}
            </div>
          )}
        </section>
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
          <NavLink active={route.page === "home"} onClick={() => navigate({ page: "home" })}>{NAV_LABELS[language].home}</NavLink>
          <NavLink active={route.page === "tree"} onClick={() => navigate({ page: "tree" })}>{NAV_LABELS[language].tree}</NavLink>
          <NavLink active={route.page === "gallery"} onClick={() => navigate({ page: "gallery" })}>{NAV_LABELS[language].gallery}</NavLink>
          <NavLink active={route.page === "admin"} onClick={() => navigate({ page: "admin" })}>{NAV_LABELS[language].admin}</NavLink>
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
            ) : null}
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
          ) : null}
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

      {memberDraft ? (
        <Modal
          title={memberDraft.id ? t(language, "editMemberModalTitle") : t(language, "addMemberModalTitle")}
          subtitle={t(language, "memberModalSubtitle")}
          onClose={closeEditors}
        >
          <div className="form-grid">
            <label className="span-6">
              {t(language, "nameLabel")}
              <input className="field" value={memberDraft.name} onChange={(e) => setMemberDraft((current) => current ? { ...current, name: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "urduNameLabel")}
              <input className="field" value={memberDraft.nameUr} onChange={(e) => setMemberDraft((current) => current ? { ...current, nameUr: e.target.value } : current)} />
            </label>
            <label className="span-4">
              {t(language, "genderLabel")}
              <select className="select" value={memberDraft.gender} onChange={(e) => setMemberDraft((current) => current ? { ...current, gender: e.target.value as Gender } : current)}>
                <option value="male">{t(language, "genderMale")}</option>
                <option value="female">{t(language, "genderFemale")}</option>
              </select>
            </label>
            <label className="span-4">
              {t(language, "dobLabel")}
              <input className="field" type="date" value={memberDraft.dob} onChange={(e) => setMemberDraft((current) => current ? { ...current, dob: e.target.value } : current)} />
            </label>
            <label className="span-4">
              {t(language, "dodLabel")}
              <input className="field" type="date" value={memberDraft.dod} onChange={(e) => setMemberDraft((current) => current ? { ...current, dod: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "birthplaceLabel")}
              <input className="field" value={memberDraft.birthplace} onChange={(e) => setMemberDraft((current) => current ? { ...current, birthplace: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "photoUrlLabel")}
              <input className="field" value={memberDraft.photo} onChange={(e) => setMemberDraft((current) => current ? { ...current, photo: e.target.value } : current)} />
            </label>
            <label className="span-12">
              {t(language, "uploadPhotoLabel")}
              <input
                className="field"
                type="file"
                accept="image/*"
                onChange={(e) => handleMemberPhoto(e.target.files?.[0])}
              />
            </label>
            <label className="span-12">
              {t(language, "bioLabel")}
              <textarea className="textarea" value={memberDraft.bio} onChange={(e) => setMemberDraft((current) => current ? { ...current, bio: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "fatherLabel")}
              <select className="select" value={memberDraft.fatherId} onChange={(e) => setMemberDraft((current) => current ? { ...current, fatherId: e.target.value } : current)}>
                <option value="">{t(language, "noneOption")}</option>
                {state.members.filter((member) => member.gender === "male" && member.id !== memberDraft.id).map((member) => (
                  <option key={member.id} value={member.id}>{displayName(member, language)}</option>
                ))}
              </select>
            </label>
            <label className="span-6">
              {t(language, "motherLabel")}
              <select className="select" value={memberDraft.motherId} onChange={(e) => setMemberDraft((current) => current ? { ...current, motherId: e.target.value } : current)}>
                <option value="">{t(language, "noneOption")}</option>
                {state.members.filter((member) => member.gender === "female" && member.id !== memberDraft.id).map((member) => (
                  <option key={member.id} value={member.id}>{displayName(member, language)}</option>
                ))}
              </select>
            </label>
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
                      {displayName(member, language)} ✕
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
                        displayName(member, language).toLowerCase().includes(spouseSearchQuery.trim().toLowerCase())
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
                          {displayName(member, language)}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={saveMember}>{t(language, "saveMemberButton")}</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>{t(language, "cancelButton")}</button>
            {memberDraft.id ? <button className="btn-ghost danger" type="button" onClick={() => { deleteMember(memberDraft.id!); closeEditors(); }}>{t(language, "deleteButton")}</button> : null}
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
              <input className="field" value={userDraft.email} onChange={(e) => setUserDraft((current) => current ? { ...current, email: e.target.value } : current)} />
            </label>
            <label className="span-6">
              {t(language, "roleLabel")}
              <select className="select" value={userDraft.role} onChange={(e) => setUserDraft((current) => current ? { ...current, role: e.target.value as Role } : current)}>
                <option value="editor">{t(language, "editorOption")}</option>
                <option value="admin">{t(language, "adminOption")}</option>
              </select>
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={saveUser}>{t(language, "saveUserButton")}</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>{t(language, "cancelButton")}</button>
            {userDraft.id ? <button className="btn-ghost danger" type="button" onClick={() => { deleteUser(userDraft.id!); closeEditors(); }}>{t(language, "deleteButton")}</button> : null}
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
