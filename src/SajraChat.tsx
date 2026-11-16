import React, { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { getSupabaseClient } from "./supabase";
import { appSpeech } from "./AppUpdater";
import { t } from "./i18n";
import type { Member, Language } from "./types";

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

export default function SajraChat({ appName, language, members, onOpenMember, onFeedback }: { appName: string; language: Language; members: Member[]; onOpenMember: (memberId: number) => void; onFeedback: (answer: string, helpful: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answerLength, setAnswerLength] = useState<"concise" | "detailed">("concise");
  const [responseLanguage, setResponseLanguage] = useState<"auto" | "en" | "hinglish" | "ur">(language === "ur" ? "ur" : "auto");
  // Follows the app's own language toggle so switching to Urdu also switches the chat's reply
  // language without the user having to pick it again in the settings dropdown below.
  useEffect(() => {
    setResponseLanguage(language === "ur" ? "ur" : "auto");
  }, [language]);
  const [readAloud, setReadAloud] = useState(true);
  const [listening, setListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [nativeSpeechAvailable, setNativeSpeechAvailable] = useState<boolean | null>(null);
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
  // Keep the mic visible in the APK even when Android has no speech provider enabled yet.
  // The plugin can request permission and the button can show a useful error on tap.
  const micSupported = isNative || webSpeechRecognitionSupported;
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
    setError("");

    if (isNative) {
      if (nativeSpeechAvailable === false) {
        setError(t(language, "chatVoiceUnavailableError"));
        return;
      }
      try {
        await appSpeech.start({ language: speechLangFor(responseLanguage) });
        setListening(true);
      } catch (error) {
        setListening(false);
        setError(error instanceof Error ? error.message : t(language, "chatMicPermissionError"));
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
      setError(t(language, "chatFeedbackFailed"));
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    const supabase = getSupabaseClient();
    if (!text || busy) return;
    if (!supabase) { setError(t(language, "chatNotConfiguredError")); return; }
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setDraft(""); setBusy(true); setError("");
    try {
      const familyMembers = members.map(({ id, uniqueId, name, nameUr, gender, profession, fatherId, motherId, spouseIds, daughtersCount }) => ({ id, uniqueId, name, nameUr, gender, profession, fatherId, motherId, spouseIds, daughtersCount: daughtersCount ?? undefined }));
      const { data, error: invokeError } = await supabase.functions.invoke("sajra-chat", { body: { messages: next.slice(-6), appName, familyMembers, answerLength, responseLanguage } });
      if (invokeError) throw invokeError;
      if (typeof data?.reply !== "string") throw new Error(t(language, "chatNoAnswerError"));
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (err) {
      if (err instanceof FunctionsHttpError) {
        try {
          const body = await err.context.clone().json();
          setError(typeof body?.error === "string" ? body.error : err.message);
        } catch { setError(err.message); }
      } else {
        setError(err instanceof Error ? err.message : t(language, "chatUnreachableError"));
      }
    }
    finally { setBusy(false); setTimeout(scrollToBottom, 20); }
  }

  return <div className="sajra-chat-widget">
    {open ? <section className="sajra-chat-panel" aria-label={t(language, "chatAriaLabel")}>
      <header className="sajra-chat-header"><span className="sajra-chat-avatar">{"\u2726"}</span><div><strong>{t(language, "chatTitle")}</strong></div><button type="button" className="sajra-chat-close" aria-label={t(language, "chatCloseAriaLabel")} onClick={() => setOpen(false)}>{"\u00D7"}</button></header>
      <div className="sajra-chat-messages" aria-live="polite">
        {!messages.length ? <div className="sajra-chat-welcome"><span>{"\u2726"}</span><h3>{t(language, "chatGreeting")}</h3><p>{t(language, "chatWelcomeMessage").replace("{appName}", appName)}</p><div className="sajra-chat-chips"><button type="button" onClick={() => setDraft(t(language, "chatSearchTreeQuestion"))}>{t(language, "chatChipSearchTree")}</button><button type="button" onClick={() => setDraft(t(language, "chatChipFamilyCountsQuestion"))}>{t(language, "chatChipFamilyCounts")}</button><button type="button" onClick={() => setDraft(t(language, "chatChipFindParentsQuestion"))}>{t(language, "chatChipFindParents")}</button><button type="button" onClick={() => setDraft(t(language, "chatChipFindRelationshipQuestion"))}>{t(language, "chatChipFindRelationship")}</button><button type="button" onClick={() => setDraft(t(language, "chatChipAboutSajraQuestion"))}>{t(language, "chatChipAboutSajra")}</button></div></div> : messages.map((message, index) => <div key={index} className={`sajra-chat-message ${message.role}`}>{message.role === "assistant" ? <>{renderAssistantMessage(message.content)}{members.filter((member) => member.uniqueId && message.content.includes(member.uniqueId)).map((member) => { const father = members.find((candidate) => candidate.id === member.fatherId); const mother = members.find((candidate) => candidate.id === member.motherId); return <button key={member.id} type="button" className="sajra-chat-profile-card" onClick={() => { setOpen(false); onOpenMember(member.id); }}><strong>{member.name}</strong><span>{member.uniqueId}</span>{member.profession ? <small>{member.profession}</small> : null}{father || mother ? <small>{father ? `${t(language, "chatFatherPrefix")} ${father.name}` : ""}{father && mother ? " | " : ""}{mother ? `${t(language, "chatMotherPrefix")} ${mother.name}` : ""}</small> : null}<small>{t(language, "viewProfile")}</small></button>; })}{message.role === "assistant" ? <><div className="sajra-chat-source">{t(language, "chatSourceLabel")}</div><div className="sajra-chat-feedback" aria-label={t(language, "chatRateAnswerAriaLabel")}><span>{t(language, "chatWasHelpfulLabel")}</span><button type="button" aria-label={t(language, "chatHelpfulAriaLabel")} aria-pressed={message.feedback === "up"} disabled={Boolean(message.feedback)} onClick={() => void submitFeedback(index, message.content, true)}>{t(language, "chatYesLabel")}</button><button type="button" aria-label={t(language, "chatNotHelpfulAriaLabel")} aria-pressed={message.feedback === "down"} disabled={Boolean(message.feedback)} onClick={() => void submitFeedback(index, message.content, false)}>{t(language, "chatNoLabel")}</button>{message.feedbackSent ? <small>{t(language, "chatFeedbackThanks")}</small> : message.feedback ? <small>{t(language, "chatFeedbackSending")}</small> : null}</div></> : null}</> : message.content}</div>)}
        {busy ? <div className="sajra-chat-message assistant sajra-chat-typing"><i/><i/><i/></div> : null}{error ? <p className="sajra-chat-error">{error}</p> : null}<div ref={bottomRef}/>
      </div>
      <div className="sajra-chat-settings"><label>{t(language, "chatLanguageLabel")}<select value={responseLanguage} onChange={(event) => setResponseLanguage(event.target.value as "auto" | "en" | "hinglish" | "ur")}><option value="auto">{t(language, "chatLangAuto")}</option><option value="en">{t(language, "chatLangEnglish")}</option><option value="hinglish">{t(language, "chatLangHinglish")}</option><option value="ur">{t(language, "chatLangUrdu")}</option></select></label><label>{t(language, "chatAnswerLabel")}<select value={answerLength} onChange={(event) => setAnswerLength(event.target.value as "concise" | "detailed")}><option value="concise">{t(language, "chatAnswerShort")}</option><option value="detailed">{t(language, "chatAnswerDetailed")}</option></select></label>{speechSynthesisSupported ? <>{speaking ? <button type="button" className="sajra-chat-voice-stop" onClick={stopSpeaking}>{t(language, "chatStopSpeakingLabel")}</button> : null}<button type="button" className={`sajra-chat-voice-toggle${readAloud ? " active" : ""}`} aria-pressed={readAloud} onClick={() => { setReadAloud((value) => !value); stopSpeaking(); }}>{readAloud ? t(language, "chatReadAloudOnLabel") : t(language, "chatReadAloudOffLabel")}</button></> : null}</div><form className="sajra-chat-form" onSubmit={(event) => void send(event)}>{micSupported ? <button type="button" className={`sajra-chat-mic-btn${listening ? " listening" : ""}`} style={listening ? { transform: `scale(${1 + micLevel * 0.3})` } : undefined} aria-label={listening ? t(language, "chatStopListeningAriaLabel") : t(language, "chatSpeakQuestionAriaLabel")} aria-pressed={listening} onClick={() => void toggleListening()}><MicIcon /></button> : null}<textarea aria-label={t(language, "chatYourMessageAriaLabel")} placeholder={listening ? t(language, "chatListeningPlaceholder") : t(language, "chatAskPlaceholder")} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(event); } }} /><button type="submit" aria-label={t(language, "chatSendMessageAriaLabel")} disabled={!draft.trim() || busy}>{"\u2191"}</button></form>
      <div className="sajra-chat-footnote">{t(language, "chatDisclaimer")}</div>
    </section> : null}
    {!open ? <button type="button" className="sajra-chat-launcher" aria-label={t(language, "chatOpenAriaLabel")} onClick={() => setOpen(true)}><span>{"\u2726"}</span><span className="sajra-chat-launcher-label">{t(language, "chatLauncherLabel")}</span></button> : null}
  </div>;
}
