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
import { hasLetters, resolveReplyLanguage } from "../language/detect";
import { hybridRetrieve } from "../retrieval/embeddings";
import { searchIndex, sourcesFromChunks } from "../retrieval/search";
import type { ChatMetadata, KnowledgeIndex, ReplyLanguage } from "../types";
import { attachContactFooter, contactFooter, contactRouteFooter, replyHasContactRoute, retrievalHasAnswer, sharesClinicOrService, topicShareText } from "./contacts";
import { guardRequest, withCors } from "./guard";
import { attachHoursWording, hoursRelevant } from "./hours";
import { getKnowledgeIndex } from "./index-store";
import { buildInstructions } from "./prompt";
import { attachScriptFix } from "./script-fix";
import type { StatusTag } from "./status-tag";
import { chatGenerationSettings, createRetryingTextStream, type ChatTimingEvent } from "./stream-timing";

export const maxDuration = 60;
export const runtime = "nodejs";

export type ClinicUIMessage = UIMessage<ChatMetadata>;

const bodySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1).max(24),
  language: z.string().max(32).optional(),
});

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

/** Follow-up location questions keep the clinic named in a recent turn, without replacing the latest wording. */
export function retrievalQuery(latest: string, prior: string[]): string {
  const context = clinicContextText([...prior, latest]);
  if (context === latest) return latest;
  const names = mentionedClinics(context);
  return names.length ? `${names.join(" ")} ${latest}`.trim() : latest;
}

export function prepareTurn(messages: { role?: string; parts?: unknown; content?: unknown }[], language: string | undefined, index: KnowledgeIndex) {
  const turns = userTexts(messages);
  const text = (turns[turns.length - 1] || "").slice(0, 4000);
  const query = retrievalQuery(text, turns.slice(0, -1)).slice(0, 4000);
  const reply: ReplyLanguage = resolveReplyLanguage(text, language);
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
  const index = getKnowledgeIndex();
  const lexical = prepareTurn(messages, parsed.data.language, index);
  if (!lexical.text) {
    return withCors(request, Response.json({ error: "Type a message to start." }, { status: 400 }));
  }
  const letterless = !hasLetters(lexical.text);
  const chunks = letterless ? [] : await hybridRetrieve(index, lexical.query, lexical.chunks);
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

  const replyStatus: { tag: StatusTag | null } = { tag: null };
  const textStream = createRetryingTextStream({
    language: lexical.reply.code,
    log: scheduleRequestTimingLog(),
    onStatus: (status) => {
      replyStatus.tag = status.tag;
    },
    run: (attempt, signal) =>
      streamText({
        ...chatGenerationSettings(attempt),
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

  const uiStream = attachHoursWording(
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
