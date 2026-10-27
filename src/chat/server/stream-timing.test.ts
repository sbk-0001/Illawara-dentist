import { describe, expect, it, vi } from "vitest";
import { CHAT_MODEL } from "./prompt";
import { CHAT_FALLBACK_MODEL, FIRST_TOKEN_TIMEOUT_MS, chatGenerationSettings, createRetryingTextStream, firstTokenBudget, modelSupportsTemperature, type ChatTimingEvent } from "./stream-timing";

async function readText(stream: ReadableStream<{ type: string; text?: string }>): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const next = await reader.read();
    if (next.done) return text;
    if (next.value.type === "text-delta" && next.value.text) text += next.value.text;
  }
}

describe("first-token timeout", () => {
  it("sets an 8 second first-chunk timeout and one fallback attempt", () => {
    const first = chatGenerationSettings(0);
    expect(first.model).toBe(CHAT_MODEL);
    expect(first.timeout.firstChunkMs).toBe(FIRST_TOKEN_TIMEOUT_MS);
    expect(FIRST_TOKEN_TIMEOUT_MS).toBe(8000);
    expect(first.maxRetries).toBe(0);
    expect(first.providerOptions).toEqual({ gateway: { models: [CHAT_FALLBACK_MODEL] } });
    expect(modelSupportsTemperature(CHAT_MODEL)).toBe(false);
    expect(first).not.toHaveProperty("temperature");
    const retry = chatGenerationSettings(1);
    expect(retry.model).toBe(CHAT_FALLBACK_MODEL);
    expect(retry.providerOptions).toBeUndefined();
    expect(modelSupportsTemperature(CHAT_FALLBACK_MODEL)).toBe(true);
    expect(retry.temperature).toBe(0.2);
  });

  it("does not retry when the first attempt yields text", async () => {
    let calls = 0;
    const stream = createRetryingTextStream({
      language: "fa",
      timeoutMs: 200,
      log: () => undefined,
      run: async function* (attempt) {
        calls += 1;
        expect(attempt).toBe(0);
        yield { type: "text-start" };
        yield { type: "text-delta", text: "سلام" };
      },
    });
    expect(await readText(stream)).toBe("سلام");
    expect(calls).toBe(1);
  });

  it("retries once when the first attempt produces no text in time", async () => {
    const events: ChatTimingEvent[] = [];
    let calls = 0;
    const stream = createRetryingTextStream({
      language: "bn",
      timeoutMs: 30,
      log: (event) => events.push(event),
      run: (attempt, signal) => ({
        async *[Symbol.asyncIterator]() {
          calls += 1;
          if (attempt === 0) {
            await new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
            });
          }
          yield { type: "text-delta", text: "সোমবার" };
        },
      }),
    });
    expect(await readText(stream)).toBe("সোমবার");
    expect(calls).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "chat-timing",
      language: "bn",
      model: CHAT_FALLBACK_MODEL,
      attempt: 1,
      retried: true,
      outcome: "done",
    });
    expect(events[0]?.ttftMs).toEqual(expect.any(Number));
    expect(events[0]?.firstAttemptMs).toBeGreaterThan(0);
    expect(events[0]?.retrievalMs).toBe(0);
    expect(events[0]?.error).toBeUndefined();
  });

  it("counts retrieval against the 8s budget and logs retrievalMs", async () => {
    expect(firstTokenBudget({ attempt: 0, timeoutMs: 8000, startedAt: 0, now: 7900 })).toBe(250);
    expect(firstTokenBudget({ attempt: 1, timeoutMs: 8000, startedAt: 0, now: 7900 })).toBe(8000);
    expect(firstTokenBudget({ attempt: 0, timeoutMs: 30 })).toBe(30);

    const events: ChatTimingEvent[] = [];
    let calls = 0;
    const startedAt = Date.now() - 7900;
    const stream = createRetryingTextStream({
      language: "ur",
      timeoutMs: 8000,
      startedAt,
      retrievalMs: 7900,
      log: (event) => events.push(event),
      run: (attempt, signal) => ({
        async *[Symbol.asyncIterator]() {
          calls += 1;
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          });
          expect(attempt).toBe(1);
          yield { type: "text-delta", text: "فون" };
        },
      }),
    });
    expect(await readText(stream)).toBe("فون");
    expect(calls).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]?.retrievalMs).toBe(7900);
    expect(events[0]?.retried).toBe(true);
    expect(events[0]?.ttftMs).toBeGreaterThanOrEqual(7900);
    expect(events[0]?.ttftMs).toBeLessThan(14000);
    expect(events[0]?.totalMs).toBeGreaterThanOrEqual(events[0]?.ttftMs ?? 0);
  });

  it("prints one structured line and nothing from the prompt", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line) => {
      lines.push(String(line));
    });
    try {
      const stream = createRetryingTextStream({
        language: "ko",
        timeoutMs: 200,
        run: async function* () {
          yield { type: "text-delta", text: "02 4284 4486" };
        },
      });
      expect(await readText(stream)).toBe("02 4284 4486");
    } finally {
      spy.mockRestore();
    }
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}") as ChatTimingEvent;
    expect(parsed).toMatchObject({
      event: "chat-timing",
      language: "ko",
      model: CHAT_MODEL,
      attempt: 0,
      retried: false,
      outcome: "done",
    });
    expect(parsed.ttftMs).toEqual(expect.any(Number));
    expect(parsed.retrievalMs).toBe(0);
    expect(parsed.spokenLanguage).toBeNull();
    expect(parsed.inputMode).toBe("text");
    expect(parsed.transcriptScript).toBe("");
    expect(parsed.langOverride).toBe(false);
    expect(parsed.tag_missing).toBe(true);
    expect(parsed.tag_missing_rate).toBeGreaterThan(0);
    expect(parsed.tag_missing_rate).toBeLessThanOrEqual(1);
    expect(JSON.stringify(parsed)).not.toMatch(/AI_GATEWAY|api[_-]?key|prompt/i);
  });
});
