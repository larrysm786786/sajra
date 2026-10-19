import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getSupabaseClient } from "./supabase";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function SajraChat({ appName }: { appName: string }) {
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
    if (!supabase) { setError("Chat ke liye Supabase configure karna zaroori hai."); return; }
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setDraft(""); setBusy(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("sajra-chat", { body: { messages: next.slice(-12), appName } });
      if (invokeError) throw invokeError;
      if (typeof data?.reply !== "string") throw new Error("Jawab nahin mil saka. Dobara koshish karein.");
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (err) { setError(err instanceof Error ? err.message : "Chat service se rabta nahin ho saka."); }
    finally { setBusy(false); setTimeout(scrollToBottom, 20); }
  }

  return <div className="sajra-chat-widget">
    {open ? <section className="sajra-chat-panel" aria-label={`${appName} AI assistant`}>
      <header className="sajra-chat-header"><span className="sajra-chat-avatar">✦</span><div><strong>{appName} AI</strong><small>Family guide · Grok</small></div><button type="button" className="sajra-chat-close" aria-label="Close chat" onClick={() => setOpen(false)}>×</button></header>
      <div className="sajra-chat-messages" aria-live="polite">
        {!messages.length ? <div className="sajra-chat-welcome"><span>✦</span><h3>Assalamu alaikum!</h3><p>Main {appName} family tree explore karne mein aapki madad kar sakta hoon. Kya jaan’na chahenge?</p><div className="sajra-chat-chips"><button type="button" onClick={() => setDraft("Family tree mein kaise search karoon?")}>Tree mein search</button><button type="button" onClick={() => setDraft("Sajra ke baare mein batao")}>Sajra ke baare mein</button></div></div> : messages.map((message, index) => <div key={index} className={`sajra-chat-message ${message.role}`}>{message.content}</div>)}
        {busy ? <div className="sajra-chat-message assistant sajra-chat-typing"><i/><i/><i/></div> : null}{error ? <p className="sajra-chat-error">{error}</p> : null}<div ref={bottomRef}/>
      </div>
      <form className="sajra-chat-form" onSubmit={(event) => void send(event)}><textarea aria-label="Your message" placeholder="Ask me anything…" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(event); } }} /><button type="submit" aria-label="Send message" disabled={!draft.trim() || busy}>↑</button></form>
      <div className="sajra-chat-footnote">AI can make mistakes. Avoid sharing private information.</div>
    </section> : null}
    <button type="button" className={`sajra-chat-launcher${open ? " active" : ""}`} aria-label={open ? "Close AI chat" : "Open AI chat"} onClick={() => setOpen((value) => !value)}>{open ? "×" : <><span>✦</span><span className="sajra-chat-launcher-label">Ask Sajra AI</span></>}</button>
  </div>;
}



