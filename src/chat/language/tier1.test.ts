import { describe, expect, it } from "vitest";
import { LANGUAGE_OPTIONS } from "./catalog";
import { detectLanguage } from "./detect";
import { applyGlossary } from "../server/glossary";
import { prepareTurn } from "../server/chat-route";
import { getKnowledgeIndex } from "../server/index-store";
import { expandQuery } from "../retrieval/search";
import { formatClinicHours } from "../server/hours";
import { tryAgainMessage } from "../server/system-text";
import { contactFooter } from "../server/contacts";
import { deepgramLanguageHints, micListeningNote, repairModelFor, speechEngineFor } from "../stt";

const index = getKnowledgeIndex();

describe("tier-1 languages", () => {
  it("lists the picker with Auto implied first and the eight languages next", () => {
    expect(LANGUAGE_OPTIONS.slice(0, 8).map((option) => option.code)).toEqual(["en", "zh", "ml", "ta", "hi", "ar", "es", "bn"]);
  });

  it("detects Malayalam and Tamil script, and romanised Manglish, Tanglish, Arabizi and pinyin", () => {
    expect(detectLanguage("വൂണോണ ക്ലിനിക്കിന്റെ വിലാസം എന്താണ്?")).toMatchObject({ code: "ml", script: "Malayalam" });
    expect(detectLanguage("வூனோனா கிளினிக் முகவரி என்ன?")).toMatchObject({ code: "ta", script: "Tamil" });
    expect(detectLanguage("clinic evide aanu")).toMatchObject({ code: "ml-Latn" });
    expect(detectLanguage("enga irukku eppo")).toMatchObject({ code: "ta-Latn" });
    expect(detectLanguage("3iyada maw3ed")).toMatchObject({ code: "ar-Latn" });
    expect(detectLanguage("zhensuo dianhua")).toMatchObject({ code: "zh-Latn" });
    expect(detectLanguage("What time does Dapto open?")).toMatchObject({ code: "en" });
  });

  it("answers each tier-1 voice turn in that script, and switches without using the previous turn", () => {
    const malayalam = "വൂണോണ ക്ലിനിക്കിന്റെ വിലാസം എന്താണ്?";
    const tamil = "வூனோனா கிளினிக் எப்போது திறந்திருக்கும்?";
    const cases = [
      ["ml", malayalam, "Malayalam"],
      ["ta", "எனக்கு பல்வலி, அப்பாயிண்ட்மெண்ட் கிடைக்குமா?", "Tamil"],
      ["hi", "मेरे दांत में दर्द है आज अपॉइंटमेंट मिलेगा?", "Devanagari"],
      ["ar", "ما هو عنوان عيادة وونونا؟", "Arabic"],
      ["zh", "伍诺纳诊所的地址在哪里？", "Han"],
      ["es", "¿Puedo reservar en Shellharbour el sábado?", "Latin"],
      ["bn", "আমার দাঁতে ব্যথা করছে আজকে কি অ্যাপয়েন্টমেন্ট পাওয়া যাবে?", "Bengali"],
    ] as const;
    for (const [code, text, script] of cases) {
      const turn = prepareTurn([{ role: "user", content: text }], "auto", index, { inputMode: "voice", spokenLanguage: code });
      expect(turn.reply.code, text).toBe(code);
      expect(turn.reply.script, text).toBe(script);
    }

    const toMalayalam = prepareTurn(
      [
        { role: "assistant", metadata: { language: "en" }, content: "Dapto is open." },
        { role: "user", content: malayalam },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "en" },
    );
    expect(toMalayalam.reply.code).toBe("ml");

    const toTamil = prepareTurn(
      [
        { role: "assistant", metadata: { language: "ml" }, content: "വിലാസം ഇതാണ്." },
        { role: "user", content: tamil },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "ml" },
    );
    expect(toTamil.reply.code).toBe("ta");

    const picked = prepareTurn([{ role: "user", content: "What time does Dapto open on Saturday?" }], "ml", index, {
      inputMode: "voice",
      spokenLanguage: "en",
    });
    expect(picked.reply.code).toBe("ml");
    expect(picked.instructions).toContain("Write in Malayalam, using Malayalam script.");
    expect(picked.instructions).toContain("warm person at the clinic desk");
  });

  it("translates the same dental words for every tier-1 language and finds the English pages", () => {
    expect(applyGlossary("toothache appointment whitening implant", "ml")).toContain("പല്ലുവേദന");
    expect(applyGlossary("toothache appointment whitening implant", "ta")).toContain("பல்வலி");
    expect(applyGlossary("opening hours address phone fees", "hi")).toContain("पता");
    expect(applyGlossary("opening hours address phone fees", "ar")).toContain("العنوان");
    expect(applyGlossary("opening hours address phone fees", "zh")).toContain("地址");
    expect(applyGlossary("opening hours address phone fees", "es")).toContain("dirección");
    expect(applyGlossary("opening hours address phone fees", "bn")).toContain("ঠিকানা");
    expect(expandQuery("പല്ലുവേദന")).toMatch(/toothache/);
    expect(expandQuery("பல்வலி")).toMatch(/toothache/);
    expect(expandQuery("ഇംപ്ലാന്റ്")).toMatch(/implant/);
    expect(expandQuery("\u0b87\u0bae\u0bcd\u0baa\u0bcd\u0bb3\u0bbe\u0ba3\u0bcd\u0b9f\u0bcd")).toMatch(/implant/);
    expect(formatClinicHours("dapto", "ml")).not.toContain("Monday");
    expect(formatClinicHours("dapto", "ta")).not.toContain("Monday");
    expect(tryAgainMessage("ml", [])).toContain("വീണ്ടും");
    expect(tryAgainMessage("ta", [])).toContain("மீண்டும்");
    expect(contactFooter(index, detectLanguage("വിലാസം എന്താണ്?"), { kind: "one", clinic: "woonona" })).toContain("ഫോൺ");
  });

  it("sends Malayalam to gpt-4o-transcribe and keeps the other seven on Nova-3", () => {
    expect(speechEngineFor({ picker: "ml" })).toBe("gpt-4o-transcribe");
    expect(speechEngineFor({ transcript: "വൂണോണ ക്ലിനിക്ക് എവിടെയാണ്" })).toBe("gpt-4o-transcribe");
    expect(speechEngineFor({ transcript: "clinic evide aanu" })).toBe("gpt-4o-transcribe");
    expect(repairModelFor("ml", "")).toBe("openai/gpt-4o-transcribe");
    expect(deepgramLanguageHints("ml")).toEqual(["en"]);
    for (const code of ["en", "zh", "hi", "ar", "es", "bn"]) {
      expect(speechEngineFor({ picker: code }), code).toBe("deepgram");
      expect(repairModelFor(code, "already native"), code).toBe("openai/gpt-4o-mini-transcribe");
    }
    expect(speechEngineFor({ picker: "ta" })).toBe("deepgram");
    expect(repairModelFor("ta", "வூனோனா கிளினிக்")).toBe("openai/gpt-4o-mini-transcribe");
    expect(repairModelFor("ta", "Woonona clinic")).toBe("openai/gpt-4o-transcribe");
    expect(micListeningNote("ml")).toBe("കേൾക്കുന്നു · മലയാളം");
    expect(micListeningNote("ta")).toBe("கேட்கிறேன் · தமிழ்");
    expect(deepgramLanguageHints("ta")).toEqual(["ta", "en"]);
  });
});
