import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language/detect";
import {
  attachContactFooter,
  contactFooter,
  ensureContactFooter,
  replyHasContactRoute,
  shouldAppendContactFooter,
} from "./contacts";
import { getKnowledgeIndex } from "./index-store";

const index = getKnowledgeIndex();

async function readChunks(stream: ReadableStream<{ type: string; id?: string; delta?: string }>) {
  const reader = stream.getReader();
  const chunks: { type: string; id?: string; delta?: string }[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
}

describe("contact footer", () => {
  it("ends a Bengali no-answer with every clinic phone and booking link", () => {
    const language = detectLanguage("এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?");
    const block = contactFooter(index, language, { kind: "any" });
    expect(language.code).toBe("bn");
    expect(block).toMatch(/[\u0980-\u09FF]/);
    expect(block).toContain("02 4288 0737");
    expect(block).toContain("02 4216 9911");
    expect(block).toContain("02 4284 4486");
    expect(block).toContain("zavy360.com");
    expect(block).not.toContain("02 4062 8706");
    expect(shouldAppendContactFooter("এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?", 0)).toBe(true);
  });

  it("does not duplicate a reply that already has the contact route", () => {
    const reply = [
      "I don't know.",
      "Dapto Dentists — 02 4288 0737 — https://bookings.zavy360.com/booking/shellharbourdentists/locations/a",
      "Shellharbour Dentists — 02 4216 9911 — https://bookings.zavy360.com/booking/shellharbourdentists/locations/b",
      "Woonona Dentists — 02 4284 4486 — https://bookings.zavy360.com/booking/shellharbourdentists/locations/c",
    ].join("\n");
    expect(replyHasContactRoute(reply, index)).toBe(true);
    expect(ensureContactFooter(reply, index, detectLanguage(reply), { kind: "any" })).toBe(reply);
  });

  it("appends for off-topic questions and skips a greeting", () => {
    expect(shouldAppendContactFooter("Who won the world cup in 2022?", 4)).toBe(true);
    expect(shouldAppendContactFooter("২০২২ বিশ্বকাপ কে জিতেছে?", 3)).toBe(true);
    expect(shouldAppendContactFooter("hello", 0)).toBe(false);
    expect(shouldAppendContactFooter("How much is a check-up?", 3)).toBe(false);
  });

  it("writes the contact block into the answer stream before the text closes", async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "জানি না।" });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });
    const language = detectLanguage("জানি না কেন");
    const chunks = await readChunks(
      attachContactFooter(source, contactFooter(index, language, { kind: "any" }), (text) => replyHasContactRoute(text, index)),
    );
    const end = chunks.findIndex((chunk) => chunk.type === "text-end");
    const injected = chunks.slice(0, end).filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(injected).toContain("02 4288 0737");
    expect(injected).toContain("02 4216 9911");
    expect(injected).toContain("02 4284 4486");
    expect(injected).toContain("zavy360.com");
    expect(injected).not.toContain("02 4062 8706");
  });
});
