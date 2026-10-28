import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareTurn } from "../server/chat-route";
import { getKnowledgeIndex } from "../server/index-store";
import { applyGlossary } from "../server/glossary";
import { dedupePhoneLines, scrubForeignEnglish } from "../server/label-fix";
import { rewriteEnglishHours } from "../server/hours";
import { chooseCheckedTranscript, finishedMicLanguage, languageFromNativeScript, malayalamMishear, needsOpenTranscribe, speechEngineFor, spokenLanguageForTranscript, transcriptTooShort } from "../stt";
import { confidentIndonesian } from "../language/detect";

const index = getKnowledgeIndex();
const cases = JSON.parse(readFileSync(new URL("./typed-cases.json", import.meta.url), "utf8")) as { id: string; lang: string; q: string }[];

describe("live typed cases", () => {
  it("answers every attached case in that case's language", () => {
    for (const item of cases) {
      const turn = prepareTurn(
        [
          { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ, ডাপ্টো খোলা।" },
          { role: "user", content: item.q },
        ],
        "auto",
        index,
      );
      expect(turn.reply.code, item.id).toBe(item.lang);
    }
  });

  it("keeps a Hindi voice turn in Hindi after a Bengali reply", () => {
    const hindi = "मेरे दांत में दर्द है, क्या आज अपॉइंटमेंट मिल सकता है?";
    const turn = prepareTurn(
      [
        { role: "user", content: "আমার দাঁতে ব্যথা করছে, আজকে কি অ্যাপয়েন্টমেন্ট পাওয়া যাবে?" },
        { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ, অ্যাপয়েন্টমেন্ট পাওয়া যাবে।" },
        { role: "user", content: hindi },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "hi" },
    );
    expect(languageFromNativeScript(hindi)).toBe("hi");
    expect(turn.spokenLanguage).toBe("hi");
    expect(turn.reply.code).toBe("hi");
    expect(turn.reply.script).toBe("Devanagari");
  });

  it("localizes an English hours lead and does not borrow Hindi whitening into Malayalam", () => {
    const hours = rewriteEnglishHours("Dapto Dentists is open ശനിയാഴ്ച 08:00–16:00.", "ml");
    expect(hours).not.toContain("is open");
    expect(hours).toContain("തുറന്നിരിക്കുന്നു");
    expect(applyGlossary("teeth whitening", "ml")).toBe("പല്ലുകൾ വെളുപ്പിക്കൽ");
    expect(applyGlossary("പല്ല് സഫെദകരണം ചെയ്യാം", "ml")).toContain("പല്ലുകൾ വെളുപ്പിക്കൽ");
    expect(applyGlossary("പല്ല് സഫെദകരണം", "ml")).not.toContain("सफेद");
  });

  it("drops a glued Hindi copula and replaces an English reply that still has Bengali", () => {
    expect(dedupePhoneLines("Dapto Dentists का फ़ोन नंबर 02 4288 0737 है।है।")).toBe("Dapto Dentists का फ़ोन नंबर 02 4288 0737 है।");
    expect(scrubForeignEnglish("Woonona Dentists ফোন: 02 4284 4486।")).toBe("The phone number for Woonona Dentists is 02 4284 4486.");
  });

  it("shows Bangla after one finished Bengali utterance and checks Tamil with an open transcription", () => {
    expect(finishedMicLanguage("আমার দাঁতে ব্যথা করছে আজকে কি অ্যাপয়েন্টমেন্ট পাওয়া যাবে?")).toBe("bn");
    expect(needsOpenTranscribe("வூனோனா கிளினிக்கின் முகவரி என்ன?")).toBe(true);
    expect(needsOpenTranscribe("What time does the Dapto clinic open on Saturday?")).toBe(false);
    expect(needsOpenTranscribe("¿A qué hora abre la clínica de Dapto el sábado?")).toBe(false);
    expect(needsOpenTranscribe("apakah dokter gigi di Dapto buka?")).toBe(false);
    expect(confidentIndonesian("apakah dokter gigi di Dapto buka?")).toBe(true);
    expect(spokenLanguageForTranscript("id", "Woonona kliniker chikana")).not.toBe("id");
    expect(needsOpenTranscribe("Woonona kliniker chikana")).toBe(true);
    const tamil = "வூனோனா கிளினிக்";
    const malayalam = "വൂണോണ ക്ലിനിക്ക് എവിടെയാണ്";
    expect(chooseCheckedTranscript(tamil, malayalam)).toBe(malayalam);
    expect(chooseCheckedTranscript(tamil, tamil)).toBe(tamil);
    expect(chooseCheckedTranscript(tamil, null)).toBe("");
    expect(transcriptTooShort("")).toBe(true);
    expect(transcriptTooShort("What time does the Dapto clinic open?")).toBe(false);
    const forced = prepareTurn([{ role: "user", content: "What time does the Dapto clinic open on Saturday?" }], "ml", index, {
      inputMode: "voice",
      spokenLanguage: "en",
    });
    expect(forced.reply.code).toBe("ml");
    const indonesian = prepareTurn([{ role: "user", content: "Woonona kliniker chikana" }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "id",
    });
    expect(indonesian.reply.code).not.toBe("id");
  });

  it("sends Telugu and Kannada script to the Malayalam transcriber", () => {
    const telugu = "Woonona క్లినిక్ ఇండే విలాసం ఎందాన.";
    expect(malayalamMishear(telugu)).toBe(true);
    expect(languageFromNativeScript(telugu)).toBe("ml");
    expect(speechEngineFor({ transcript: telugu })).toBe("gpt-4o-transcribe");
    expect(languageFromNativeScript("வூனோனா கிளினிக்")).toBe("ta");
  });
});
