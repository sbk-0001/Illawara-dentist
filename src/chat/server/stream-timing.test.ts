import { describe, expect, it } from "vitest";
import { CHAT_MODEL } from "./prompt";
import { CHAT_FALLBACK_MODEL, FIRST_TOKEN_TIMEOUT_MS, chatGenerationSettings, createRetryingTextStream } from "./stream-timing";

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
    expect(chatGenerationSettings(1).model).toBe(CHAT_FALLBACK_MODEL);
    expect(chatGenerationSettings(1).providerOptions).toBeUndefined();
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
    const events: string[] = [];
    let calls = 0;
    const stream = createRetryingTextStream({
      language: "bn",
      timeoutMs: 30,
      log: (event) => events.push(String(event.outcome)),
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
    expect(events).toContain("retry");
    expect(events).toContain("first-token");
  });
});
