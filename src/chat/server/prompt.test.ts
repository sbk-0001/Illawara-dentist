import { describe, expect, it } from "vitest";
import { getKnowledgeIndex } from "./index-store";
import { buildInstructions } from "./prompt";
import { prepareTurn } from "./chat-route";

const index = getKnowledgeIndex();

describe("prompt rules", () => {
  it("tells a Banglish visitor to stay in romanised Bengali and includes real contacts", () => {
    const turn = prepareTurn([{ role: "user", parts: [{ type: "text", text: "Dapto te check up er dam koto?" }] }], "auto", index);
    expect(turn.reply.code).toBe("bn-Latn");
    expect(turn.instructions).toContain("Banglish");
    expect(turn.instructions).toContain(index.contacts.dapto.phone);
    expect(turn.instructions).toContain(index.contacts.dapto.bookingUrl);
    expect(turn.instructions).not.toContain("02 4210 5301");
  });

  it("asks which clinic for an unspecified hours question", () => {
    const turn = prepareTurn([{ role: "user", content: "What are your Saturday hours?" }], "auto", index);
    expect(turn.focus).toEqual({ kind: "ask" });
    expect(turn.instructions).toMatch(/which of Dapto, Shellharbour or Woonona/i);
  });

  it("puts 000 in the first-sentence rule for severe symptoms", () => {
    const turn = prepareTurn([{ role: "user", content: "I can't breathe and my face is swelling" }], "en", index);
    expect(turn.severe).toBe(true);
    expect(turn.reply.source).toBe("picker");
    expect(turn.instructions).toContain("call 000");
  });

  it("says the language could not be detected for gibberish", () => {
    const instructions = buildInstructions({
      index,
      language: { code: "en", label: "English", script: "Latin", dir: "ltr", fallback: true, source: "fallback" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
    });
    expect(instructions).toMatch(/could not be detected/i);
    expect(instructions).toContain("NO RELEVANT PAGES");
  });
});
