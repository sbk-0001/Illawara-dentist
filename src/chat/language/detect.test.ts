import { describe, expect, it } from "vitest";
import { EVAL_CASES, SEVERE_SAMPLES } from "../eval/cases";
import { isSevereEmergency } from "../intent";
import { detectLanguage, resolveReplyLanguage } from "./detect";

describe("detectLanguage", () => {
  it("detects every eval prompt as that language and script", () => {
    for (const item of EVAL_CASES) {
      const detected = detectLanguage(item.prompt);
      expect(detected.code, item.id).toBe(item.language);
      expect(detected.fallback, item.id).toBe(false);
    }
  });

  it("detects Arabic, Hebrew, Urdu and Persian, including direction", () => {
    expect(detectLanguage("ما هي ساعات العمل في العيادة؟")).toMatchObject({ code: "ar", dir: "rtl" });
    expect(detectLanguage("מה שעות הפעילות במרפאה?")).toMatchObject({ code: "he", dir: "rtl", script: "Hebrew" });
    expect(detectLanguage("ڈاپٹو کلینک ہفتہ کو کتنے بجے کھلتا ہے؟")).toMatchObject({ code: "ur", dir: "rtl" });
    expect(detectLanguage("ساعت کاری کلینیک داپتو در روز شنبه چیست؟")).toMatchObject({ code: "fa", dir: "rtl" });
  });

  it("keeps Banglish and Hinglish in Latin script", () => {
    expect(detectLanguage("amar daat e byatha, Dapto te appointment kobe pabo?")).toMatchObject({ code: "bn-Latn", script: "Latin" });
    expect(detectLanguage("mujhe Dapto me kal appointment chahiye, fees kitni hai?")).toMatchObject({ code: "hi-Latn", script: "Latin" });
  });

  it("follows a mixed message by its dominant script", () => {
    expect(detectLanguage("Hello, ما هي الرسوم في العيادة؟").code).toBe("ar");
  });

  it("falls back to English only when the language cannot be told", () => {
    const detected = detectLanguage("asdfgh qwerty zxcvbn plmokn");
    expect(detected.fallback).toBe(true);
    expect(detected.code).toBe("en");
    expect(detectLanguage("What are your Saturday hours in Dapto?").code).toBe("en");
  });

  it("uses only the latest turn, so a language switch is not stuck on the first one", () => {
    const first = detectLanguage("What are your fees?");
    const second = detectLanguage("كم تبلغ الرسوم؟");
    expect(first.code).toBe("en");
    expect(second.code).toBe("ar");
  });
});

describe("language picker", () => {
  it("forces the reply language whatever was typed", () => {
    const forced = resolveReplyLanguage("What time do you open on Saturday?", "ar");
    expect(forced).toMatchObject({ code: "ar", dir: "rtl", source: "picker", fallback: false });
  });

  it("stays on auto detection by default", () => {
    const detected = resolveReplyLanguage("¿Cuál es el horario del sábado?", "auto");
    expect(detected.code).toBe("es");
    expect(detected.source).toBe("detected");
  });

  it("ignores an unknown picker value and detects instead", () => {
    expect(resolveReplyLanguage("Ποιες είναι οι ώρες;", "klingon").code).toBe("el");
  });
});

describe("severe symptoms", () => {
  it("flags trouble breathing and spreading swelling in the eval languages", () => {
    for (const sample of SEVERE_SAMPLES) {
      expect(isSevereEmergency(sample.text), sample.language).toBe(true);
    }
    expect(isSevereEmergency("I have a broken tooth")).toBe(false);
  });
});
