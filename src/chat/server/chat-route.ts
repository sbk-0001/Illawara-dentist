import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { clinicFocus, isSevereEmergency } from "../intent";
import { resolveReplyLanguage } from "../language/detect";
import { hybridRetrieve } from "../retrieval/embeddings";
import { searchIndex, sourcesFromChunks } from "../retrieval/search";
import type { ChatMetadata, KnowledgeIndex, ReplyLanguage } from "../types";
import { attachContactFooter, contactFooter, replyHasContactRoute, shouldAppendContactFooter } from "./contacts";
import { guardRequest, withCors } from "./guard";
import { getKnowledgeIndex } from "./index-store";
import { buildInstructions, CHAT_MODEL } from "./prompt";

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

export function prepareTurn(messages: { role?: string; parts?: unknown; content?: unknown }[], language: string | undefined, index: KnowledgeIndex) {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  const text = (latest ? messageText(latest) : "").slice(0, 4000);
  const reply: ReplyLanguage = resolveReplyLanguage(text, language);
  const focus = clinicFocus(text);
  const severe = isSevereEmergency(text);
  const chunks = text ? searchIndex(index, text, 8).slice(0, 6) : [];
  const sources = chunks.length && chunks[0].score >= 1 ? sourcesFromChunks(chunks) : [];
  return {
    text,
    reply,
    focus,
    severe,
    chunks,
    sources,
    instructions: buildInstructions({ index, language: reply, focus, severe, question: text, chunks: sources.length ? chunks : [] }),
  };
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
  const chunks = await hybridRetrieve(index, lexical.text, lexical.chunks);
  const sources = sourcesFromChunks(chunks);
  const instructions = buildInstructions({
    index,
    language: lexical.reply,
    focus: lexical.focus,
    severe: lexical.severe,
    question: lexical.text,
    chunks: sources.length ? chunks : [],
  });

  const result = streamText({
    model: CHAT_MODEL,
    instructions,
    messages: await convertToModelMessages(messages),
    temperature: 0.2,
    maxRetries: 1,
  });

  const metadata = {
    language: lexical.reply.code,
    dir: lexical.reply.dir,
    fallback: lexical.reply.fallback,
    sources,
  } satisfies ChatMetadata;

  const uiStream = toUIMessageStream({
    stream: result.stream,
    sendReasoning: false,
    messageMetadata: ({ part }) => (part.type === "start" ? metadata : undefined),
  });
  const stream = shouldAppendContactFooter(lexical.text, sources.length)
    ? attachContactFooter(uiStream, contactFooter(index, lexical.reply, lexical.focus), (text) => replyHasContactRoute(text, index))
    : uiStream;

  return withCors(request, createUIMessageStreamResponse({ stream }));
}

export function OPTIONS(request: Request): Response {
  const blocked = guardRequest(request, "chat-opt", 60);
  if (blocked) return withCors(request, blocked);
  return withCors(request, new Response(null, { status: 204 }));
}
