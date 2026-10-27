import { describe, expect, it } from "vitest";
import { drainStatusTag } from "./status-tag";
import { createRetryingTextStream, type ChatTimingEvent } from "./stream-timing";

async function readDeltas(stream: ReadableStream<{ type: string; text?: string }>): Promise<string[]> {
  const reader = stream.getReader();
  const deltas: string[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) return deltas;
    if (next.value.type === "text-delta" && next.value.text) deltas.push(next.value.text);
  }
}

describe("status tag", () => {
  it("holds a tag split across buffers and never releases a partial tag", () => {
    const held = drainStatusTag("[[", false);
    expect(held).toMatchObject({ visible: "", hold: "[[", decided: false, tag: null, missing: false });
    const closed = drainStatusTag(`${held.hold}A]] Monday to Friday.`, false);
    expect(closed).toMatchObject({ visible: "Monday to Friday.", hold: "", decided: true, tag: "A", missing: false });
    expect(closed.visible).not.toContain("[[");

    const pieces = ["[", "[", "N", "]", "]"];
    let buffer = "";
    for (const piece of pieces) {
      buffer += piece;
      const step = drainStatusTag(buffer, false);
      expect(step.visible).toBe("");
      expect(step.visible).not.toContain("[");
      if (!step.decided) buffer = step.hold;
    }
    const answer = drainStatusTag("抱歉，我无法确认。", false);
    expect(answer.missing).toBe(true);

    expect(drainStatusTag("[[NO_ANSWER]]", false)).toMatchObject({
      visible: "[[NO_ANSWER]]",
      decided: true,
      tag: null,
      missing: true,
    });
    expect(drainStatusTag("[[G]]\nXin chào", true)).toMatchObject({ visible: "Xin chào", tag: "G", missing: false });
  });

  it("strips a tag split across stream chunks and logs when the tag is missing", async () => {
    const present: ChatTimingEvent[] = [];
    let status: { tag: string | null; missing: boolean } | undefined;
    const tagged = createRetryingTextStream({
      language: "fr",
      timeoutMs: 200,
      log: (event) => present.push(event),
      onStatus: (next) => {
        status = next;
      },
      run: async function* () {
        yield { type: "text-delta", text: "[[" };
        yield { type: "text-delta", text: "A]]" };
        yield { type: "text-delta", text: " Ouvert de 8h à 18h." };
      },
    });
    const deltas = await readDeltas(tagged);
    expect(deltas.join("")).toBe("Ouvert de 8h à 18h.");
    expect(deltas.some((delta) => delta.includes("[[") || delta.includes("]]"))).toBe(false);
    expect(status).toEqual({ tag: "A", missing: false });
    expect(present).toHaveLength(1);
    expect(present[0]?.tag_missing).toBe(false);
    expect(JSON.stringify(present[0])).not.toMatch(/AI_GATEWAY|api[_-]?key|prompt/i);

    const missing: ChatTimingEvent[] = [];
    const untagged = createRetryingTextStream({
      language: "zh",
      timeoutMs: 200,
      log: (event) => missing.push(event),
      run: async function* () {
        yield { type: "text-delta", text: "抱歉，我无法确认。" };
      },
    });
    expect((await readDeltas(untagged)).join("")).toBe("抱歉，我无法确认。");
    expect(missing[0]?.tag_missing).toBe(true);
    expect(JSON.stringify(missing[0])).not.toMatch(/\[\[A\]\]|\[\[N\]\]|\[\[G\]\]/);
  });
});
