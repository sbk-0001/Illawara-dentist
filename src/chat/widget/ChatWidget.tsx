"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGE_OPTIONS } from "../language/catalog";
import { detectLanguage } from "../language/detect";
import type { ChatMetadata } from "../types";
import { alternativeFromLiveResult, correctTranscript, deepgramListenUrl, formatLiveDrop, interimMicLanguage, majoritySpokenLanguage, micListeningNote, spokenLanguageAtSubmit, spokenLanguageForTranscript, transcriptNeedsRepair, votesFromAlternative, type DeepgramAlternative } from "../stt";
import { splitIsolatedEmbeds } from "./bidi";
import { createMicAudioQueue, enqueueMicAudio, flushMicAudio, shouldUploadRecording, type MicAudioQueue } from "./mic-audio";
import { dedupeSourceChips } from "./sources";
import { voiceDraftStillApplies, type VoiceDraft } from "./voice-draft";
import styles from "./ChatWidget.module.css";

export type ClinicUIMessage = UIMessage<ChatMetadata>;

type MicState = "idle" | "requesting" | "listening" | "transcribing" | "unavailable";

type ChatWidgetProps = {
  api?: string;
  initialMessages?: ClinicUIMessage[];
  defaultOpen?: boolean;
};

function textOf(message: ClinicUIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("").trim();
}

function MessageText({ text }: { text: string }) {
  return splitIsolatedEmbeds(text).map((part, index) =>
    part.kind === "isolate" ? (
      <bdi key={index} dir="ltr" className={part.embed === "url" ? styles.isolateUrl : styles.isolatePhone}>
        {part.value}
      </bdi>
    ) : (
      <span key={index}>{part.value}</span>
    ),
  );
}

function ensureFonts() {
  if (typeof document === "undefined") return;
  if (document.querySelector("link[data-illawarra-chat-fonts]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@420;500;600;700&display=swap";
  link.setAttribute("data-illawarra-chat-fonts", "true");
  document.head.appendChild(link);
}

export function ChatWidget({ api = "/api/chat", initialMessages, defaultOpen = false }: ChatWidgetProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("auto");
  const [mic, setMic] = useState<MicState>("idle");
  const [micNote, setMicNote] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const session = useRef<{
    stream?: MediaStream;
    recorder?: MediaRecorder;
    socket?: WebSocket;
    chunks: Blob[];
    audio: MicAudioQueue;
    finals: string;
    langVotes: string[];
    spokenLanguage: string;
    interimLanguage: string;
    liveDrop: string;
    ignoreClose: boolean;
    generation: number;
  }>({ chunks: [], audio: createMicAudioQueue(), finals: "", langVotes: [], spokenLanguage: "", interimLanguage: "", liveDrop: "", ignoreClose: false, generation: 0 });
  const voiceRequest = useRef<VoiceDraft | null>(null);
  const draftGeneration = useRef(0);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ClinicUIMessage>({
        api,
        body: { language },
      }),
    [api, language],
  );

  const { messages, sendMessage, status, error, clearError } = useChat<ClinicUIMessage>({
    transport,
    messages: initialMessages,
  });

  useEffect(() => {
    ensureFonts();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const typed = input.trim();
  const activeCode = language !== "auto" ? language : detectLanguage(typed || (lastUser ? textOf(lastUser) : "")).code;
  const dir = LANGUAGE_OPTIONS.find((option) => option.code === activeCode)?.dir || "ltr";
  const busy = status === "submitted" || status === "streaming";

  function releaseMic() {
    const current = session.current;
    current.ignoreClose = true;
    current.socket?.close();
    if (current.recorder && current.recorder.state !== "inactive") current.recorder.stop();
    current.stream?.getTracks().forEach((track) => track.stop());
    session.current = { chunks: [], audio: createMicAudioQueue(), finals: "", langVotes: [], spokenLanguage: "", interimLanguage: "", liveDrop: "", ignoreClose: false, generation: draftGeneration.current };
  }

  function staleDraft(): boolean {
    return session.current.generation !== draftGeneration.current;
  }

  function bindVoice(transcript: string, heard: string) {
    if (staleDraft()) return;
    const spoken = spokenLanguageForTranscript(heard, transcript, preferredSpeechLanguage()) || "";
    voiceRequest.current = { transcript, spokenLanguage: spoken, liveDrop: session.current.liveDrop };
    setInput(transcript);
    const note = interimMicLanguage(undefined, transcript) || heard;
    setMicNote(note ? micListeningNote(note) : "Listening…");
  }

  function preferredSpeechLanguage(): string | null {
    if (language !== "auto") return language;
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (lastAssistant?.metadata?.language) return lastAssistant.metadata.language;
    if (lastUser) return detectLanguage(textOf(lastUser)).code;
    return null;
  }

  function captureRecording(): Promise<{ blob: Blob; hadSocket: boolean; finals: string; spokenLanguage: string; liveDrop: string }> {
    const current = session.current;
    const hadSocket = current.socket?.readyState === WebSocket.OPEN;
    const finals = current.finals.trim();
    const heard = majoritySpokenLanguage(current.langVotes) || current.interimLanguage || current.spokenLanguage;
    const spokenLanguage = spokenLanguageForTranscript(heard, finals, preferredSpeechLanguage()) || "";
    const liveDrop = current.liveDrop;
    const recorder = current.recorder;
    current.ignoreClose = true;
    current.socket?.close();
    return new Promise((resolve) => {
      const finish = () => {
        const blob = new Blob(current.chunks, { type: current.chunks[0]?.type || "audio/webm" });
        current.stream?.getTracks().forEach((track) => track.stop());
        session.current = { chunks: [], audio: createMicAudioQueue(), finals: "", langVotes: [], spokenLanguage: "", interimLanguage: "", liveDrop: "", ignoreClose: false, generation: draftGeneration.current };
        resolve({ blob, hadSocket, finals, spokenLanguage, liveDrop });
      };
      if (!recorder || recorder.state === "inactive") {
        finish();
        return;
      }
      recorder.addEventListener("stop", finish, { once: true });
      if (recorder.state === "recording") recorder.requestData();
      recorder.stop();
    });
  }

  useEffect(() => () => releaseMic(), []);

  async function uploadFallback(blob: Blob, liveDrop: string, priorSpoken: string): Promise<boolean> {
    const generation = draftGeneration.current;
    setMic("transcribing");
    setMicNote("Transcribing…");
    const abandoned = () => draftGeneration.current !== generation;
    const finishNote = (note: string) => {
      if (abandoned()) {
        setMicNote("");
        setMic("idle");
        return;
      }
      setMicNote(note);
      setMic("idle");
    };
    try {
      const hint = preferredSpeechLanguage();
      const body = new FormData();
      body.set("audio", blob, "speech.webm");
      if (hint) body.set("languageHint", hint);
      if (liveDrop) body.set("liveDrop", liveDrop);
      const response = await fetch("/api/chat/transcribe", { method: "POST", body });
      const payload = (await response.json()) as { transcript?: string; language?: string; error?: string };
      if (abandoned()) {
        setMicNote("");
        setMic("idle");
        return false;
      }
      if (!response.ok || !payload.transcript) {
        finishNote(payload.error || "Could not transcribe that.");
        return false;
      }
      const transcript = correctTranscript(payload.transcript);
      const spoken = spokenLanguageAtSubmit({
        interim: payload.language,
        draft: priorSpoken,
        text: transcript,
        hint,
      });
      voiceRequest.current = { transcript, spokenLanguage: spoken, liveDrop };
      setInput(transcript);
      const note = interimMicLanguage(undefined, transcript) || spoken;
      finishNote(note ? micListeningNote(note) : "Listening…");
      return true;
    } catch {
      if (abandoned()) {
        setMicNote("");
        setMic("idle");
        return false;
      }
      finishNote("Could not transcribe that.");
      return false;
    }
  }

  async function toggleMic() {
    if (mic === "listening" || mic === "requesting") {
      const generation = draftGeneration.current;
      const { blob, hadSocket, finals, spokenLanguage, liveDrop } = await captureRecording();
      if (draftGeneration.current !== generation) {
        setMic("idle");
        setMicNote("");
        return;
      }
      if (finals) {
        voiceRequest.current = { transcript: finals, spokenLanguage, liveDrop };
        setInput(finals);
      }
      const needsRepair = Boolean(finals && transcriptNeedsRepair(spokenLanguage, finals, preferredSpeechLanguage()));
      if (shouldUploadRecording({ byteLength: blob.size, transcript: finals, socketOpened: hadSocket, needsRepair })) {
        const uploaded = await uploadFallback(blob, liveDrop, spokenLanguage);
        if (uploaded || !finals) return;
      }
      if (draftGeneration.current !== generation) {
        setMic("idle");
        setMicNote("");
        return;
      }
      if (finals) {
        bindVoice(finals, spokenLanguage);
      } else {
        voiceRequest.current = null;
        setMicNote("");
      }
      setMic("idle");
      return;
    }

    setMic("requesting");
    setMicNote("Starting microphone…");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMic("unavailable");
      setMicNote("Microphone unavailable");
      return;
    }
    session.current.stream = stream;
    session.current.chunks = [];
    session.current.audio = createMicAudioQueue();
    session.current.finals = "";
    session.current.langVotes = [];
    session.current.spokenLanguage = "";
    session.current.interimLanguage = "";
    session.current.liveDrop = "";
    session.current.ignoreClose = false;
    session.current.generation = draftGeneration.current;
    voiceRequest.current = null;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    session.current.recorder = recorder;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size <= 0) return;
      session.current.chunks.push(event.data);
      enqueueMicAudio(session.current.audio, event.data, (chunk) => {
        const socket = session.current.socket;
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(chunk);
      });
    });
    recorder.start(250);

    try {
      const tokenResponse = await fetch("/api/chat/stt-token", { method: "POST" });
      if (!tokenResponse.ok) throw new Error("token");
      const token = (await tokenResponse.json()) as { access_token?: string };
      if (!token.access_token) throw new Error("token");
      const speechLanguage = preferredSpeechLanguage();
      const socket = new WebSocket(
        deepgramListenUrl("stream", speechLanguage),
        ["bearer", token.access_token],
      );
      session.current.socket = socket;
      const opened = await new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 2500);
        socket.addEventListener("open", () => {
          window.clearTimeout(timer);
          if (session.current.socket === socket) {
            flushMicAudio(session.current.audio, (chunk) => {
              if (socket.readyState === WebSocket.OPEN) socket.send(chunk);
            });
          }
          resolve(true);
        });
        socket.addEventListener("error", () => {
          window.clearTimeout(timer);
          resolve(false);
        });
      });
      if (!opened) throw new Error("socket");
      socket.addEventListener("error", () => {
        if (session.current.socket !== socket || session.current.ignoreClose) return;
        if (!session.current.liveDrop) session.current.liveDrop = formatLiveDrop({ fallback: "socket-error" });
      });
      socket.addEventListener("close", (event) => {
        if (session.current.socket !== socket || session.current.ignoreClose) return;
        session.current.liveDrop = formatLiveDrop({ code: event.code, reason: event.reason, wasClean: event.wasClean });
      });
      socket.addEventListener("message", (event) => {
        if (session.current.socket !== socket) return;
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            is_final?: boolean;
            channel?: { alternatives?: DeepgramAlternative[]; detected_language?: string; languages?: unknown[] };
          };
          const alternative = alternativeFromLiveResult({
            alternative: payload.channel?.alternatives?.[0],
            detectedLanguage: payload.channel?.detected_language,
            channelLanguages: payload.channel?.languages,
          });
          const transcript = alternative?.transcript?.trim() || "";
          if (staleDraft()) return;
          const heardNow = interimMicLanguage(alternative, transcript);
          const deepgram = majoritySpokenLanguage(votesFromAlternative(alternative));
          if (deepgram) session.current.interimLanguage = deepgram;
          else if (heardNow) session.current.interimLanguage = heardNow;
          if (heardNow || session.current.interimLanguage) {
            setMicNote(micListeningNote(heardNow || session.current.interimLanguage));
          }
          if (!transcript) return;
          const hint = preferredSpeechLanguage();
          if (payload.is_final) {
            session.current.langVotes.push(...votesFromAlternative(alternative));
            const spoken = majoritySpokenLanguage(session.current.langVotes);
            if (spoken) session.current.spokenLanguage = spoken;
            session.current.finals = correctTranscript(`${session.current.finals} ${transcript}`.trim());
            const resolved = spokenLanguageForTranscript(spoken || heardNow || session.current.interimLanguage, session.current.finals, hint) || "";
            if (staleDraft()) return;
            voiceRequest.current = { transcript: session.current.finals, spokenLanguage: resolved, liveDrop: session.current.liveDrop };
            setInput(session.current.finals);
          } else {
            const shown = correctTranscript(`${session.current.finals} ${transcript}`.trim());
            const resolved = spokenLanguageForTranscript(heardNow || session.current.interimLanguage, shown, hint) || "";
            if (staleDraft()) return;
            voiceRequest.current = { transcript: shown, spokenLanguage: resolved, liveDrop: session.current.liveDrop };
            setInput(shown);
          }
          if (!heardNow && !session.current.interimLanguage) setMicNote("Listening…");
        } catch {
          // Ignore non-JSON socket frames.
        }
      });
      setMic("listening");
      setMicNote((current) => (current && current !== "Starting microphone…" ? current : "Listening…"));
    } catch {
      if (!session.current.liveDrop) session.current.liveDrop = formatLiveDrop({ fallback: "open-failed" });
      setMic("listening");
      setMicNote("Listening… will transcribe when you stop");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const voice = voiceRequest.current;
    const useVoice = Boolean(voice && voiceDraftStillApplies(voice, text));
    const hint = preferredSpeechLanguage();
    const spoken = useVoice
      ? spokenLanguageAtSubmit({
          votes: session.current.langVotes,
          interim: session.current.interimLanguage,
          draft: voice?.spokenLanguage,
          text,
          hint,
        })
      : "";
    const liveDrop = voice?.liveDrop || "";
    draftGeneration.current += 1;
    releaseMic();
    setMic("idle");
    setInput("");
    clearError();
    setMicNote("");
    try {
      await sendMessage(
        { text },
        {
          body: useVoice
            ? {
                inputMode: "voice" as const,
                ...(spoken ? { spokenLanguage: spoken } : {}),
                ...(liveDrop ? { liveDrop } : {}),
              }
            : { inputMode: "text" as const },
        },
      );
    } catch {
      setMicNote("");
    } finally {
      voiceRequest.current = null;
      setInput("");
      setMicNote("");
    }
  }

  return (
    <>
      <button type="button" className={styles.launcher} aria-expanded={open} data-testid="chat-launcher" onClick={() => setOpen((value) => !value)}>
        <span className={styles.launcherMark} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H12l-4.2 3.2c-.7.5-1.8 0-1.8-.9V16h-.5A3.5 3.5 0 0 1 2 12.5v-6A3.5 3.5 0 0 1 5.5 3" stroke="currentColor" strokeWidth="1.8" transform="translate(1.2 1)" />
          </svg>
        </span>
        {open ? "Close chat" : "Ask the clinics"}
      </button>
      {open ? (
        <section className={styles.panel} role="dialog" aria-label="Illawarra Dentists chat" dir={dir} data-testid="chat-panel">
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Care beyond the chair</p>
              <h2 className={styles.title}>Illawarra Dentists</h2>
              <p className={styles.clinics}>Woonona · Dapto · Shellharbour</p>
            </div>
            <button type="button" className={styles.close} aria-label="Close chat" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <div className={styles.log}>
            {messages.length === 0 ? (
              <p className={styles.welcome}>
                Ask about services, fees, health funds, hours or a visit. Answers come only from the three clinic websites, in the language you use.
              </p>
            ) : null}
            {messages.map((message) => {
              const text = textOf(message);
              if (!text) return null;
              const messageDir = message.role === "user" ? detectLanguage(text).dir : message.metadata?.dir || dir;
              return (
                <article key={message.id} className={`${styles.bubble} ${message.role === "user" ? styles.user : styles.assistant}`} dir={messageDir}>
                  <MessageText text={text} />
                  {message.role === "assistant" && message.metadata?.sources?.length ? (
                    <div className={styles.sources}>
                      {dedupeSourceChips(message.metadata.sources).map((source) => (
                        <a key={`${source.url} ${source.title}`} className={styles.source} href={source.url} target="_blank" rel="noreferrer" data-testid="chat-source">
                          {source.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <form className={styles.composer} onSubmit={onSubmit}>
            <div className={styles.row}>
              <textarea
                className={styles.input}
                data-testid="chat-input"
                rows={2}
                dir={dir}
                value={input}
                placeholder="Type in any language"
                aria-label="Message"
                onChange={(event) => {
                  const next = event.target.value;
                  const voice = voiceRequest.current;
                  if (voice && !voiceDraftStillApplies(voice, next)) {
                    voiceRequest.current = null;
                    setMicNote("");
                  }
                  setInput(next);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="button"
                className={styles.mic}
                data-testid="chat-mic"
                data-mic={mic}
                aria-pressed={mic === "listening"}
                aria-label={mic === "listening" ? "Stop listening" : mic === "unavailable" ? "Microphone unavailable" : "Speak"}
                disabled={mic === "transcribing"}
                onClick={() => void toggleMic()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <button className={styles.send} type="submit" disabled={busy || !input.trim()} aria-label="Send">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className={styles.tools}>
              <label>
                <span className={styles.srOnly}>Reply language</span>
                <select className={styles.picker} data-testid="chat-language" aria-label="Reply language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="auto">Auto</option>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className={styles.status} data-testid="chat-mic-note">
                {micNote || (busy ? "Answering…" : "Text replies only")}
              </p>
            </div>
            {error ? <p className={styles.error}>{error.message || "The assistant could not answer just now."}</p> : null}
          </form>
        </section>
      ) : null}
    </>
  );
}
