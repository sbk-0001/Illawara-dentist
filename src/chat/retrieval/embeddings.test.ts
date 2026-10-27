import { describe, expect, it } from "vitest";
import { FIRST_TOKEN_TIMEOUT_MS } from "../server/stream-timing";
import { RETRIEVAL_TIMEOUT_MS, withRetrievalDeadline } from "./embeddings";

describe("retrieval deadline", () => {
  it("stays shorter than the first-token budget", () => {
    expect(RETRIEVAL_TIMEOUT_MS).toBe(2000);
    expect(RETRIEVAL_TIMEOUT_MS).toBeLessThan(FIRST_TOKEN_TIMEOUT_MS);
  });

  it("returns the embedding result when it finishes in time", async () => {
    const result = await withRetrievalDeadline(async () => "vectors", "lexical", 200);
    expect(result).toBe("vectors");
  });

  it("falls back to lexical search when embeddings miss the deadline", async () => {
    let aborted = false;
    const result = await withRetrievalDeadline(
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          const timer = setTimeout(() => _resolve("slow"), 200);
          signal.addEventListener("abort", () => {
            aborted = true;
            clearTimeout(timer);
            reject(new Error("aborted"));
          });
        }),
      "lexical",
      30,
    );
    expect(result).toBe("lexical");
    expect(aborted).toBe(true);
  });
});
