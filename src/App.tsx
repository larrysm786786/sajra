import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppState, GalleryImage, Gender, Language, Member, Role, TreeNode, User, ViewKey } from "./types";
import {
  assignUniqueName,
  buildTree,
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
          {member.birthplace || "No birthplace noted"}
          {calculateAge(member.dob, member.dod) !== null ? ` • Age ${calculateAge(member.dob, member.dod)}` : ""}
        </div>
      </div>
    </button>
  );
}

function TreeBranch({
  node,
  language,
  onOpen,
  query,
  depth = 0
}: {
  node: TreeNode;
  language: AppState["language"];
  onOpen: (id: number) => void;
  query: string;
  depth?: number;
}) {
  const memberName = displayName(node.member, language);
  const matches = !query || memberName.toLowerCase().includes(query.toLowerCase());
  const age = calculateAge(node.member.dob, node.member.dod);

  return (
    <details className="tree-details" open={depth < 2 || Boolean(query)}>
      <summary className="tree-summary">
        <div className="tree-card" style={{ opacity: matches ? 1 : 0.62, marginBottom: 10 }}>
          <div className="tree-head">
            <div>
              <div className="tree-name">{memberName}</div>
              <div className="tree-sub">
                {node.member.birthplace || "No birthplace noted"}
                {age !== null ? ` • Age ${age}` : ""}
                {node.member.dod ? ` • Died ${formatDate(node.member.dod)}` : ""}
              </div>
            </div>
            <span className="pill">{node.member.gender}</span>
          </div>
          <div className="member-chip-list">
            <button type="button" className="member-chip" onClick={(e) => { e.preventDefault(); onOpen(node.member.id); }}>
              View profile
            </button>
            {node.member.spouseIds.length ? <span className="pill">{node.member.spouseIds.length} spouses</span> : null}
            {node.children.length ? <span className="pill">{node.children.length} children</span> : null}
          </div>
        </div>
      </summary>
      {node.children.length ? (
        <div className="tree-branch">
          {node.children.map((child) => (
            <TreeBranch key={child.member.id} node={child} language={language} onOpen={onOpen} query={query} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </details>
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
            <h2 className="section-title" style={{ fontSize: "2.4rem" }}>{title}</h2>
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
  const supabaseConfigured = useMemo(() => isSupabaseConfigured(), []);
  const [treeQuery, setTreeQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "ready" | "error" | "conflict">("loading");
  const [syncMessage, setSyncMessage] = useState("Checking local data...");
  const [memberDraft, setMemberDraft] = useState<MemberDraft | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null);
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraft | null>(null);
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
  const tree = useMemo(() => buildTree(state.members), [state.members]);
  const selectedMember = route.page === "member" && route.memberId ? memberMap.get(route.memberId) : undefined;

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "#/home";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
        setSyncMessage("Running in local-only mode.");
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
          setSyncMessage("Loaded the shared family tree from Supabase.");
        } else if (localHasData) {
          setSyncMessage("Supabase has no data yet. Log in as admin to publish this browser's data.");
        } else {
          setSyncMessage("Supabase is connected and waiting for the first save.");
        }

        setSyncStatus("ready");
      } catch {
        if (cancelled) return;
        setSyncStatus("error");
        setSyncMessage(supabaseConfigured ? "Supabase sync is unavailable. Showing local data." : "Running in local-only mode.");
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
          setSyncMessage("Changes synced to Supabase.");
        })
        .catch(async (error) => {
          if (error instanceof StaleWriteError) {
            setSyncStatus("conflict");
            setSyncMessage("Someone else saved changes first. Reloading the latest version...");
            const remote = await loadSupabaseState();
            if (remote) {
              setState(remote.state);
              saveState(remote.state);
              remoteUpdatedAtRef.current = remote.updatedAt;
              setSyncMessage("Reloaded the latest version from Supabase. Please redo your last change.");
            }
            return;
          }
          setSyncStatus("error");
          setSyncMessage("Could not save to Supabase. Local data is safe.");
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
      setLoginError("Admin login requires Supabase to be configured.");
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
      setLoginError(error instanceof Error ? error.message : "Invalid email or password.");
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
    if (!window.confirm("Delete this member and remove relationship links?")) return;
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
    if (!window.confirm("Delete this user?")) return;
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
    if (!window.confirm("Delete this gallery photo?")) return;
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
      setImportError("Invalid backup file.");
    }
  }

  function resetToEmpty() {
    if (!window.confirm("Reset the whole app state? This cannot be undone.")) return;
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
              <span className="eyebrow">Admin access</span>
              <h2 className="section-title" style={{ fontSize: "2.8rem", marginTop: 12 }}>Sign in to manage Sajra</h2>
              <p className="section-subtitle">Use the stored user accounts to unlock editing, gallery uploads, and data export.</p>
            </div>
          </div>
          <div className="profile-layout" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Card title="Login" subtitle="Managed by Supabase Authentication.">
              <form className="form-stack" onSubmit={handleLoginSubmit}>
                <label>
                  Email
                  <input type="email" className="field" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoComplete="username" />
                </label>
                <label>
                  Password
                  <input type="password" className="field" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="current-password" />
                </label>
                {loginError ? <div className="notice danger">{loginError}</div> : null}
                <button className="btn" type="submit" disabled={loginBusy}>{loginBusy ? "Signing in..." : "Login"}</button>
              </form>
            </Card>
            <Card title="What this unlocks" subtitle="Client-side admin tools on GitHub Pages.">
              <div className="list">
                <div className="notice">Add and edit members with parent and spouse links.</div>
                <div className="notice">Manage users if you are an admin.</div>
                <div className="notice">Upload photos directly into the static app backup.</div>
                <div className="notice">Export the full app state as JSON for backup or migration.</div>
              </div>
            </Card>
          </div>
        </section>
      );
    }

    if (route.page === "member") {
      const member = selectedMember;
      return (
        <section className="section">
          {member ? (
            <>
              <div className="profile-layout">
                <img className="member-photo hero-photo" src={photoSrc(member.photo)} alt={displayName(member, language)} />
                <div>
                  <span className="eyebrow">{member.gender}</span>
                  <h1 className="section-title" style={{ marginTop: 12 }}>{displayName(member, language)}</h1>
                  <p className="section-subtitle" style={{ marginTop: 12 }}>
                    {member.birthplace || "No birthplace noted"}
                    {member.dob ? ` • Born ${formatDate(member.dob)}` : ""}
                    {member.dod ? ` • Died ${formatDate(member.dod)}` : ""}
                    {calculateAge(member.dob, member.dod) !== null ? ` • Age ${calculateAge(member.dob, member.dod)}` : ""}
                  </p>
                  <div className="profile-meta">
                    <button className="btn" type="button" onClick={() => navigate({ page: "tree" })}>Open Tree</button>
                    {isLoggedIn ? <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>Edit member</button> : null}
                  </div>
                  {member.bio ? <p style={{ marginTop: 16, lineHeight: 1.8 }}>{member.bio}</p> : null}
                </div>
              </div>

              <div className="card-grid" style={{ marginTop: 20 }}>
                <Card title="Parents" subtitle="Direct lineage">
                  {getParents(state.members, member).length ? (
                    <div className="member-grid">
                      {getParents(state.members, member).map((parent) => (
                        <MemberCard key={parent.id} member={parent} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
                      ))}
                    </div>
                  ) : <div className="empty">No parents linked.</div>}
                </Card>
                <Card title="Spouses" subtitle="Marriage links">
                  {getSpouses(state.members, member).length ? (
                    <div className="member-grid">
                      {getSpouses(state.members, member).map((spouse) => (
                        <MemberCard key={spouse.id} member={spouse} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
                      ))}
                    </div>
                  ) : <div className="empty">No spouse links yet.</div>}
                </Card>
                <Card title="Children" subtitle="Descendants">
                  {getChildren(state.members, member.id).length ? (
                    <div className="member-grid">
                      {getChildren(state.members, member.id).sort(sortMembers).map((child) => (
                        <MemberCard key={child.id} member={child} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
                      ))}
                    </div>
                  ) : <div className="empty">No children linked.</div>}
                </Card>
              </div>
            </>
          ) : (
            <div className="empty">
              Member not found. Use search or return home.
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
              <span className="eyebrow">Family tree</span>
              <h2 className="section-title" style={{ fontSize: "2.9rem", marginTop: 12 }}>Explore the lineage</h2>
              <p className="section-subtitle">Switch views, search by name, and open detailed member profiles.</p>
            </div>
          </div>

          {state.members.length ? (
            <FamilyTreeD3
              members={state.members}
              language={language}
              onOpenMember={(id) => navigate({ page: "member", memberId: id })}
            />
          ) : (
            <div className="empty">No members yet. Add the first root member from admin.</div>
          )}
        </section>
      );
    }

    if (route.page === "gallery") {
      return (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Gallery</span>
              <h2 className="section-title" style={{ fontSize: "2.9rem", marginTop: 12 }}>Captured memories</h2>
              <p className="section-subtitle">Photos are kept inside this static app backup, so they travel with export/import.</p>
            </div>
            {isLoggedIn ? <button className="btn" type="button" onClick={() => openGalleryEditor()}>Add photo</button> : null}
          </div>
          {state.gallery.length ? (
            <div className="gallery-grid">
              {state.gallery.map((image) => (
                <article className="gallery-card" key={image.id}>
                  <img className="member-photo" src={photoSrc(image.src)} alt={image.caption ?? "Gallery image"} />
                  <div style={{ marginTop: 12 }}>
                    <div className="tree-name">{image.caption || "Untitled photo"}</div>
                    <div className="tree-sub">{formatDate(image.uploadedAt)}</div>
                  </div>
                  {isLoggedIn ? (
                    <div className="actions-row" style={{ marginTop: 12 }}>
                      <button className="btn-ghost" type="button" onClick={() => openGalleryEditor(image)}>Edit</button>
                      <button className="btn-ghost danger" type="button" onClick={() => deleteGalleryItem(image.id)}>Delete</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">No photos yet.</div>
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
              <span className="eyebrow">Admin console</span>
              <h2 className="section-title" style={{ fontSize: "2.9rem", marginTop: 12 }}>Manage the archive</h2>
              <p className="section-subtitle">Edit members, users, gallery photos, and download a full backup as JSON.</p>
            </div>
            <div className="actions-row">
              <button className="btn" type="button" onClick={() => openMemberEditor()}>Add member</button>
              {isAdmin ? <button className="btn-ghost" type="button" onClick={() => openUserEditor()}>Add user</button> : null}
              <button className="btn-ghost" type="button" onClick={() => openGalleryEditor()}>Add gallery photo</button>
            </div>
          </div>

          <div className="stat-grid">
            <StatCard value={stats.members} label="Members" />
            <StatCard value={stats.roots} label="Roots" />
            <StatCard value={stats.gallery} label="Gallery items" />
            <StatCard value={stats.users} label="Users" />
          </div>

          <div className="card-grid" style={{ marginTop: 18 }}>
            <Card
              title="Members"
              subtitle="Find, edit, or remove people in the family tree."
              actions={<input className="field" style={{ maxWidth: 280 }} placeholder="Search members" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />}
            >
              <div className="list">
                {memberSearchResults.map((member) => (
                  <div key={member.id} className="card" style={{ padding: 14 }}>
                    <div className="tree-head">
                      <div>
                        <div className="tree-name">{displayName(member, language)}</div>
                        <div className="tree-sub">{member.birthplace || "No birthplace noted"}</div>
                      </div>
                      <div className="actions-row">
                        <button className="btn-ghost" type="button" onClick={() => navigate({ page: "member", memberId: member.id })}>Open</button>
                        <button className="btn-ghost" type="button" onClick={() => openMemberEditor(member)}>Edit</button>
                        <button className="btn-ghost danger" type="button" onClick={() => deleteMember(member.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
                {!memberSearchResults.length ? <div className="empty">No member matches found.</div> : null}
              </div>
            </Card>

            {isAdmin ? (
              <Card
                title="Users"
                subtitle="Admin and editor accounts stored in the backup."
                actions={<button className="btn-ghost" type="button" onClick={() => openUserEditor()}>Add user</button>}
              >
                <div className="list">
                  {sortedUsers.map((user) => (
                    <div key={user.id} className="card" style={{ padding: 14 }}>
                      <div className="tree-head">
                        <div>
                          <div className="tree-name">{user.username}</div>
                          <div className="tree-sub">{user.name || "No name"} • {user.role}</div>
                        </div>
                        <div className="actions-row">
                          <button className="btn-ghost" type="button" onClick={() => openUserEditor(user)}>Edit</button>
                          <button className="btn-ghost danger" type="button" onClick={() => deleteUser(user.id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card title="Backup" subtitle="Export or import the complete static app state.">
              <div className="list">
                <button className="btn" type="button" onClick={exportState}>Download JSON backup</button>
                <button className="btn-ghost" type="button" onClick={triggerImport}>Import JSON backup</button>
                <button className="btn-ghost danger" type="button" onClick={resetToEmpty}>Reset app state</button>
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
          <span className="eyebrow">About</span>
          <h2 className="section-title" style={{ fontSize: "3rem", marginTop: 12 }}>Static React conversion</h2>
          <p className="section-subtitle" style={{ marginTop: 12 }}>
            Sajra has been rewritten as a client-side React app suitable for GitHub Pages. State is stored locally in the browser and can be exported as JSON.
          </p>
          <div className="notice" style={{ marginTop: 18 }}>
            If you want a database-backed version later, this structure can be connected to Supabase storage and tables in a second pass.
          </div>
        </section>
      );
    }

    return (
      <>
        <section className="hero">
          <span className="eyebrow">Sajra family archive</span>
          <h1>Preserve lineage, stories, and shared memory.</h1>
          <p>
            A single-page React build for GitHub Pages that keeps the family tree, member profiles, and gallery together in a polished static experience.
          </p>
          <div className="hero-actions">
            <button className="btn" type="button" onClick={() => navigate({ page: "tree" })}>Open Family Tree</button>
            <button className="btn-ghost" type="button" onClick={() => navigate({ page: "gallery" })}>View Gallery</button>
            <button className="btn-ghost" type="button" onClick={() => navigate({ page: "about" })}>About the rewrite</button>
          </div>
          <div className="hero-kpis">
            <span className="kpi">{stats.members} members</span>
            <span className="kpi">{stats.roots} roots</span>
            <span className="kpi">{stats.gallery} photos</span>
            <span className="kpi">{stats.users} accounts</span>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Snapshot</span>
              <h2 className="section-title" style={{ fontSize: "2.7rem", marginTop: 12 }}>Quick stats</h2>
            </div>
          </div>
          <div className="stat-grid">
            <StatCard value={stats.members} label="Members" hint="People stored in the family tree." />
            <StatCard value={stats.roots} label="Root branches" hint="Ancestors without parent links." />
            <StatCard value={stats.male} label="Male members" hint="Gender split from saved data." />
            <StatCard value={stats.female} label="Female members" hint="Gender split from saved data." />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Founding branches</span>
              <h2 className="section-title" style={{ fontSize: "2.7rem", marginTop: 12 }}>Roots and elders</h2>
            </div>
            <button className="btn-ghost" type="button" onClick={() => navigate({ page: "tree" })}>Open tree</button>
          </div>
          {roots.length ? (
            <div className="member-grid">
              {roots.slice(0, 8).map((member) => (
                <MemberCard key={member.id} member={member} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
              ))}
            </div>
          ) : (
            <div className="empty">
              No root members yet. Sign in and add the first ancestor from the admin panel.
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Recent people</span>
              <h2 className="section-title" style={{ fontSize: "2.7rem", marginTop: 12 }}>Newest additions</h2>
            </div>
            <input
              className="field"
              style={{ maxWidth: 320 }}
              placeholder="Search member names"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
          </div>
          {memberSearchResults.length ? (
            <div className="member-grid">
              {memberSearchResults.map((member) => (
                <MemberCard key={member.id} member={member} language={language} onOpen={(id) => navigate({ page: "member", memberId: id })} />
              ))}
            </div>
          ) : (
            <div className="empty">No members match your search.</div>
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
            <span>Family tree and archive</span>
          </div>
        </a>
        <nav className="topnav">
          <NavLink active={route.page === "home"} onClick={() => navigate({ page: "home" })}>{NAV_LABELS[language].home}</NavLink>
          <NavLink active={route.page === "tree"} onClick={() => navigate({ page: "tree" })}>{NAV_LABELS[language].tree}</NavLink>
          <NavLink active={route.page === "gallery"} onClick={() => navigate({ page: "gallery" })}>{NAV_LABELS[language].gallery}</NavLink>
          <NavLink active={route.page === "admin"} onClick={() => navigate({ page: "admin" })}>{NAV_LABELS[language].admin}</NavLink>
          <NavLink active={route.page === "about"} onClick={() => navigate({ page: "about" })}>{NAV_LABELS[language].about}</NavLink>
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
            <button type="button" className="toggle" onClick={logout}>Logout</button>
          ) : null}
        </div>
      </header>

      {content}

      <p className="footer-note">
        {supabaseConfigured
          ? syncStatus === "error"
            ? `Supabase sync issue: ${syncMessage} Local storage and browser backup still work.`
            : syncStatus === "conflict"
              ? syncMessage
              : `Supabase sync is on. ${syncMessage}`
          : "This version runs locally in your browser. Add Supabase env vars to enable cloud sync."}
      </p>

      {memberDraft ? (
        <Modal
          title={memberDraft.id ? "Edit member" : "Add member"}
          subtitle="Capture names, lineage, and spouse links in one place."
          onClose={closeEditors}
        >
          <div className="form-grid">
            <label className="span-6">
              Name
              <input className="field" value={memberDraft.name} onChange={(e) => setMemberDraft((current) => current ? { ...current, name: e.target.value } : current)} />
            </label>
            <label className="span-6">
              Urdu name
              <input className="field" value={memberDraft.nameUr} onChange={(e) => setMemberDraft((current) => current ? { ...current, nameUr: e.target.value } : current)} />
            </label>
            <label className="span-4">
              Gender
              <select className="select" value={memberDraft.gender} onChange={(e) => setMemberDraft((current) => current ? { ...current, gender: e.target.value as Gender } : current)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label className="span-4">
              Date of birth
              <input className="field" type="date" value={memberDraft.dob} onChange={(e) => setMemberDraft((current) => current ? { ...current, dob: e.target.value } : current)} />
            </label>
            <label className="span-4">
              Date of death
              <input className="field" type="date" value={memberDraft.dod} onChange={(e) => setMemberDraft((current) => current ? { ...current, dod: e.target.value } : current)} />
            </label>
            <label className="span-6">
              Birthplace
              <input className="field" value={memberDraft.birthplace} onChange={(e) => setMemberDraft((current) => current ? { ...current, birthplace: e.target.value } : current)} />
            </label>
            <label className="span-6">
              Photo data or URL
              <input className="field" value={memberDraft.photo} onChange={(e) => setMemberDraft((current) => current ? { ...current, photo: e.target.value } : current)} />
            </label>
            <label className="span-12">
              Upload photo
              <input
                className="field"
                type="file"
                accept="image/*"
                onChange={(e) => handleMemberPhoto(e.target.files?.[0])}
              />
            </label>
            <label className="span-12">
              Bio
              <textarea className="textarea" value={memberDraft.bio} onChange={(e) => setMemberDraft((current) => current ? { ...current, bio: e.target.value } : current)} />
            </label>
            <label className="span-6">
              Father
              <select className="select" value={memberDraft.fatherId} onChange={(e) => setMemberDraft((current) => current ? { ...current, fatherId: e.target.value } : current)}>
                <option value="">None</option>
                {state.members.filter((member) => member.gender === "male" && member.id !== memberDraft.id).map((member) => (
                  <option key={member.id} value={member.id}>{displayName(member, language)}</option>
                ))}
              </select>
            </label>
            <label className="span-6">
              Mother
              <select className="select" value={memberDraft.motherId} onChange={(e) => setMemberDraft((current) => current ? { ...current, motherId: e.target.value } : current)}>
                <option value="">None</option>
                {state.members.filter((member) => member.gender === "female" && member.id !== memberDraft.id).map((member) => (
                  <option key={member.id} value={member.id}>{displayName(member, language)}</option>
                ))}
              </select>
            </label>
            <div className="span-12">
              <div className="muted" style={{ marginBottom: 10, fontWeight: 700 }}>Spouses</div>
              <div className="member-chip-list">
                {state.members.filter((member) => member.id !== memberDraft.id).map((member) => {
                  const selected = memberDraft.spouseIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`member-chip ${selected ? "active" : ""}`}
                      onClick={() => setMemberDraft((current) => current ? {
                        ...current,
                        spouseIds: selected ? current.spouseIds.filter((id) => id !== member.id) : [...current.spouseIds, member.id]
                      } : current)}
                    >
                      {displayName(member, language)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={saveMember}>Save member</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>Cancel</button>
            {memberDraft.id ? <button className="btn-ghost danger" type="button" onClick={() => { deleteMember(memberDraft.id!); closeEditors(); }}>Delete</button> : null}
          </div>
        </Modal>
      ) : null}

      {userDraft ? (
        <Modal
          title={userDraft.id ? "Edit user" : "Add user"}
          subtitle="A directory label only — it does not grant login access. Manage real sign-in accounts in Supabase Authentication."
          onClose={closeEditors}
        >
          <div className="form-grid">
            <label className="span-6">
              Username
              <input className="field" value={userDraft.username} onChange={(e) => setUserDraft((current) => current ? { ...current, username: e.target.value } : current)} />
            </label>
            <label className="span-6">
              Name
              <input className="field" value={userDraft.name} onChange={(e) => setUserDraft((current) => current ? { ...current, name: e.target.value } : current)} />
            </label>
            <label className="span-6">
              Email
              <input className="field" value={userDraft.email} onChange={(e) => setUserDraft((current) => current ? { ...current, email: e.target.value } : current)} />
            </label>
            <label className="span-6">
              Role
              <select className="select" value={userDraft.role} onChange={(e) => setUserDraft((current) => current ? { ...current, role: e.target.value as Role } : current)}>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={saveUser}>Save user</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>Cancel</button>
            {userDraft.id ? <button className="btn-ghost danger" type="button" onClick={() => { deleteUser(userDraft.id!); closeEditors(); }}>Delete</button> : null}
          </div>
        </Modal>
      ) : null}

      {galleryDraft ? (
        <Modal
          title={galleryDraft.id ? "Edit gallery photo" : "Add gallery photo"}
          subtitle="Store a photo as a data URL or paste a direct image URL."
          onClose={closeEditors}
        >
          <div className="form-grid">
            <label className="span-12">
              Photo URL or data URL
              <input className="field" value={galleryDraft.src} onChange={(e) => setGalleryDraft((current) => current ? { ...current, src: e.target.value } : current)} />
            </label>
            <label className="span-12">
              Upload image
              <input className="field" type="file" accept="image/*" onChange={(e) => handleGalleryFile(e.target.files?.[0])} />
            </label>
            <label className="span-12">
              Caption
              <input className="field" value={galleryDraft.caption} onChange={(e) => setGalleryDraft((current) => current ? { ...current, caption: e.target.value } : current)} />
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={saveGallery}>Save photo</button>
            <button className="btn-ghost" type="button" onClick={closeEditors}>Cancel</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
