import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { z } from "zod";
import { clinicContextText, clinicFocus, isSevereEmergency, mentionedClinics } from "../intent";
import { addressFocus } from "./address";
import { confidentIndonesian, detectLanguage, hasLetters, isDictionaryEnglish, resolveReplyLanguage, romanisedIndic } from "../language/detect";
import { latinManglish, malayalamMarkersWin } from "../language/indic";
import { languageFromNativeScript, normalizeSpokenLanguage, requiresNativeScript, spokenLanguageForTranscript } from "../stt";
import { languageOption, replyFromOption } from "../language/catalog";
import { hybridRetrieveDetailed } from "../retrieval/embeddings";
import { searchIndex, sourcesFromChunks } from "../retrieval/search";
import type { ChatMetadata, KnowledgeIndex, ReplyLanguage } from "../types";
import { attachContactFooter, contactFooter, contactRouteFooter, replyHasContactRoute, retrievalHasAnswer, sharesClinicOrService, topicShareText } from "./contacts";
import { guardRequest, withCors } from "./guard";
import { attachHoursWording, hoursRelevant } from "./hours";
import { attachContactLabels } from "./label-fix";
import { getKnowledgeIndex } from "./index-store";
import { buildInstructions, scriptRetryInstruction } from "./prompt";
import { attachScriptFix } from "./script-fix";
import type { StatusTag } from "./status-tag";
import { tryAgainMessage } from "./system-text";
import { FIRST_TOKEN_TIMEOUT_MS, OVERALL_DEADLINE_MS, chatGenerationSettings, createRetryingTextStream, firstTokenBudget, type ChatTimingEvent } from "./stream-timing";
import { SCRIPT_CONVERT_TIMEOUT_MS, rewriteTranscriptScript } from "./transcript-repair";

export const maxDuration = 60;
export const runtime = "nodejs";

export type ClinicUIMessage = UIMessage<ChatMetadata>;

const bodySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1).max(24),
  language: z.string().max(32).optional(),
  inputMode: z.enum(["voice", "text"]).optional(),
  spokenLanguage: z.string().max(32).optional(),
  liveDrop: z.string().max(160).optional(),
});

function cleanLiveDrop(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  return cleaned || undefined;
}

export type VoiceTurn = {
  inputMode?: "voice" | "text";
  spokenLanguage?: string;
};

/** The English regeneration sees only this user turn, so a Bengali answer cannot continue. */
export function messagesForScriptRetry<T extends { role?: string }>(messages: T[], code: string, scriptRetry: boolean): T[] {
  if (!scriptRetry || code !== "en") return messages;
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  return lastUser ? [lastUser] : messages;
}

/** Drop earlier assistant text when this turn's language is different, so the model cannot continue it. */
export function messagesAfterLanguageSwitch<T extends { role?: string; parts?: unknown; content?: unknown; metadata?: { language?: string } }>(
  messages: T[],
  replyCode: string,
): T[] {
  const normalized = normalizeSpokenLanguage(replyCode) || replyCode;
  let prior: string | null = null;
  for (let i = messages.length - 2; i >= 0; i -= 1) {
    if (messages[i]?.role !== "assistant") continue;
    prior = normalizeSpokenLanguage(messages[i]?.metadata?.language);
    if (prior) break;
  }
  if (!prior || prior === normalized) return messages;
  const note = `The visitor has switched to ${normalized}. Earlier replies were in ${prior} and do not decide this answer.`;
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    return { ...message, parts: [{ type: "text", text: note }], content: note };
  });
}

export function messageText(message: { parts?: unknown; content?: unknown }): string {
  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as { type?: string; text?: string };
        return record.type === "text" && typeof record.text === "string" ? record.text : "";
      })
      .join("\n")
      .trim();
  }
  return typeof message.content === "string" ? message.content.trim() : "";
}

function replaceLastUserText<T extends { role?: string; parts?: unknown; content?: unknown }>(messages: T[], from: string, to: string): T[] {
  let replaced = false;
  const next = messages.map((message) => ({ ...message }));
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const message = next[i];
    if (!message || message.role !== "user" || replaced) continue;
    if (messageText(message) !== from) continue;
    replaced = true;
    next[i] = { ...message, content: to, parts: [{ type: "text", text: to }] };
  }
  return next;
}

function userTexts(messages: { role?: string; parts?: unknown; content?: unknown }[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => messageText(message).trim())
    .filter(Boolean);
}

function priorReplyLanguage(messages: { role?: string; metadata?: { language?: string } }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role !== "assistant") continue;
    const code = normalizeSpokenLanguage(messages[i]?.metadata?.language);
    if (code && code !== "en") return code;
  }
  return null;
}

/** An earlier turn already committed to a language other than English. */
function priorNonEnglishTurn(messages: { role?: string; parts?: unknown; content?: unknown; metadata?: { language?: string } }[]): boolean {
  const earlier = messages.slice(0, -1);
  for (const message of earlier) {
    if (message.role === "assistant") {
      const code = normalizeSpokenLanguage(message.metadata?.language);
      if (code && code !== "en") return true;
      continue;
    }
    if (message.role !== "user") continue;
    const detected = detectLanguage(messageText(message));
    if (detected.code !== "en" && detected.code !== "und" && !detected.fallback) return true;
  }
  return false;
}

/** "Woonona phone?" is real Latin and too short for the detector to name. */
function shortUnidentifiedLatin(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (/[^\sA-Za-z0-9?.!',-]/.test(trimmed)) return false;
  const tokens = trimmed.match(/[A-Za-z]{2,}/g) ?? [];
  return tokens.length > 0 && tokens.length <= 3;
}

/** Follow-up location questions keep the clinic named in a recent turn, without replacing the latest wording. */
export function retrievalQuery(latest: string, prior: string[]): string {
  const context = clinicContextText([...prior, latest]);
  if (context === latest) return latest;
  const names = mentionedClinics(context);
  return names.length ? `${names.join(" ")} ${latest}`.trim() : latest;
}

export function prepareTurn(
  messages: { role?: string; parts?: unknown; content?: unknown; metadata?: { language?: string } }[],
  language: string | undefined,
  index: KnowledgeIndex,
  voice?: VoiceTurn,
) {
  const turns = userTexts(messages);
  const text = (turns[turns.length - 1] || "").slice(0, 4000);
  const query = retrievalQuery(text, turns.slice(0, -1)).slice(0, 4000);
  const textDetection = detectLanguage(text);
  let reply: ReplyLanguage = resolveReplyLanguage(text, language);
  const inputMode: "voice" | "text" = voice?.inputMode === "voice" ? "voice" : "text";
  const pickerLocked = Boolean(language && language !== "auto" && languageOption(language));
  const romanToNative: Record<string, string> = {
    "bn-Latn": "bn",
    "hi-Latn": "hi",
    "ml-Latn": "ml",
    "ta-Latn": "ta",
    "ar-Latn": "ar",
    "zh-Latn": "zh",
  };
  let spokenLanguage = inputMode === "voice"
    ? spokenLanguageForTranscript(voice?.spokenLanguage, text, null, pickerLocked ? language : null)
    : null;
  if (inputMode === "voice" && !pickerLocked) {
    const scriptCode = languageFromNativeScript(text);
    if (scriptCode) spokenLanguage = scriptCode;
    else if (textDetection.code === "id" && !confidentIndonesian(text)) spokenLanguage = null;
    else if (textDetection.code !== "und" && !textDetection.fallback) {
      spokenLanguage = romanToNative[textDetection.code] || textDetection.code;
    }
    if (malayalamMarkersWin(text) || latinManglish(text)) spokenLanguage = "ml";
    if (spokenLanguage === "id" && !confidentIndonesian(text)) spokenLanguage = null;
  }
  // A picker locks the reply. Auto voice uses this utterance's script or its own
  // spoken language. An earlier turn may break a typed Banglish/Hinglish tie only.
  const english = languageOption("en");
  if (!pickerLocked && inputMode !== "voice" && english && isDictionaryEnglish(text)) {
    reply = replyFromOption(english, "detected", false);
  } else if (!pickerLocked && inputMode !== "voice" && reply.code === "und" && textDetection.code === "und") {
    const romanised = romanisedIndic(text);
    const prior = priorReplyLanguage(messages);
    const priorNative = prior === "bn" || prior === "bn-Latn" ? "bn" : prior === "hi" || prior === "hi-Latn" ? "hi" : null;
    const romanFollow = romanised === "bn-Latn" ? "bn" : romanised === "hi-Latn" ? "hi" : null;
    const follow = romanFollow && priorNative === romanFollow ? languageOption(romanFollow) : null;
    if (follow) reply = replyFromOption(follow, "detected", false);
    else if (shortUnidentifiedLatin(text) && !spokenLanguage && !priorNonEnglishTurn(messages) && english) {
      reply = replyFromOption(english, "detected", false);
    }
  }
  if (!pickerLocked && romanToNative[reply.code]) {
    const native = languageOption(romanToNative[reply.code] || "");
    if (native) reply = replyFromOption(native, "detected", false);
  }
  const softText = textDetection.code === "en" || textDetection.code === "und" || textDetection.fallback || textDetection.script === "Latin";
  let langOverride = false;
  if (!pickerLocked && (reply.code === "id" || spokenLanguage === "id") && !confidentIndonesian(text)) {
    const englishReply = languageOption("en");
    if (textDetection.code === "es" && languageOption("es")) reply = replyFromOption(languageOption("es")!, "detected", false);
    else if (englishReply && !languageFromNativeScript(text)) reply = replyFromOption(englishReply, "detected", false);
  }
  if (inputMode === "voice" && !pickerLocked) {
    const scriptCode = malayalamMarkersWin(text) || latinManglish(text) ? "ml" : languageFromNativeScript(text);
    const voiced = scriptCode || (spokenLanguage && spokenLanguage !== "en" && spokenLanguage !== "id" && softText ? spokenLanguage : null);
    const option = voiced ? languageOption(voiced) : undefined;
    if (option) {
      const forced = { ...replyFromOption(option, "detected" as const, false), confidence: "high" as const };
      langOverride = forced.code !== reply.code;
      reply = forced;
    }
  }
  const priorTexts = messages
    .slice(0, Math.max(0, messages.map((message) => message.role).lastIndexOf("user")))
    .map((message) => messageText(message));
  const namedNow = mentionedClinics(text);
  const inherited = clinicFocus(clinicContextText(turns));
  const preferred =
    namedNow.length === 1
      ? { kind: "one" as const, clinic: namedNow[0] }
      : namedNow.length > 1
        ? { kind: "many" as const, clinics: namedNow }
        : inherited;
  const focus = addressFocus(text, priorTexts, preferred);
  const severe = isSevereEmergency(text);
  const letterless = !hasLetters(text);
  const chunks = !letterless && query ? searchIndex(index, query, 8).slice(0, 6) : [];
  const sources = chunks.length && (chunks[0]?.score ?? 0) >= 1 ? sourcesFromChunks(chunks) : [];
  return {
    text,
    query,
    reply,
    focus,
    severe,
    chunks,
    sources,
    topicText: topicShareText(turns, focus),
    inputMode,
    spokenLanguage,
    transcriptScript: textDetection.script,
    langOverride,
    instructions: buildInstructions({ index, language: reply, focus, severe, question: text, chunks: sources.length ? chunks : [] }),
  };
}

/** One JSON line, printed after the response finishes so Vercel runtime logs keep it. */
function scheduleRequestTimingLog(): (event: ChatTimingEvent) => void {
  let resolveLine: (line: string) => void = () => undefined;
  const pending = new Promise<string>((resolve) => {
    resolveLine = resolve;
  });
  after(async () => {
    console.log(await pending);
  });
  return (event) => resolveLine(JSON.stringify(event));
}

export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request, "chat", 20);
  if (blocked) return withCors(request, blocked);
  if (!process.env.AI_GATEWAY_API_KEY) {
    return withCors(request, Response.json({ error: "AI_GATEWAY_API_KEY is not configured." }, { status: 503 }));
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return withCors(request, Response.json({ error: "Expected a JSON body." }, { status: 400 }));
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return withCors(request, Response.json({ error: "Invalid chat request." }, { status: 400 }));
  }

  let messages = parsed.data.messages as unknown as ClinicUIMessage[];
  const startedAt = Date.now();
  const index = getKnowledgeIndex();
  const liveDrop = cleanLiveDrop(parsed.data.liveDrop);
  let lexical = prepareTurn(messages, parsed.data.language, index, {
    inputMode: parsed.data.inputMode,
    spokenLanguage: parsed.data.spokenLanguage,
  });
  if (parsed.data.inputMode === "voice" && requiresNativeScript(lexical.reply.code) && languageFromNativeScript(lexical.text) !== lexical.reply.code) {
    const remaining = OVERALL_DEADLINE_MS - (Date.now() - startedAt);
    if (remaining > 400) {
      const rewritten = await rewriteTranscriptScript({
        text: lexical.text,
        language: lexical.reply.code,
        timeoutMs: Math.min(SCRIPT_CONVERT_TIMEOUT_MS, remaining - 200),
      });
      if (rewritten && rewritten !== lexical.text) {
        messages = replaceLastUserText(messages, lexical.text, rewritten);
        lexical = prepareTurn(messages, parsed.data.language, index, {
          inputMode: parsed.data.inputMode,
          spokenLanguage: parsed.data.spokenLanguage,
        });
      }
    }
  }
  if (!lexical.text) {
    return withCors(request, Response.json({ error: "Type a message to start." }, { status: 400 }));
  }
  const letterless = !hasLetters(lexical.text);
  const retrievalStarted = Date.now();
  const retrieved = letterless
    ? { chunks: [], timedOut: false }
    : await hybridRetrieveDetailed(index, lexical.query, lexical.chunks);
  const chunks = retrieved.chunks;
  const retrievalMs = Date.now() - retrievalStarted;
  const topScore = chunks[0]?.score ?? 0;
  const shares = sharesClinicOrService(lexical.topicText, chunks);
  const answered = !letterless && retrievalHasAnswer(chunks.length, topScore);
  const sources = answered ? sourcesFromChunks(chunks) : [];
  const instructions = buildInstructions({
    index,
    language: lexical.reply,
    focus: lexical.focus,
    severe: lexical.severe,
    question: lexical.text,
    chunks: sources.length ? chunks : [],
  });
  const modelMessages = await convertToModelMessages(messagesAfterLanguageSwitch(messages, lexical.reply.code));

  const replyStatus: { tag: StatusTag | null; missing: boolean } = { tag: null, missing: true };
  const textStream = createRetryingTextStream({
    language: lexical.reply.code,
    startedAt,
    retrievalMs,
    retrievalTimedOut: retrieved.timedOut,
    deadlineMs: OVERALL_DEADLINE_MS,
    fallbackText: tryAgainMessage(
      lexical.reply.code,
      Object.values(index.contacts).map((card) => ({ name: card.name, phone: card.phone })),
    ),
    spokenLanguage: lexical.spokenLanguage,
    inputMode: lexical.inputMode,
    transcriptScript: lexical.transcriptScript,
    langOverride: lexical.langOverride,
    liveDrop,
    log: scheduleRequestTimingLog(),
    onStatus: (status) => {
      replyStatus.tag = status.tag;
      replyStatus.missing = status.missing;
    },
    run: (attempt, signal, mode) =>
      streamText({
        ...chatGenerationSettings(
          attempt,
          mode?.scriptRetry ? FIRST_TOKEN_TIMEOUT_MS : firstTokenBudget({ attempt, timeoutMs: FIRST_TOKEN_TIMEOUT_MS, startedAt }),
        ),
        instructions: mode?.scriptRetry ? `${instructions}\n\n${scriptRetryInstruction(lexical.reply)}` : instructions,
        messages: messagesForScriptRetry(modelMessages, lexical.reply.code, mode?.scriptRetry === true),
        abortSignal: signal,
      }).stream,
  });

  const metadata = {
    language: lexical.reply.code,
    dir: lexical.reply.dir,
    fallback: lexical.reply.fallback,
    sources,
  } satisfies ChatMetadata;

  const uiStream = attachContactLabels(
    attachHoursWording(
      attachScriptFix(
        toUIMessageStream({
          stream: textStream,
          sendReasoning: false,
          messageMetadata: ({ part }) => (part.type === "start" ? metadata : undefined),
        }),
        lexical.reply.code,
        lexical.text,
      ),
      lexical.reply.code,
      hoursRelevant(lexical.text, chunks),
      lexical.text,
    ),
    { code: lexical.reply.code, index, replyStatus, focus: lexical.focus, question: lexical.text },
  );
  const stream = attachContactFooter(uiStream, {
    footer: contactFooter(index, lexical.reply, lexical.focus),
    routeFooter: contactRouteFooter(index, lexical.reply, lexical.focus),
    sourcesFound: answered,
    sourceCount: chunks.length,
    topScore,
    question: lexical.text,
    covered: (text) => replyHasContactRoute(text, index),
    sharesTopic: shares,
    index,
    focus: lexical.focus,
    facts: chunks.slice(0, 4).map((chunk) => `${chunk.title}\n${chunk.heading}\n${chunk.text}`).join("\n"),
    replyStatus,
  });

  return withCors(request, createUIMessageStreamResponse({ stream }));
}

export function OPTIONS(request: Request): Response {
  const blocked = guardRequest(request, "chat-opt", 60);
  if (blocked) return withCors(request, blocked);
  return withCors(request, new Response(null, { status: 204 }));
}
