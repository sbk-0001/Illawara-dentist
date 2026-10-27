import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language/detect";
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

  it("gives Shellharbour's main number unless an alternative is requested", () => {
    const normal = prepareTurn([{ role: "user", content: "What is the phone number for Shellharbour?" }], "en", index);
    expect(normal.instructions).toContain("02 4216 9911");
    expect(normal.instructions).not.toContain("02 4062 8706");
    expect(normal.instructions).toMatch(/main phone/i);
    const alternate = prepareTurn([{ role: "user", content: "Is there an alternative phone number for Shellharbour?" }], "en", index);
    expect(alternate.instructions).toContain("02 4062 8706");
  });

  it("does not ask for a no-other-answer line when pages matched", () => {
    const turn = prepareTurn([{ role: "user", content: "Do you offer dental implants?" }], "en", index);
    expect(turn.chunks.length).toBeGreaterThan(0);
    expect(turn.instructions).toMatch(/no other answer on the website/i);
    expect(turn.instructions).not.toContain("NO RELEVANT PAGES");
  });

  it("does not force English when a Latin question is real but unnamed", () => {
    const detected = detectLanguage("Quosta mendera florita belano");
    const instructions = buildInstructions({
      index,
      language: detected,
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "Quosta mendera florita belano",
    });
    expect(detected.fallback).toBe(false);
    expect(instructions).not.toMatch(/could not be detected/i);
    expect(instructions).toMatch(/same language and script as the visitor's latest message/i);
  });

  it("quotes an inexact published fee instead of assigning it to the asked item", () => {
    const instructions = buildInstructions({
      index,
      language: { code: "en", label: "English", script: "Latin", dir: "ltr", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "How much are zirconia implants?",
    });
    expect(instructions).toMatch(/does not list that exact item/i);
    expect(instructions).toMatch(/from \$5000/i);
    expect(instructions).toMatch(/\$30 a week/i);
    expect(instructions).toMatch(/zirconia/i);
    expect(instructions).toMatch(/phone and booking link/i);
  });

  it("tells Persian replies to keep Western digits", () => {
    const instructions = buildInstructions({
      index,
      language: { code: "fa", label: "فارسی", script: "Arabic", dir: "rtl", fallback: false, source: "detected" },
      focus: { kind: "one", clinic: "dapto" },
      severe: false,
      chunks: [],
      question: "شماره تلفن داپتو چیست؟",
    });
    expect(instructions).toMatch(/Western digits/);
    expect(instructions).toContain("0-9");
    expect(instructions).toContain("02 4288 0737");
    expect(instructions).not.toMatch(/[۰-۹٠-٩]/);
  });

  it("asks for the no-answer marker only when no pages were found", () => {
    const missed = buildInstructions({
      index,
      language: { code: "en", label: "English", script: "Latin", dir: "ltr", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
    });
    expect(missed).toContain("[[NO_ANSWER]]");
    const found = prepareTurn([{ role: "user", content: "Do you offer dental implants?" }], "en", index);
    expect(found.sources.length).toBeGreaterThan(0);
    expect(found.instructions).toMatch(/Do not write \[\[NO_ANSWER\]\]/);
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
