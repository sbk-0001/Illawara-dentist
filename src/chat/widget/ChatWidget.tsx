"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGE_OPTIONS } from "../language/catalog";
import { detectLanguage } from "../language/detect";
import type { ChatMetadata } from "../types";
import { deepgramListenUrl } from "../stt";
import { splitIsolatedEmbeds } from "./bidi";
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
      <bdi key={index} dir="ltr" className={styles.isolate}>
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
    finals: string;
  }>({ chunks: [], finals: "" });

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
    current.socket?.close();
    if (current.recorder && current.recorder.state !== "inactive") current.recorder.stop();
    current.stream?.getTracks().forEach((track) => track.stop());
    session.current = { chunks: [], finals: "" };
  }

  function captureRecording(): Promise<{ blob: Blob; hadSocket: boolean; finals: string }> {
    const current = session.current;
    const hadSocket = current.socket?.readyState === WebSocket.OPEN;
    const finals = current.finals.trim();
    const recorder = current.recorder;
    current.socket?.close();
    return new Promise((resolve) => {
      const finish = () => {
        const blob = new Blob(current.chunks, { type: current.chunks[0]?.type || "audio/webm" });
        current.stream?.getTracks().forEach((track) => track.stop());
        session.current = { chunks: [], finals: "" };
        resolve({ blob, hadSocket, finals });
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

  async function uploadFallback(blob: Blob) {
    setMic("transcribing");
    setMicNote("Transcribing…");
    try {
      const body = new FormData();
      body.set("audio", blob, "speech.webm");
      const response = await fetch("/api/chat/transcribe", { method: "POST", body });
      const payload = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !payload.transcript) {
        setMicNote(payload.error || "Could not transcribe that.");
        setMic("idle");
        return;
      }
      setInput((value) => (value ? `${value.trim()} ${payload.transcript}` : payload.transcript || ""));
      setMicNote("");
      setMic("idle");
    } catch {
      setMicNote("Could not transcribe that.");
      setMic("idle");
    }
  }

  async function toggleMic() {
    if (mic === "listening" || mic === "requesting") {
      const { blob, hadSocket, finals } = await captureRecording();
      if (!hadSocket && blob.size > 0) {
        await uploadFallback(blob);
        return;
      }
      if (finals) setInput((value) => (value ? `${value.trim()} ${finals}` : finals));
      setMic("idle");
      setMicNote("");
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
    session.current.finals = "";

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    session.current.recorder = recorder;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) session.current.chunks.push(event.data);
      if (session.current.socket?.readyState === WebSocket.OPEN) session.current.socket.send(event.data);
    });
    recorder.start(250);

    try {
      const tokenResponse = await fetch("/api/chat/stt-token", { method: "POST" });
      if (!tokenResponse.ok) throw new Error("token");
      const token = (await tokenResponse.json()) as { access_token?: string };
      if (!token.access_token) throw new Error("token");
      const socket = new WebSocket(
        deepgramListenUrl("stream"),
        ["bearer", token.access_token],
      );
      session.current.socket = socket;
      const opened = await new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 2500);
        socket.addEventListener("open", () => {
          window.clearTimeout(timer);
          resolve(true);
        });
        socket.addEventListener("error", () => {
          window.clearTimeout(timer);
          resolve(false);
        });
      });
      if (!opened) throw new Error("socket");
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            is_final?: boolean;
            channel?: { alternatives?: { transcript?: string }[] };
          };
          const transcript = payload.channel?.alternatives?.[0]?.transcript?.trim() || "";
          if (!transcript) return;
          if (payload.is_final) {
            session.current.finals = `${session.current.finals} ${transcript}`.trim();
            setInput(session.current.finals);
          } else {
            const live = `${session.current.finals} ${transcript}`.trim();
            setInput(live);
          }
        } catch {
          // Ignore non-JSON socket frames.
        }
      });
      setMic("listening");
      setMicNote("Listening…");
    } catch {
      setMic("listening");
      setMicNote("Listening… will transcribe when you stop");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    clearError();
    await sendMessage({ text });
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
                      {message.metadata.sources.map((source) => (
                        <a key={source.url} className={styles.source} href={source.url} target="_blank" rel="noreferrer" data-testid="chat-source">
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
                onChange={(event) => setInput(event.target.value)}
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
