import { describe, expect, it } from "vitest";
import { clinicFocus } from "../intent";
import { coreIntent, coreTemplate } from "./core-reply";
import { getKnowledgeIndex } from "./index-store";
import misses from "./intent-misses.json";
import templates from "./templates-v2.json";

const index = getKnowledgeIndex();
const LANGS = ["en", "zh", "ml", "ta", "hi", "ar", "es", "bn"] as const;
const CLINICS = ["dapto", "shellharbour", "woonona"] as const;
const PHONES = ["02 4288 0737", "02 4216 9911", "02 4284 4486"];

const QUESTIONS = {
  hours: "What are your opening hours?",
  address: "What is the address?",
  phone: "What is the phone number?",
  ache: "I have a toothache",
  white: "Do you offer teeth whitening?",
  implant: "How much does a dental implant cost?",
} as const;

/** Transcripts that do not actually ask the labelled question. The model answers these. */
const EXPECT_LLM = new Set([
  "run28:m_pick_ml_hours_1_noisy",
  "run30:m_auto_ml_hours_1_noisy",
  "run30:m_pick_ml_hours_1_noisy",
  "run32:m_auto_ml_hours_1_noisy",
]);

function walkStrings(value: unknown, out: string[]) {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value)) walkStrings(child, out);
  }
}

describe("reviewed templates", () => {
  it("renders each core reply in each language with phones intact and no doubled asterisks", () => {
    const rendered: string[] = [];
    for (const code of LANGS) {
      for (const question of Object.values(QUESTIONS)) {
        for (const focus of [{ kind: "any" as const }, ...CLINICS.map((clinic) => ({ kind: "one" as const, clinic }))]) {
          const text = coreTemplate(question, code, focus, index);
          expect(text, `${code} ${question}`).toBeTruthy();
          expect(text).not.toContain("**");
          expect(text).not.toMatch(/\{[a-z_]+\}/);
          rendered.push(text ?? "");
        }
      }
    }
    for (const phone of PHONES) {
      expect(rendered.some((text) => text.includes(phone))).toBe(true);
    }
    const phoneAll = coreTemplate(QUESTIONS.phone, "en", { kind: "any" }, index) ?? "";
    for (const phone of PHONES) expect(phoneAll).toContain(phone);
    expect(phoneAll).toContain("Here are the phone numbers");
    expect(coreTemplate(QUESTIONS.address, "en", { kind: "any" }, index)).toContain("Here are the addresses");
    expect(coreTemplate(QUESTIONS.hours, "en", { kind: "any" }, index)).toMatch(/^It depends on the clinic\./);
  });

  it("keeps $5000 off every Shellharbour implant reply and gives Dapto the consult", () => {
    for (const code of LANGS) {
      const shell = coreTemplate(QUESTIONS.implant, code, { kind: "one", clinic: "shellharbour" }, index) ?? "";
      expect(shell, code).toContain("$4500*");
      expect(shell, code).not.toContain("$5000");
      const dapto = coreTemplate(QUESTIONS.implant, code, { kind: "one", clinic: "dapto" }, index) ?? "";
      expect(dapto, code).not.toMatch(/\$4500|\$5000/);
      expect(dapto, code).toContain("$50");
    }
  });

  it("stores the reviewed strings without a doubled asterisk", () => {
    const strings: string[] = [];
    walkStrings(templates, strings);
    expect(strings.length).toBeGreaterThan(40);
    for (const text of strings) expect(text).not.toContain("**");
  });

  it("matches every non-garbled intent miss and leaves garbled ones to the model", () => {
    for (const miss of misses.misses) {
      const got = coreIntent(miss.text);
      if (EXPECT_LLM.has(miss.src)) {
        expect(got, miss.src).toBeNull();
        continue;
      }
      if (miss.text.includes("എവിടെ")) {
        expect(got, miss.src).toBe("address");
        continue;
      }
      expect(got, `${miss.src} ${miss.text}`).toBe(miss.intent === "white" ? "white" : miss.intent);
      expect(coreTemplate(miss.text, miss.lang, clinicFocus(miss.text), index), miss.src).toBeTruthy();
    }
  });
});
