import React, { useRef, useState } from "react";
import type { FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type { Member } from "./types";

type ChatMessage = { role: "user" | "assistant"; content: string; feedback?: "up" | "down"; feedbackSent?: boolean };

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

export default function SajraChat({ appName, members, onOpenMember, onFeedback }: { appName: string; members: Member[]; onOpenMember: (memberId: number) => void; onFeedback: (answer: string, helpful: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answerLength, setAnswerLength] = useState<"concise" | "detailed">("concise");
  const [responseLanguage, setResponseLanguage] = useState<"auto" | "en" | "hinglish" | "ur">("auto");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  async function submitFeedback(index: number, content: string, helpful: boolean) {
    setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedback: helpful ? "up" : "down" } : item));
    try {
      await onFeedback(content, helpful);
      setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackSent: true } : item));
    } catch {
      setError("Feedback could not be sent. Please try again later.");
    }
  }
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
      const { data, error: invokeError } = await supabase.functions.invoke("sajra-chat", { body: { messages: next.slice(-6), appName, familyMembers, answerLength, responseLanguage } });
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
      <header className="sajra-chat-header"><span className="sajra-chat-avatar">&#x2726;</span><div><strong>Anis AI</strong></div><button type="button" className="sajra-chat-close" aria-label="Close chat" onClick={() => setOpen(false)}>&#x00D7;</button></header>
      <div className="sajra-chat-messages" aria-live="polite">
        {!messages.length ? <div className="sajra-chat-welcome"><span>&#x2726;</span><h3>Assalamo Alaikum</h3><p>I can help you explore the {appName} family tree. What would you like to know?</p><div className="sajra-chat-chips"><button type="button" onClick={() => setDraft("How do I search the family tree?")}>Search the tree</button><button type="button" onClick={() => setDraft("How many Hafiz, Maulanas, and engineers are in the tree?")}>Family counts</button><button type="button" onClick={() => setDraft("Who are the parents of ")}>Find parents</button><button type="button" onClick={() => setDraft("How are these family members related: ")}>Find a relationship</button><button type="button" onClick={() => setDraft("Tell me about Sajra")}>About Sajra</button></div></div> : messages.map((message, index) => <div key={index} className={`sajra-chat-message ${message.role}`}>{message.role === "assistant" ? <>{renderAssistantMessage(message.content)}{members.filter((member) => member.uniqueId && message.content.includes(member.uniqueId)).map((member) => { const father = members.find((candidate) => candidate.id === member.fatherId); const mother = members.find((candidate) => candidate.id === member.motherId); return <button key={member.id} type="button" className="sajra-chat-profile-card" onClick={() => { setOpen(false); onOpenMember(member.id); }}><strong>{member.name}</strong><span>{member.uniqueId}</span>{member.profession ? <small>{member.profession}</small> : null}{father || mother ? <small>{father ? "Father: " + father.name : ""}{father && mother ? " | " : ""}{mother ? "Mother: " + mother.name : ""}</small> : null}<small>View profile</small></button>; })}{message.role === "assistant" ? <><div className="sajra-chat-source">Family tree records</div><div className="sajra-chat-feedback" aria-label="Rate this answer"><span>Was this helpful?</span><button type="button" aria-label="Helpful" aria-pressed={message.feedback === "up"} disabled={Boolean(message.feedback)} onClick={() => void submitFeedback(index, message.content, true)}>Yes</button><button type="button" aria-label="Not helpful" aria-pressed={message.feedback === "down"} disabled={Boolean(message.feedback)} onClick={() => void submitFeedback(index, message.content, false)}>No</button>{message.feedbackSent ? <small>Thanks, feedback sent to the site admins.</small> : message.feedback ? <small>Sending feedback</small> : null}</div></> : null}</> : message.content}</div>)}
        {busy ? <div className="sajra-chat-message assistant sajra-chat-typing"><i/><i/><i/></div> : null}{error ? <p className="sajra-chat-error">{error}</p> : null}<div ref={bottomRef}/>
      </div>
      <div className="sajra-chat-settings"><label>Language<select value={responseLanguage} onChange={(event) => setResponseLanguage(event.target.value as "auto" | "en" | "hinglish" | "ur")}><option value="auto">Match my message</option><option value="en">English</option><option value="hinglish">Hinglish</option><option value="ur">Urdu</option></select></label><label>Answer<select value={answerLength} onChange={(event) => setAnswerLength(event.target.value as "concise" | "detailed")}><option value="concise">Short</option><option value="detailed">Detailed</option></select></label></div><form className="sajra-chat-form" onSubmit={(event) => void send(event)}><textarea aria-label="Your message" placeholder="Ask me anything&#x2026;" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(event); } }} /><button type="submit" aria-label="Send message" disabled={!draft.trim() || busy}>&#x2191;</button></form>
      <div className="sajra-chat-footnote">AI can make mistakes. Avoid sharing private information.</div>
    </section> : null}
    <button type="button" className={`sajra-chat-launcher${open ? " active" : ""}`} aria-label={open ? "Close AI chat" : "Open AI chat"} onClick={() => setOpen((value) => !value)}>{open ? "&#x00D7;" : <><span>&#x2726;</span><span className="sajra-chat-launcher-label">Ask Anis AI</span></>}</button>
  </div>;
}
