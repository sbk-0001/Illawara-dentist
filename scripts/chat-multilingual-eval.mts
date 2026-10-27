/**
 * Multilingual groundedness eval for the clinic chat.
 *
 * Requires AI_GATEWAY_API_KEY. Without it, the script skips and exits 0.
 * Run: npm run eval
 *
 * The model is the same one /api/chat uses. This does not mock replies.
 */
import { streamText } from "ai";
import { EVAL_CASES } from "../src/chat/eval/cases.ts";
import { replyMatchesLanguage } from "../src/chat/language/reply-script.ts";
import { ensureContactFooter, modelSignalsNoAnswer, retrievalHasAnswer, sharesClinicOrService, shouldAppendContactFooter, stripNoAnswerSentinel } from "../src/chat/server/contacts.ts";
import { checkGrounding } from "../src/chat/server/grounding.ts";
import { getKnowledgeIndex } from "../src/chat/server/index-store.ts";
import { prepareTurn } from "../src/chat/server/chat-route.ts";
import { buildInstructions } from "../src/chat/server/prompt.ts";
import { hybridRetrieve } from "../src/chat/retrieval/embeddings.ts";
import { hasLetters } from "../src/chat/language/detect.ts";
import { sourcesFromChunks } from "../src/chat/retrieval/search.ts";
import { fixReplyScript } from "../src/chat/server/script-fix.ts";
import { hoursRelevant, rewriteEnglishHours } from "../src/chat/server/hours.ts";
import { chatGenerationSettings, createRetryingTextStream } from "../src/chat/server/stream-timing.ts";

type Row = {
  id: string;
  languageOk: boolean;
  scriptOk: boolean;
  groundedOk: boolean;
  reasons: string[];
  ttftMs: number;
  totalMs: number;
  reply: string;
};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function answer(prompt: string): Promise<{ reply: string; ttftMs: number; totalMs: number; detected: string }> {
  const index = getKnowledgeIndex();
  const messages = [{ role: "user" as const, parts: [{ type: "text", text: prompt }] }];
  const started = performance.now();
  const turn = prepareTurn(messages, "auto", index);
  const letterless = !hasLetters(turn.text);
  const chunks = letterless ? [] : await hybridRetrieve(index, turn.query, turn.chunks);
  const topScore = chunks[0]?.score ?? 0;
  const shares = sharesClinicOrService(turn.topicText, chunks);
  const answered = !letterless && retrievalHasAnswer(chunks.length, topScore);
  const sourced = answered ? sourcesFromChunks(chunks) : [];
  const instructions = buildInstructions({
    index,
    language: turn.reply,
    focus: turn.focus,
    severe: turn.severe,
    question: turn.text,
    chunks: sourced.length ? chunks : [],
  });
  const stream = createRetryingTextStream({
    language: turn.reply.code,
    run: (attempt, signal) =>
      streamText({
        ...chatGenerationSettings(attempt),
        instructions,
        prompt,
        abortSignal: signal,
      }).stream,
  });
  const reader = stream.getReader();
  let reply = "";
  let ttftMs = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.type === "text-delta" && next.value.text) {
      if (!ttftMs) ttftMs = performance.now() - started;
      reply += next.value.text;
    }
  }
  const scripted = fixReplyScript(reply.trim(), turn.reply.code, turn.text);
  const finished = hoursRelevant(turn.text, chunks) ? rewriteEnglishHours(scripted, turn.reply.code) : scripted;
  const saidNo = modelSignalsNoAnswer(finished);
  const visible = stripNoAnswerSentinel(finished);
  const withContacts = shouldAppendContactFooter({
    question: turn.text,
    sourceCount: chunks.length,
    topScore,
    modelSaidNoAnswer: saidNo,
    replyText: visible,
    sharesTopic: shares,
    index,
    focus: turn.focus,
  })
    ? ensureContactFooter(visible, index, turn.reply, turn.focus)
    : visible;
  return { reply: withContacts, ttftMs, totalMs: performance.now() - started, detected: turn.reply.code };
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.log("EVAL_STATUS=skipped");
    console.log("AI_GATEWAY_API_KEY is not set. The eval is ready to run once that key exists. Language detection for these prompts is covered by unit tests.");
    process.exit(0);
  }

  const index = getKnowledgeIndex();
  const rows: Row[] = [];
  for (const item of EVAL_CASES) {
    const result = await answer(item.prompt);
    const grounding = checkGrounding(result.reply, index, item.kind, item.clinic);
    const row: Row = {
      id: item.id,
      languageOk: result.detected === item.language,
      scriptOk: replyMatchesLanguage(result.reply, item.language),
      groundedOk: grounding.ok,
      reasons: grounding.reasons,
      ttftMs: Math.round(result.ttftMs),
      totalMs: Math.round(result.totalMs),
      reply: result.reply.slice(0, 400),
    };
    rows.push(row);
    console.log(`${row.languageOk && row.scriptOk && row.groundedOk ? "ok" : "FAIL"} ${row.id} ttft=${row.ttftMs}ms total=${row.totalMs}ms`);
    if (!row.languageOk || !row.scriptOk || !row.groundedOk) {
      console.log(" ", row.reasons.join("; ") || `detected/script mismatch, reply starts: ${row.reply.slice(0, 160)}`);
    }
  }

  const ttft = rows.map((row) => row.ttftMs);
  const total = rows.map((row) => row.totalMs);
  const failed = rows.filter((row) => !row.languageOk || !row.scriptOk || !row.groundedOk);
  const summary = {
    model: CHAT_MODEL,
    cases: rows.length,
    failed: failed.length,
    ttft: { p50: Math.round(percentile(ttft, 50)), p95: Math.round(percentile(ttft, 95)) },
    total: { p50: Math.round(percentile(total, 50)), p95: Math.round(percentile(total, 95)) },
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
