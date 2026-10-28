import { describe, expect, it } from "vitest";
import { needsServerFinalTranscript } from "../stt";
import { confidentLatinLanguage } from "../language/detect";
import { GEMINI_STT_PROMPT, geminiSttPrompt, openAiTranscribeProviderOptions, parseGeminiStt, resolveFinalTranscript, resolveFusedLiveFinal, STT_CLINIC_PROMPT, transcriptAnomaly } from "./final-transcript";

const SINHALA = "වූනෝනේ ක්ලිනික්හින්දේ විලාසයම් එන්දා.";
const THAANA = "ޑާބްޓޯކިއުނިކިޝަނިއާލްޗައިޕޯލްތުރަކު.";
const KANNADA = "ಡಾಕ್ಟೋ ಕ್ಲಿನಿಕ್inde ಫೋನ್ ನಂಬರ್ ಎಂದಾ.";
const ASSAMESE = "ডাক্তৰ ক্লিনিকৰ ফোন নম্বৰ এনদান।";
const TAMIL_MARKERS = "நீங்கள் பல் வெளுப்பிக்கல் சிகிச்சை செய்யாருண்டோ?";
const MALAYALAM = "വൂനോന ക്ലിനിക്കിന്റെ വിലാസം എന്താണ്?";
const BENGALI = "আমার দাঁতে ব্যথা করছে, আজকে কি অ্যাপয়েন্টমেন্ট পাওয়া যাবে?";
const TAMIL = "வூனோனா கிளினிக்கின் முகவரி என்ன?";

describe("final transcript from the bake-off", () => {
  it("marks Sinhala, Thaana, Kannada, Assamese, and Tamil-with-Malayalam-markers as anomalies", () => {
    expect(transcriptAnomaly(SINHALA)).toBe("foreign-script");
    expect(transcriptAnomaly(THAANA)).toBe("foreign-script");
    expect(transcriptAnomaly(KANNADA)).toBe("foreign-script");
    expect(transcriptAnomaly(ASSAMESE)).toBe("assamese");
    expect(transcriptAnomaly(TAMIL_MARKERS)).toBe("tamil-markers");
    expect(transcriptAnomaly("")).toBe("empty");
    expect(transcriptAnomaly("Woonona klinikinde vilasem endan")).toBe("manglish");
    expect(transcriptAnomaly("Dental implant in etre çelevakum")).toBe("manglish");
    expect(STT_CLINIC_PROMPT).toContain("Dapto");
    expect(STT_CLINIC_PROMPT).toContain("Woonona");
    expect(STT_CLINIC_PROMPT).toContain("Shellharbour");
    expect(openAiTranscribeProviderOptions().openai.prompt).toBe(STT_CLINIC_PROMPT);
    expect(openAiTranscribeProviderOptions("ml").openai.language).toBe("ml");
    expect(GEMINI_STT_PROMPT).toContain("not the word for doctor");
    expect(transcriptAnomaly(MALAYALAM)).toBeNull();
    expect(transcriptAnomaly(BENGALI)).toBeNull();
    expect(transcriptAnomaly(TAMIL)).toBeNull();
  });

  it("uses Gemini only when gpt-transcribe is an anomaly and Gemini says Malayalam", async () => {
    for (const anomaly of [SINHALA, THAANA, KANNADA, ASSAMESE, TAMIL_MARKERS]) {
      const result = await resolveFinalTranscript({
        audio: new Uint8Array(),
        deepgram: anomaly,
        gpt: async () => anomaly,
        gemini: async () => ({ lang: "ml", transcript: MALAYALAM }),
      });
      expect(result.transcript, anomaly).toBe(MALAYALAM);
      expect(result.language).toBe("ml");
      expect(result.sttEngine).toBe("gemini");
      expect(result.sttFallback).toBe(true);
    }
  });

  it("sends Latin Manglish to Gemini and answers in Malayalam", async () => {
    const manglish = "Dental implant in etre çelevakum";
    const malayalam = "ഡെന്റൽ ഇംപ്ലാന്റിന് എത്ര ചെലവാകും?";
    const result = await resolveFinalTranscript({
      audio: new Uint8Array(),
      deepgram: manglish,
      gpt: async () => manglish,
      gemini: async () => ({ lang: "ml", transcript: malayalam }),
    });
    expect(result.transcript).toBe(malayalam);
    expect(result.language).toBe("ml");
    expect(result.sttEngine).toBe("gemini");
    expect(result.sttFallback).toBe(true);
  });

  it("keeps a clean gpt-transcribe result and does not wait for Gemini", async () => {
    let aborted = false;
    const result = await resolveFinalTranscript({
      audio: new Uint8Array(),
      deepgram: "some live text",
      gpt: async () => BENGALI,
      gemini: (_hint, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    });
    expect(result.transcript).toBe(BENGALI);
    expect(result.language).toBe("bn");
    expect(result.sttEngine).toBe("gpt-transcribe");
    expect(result.sttFallback).toBe(false);
    expect(aborted).toBe(true);
  });

  it("uses the Malayalam/Tamil judge when the anomaly is not rescued as Malayalam", async () => {
    const result = await resolveFinalTranscript({
      audio: new Uint8Array(),
      deepgram: TAMIL_MARKERS,
      gpt: async () => TAMIL_MARKERS,
      gemini: async () => ({ lang: "ta", transcript: TAMIL }),
    });
    expect(result.language).toBe("ml");
    expect(result.sttFallback).toBe(true);
    expect(result.transcript).toBe(TAMIL_MARKERS);
  });

  it("uses Gemini as the Malayalam picker and gpt-transcribe as its timeout fallback", async () => {
    const primary = await resolveFinalTranscript({
      audio: new Uint8Array(),
      picker: "ml",
      gpt: async (language) => {
        expect(language).toBe("ml");
        return TAMIL_MARKERS;
      },
      gemini: async (hint) => {
        expect(hint).toBe("ml");
        expect(geminiSttPrompt(hint)).toContain(GEMINI_STT_PROMPT);
        expect(geminiSttPrompt(hint)).toContain("Malayalam");
        return { lang: "ml", transcript: MALAYALAM };
      },
    });
    expect(primary).toMatchObject({ transcript: MALAYALAM, language: "ml", sttEngine: "gemini", sttFallback: false });

    const fallback = await resolveFinalTranscript({
      audio: new Uint8Array(),
      picker: "ml",
      deepgram: TAMIL_MARKERS,
      gpt: async () => MALAYALAM,
      gemini: async () => null,
    });
    expect(fallback).toMatchObject({ transcript: MALAYALAM, language: "ml", sttEngine: "gpt-transcribe", sttFallback: true });
  });

  it("sends Tamil, Hindi, and Bengali pickers to gpt-transcribe with that language", async () => {
    for (const language of ["ta", "hi", "bn"] as const) {
      const seen: (string | undefined)[] = [];
      const result = await resolveFinalTranscript({
        audio: new Uint8Array(),
        picker: language,
        gpt: async (hint) => {
          seen.push(hint);
          return language === "ta" ? TAMIL : language === "hi" ? "मेरे दांत में दर्द है" : BENGALI;
        },
        gemini: async () => {
          throw new Error("gemini is not the primary engine");
        },
      });
      expect(seen).toEqual([language]);
      expect(result.sttEngine).toBe("gpt-transcribe");
      expect(result.sttFallback).toBe(false);
      expect(result.language).toBe(language);
    }
  });

  it("sends a confident-English Deepgram Manglish final through the fused route", async () => {
    const live = "Dental implant in etre çelevakum";
    const malayalam = "ഡെന്റൽ ഇംപ്ലാന്റിന് എത്ര ചെലവാകും?";
    const english = confidentLatinLanguage("Dental implant cost at Dapto");
    expect(english).toBe("en");
    expect(needsServerFinalTranscript(live, null)).toBe(true);
    const result = await resolveFusedLiveFinal({
      liveTranscript: live,
      gpt: async () => "How much does a dental implant cost at Dapto?",
      gemini: async () => ({ lang: "ml", transcript: malayalam }),
    });
    expect(result.fused).toBe(true);
    expect(result.language).toBe("ml");
    expect(result.sttEngine).toBe("gemini");
    expect(result.transcript).toBe(malayalam);
    expect(result.sttFallback).toBe(true);
  });

  it("keeps gpt or the Deepgram final when Gemini is empty or throws", async () => {
    const live = "Dental implant in etre çelevakum";
    const gptText = "How much does a dental implant cost?";
    const empty = await resolveFusedLiveFinal({
      liveTranscript: live,
      gpt: async () => gptText,
      gemini: async () => ({ lang: "ml", transcript: "" }),
    });
    expect(empty.fused).toBe(true);
    expect(empty.transcript).toBe(gptText);
    expect(empty.language).toBe("ml");
    const thrown = await resolveFusedLiveFinal({
      liveTranscript: live,
      gpt: async () => {
        throw new Error("gpt down");
      },
      gemini: async () => {
        throw new Error("gemini down");
      },
    });
    expect(thrown.transcript).toBe(live);
    expect(thrown.language).toBe("ml");
    expect(thrown.transcript.trim().length).toBeGreaterThan(0);
  });

  it("sends the clinic prompt on the Bengali picker path", async () => {
    let language: string | undefined;
    const result = await resolveFinalTranscript({
      audio: new Uint8Array(),
      picker: "bn",
      deepgram: "ডাক্তার ক্লিনিকের",
      gpt: async (code) => {
        language = code;
        return "ডাপ্টো ক্লিনিকের ফোন নম্বর কী?";
      },
    });
    expect(language).toBe("bn");
    expect(result.transcript).toContain("ডাপ্টো");
    expect(openAiTranscribeProviderOptions("bn").openai.prompt).toContain("Dapto");
    expect(openAiTranscribeProviderOptions("bn").openai.prompt).toContain("Woonona");
  });

  it("keeps confident English, Spanish, Chinese, and Arabic on Deepgram", () => {
    expect(needsServerFinalTranscript("What time does the Dapto clinic open on Saturday?", null)).toBe(false);
    expect(needsServerFinalTranscript("¿A qué hora abre la clínica de Dapto el sábado?", null)).toBe(false);
    expect(needsServerFinalTranscript("达普托诊所星期六几点开门？", null)).toBe(false);
    expect(needsServerFinalTranscript("كم تكلفة زراعة الأسنان؟", null)).toBe(false);
    expect(needsServerFinalTranscript(TAMIL, null)).toBe(true);
    expect(needsServerFinalTranscript(SINHALA, null)).toBe(true);
    expect(needsServerFinalTranscript("", null)).toBe(true);
    expect(needsServerFinalTranscript(TAMIL, "ta")).toBe(true);
    expect(needsServerFinalTranscript(MALAYALAM, "ml")).toBe(true);
    expect(needsServerFinalTranscript("¿Puedo reservar?", "es")).toBe(false);
  });

  it("reads the Gemini JSON object", () => {
    expect(parseGeminiStt(`{"lang":"ml","transcript":"${MALAYALAM}"}`)).toEqual({ lang: "ml", transcript: MALAYALAM });
    expect(geminiSttPrompt(null)).toBe(GEMINI_STT_PROMPT);
  });
});
