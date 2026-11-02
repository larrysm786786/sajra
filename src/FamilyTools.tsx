import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import type { Language, Member } from "./types";
import { displayName, getChildren, photoSrc, publicPageUrl } from "./lib";
import { appPrint } from "./AppUpdater";

function currentUrl(page: "member" | "branch", id: number): string {
  return publicPageUrl(`/${page}/${id}`);
}

function BranchNode({ member, members, language, onOpen, seen }: { member: Member; members: Member[]; language: Language; onOpen: (id: number) => void; seen: Set<number> }) {
  if (seen.has(member.id)) return null;
  seen.add(member.id);
  const children = getChildren(members, member.id).sort((a, b) => a.name.localeCompare(b.name));
  return <li className="branch-tree-node">
    <button type="button" className="branch-member-link" onClick={() => onOpen(member.id)}>
      <img src={photoSrc(member.photo)} alt="" />
      <span>{displayName(member, language)}{member.uniqueId ? <small>{member.uniqueId}</small> : null}</span>
    </button>
    {children.length ? <ul>{children.map((child) => <BranchNode key={child.id} member={child} members={members} language={language} onOpen={onOpen} seen={seen} />)}</ul> : null}
  </li>;
}

export function BranchPage({ member, members, language, onOpen }: { member: Member; members: Member[]; language: Language; onOpen: (id: number) => void }) {
  const [shareMessage, setShareMessage] = useState("");
  const url = currentUrl("branch", member.id);
  async function shareBranch() {
    const title = `${displayName(member, language)} family branch`;
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title, url });
      else if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); setShareMessage("Branch link copied."); window.setTimeout(() => setShareMessage(""), 2200); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try { await navigator.clipboard.writeText(url); setShareMessage("Branch link copied."); window.setTimeout(() => setShareMessage(""), 2200); }
      catch { window.prompt("Copy this family branch link", url); }
    }
  }
  function printBranch() {
    // branch-print-mode only has any effect inside an @media print block, so it's harmless to
    // leave set on screen - for the native print dialog there's no reliable "print finished"
    // event to remove it on (Android's PrintDocumentAdapter renders asynchronously, well after
    // this call returns), so it's simplest to just leave it rather than risk removing it before
    // the content is actually captured.
    document.body.classList.add("branch-print-mode");
    if (Capacitor.isNativePlatform()) { void appPrint.print().catch(() => {}); return; }
    window.addEventListener("afterprint", () => document.body.classList.remove("branch-print-mode"), { once: true });
    window.print();
  }
  return <section className="section branch-page">
    <div className="section-head no-print">
      <div><span className="eyebrow">Family branch</span><h1 className="section-title" style={{ marginTop: 12 }}>{displayName(member, language)}</h1><p className="section-subtitle">Family members descended from this branch.</p></div>
      <div className="actions-row"><button className="btn-ghost" type="button" onClick={() => void shareBranch()}>Share branch</button><button className="btn" type="button" onClick={printBranch}>Print branch</button></div>
    </div>
    {shareMessage ? <p className="hint no-print" role="status">{shareMessage}</p> : null}
    <div className="branch-print-heading"><h1>{displayName(member, language)} - Family Branch</h1><p>{member.uniqueId || ""}</p></div>
    <div className="branch-tree-wrap"><ul className="branch-tree"><BranchNode member={member} members={members} language={language} onOpen={onOpen} seen={new Set()} /></ul></div>
  </section>;
}