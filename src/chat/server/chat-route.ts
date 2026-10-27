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
import { hasLetters, detectLanguage, resolveReplyLanguage } from "../language/detect";
import { normalizeSpokenLanguage, spokenLanguageForTranscript } from "../stt";
import { languageOption, replyFromOption } from "../language/catalog";
import { hybridRetrieve } from "../retrieval/embeddings";
import { searchIndex, sourcesFromChunks } from "../retrieval/search";
import type { ChatMetadata, KnowledgeIndex, ReplyLanguage } from "../types";
import { attachContactFooter, contactFooter, contactRouteFooter, replyHasContactRoute, retrievalHasAnswer, sharesClinicOrService, topicShareText } from "./contacts";
import { guardRequest, withCors } from "./guard";
import { attachHoursWording, hoursRelevant } from "./hours";
import { attachContactLabels } from "./label-fix";
import { getKnowledgeIndex } from "./index-store";
import { buildInstructions } from "./prompt";
import { attachScriptFix } from "./script-fix";
import type { StatusTag } from "./status-tag";
import { FIRST_TOKEN_TIMEOUT_MS, chatGenerationSettings, createRetryingTextStream, firstTokenBudget, type ChatTimingEvent } from "./stream-timing";

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
  const spokenLanguage = inputMode === "voice" ? spokenLanguageForTranscript(voice?.spokenLanguage, text, priorReplyLanguage(messages)) : null;
  const pickerLocked = Boolean(language && language !== "auto" && languageOption(language));
  const softText = textDetection.code === "en" || textDetection.code === "und" || textDetection.fallback || textDetection.script === "Latin";
  const hindiOnBengali = spokenLanguage === "bn" && (reply.code === "hi" || reply.code === "hi-Latn");
  let langOverride = false;
  if (inputMode === "voice" && spokenLanguage && spokenLanguage !== "en" && !pickerLocked && (softText || hindiOnBengali)) {
    const option = languageOption(spokenLanguage);
    if (option) {
      const forced = { ...replyFromOption(option, "detected" as const, false), confidence: "high" as const };
      langOverride = forced.code !== reply.code;
      reply = forced;
    }
  }
  const focus = clinicFocus(clinicContextText(turns));
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

  const messages = parsed.data.messages as unknown as ClinicUIMessage[];
  const startedAt = Date.now();
  const index = getKnowledgeIndex();
  const liveDrop = cleanLiveDrop(parsed.data.liveDrop);
  const lexical = prepareTurn(messages, parsed.data.language, index, {
    inputMode: parsed.data.inputMode,
    spokenLanguage: parsed.data.spokenLanguage,
  });
  if (!lexical.text) {
    return withCors(request, Response.json({ error: "Type a message to start." }, { status: 400 }));
  }
  const letterless = !hasLetters(lexical.text);
  const retrievalStarted = Date.now();
  const chunks = letterless ? [] : await hybridRetrieve(index, lexical.query, lexical.chunks);
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
  const modelMessages = await convertToModelMessages(messages);

  const replyStatus: { tag: StatusTag | null; missing: boolean } = { tag: null, missing: true };
  const textStream = createRetryingTextStream({
    language: lexical.reply.code,
    startedAt,
    retrievalMs,
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
    run: (attempt, signal) =>
      streamText({
        ...chatGenerationSettings(attempt, firstTokenBudget({ attempt, timeoutMs: FIRST_TOKEN_TIMEOUT_MS, startedAt })),
        instructions,
        messages: modelMessages,
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
    { code: lexical.reply.code, index, replyStatus, focus: lexical.focus },
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
