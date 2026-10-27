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

  it("tells every language to translate hours and keep names", () => {
    const instructions = buildInstructions({
      index,
      language: { code: "fa", label: "فارسی", script: "Arabic", dir: "rtl", fallback: false, source: "detected" },
      focus: { kind: "one", clinic: "woonona" },
      severe: false,
      chunks: [],
      question: "ساعات کاری وونونا چیست؟",
    });
    expect(instructions).toMatch(/Translate day names/i);
    expect(instructions).toMatch(/quote the matching line below verbatim/i);
    expect(instructions).toMatch(/دوشنبه تا جمعه/);
    expect(instructions).toContain("8:00 تا 18:00");
    expect(instructions).not.toMatch(/8\.00 AM/);
    expect(instructions).not.toMatch(/Monday – Friday/);
    expect(instructions).toMatch(/Latin letters only/);
    expect(instructions).toMatch(/proper names verbatim/i);
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

  it("requires a status tag and uses [[N]] only when no pages were found", () => {
    const missed = buildInstructions({
      index,
      language: { code: "en", label: "English", script: "Latin", dir: "ltr", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
    });
    expect(missed).toContain("STATUS TAG");
    expect(missed).toContain("[[A]]");
    expect(missed).toContain("[[G]]");
    expect(missed).toMatch(/Start with \[\[N\]\]/);
    expect(missed).not.toContain("[[NO_ANSWER]]");
    const found = prepareTurn([{ role: "user", content: "Do you offer dental implants?" }], "en", index);
    expect(found.sources.length).toBeGreaterThan(0);
    expect(found.instructions).toMatch(/start with \[\[A\]\]/);
    expect(found.instructions).toMatch(/Do not start with \[\[N\]\]/);
    expect(found.instructions).not.toContain("[[NO_ANSWER]]");
  });

  it("puts status-tag examples at the end and localises directory labels", () => {
    const language = { code: "bn", label: "বাংলা", script: "Bengali", dir: "ltr" as const, fallback: false, source: "detected" as const };
    const bn = buildInstructions({ index, language, focus: { kind: "one", clinic: "shellharbour" }, severe: false, chunks: [], question: "ফোন নম্বর কী?" });
    expect(bn.lastIndexOf("[[G]]")).toBeGreaterThan(bn.lastIndexOf("CONTEXT"));
    expect(bn.indexOf("[[A]]")).toBeLessThan(bn.indexOf("LANGUAGE"));
    expect(bn).toMatch(/at least one full sentence/i);
    expect(bn).toContain(`ফোন: ${index.contacts.shellharbour.phone}`);
    expect(bn).toContain(`বুকিং: ${index.contacts.shellharbour.bookingUrl}`);
    expect(bn).toContain("ইমেইল:");
    expect(bn).toContain("ঠিকানা:");
    expect(bn).not.toContain("Phone:");
    expect(bn).not.toContain("Booking:");
    expect(bn).not.toContain("Email:");
    expect(bn).not.toContain("Address:");
    const ar = buildInstructions({
      index,
      language: { code: "ar", label: "العربية", script: "Arabic", dir: "rtl", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "ما رقم الهاتف؟",
    });
    expect(ar).toContain(`الهاتف: ${index.contacts.dapto.phone}`);
    expect(ar).not.toContain("Phone:");
    const hi = buildInstructions({
      index,
      language: { code: "hi", label: "हिन्दी", script: "Devanagari", dir: "ltr", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "फ़ोन नंबर क्या है?",
    });
    expect(hi).toContain(`फ़ोन: ${index.contacts.dapto.phone}`);
    expect(hi).toContain("बुकिंग:");
    expect(hi).not.toContain("Phone:");
    const id = buildInstructions({
      index,
      language: { code: "id", label: "Bahasa Indonesia", script: "Latin", dir: "ltr", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "Berapa nomor telepon Shellharbour?",
    });
    expect(id).toContain(`Telepon: ${index.contacts.shellharbour.phone}`);
    expect(id).toContain("Pemesanan:");
    expect(id).toContain("Alamat:");
    expect(id).not.toContain("Phone:");
    expect(id).not.toContain("Booking:");
  });

  it("localises Phone and Booking labels in a French directory", () => {
    const instructions = buildInstructions({
      index,
      language: { code: "fr", label: "Français", script: "Latin", dir: "ltr", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "Quel est le téléphone de Dapto ?",
    });
    expect(instructions).toContain(`Téléphone : ${index.contacts.dapto.phone}`);
    expect(instructions).toContain(`Réservation : ${index.contacts.dapto.bookingUrl}`);
    expect(instructions).not.toContain(`Phone: ${index.contacts.dapto.phone}`);
    expect(instructions).not.toContain(`Booking: ${index.contacts.dapto.bookingUrl}`);
  });

  it("does not require a verbatim hours line when the question is not about hours", () => {
    const instructions = buildInstructions({
      index,
      language: { code: "en", label: "English", script: "Latin", dir: "ltr", fallback: false, source: "detected" },
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "Do you offer dental implants?",
    });
    expect(instructions).not.toMatch(/quote the matching line verbatim/i);
    expect(instructions).toContain("Monday–Friday 8:00 AM–6:00 PM");
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
