import { describe, expect, it } from "vitest";
import { TRANSCRIPT_REPAIR_MODEL, TRANSCRIPT_REPAIR_TIMEOUT_MS, repairNativeTranscript } from "./transcript-repair";

describe("native-script transcript repair", () => {
  it("uses gpt-4o-mini-transcribe when the second pass is in the spoken script", async () => {
    expect(TRANSCRIPT_REPAIR_TIMEOUT_MS).toBe(2000);
    let seen: { model?: string; language?: string; maxRetries?: number } = {};
    const text = await repairNativeTranscript({
      audio: new Uint8Array([26, 69, 223, 163]),
      language: "bn",
      transcribe: async (input) => {
        seen = { model: input.model, language: input.providerOptions.openai.language, maxRetries: input.maxRetries };
        return { text: "ডাপ্টো ক্লিনিক শনিবার কখন খোলা থাকে?" };
      },
    });
    expect(text).toContain("ডাপ্টো");
    expect(seen).toEqual({ model: TRANSCRIPT_REPAIR_MODEL, language: "bn", maxRetries: 0 });

    const mixed = await repairNativeTranscript({
      audio: new Uint8Array([4, 5, 6]),
      language: "bn",
      transcribe: async () => ({ text: "Woonona ক্লিনিকের ঠিকানা কি?" }),
    });
    expect(mixed).toBe("Woonona ক্লিনিকের ঠিকানা কি?");

    const hindi = await repairNativeTranscript({
      audio: new Uint8Array([7, 8, 9]),
      language: "bn",
      transcribe: async () => ({ text: "डाप्टो क्लिनिक कब खुलेगा?" }),
    });
    expect(hindi).toBe("डाप्टो क्लिनिक कब खुलेगा?");
  });

  it("keeps the original when the repair is still Latin or misses the deadline", async () => {
    const latin = await repairNativeTranscript({
      audio: new Uint8Array([1, 2, 3]),
      language: "bn",
      transcribe: async () => ({ text: "Dapto clinic Saturday kokhon khola thake?" }),
    });
    expect(latin).toBeNull();

    const timedOut = await repairNativeTranscript({
      audio: new Uint8Array([1, 2, 3]),
      language: "hi",
      timeoutMs: 30,
      transcribe: (input) =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => _resolve({ text: "डाप्टो" }), 200);
          input.abortSignal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    });
    expect(timedOut).toBeNull();

    const english = await repairNativeTranscript({
      audio: new Uint8Array([1]),
      language: "en",
      transcribe: async () => {
        throw new Error("should not run");
      },
    });
    expect(english).toBeNull();
  });
});
