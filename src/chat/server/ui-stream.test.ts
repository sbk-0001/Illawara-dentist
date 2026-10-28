import { safeValidateTypes } from "@ai-sdk/provider-utils";
import { readUIMessageStream, toUIMessageStream, uiMessageChunkSchema, type UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language/detect";
import { attachContactFooter, contactFooter } from "./contacts";
import { attachHoursWording } from "./hours";
import { getKnowledgeIndex } from "./index-store";
import { attachContactLabels } from "./label-fix";
import { attachScriptFix } from "./script-fix";
import { createRetryingTextStream } from "./stream-timing";
import { FEE_CAVEAT_EN } from "./system-text";
import type { StatusTag } from "./status-tag";

const index = getKnowledgeIndex();

type ModelPart = { type: string; id?: string; text?: string; finishReason?: string };

/**
 * The same pipe the chat route uses: model parts, then the UI message stream,
 * then the script, hours, label and footer guards.
 */
function widgetStream(input: {
  language: string;
  question: string;
  run: (attempt: number, signal: AbortSignal, mode?: { scriptRetry?: boolean }) => AsyncIterable<ModelPart>;
  timeoutMs?: number;
  deadlineMs?: number;
  hours?: boolean;
  focus?: { kind: "one"; clinic: "dapto" } | { kind: "ask" } | { kind: "any" };
}) {
  const replyStatus: { tag: StatusTag | null; missing: boolean } = { tag: null, missing: true };
  const textStream = createRetryingTextStream({
    language: input.language,
    timeoutMs: input.timeoutMs ?? 500,
    deadlineMs: input.deadlineMs,
    log: () => undefined,
    onStatus: (status) => {
      replyStatus.tag = status.tag;
      replyStatus.missing = status.missing;
    },
    run: input.run,
  });
  const language = detectLanguage(input.language === "bn" ? "বাংলা" : "hello");
  const focus = input.focus ?? { kind: "any" as const };
  return attachContactFooter(
    attachContactLabels(
      attachHoursWording(
        attachScriptFix(
          toUIMessageStream({
            stream: textStream as never,
            sendReasoning: false,
          }),
          input.language,
          input.question,
        ),
        input.language,
        input.hours ?? false,
        input.question,
      ),
      { code: input.language, index, replyStatus, focus, question: input.question },
    ),
    {
      footer: contactFooter(index, language, focus),
      routeFooter: "",
      sourcesFound: true,
      sourceCount: 3,
      topScore: 1,
      question: input.question,
      covered: () => false,
      sharesTopic: true,
      index,
      focus,
      replyStatus,
    },
  );
}

async function assertValidReply(stream: ReadableStream<unknown>, check: (text: string) => void) {
  const reader = stream.getReader();
  const chunks: unknown[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
  }

  const open = new Set<string>();
  const errors: string[] = [];
  let deltas = 0;
  for (const chunk of chunks) {
    const parsed = await safeValidateTypes({ value: chunk, schema: uiMessageChunkSchema });
    if (!parsed.success) errors.push(parsed.error.message);
    const part = chunk as { type?: string; id?: unknown };
    if (part.type === "text-start" && typeof part.id === "string") open.add(part.id);
    if (part.type === "text-delta") {
      deltas += 1;
      if (typeof part.id !== "string" || !open.has(part.id)) {
        errors.push(`text-delta id ${JSON.stringify(part.id)} is not an open text-start`);
      }
    }
    if (part.type === "text-end") {
      if (typeof part.id !== "string" || !open.has(part.id)) errors.push(`text-end id ${JSON.stringify(part.id)} was not open`);
      else open.delete(part.id);
    }
  }
  expect(deltas).toBeGreaterThan(0);
  expect(errors).toEqual([]);

  const replay = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const problems: unknown[] = [];
  const messages: UIMessage[] = [];
  try {
    for await (const message of readUIMessageStream({
      stream: replay as never,
      terminateOnError: true,
      onError: (error) => problems.push(error),
    })) {
      messages.push(message);
    }
  } catch (error) {
    problems.push(error);
  }
  expect(problems).toEqual([]);
  const text = (messages.at(-1)?.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
  check(text);
}

describe("UI message stream validation", () => {
  it("accepts a normal English reply", async () => {
    const stream = widgetStream({
      language: "en",
      question: "Do you offer check-ups?",
      run: async function* () {
        yield { type: "text-start", id: "m1" };
        yield { type: "text-delta", id: "m1", text: "[[A]]Dapto Dentists offers check-ups for the whole family and looks after children as well." };
        yield { type: "text-end", id: "m1" };
        yield { type: "finish", finishReason: "stop" };
      },
    });
    await assertValidReply(stream, (text) => {
      expect(text).toContain("check-ups");
      expect(text).not.toContain("[[A]]");
    });
  });

  it("accepts the retry attempt when the first attempt never writes", async () => {
    const stream = widgetStream({
      language: "en",
      question: "Do you offer check-ups?",
      timeoutMs: 40,
      run: (attempt, signal) => ({
        async *[Symbol.asyncIterator]() {
          if (attempt === 0) {
            await new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
            });
          }
          yield { type: "text-delta", text: "[[A]]Dapto Dentists offers check-ups for the whole family and looks after children as well." };
        },
      }),
    });
    await assertValidReply(stream, (text) => {
      expect(text).toContain("check-ups");
    });
  });

  it("accepts the deadline fallback when the model never yields", async () => {
    const stream = widgetStream({
      language: "ko",
      question: "우노나 전화번호",
      timeoutMs: 5_000,
      deadlineMs: 80,
      run: () => ({
        [Symbol.asyncIterator](): AsyncIterator<ModelPart> {
          return {
            next: () => new Promise<IteratorResult<ModelPart>>(() => undefined),
            return: () => Promise.resolve({ done: true as const, value: undefined }),
          };
        },
      }),
    });
    await assertValidReply(stream, (text) => {
      expect(text).toContain("다시 시도");
    });
  });

  it("accepts the deadline fallback, including its own text part", async () => {
    const stream = widgetStream({
      language: "bn",
      question: "হোয়াইটেনিং আছে?",
      timeoutMs: 5_000,
      deadlineMs: 80,
      run: (attempt) => ({
        [Symbol.asyncIterator](): AsyncIterator<ModelPart> {
          return {
            next(): Promise<IteratorResult<ModelPart>> {
              if (attempt === 0) return Promise.reject(Object.assign(new Error("first-token timeout"), { name: "TimeoutError" }));
              return new Promise(() => undefined);
            },
            return(): Promise<IteratorResult<ModelPart>> {
              return Promise.resolve({ done: true, value: undefined });
            },
          };
        },
      }),
    });
    await assertValidReply(stream, (text) => {
      expect(text).toContain("আবার চেষ্টা করুন");
    });
  });

  it("accepts a regenerated Bengali reply and drops the English attempt", async () => {
    const english = `Teeth whitening is available. ${FEE_CAVEAT_EN}`;
    const bengali = "হ্যাঁ, দাঁত সাদা করার চিকিৎসা আছে। বিস্তারিত জানতে ক্লিনিকে ফোন করুন।";
    let calls = 0;
    const stream = widgetStream({
      language: "bn",
      question: "হোয়াইটেনিং আছে?",
      run: () => {
        calls += 1;
        const text = calls === 1 ? english : `[[A]]${bengali}`;
        return (async function* () {
          yield { type: "text-start", id: calls === 1 ? "bad" : "good" };
          yield { type: "text-delta", id: calls === 1 ? "bad" : "good", text };
          yield { type: "text-end", id: calls === 1 ? "bad" : "good" };
        })();
      },
    });
    await assertValidReply(stream, (text) => {
      expect(calls).toBe(2);
      expect(text).toContain("দাঁত");
      expect(text).not.toContain(FEE_CAVEAT_EN);
      expect(text).not.toContain("Teeth whitening");
    });
  });

  it("accepts a bare hours reply after the lead-in is prepended", async () => {
    const stream = widgetStream({
      language: "en",
      question: "What are your Saturday hours?",
      hours: true,
      focus: { kind: "one", clinic: "dapto" },
      run: async function* () {
        yield { type: "text-start", id: "hours-1" };
        yield { type: "text-delta", id: "hours-1", text: "[[A]]Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM." };
        yield { type: "text-end", id: "hours-1" };
      },
    });
    await assertValidReply(stream, (text) => {
      expect(text.startsWith("Dapto Dentists is open:")).toBe(true);
      expect(text).toContain("Saturday 8:00 AM–4:00 PM.");
    });
  });

  it("accepts a no-answer footer on the open text part", async () => {
    const stream = widgetStream({
      language: "en",
      question: "Do you sell toothbrushes?",
      run: async function* () {
        yield { type: "text-start", id: "miss" };
        yield { type: "text-delta", id: "miss", text: "[[N]]The website does not list that." };
        yield { type: "text-end", id: "miss" };
      },
    });
    await assertValidReply(stream, (text) => {
      expect(text).toContain("The website does not list that.");
      expect(text).toContain(index.contacts.dapto.phone);
    });
  });
});
