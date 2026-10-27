import { describe, expect, it, vi } from "vitest";
import { CHAT_MODEL } from "./prompt";
import { CHAT_FALLBACK_MODEL, FIRST_TOKEN_TIMEOUT_MS, OVERALL_DEADLINE_MS, chatGenerationSettings, createRetryingTextStream, firstTokenBudget, modelSupportsTemperature, type ChatTimingEvent } from "./stream-timing";
import { replyScriptConflicts, replyScriptRatio } from "../language/reply-script";
import { FEE_CAVEAT_EN } from "./system-text";

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
    expect(OVERALL_DEADLINE_MS).toBe(20000);
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
    expect(parsed.stalled).toBeNull();
    expect(parsed.scriptRatio).toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/AI_GATEWAY|api[_-]?key|prompt/i);
  });

  it("does not treat a status tag as the first token", async () => {
    let calls = 0;
    const stream = createRetryingTextStream({
      language: "en",
      timeoutMs: 40,
      log: () => undefined,
      run: (attempt, signal) => ({
        async *[Symbol.asyncIterator]() {
          calls += 1;
          if (attempt === 0) {
            yield { type: "text-delta", text: "[[A]]" };
            await new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
            });
          }
          yield { type: "text-delta", text: "Dapto is open Monday to Friday." };
        },
      }),
    });
    expect(await readText(stream)).toContain("Dapto is open Monday to Friday.");
    expect(calls).toBe(2);
  });

  it("regenerates once when a Bengali reply is English, and localizes a fee sentence inside Bengali", async () => {
    const english = `Teeth whitening is available. ${FEE_CAVEAT_EN}`;
    const bengali = "হ্যাঁ, দাঁত সাদা করার চিকিৎসা আছে। বিস্তারিত জানতে ক্লিনিকে ফোন করুন।";
    const modes: boolean[] = [];
    let calls = 0;
    const regenerated = createRetryingTextStream({
      language: "bn",
      timeoutMs: 500,
      log: () => undefined,
      run: (_attempt, _signal, mode) => {
        calls += 1;
        modes.push(mode?.scriptRetry === true);
        const text = calls === 1 ? english : bengali;
        return (async function* () {
          yield { type: "text-delta", text };
        })();
      },
    });
    const rewritten = await readText(regenerated);
    expect(calls).toBe(2);
    expect(modes).toEqual([false, true]);
    expect(rewritten).toContain("দাঁত");
    expect(rewritten).not.toContain(FEE_CAVEAT_EN);
    expect(rewritten).not.toContain("Teeth whitening");

    const mixed = createRetryingTextStream({
      language: "bn",
      timeoutMs: 500,
      log: () => undefined,
      run: async function* () {
        yield { type: "text-delta", text: "হ্যাঁ, দাঁত সাদা করার চিকিৎসা আছে। " };
        yield { type: "text-delta", text: FEE_CAVEAT_EN };
      },
    });
    const localized = await readText(mixed);
    expect(localized).toContain("ফি");
    expect(localized).not.toContain(FEE_CAVEAT_EN);

    const stillEnglish = createRetryingTextStream({
      language: "bn",
      timeoutMs: 500,
      log: () => undefined,
      run: async function* () {
        yield { type: "text-delta", text: english };
      },
    });
    const fallback = await readText(stillEnglish);
    expect(fallback).not.toContain("আবার চেষ্টা করুন");
    expect(fallback).toContain("Teeth whitening");
    expect(fallback).not.toContain(FEE_CAVEAT_EN);

    let minorCalls = 0;
    const minor = createRetryingTextStream({
      language: "bn",
      timeoutMs: 500,
      log: () => undefined,
      run: async function* () {
        minorCalls += 1;
        yield { type: "text-delta", text: "হ্যাঁ, Dapto Dentists-এ দাঁত সাদা করার চিকিৎসা আছে। বিস্তারিত জানতে ক্লিনিকে ফোন করুন।" };
      },
    });
    expect(await readText(minor)).toContain("দাঁত সাদা");
    expect(minorCalls).toBe(1);

    let heavyCalls = 0;
    const heavy = createRetryingTextStream({
      language: "bn",
      timeoutMs: 500,
      log: () => undefined,
      run: () => {
        heavyCalls += 1;
        const text =
          heavyCalls === 1
            ? "পেজে teeth whitening এবং professional teeth whitening সম্পর্কে বলা আছে। আরও বিস্তারিত নেই।"
            : bengali;
        return (async function* () {
          yield { type: "text-delta", text };
        })();
      },
    });
    const repaired = await readText(heavy);
    expect(heavyCalls).toBe(2);
    expect(repaired).toContain("বিস্তারিত");
    expect(repaired).not.toContain("professional teeth whitening");

    const hindi =
      "Dapto Dentists में urgent dental समस्या है। दाँत में तेज़ दर्द हो रहा है, तो क्लिनिक को फ़ोन करें। Invisalign और appointment के लिए भी कॉल कर सकते हैं।";
    expect(replyScriptConflicts(hindi, "hi")).toBe(false);
    expect(replyScriptRatio(hindi, "hi")).toBeGreaterThanOrEqual(0.4);
    const events: ChatTimingEvent[] = [];
    let hindiCalls = 0;
    const hindiStream = createRetryingTextStream({
      language: "hi",
      timeoutMs: 500,
      log: (event) => events.push(event),
      run: async function* () {
        hindiCalls += 1;
        yield { type: "text-delta", text: hindi };
      },
    });
    const hindiText = await readText(hindiStream);
    expect(hindiCalls).toBe(1);
    expect(hindiText).toContain("दाँत");
    expect(hindiText).toContain("urgent");
    expect(events[0]?.stalled).toBeNull();
    expect(events[0]?.scriptRatio).toBeGreaterThanOrEqual(0.4);

    const weaker = "Please call the clinic today about urgent dental care and an appointment.";
    const readable = "Please visit the clinic for urgent dental care today and ask the front desk for help. दाँत";
    let savedCalls = 0;
    const saved = createRetryingTextStream({
      language: "hi",
      timeoutMs: 500,
      log: () => undefined,
      run: async function* () {
        savedCalls += 1;
        yield { type: "text-delta", text: savedCalls === 1 ? readable : weaker };
      },
    });
    const savedText = await readText(saved);
    expect(savedCalls).toBe(2);
    expect(savedText).toContain("दाँत");
    expect(savedText).not.toContain("कृपया फिर कोशिश करें");
  });

  it("ends a stalled retry at the overall deadline and logs the stage", async () => {
    const events: ChatTimingEvent[] = [];
    const stream = createRetryingTextStream({
      language: "bn",
      timeoutMs: 5_000,
      deadlineMs: 80,
      log: (event) => events.push(event),
      run: (attempt) => ({
        [Symbol.asyncIterator](): AsyncIterator<{ type: string; text?: string }> {
          return {
            next(): Promise<IteratorResult<{ type: string; text?: string }>> {
              if (attempt === 0) return Promise.reject(Object.assign(new Error("first-token timeout"), { name: "TimeoutError" }));
              return new Promise(() => undefined);
            },
            return(): Promise<IteratorResult<{ type: string; text?: string }>> {
              return Promise.resolve({ done: true, value: undefined });
            },
          };
        },
      }),
    });
    const text = await readText(stream);
    expect(text).toContain("আবার চেষ্টা করুন");
    expect(text).toContain("ক্লিনিকে ফোন করুন");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "deadline", stalled: "retry", language: "bn" });
    expect(events[0]?.totalMs).toBeLessThan(2_000);
  });

  it("streams a Bengali reply after the first sentence instead of holding it all", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stream = createRetryingTextStream({
      language: "bn",
      timeoutMs: 2_000,
      log: () => undefined,
      run: async function* () {
        yield { type: "text-start", id: "bn-1" };
        yield { type: "text-delta", id: "bn-1", text: "হ্যাঁ, দাঁত সাদা করার চিকিৎসা আছে। " };
        await gate;
        yield { type: "text-delta", id: "bn-1", text: "বিস্তারিত জানতে ক্লিনিকে ফোন করুন।" };
        yield { type: "text-end", id: "bn-1" };
      },
    });
    const reader = stream.getReader();
    const early = await Promise.race([
      (async () => {
        let text = "";
        while (!text.includes("দাঁত")) {
          const next = await reader.read();
          if (next.done) break;
          if (next.value.type === "text-delta" && next.value.text) text += next.value.text;
        }
        return text;
      })(),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 300)),
    ]);
    expect(early).toContain("দাঁত সাদা");
    expect(early).not.toContain("ফোন করুন");
    release();
    let rest = early;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value.type === "text-delta" && next.value.text) rest += next.value.text;
    }
    expect(rest).toContain("ফোন করুন");
  });
});
