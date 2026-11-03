import React, { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { getSupabaseClient } from "./supabase";
import { appSpeech } from "./AppUpdater";
import type { Member } from "./types";

type ChatMessage = { role: "user" | "assistant"; content: string; feedback?: "up" | "down"; feedbackSent?: boolean };

// Minimal surface of the Web Speech API this file needs - not in standard lib.dom.d.ts, and only
// the webkit-prefixed constructor is actually present in the Chromium-based WebView these run in.
interface SpeechRecognitionResultLike { 0: { transcript: string }; isFinal: boolean; }
interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike>; }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function speechLangFor(mode: "auto" | "en" | "hinglish" | "ur"): string {
  // Indian English handles code-mixed Hindi/English speech (recognition and pronunciation) more
  // naturally than American English - there's no dedicated "Hinglish" language code to pick instead.
  if (mode === "ur") return "ur-PK";
  if (mode === "hinglish") return "en-IN";
  return "en-US";
}

/** Strips markdown (bold markers, headings, code fences, list bullets) down to text worth speaking aloud. */
function cleanForSpeech(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(String.fromCharCode(96).repeat(3)))
    .join("\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .trim();
}

/** A plain vector mic glyph (WhatsApp-style silhouette) instead of the emoji, which renders
 * inconsistently in weight and color across platforms. */
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 11Z" />
    </svg>
  );
}

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
  const [readAloud, setReadAloud] = useState(true);
  const [listening, setListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [nativeSpeechAvailable, setNativeSpeechAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseDraftRef = useRef("");
  const finalTranscriptRef = useRef("");
  const spokenCountRef = useRef(0);
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  const isNative = Capacitor.isNativePlatform();
  // The Web Speech API's SpeechRecognition is unreliable-to-absent in Android's embedded WebView
  // (unlike actual Chrome), so the native build uses a real Android SpeechRecognizer plugin
  // instead (see AppSpeechPlugin.java) and only the web build falls back to the browser API.
  const webSpeechRecognitionSupported = !isNative && typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const micSupported = isNative ? nativeSpeechAvailable : webSpeechRecognitionSupported;
  const speechSynthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!isNative) return;
    appSpeech.isAvailable().then((result) => setNativeSpeechAvailable(result.available)).catch(() => {});
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;
    let resultHandle: { remove: () => void } | undefined;
    let levelHandle: { remove: () => void } | undefined;
    let errorHandle: { remove: () => void } | undefined;
    (async () => {
      resultHandle = await appSpeech.addListener("speechResult", ({ transcript, isFinal }) => {
        if (isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim();
          setDraft([baseDraftRef.current, finalTranscriptRef.current].filter(Boolean).join(" ").trim());
        } else {
          setDraft([baseDraftRef.current, finalTranscriptRef.current, transcript].filter(Boolean).join(" ").trim());
        }
      });
      levelHandle = await appSpeech.addListener("speechLevel", ({ level }) => setMicLevel(level));
      // The plugin already retries routine no-speech/timeout pauses on its own - an event here
      // means listening genuinely stopped (e.g. a permissions problem), so reset the UI.
      errorHandle = await appSpeech.addListener("speechError", () => setListening(false));
    })();
    return () => {
      resultHandle?.remove();
      levelHandle?.remove();
      errorHandle?.remove();
    };
  }, [isNative]);

  function speak(text: string) {
    if (!speechSynthesisSupported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanForSpeech(text));
    utterance.lang = speechLangFor(responseLanguage);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  // Reads out loud only new assistant replies that arrive after the toggle is on, never the
  // whole history (e.g. when reopening the panel) or messages spoken once already.
  useEffect(() => {
    if (!readAloud || !messages.length) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant" && messages.length > spokenCountRef.current) {
      speak(last.content);
    }
    spokenCountRef.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, readAloud]);

  async function toggleListening() {
    if (listening) {
      if (isNative) await appSpeech.stop().catch(() => {});
      else recognitionRef.current?.stop();
      setListening(false);
      setMicLevel(0);
      return;
    }

    baseDraftRef.current = draft.trim();
    finalTranscriptRef.current = "";

    if (isNative) {
      try {
        await appSpeech.start({ language: speechLangFor(responseLanguage) });
        setListening(true);
      } catch {
        setListening(false);
      }
      return;
    }

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = speechLangFor(responseLanguage);
    // Continuous + interim: keeps listening across pauses between sentences (stops only when the
    // mic button is tapped again) and shows words as they're recognized, not just after stopping.
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalTranscriptRef.current = `${finalTranscriptRef.current} ${result[0].transcript}`.trim();
        else interim += result[0].transcript;
      }
      setDraft([baseDraftRef.current, finalTranscriptRef.current, interim].filter((part) => part.trim()).join(" ").trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

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
      const familyMembers = members.map(({ id, uniqueId, name, nameUr, gender, profession, fatherId, motherId, spouseIds, daughtersCount }) => ({ id, uniqueId, name, nameUr, gender, profession, fatherId, motherId, spouseIds, daughtersCount: daughtersCount ?? undefined }));
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
    {open ? <section className="sajra-chat-panel" aria-label="Anis Ai assistant">
      <header className="sajra-chat-header"><span className="sajra-chat-avatar">{"\u2726"}</span><div><strong>Anis Ai</strong></div><button type="button" className="sajra-chat-close" aria-label="Close chat" onClick={() => setOpen(false)}>{"\u00D7"}</button></header>
      <div className="sajra-chat-messages" aria-live="polite">
        {!messages.length ? <div className="sajra-chat-welcome"><span>{"\u2726"}</span><h3>Assalamo Alaikum</h3><p>I can help you explore the {appName} family tree. What would you like to know?</p><div className="sajra-chat-chips"><button type="button" onClick={() => setDraft("How do I search the family tree?")}>Search the tree</button><button type="button" onClick={() => setDraft("How many Hafiz, Maulanas, and engineers are in the tree?")}>Family counts</button><button type="button" onClick={() => setDraft("Who are the parents of ")}>Find parents</button><button type="button" onClick={() => setDraft("How are these family members related: ")}>Find a relationship</button><button type="button" onClick={() => setDraft("Tell me about Sajra")}>About Sajra</button></div></div> : messages.map((message, index) => <div key={index} className={`sajra-chat-message ${message.role}`}>{message.role === "assistant" ? <>{renderAssistantMessage(message.content)}{members.filter((member) => member.uniqueId && message.content.includes(member.uniqueId)).map((member) => { const father = members.find((candidate) => candidate.id === member.fatherId); const mother = members.find((candidate) => candidate.id === member.motherId); return <button key={member.id} type="button" className="sajra-chat-profile-card" onClick={() => { setOpen(false); onOpenMember(member.id); }}><strong>{member.name}</strong><span>{member.uniqueId}</span>{member.profession ? <small>{member.profession}</small> : null}{father || mother ? <small>{father ? "Father: " + father.name : ""}{father && mother ? " | " : ""}{mother ? "Mother: " + mother.name : ""}</small> : null}<small>View profile</small></button>; })}{message.role === "assistant" ? <><div className="sajra-chat-source">Family tree records</div><div className="sajra-chat-feedback" aria-label="Rate this answer"><span>Was this helpful?</span><button type="button" aria-label="Helpful" aria-pressed={message.feedback === "up"} disabled={Boolean(message.feedback)} onClick={() => void submitFeedback(index, message.content, true)}>Yes</button><button type="button" aria-label="Not helpful" aria-pressed={message.feedback === "down"} disabled={Boolean(message.feedback)} onClick={() => void submitFeedback(index, message.content, false)}>No</button>{message.feedbackSent ? <small>Thanks, feedback sent to the site admins.</small> : message.feedback ? <small>Sending feedback</small> : null}</div></> : null}</> : message.content}</div>)}
        {busy ? <div className="sajra-chat-message assistant sajra-chat-typing"><i/><i/><i/></div> : null}{error ? <p className="sajra-chat-error">{error}</p> : null}<div ref={bottomRef}/>
      </div>
      <div className="sajra-chat-settings"><label>Language<select value={responseLanguage} onChange={(event) => setResponseLanguage(event.target.value as "auto" | "en" | "hinglish" | "ur")}><option value="auto">Match my message</option><option value="en">English</option><option value="hinglish">Hinglish</option><option value="ur">Urdu</option></select></label><label>Answer<select value={answerLength} onChange={(event) => setAnswerLength(event.target.value as "concise" | "detailed")}><option value="concise">Short</option><option value="detailed">Detailed</option></select></label>{speechSynthesisSupported ? <>{speaking ? <button type="button" className="sajra-chat-voice-stop" onClick={stopSpeaking}>{"\u23f9\ufe0f Stop"}</button> : null}<button type="button" className={`sajra-chat-voice-toggle${readAloud ? " active" : ""}`} aria-pressed={readAloud} onClick={() => { setReadAloud((value) => !value); stopSpeaking(); }}>{readAloud ? "\ud83d\udd0a Read aloud" : "\ud83d\udd07 Read aloud"}</button></> : null}</div><form className="sajra-chat-form" onSubmit={(event) => void send(event)}>{micSupported ? <button type="button" className={`sajra-chat-mic-btn${listening ? " listening" : ""}`} style={listening ? { transform: `scale(${1 + micLevel * 0.3})` } : undefined} aria-label={listening ? "Stop listening" : "Speak your question"} aria-pressed={listening} onClick={() => void toggleListening()}><MicIcon /></button> : null}<textarea aria-label="Your message" placeholder={listening ? "Listening\u2026" : "Ask me anything\u2026"} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(event); } }} /><button type="submit" aria-label="Send message" disabled={!draft.trim() || busy}>{"\u2191"}</button></form>
      <div className="sajra-chat-footnote">AI can make mistakes. Avoid sharing private information.</div>
    </section> : null}
    <button type="button" className={`sajra-chat-launcher${open ? " active" : ""}`} aria-label={open ? "Close AI chat" : "Open AI chat"} onClick={() => setOpen((value) => !value)}>{open ? "\u00D7" : <><span>{"\u2726"}</span><span className="sajra-chat-launcher-label">Ask Anis Ai</span></>}</button>
  </div>;
}
