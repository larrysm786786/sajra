import React, { useRef, useState } from "react";
import type { FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type { Member } from "./types";

type ChatMessage = { role: "user" | "assistant"; content: string };

function renderInlineAssistantText(content: string, keyPrefix: string) {
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={keyPrefix + "-" + index}>{part.slice(2, -2)}</strong>
      : part
  );
}

function renderAssistantMessage(content: string) {
  const cleaned = content
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(String.fromCharCode(96).repeat(3)))
    .join("\n")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
  return cleaned.split(/\n{2,}/).map((block, blockIndex) => {
    const lines = block.split(/\r?\n/);
    const listItems = lines.map((line) => /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line));
    if (listItems.every(Boolean)) {
      return <ul key={blockIndex}>{listItems.map((match, index) => <li key={index}>{renderInlineAssistantText(match![1], blockIndex + "-" + index)}</li>)}</ul>;
    }
    return <p key={blockIndex}>{lines.map((line, index) => <React.Fragment key={index}>{renderInlineAssistantText(line, blockIndex + "-" + index)}{index < lines.length - 1 ? <br /> : null}</React.Fragment>)}</p>;
  });
}

export default function SajraChat({ appName, members, onOpenMember }: { appName: string; members: Member[]; onOpenMember: (memberId: number) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    const supabase = getSupabaseClient();
    if (!text || busy) return;
    if (!supabase) { setError("Chat is not configured yet. Please contact the site administrator."); return; }
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setDraft(""); setBusy(true); setError("");
    try {
      const familyMembers = members.map(({ id, uniqueId, name, nameUr, gender, profession, fatherId, motherId, spouseIds }) => ({ id, uniqueId, name, nameUr, gender, profession, fatherId, motherId, spouseIds }));
      const { data, error: invokeError } = await supabase.functions.invoke("sajra-chat", { body: { messages: next.slice(-6), appName, familyMembers } });
      if (invokeError) throw invokeError;
      if (typeof data?.reply !== "string") throw new Error("I could not get an answer. Please try again.");
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (err) {
      if (err instanceof FunctionsHttpError) {
        try {
          const body = await err.context.clone().json();
          setError(typeof body?.error === "string" ? body.error : err.message);
        } catch { setError(err.message); }
      } else {
        setError(err instanceof Error ? err.message : "Could not reach the chat service. Please try again.");
      }
    }
    finally { setBusy(false); setTimeout(scrollToBottom, 20); }
  }

  return <div className="sajra-chat-widget">
    {open ? <section className="sajra-chat-panel" aria-label="Anis AI assistant">
      <header className="sajra-chat-header"><span className="sajra-chat-avatar">✦</span><div><strong>Anis AI</strong></div><button type="button" className="sajra-chat-close" aria-label="Close chat" onClick={() => setOpen(false)}>×</button></header>
      <div className="sajra-chat-messages" aria-live="polite">
        {!messages.length ? <div className="sajra-chat-welcome"><span>✦</span><h3>Assalamo Alaikum</h3><p>I can help you explore the {appName} family tree. What would you like to know?</p><div className="sajra-chat-chips"><button type="button" onClick={() => setDraft("How do I search the family tree?")}>Search the tree</button><button type="button" onClick={() => setDraft("Tell me about Sajra")}>About Sajra</button></div></div> : messages.map((message, index) => <div key={index} className={`sajra-chat-message ${message.role}`}>{message.role === "assistant" ? <>{renderAssistantMessage(message.content)}{members.filter((member) => member.uniqueId && message.content.includes(member.uniqueId)).map((member) => <button key={member.id} type="button" className="sajra-chat-profile-link" onClick={() => { setOpen(false); onOpenMember(member.id); }}>View profile · {member.uniqueId}</button>)}</> : message.content}</div>)}
        {busy ? <div className="sajra-chat-message assistant sajra-chat-typing"><i/><i/><i/></div> : null}{error ? <p className="sajra-chat-error">{error}</p> : null}<div ref={bottomRef}/>
      </div>
      <form className="sajra-chat-form" onSubmit={(event) => void send(event)}><textarea aria-label="Your message" placeholder="Ask me anything…" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(event); } }} /><button type="submit" aria-label="Send message" disabled={!draft.trim() || busy}>↑</button></form>
      <div className="sajra-chat-footnote">AI can make mistakes. Avoid sharing private information.</div>
    </section> : null}
    <button type="button" className={`sajra-chat-launcher${open ? " active" : ""}`} aria-label={open ? "Close AI chat" : "Open AI chat"} onClick={() => setOpen((value) => !value)}>{open ? "×" : <><span>✦</span><span className="sajra-chat-launcher-label">Ask Anis AI</span></>}</button>
  </div>;
}
