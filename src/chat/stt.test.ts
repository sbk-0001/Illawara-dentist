import { describe, expect, it } from "vitest";
import { correctTranscript, deepgramLanguageHints, deepgramListenUrl, formatLiveDrop, keytermsForHints, majoritySpokenLanguage, micListeningNote, normalizeSpokenLanguage, STT_KEYTERMS, transcriptNeedsRepair, votesFromAlternative } from "./stt";

describe("Deepgram Nova-3 keyterms", () => {
  it("keeps language=multi and repeats keyterm for each clinic phrase", () => {
    for (const url of [deepgramListenUrl("stream"), deepgramListenUrl("prerecorded")]) {
      const params = new URL(url.replace(/^wss:/, "https:")).searchParams;
      expect(params.get("model")).toBe("nova-3");
      expect(params.get("language")).toBe("multi");
      expect(params.getAll("language_hint")).toEqual(["en"]);
      expect(params.getAll("keyterm")).toEqual([...STT_KEYTERMS]);
      expect(url).not.toMatch(/keywords=/);
      expect(url).not.toMatch(/keyterm=[^&]*:/);
    }
    expect(deepgramListenUrl("stream")).toContain("interim_results=true");
    expect(deepgramListenUrl("stream")).toContain("endpointing=400");
    expect(deepgramListenUrl("prerecorded")).not.toContain("interim_results");
    expect(deepgramListenUrl("stream").startsWith("wss://")).toBe(true);
    expect(deepgramListenUrl("prerecorded").startsWith("https://")).toBe(true);
  });

  it("hints Bengali plus English and drops Latin keyterms that pull names into Latin", () => {
    expect(deepgramLanguageHints("bn")).toEqual(["bn", "en"]);
    expect(deepgramLanguageHints("bn-Latn")).toEqual(["bn", "en"]);
    expect(deepgramLanguageHints("ur")).toEqual(["en"]);
    const params = new URL(deepgramListenUrl("stream", "bn").replace(/^wss:/, "https:")).searchParams;
    expect(params.get("language")).toBe("multi");
    expect(params.getAll("language_hint")).toEqual(["bn", "en"]);
    const terms = params.getAll("keyterm");
    expect(terms).toEqual(keytermsForHints(["bn", "en"]));
    expect(terms).toContain("ডাপ্টো");
    expect(terms).toContain("উনোনা");
    expect(terms).toContain("শেলহারবার");
    expect(terms).not.toContain("Dapto");
    expect(terms).not.toContain("Woonona");
    expect(deepgramListenUrl("prerecorded", "hi")).toContain("language_hint=hi");
    expect(new URL(deepgramListenUrl("prerecorded", "hi")).searchParams.getAll("keyterm")).toContain("वूनोना");
    expect(new URL(deepgramListenUrl("prerecorded", "hi")).searchParams.getAll("keyterm")).not.toContain("Dapto");
  });

  it("takes the majority spoken language from words, and a tie is not a majority", () => {
    expect(normalizeSpokenLanguage("en-AU")).toBe("en");
    expect(normalizeSpokenLanguage("not-a-language")).toBeNull();
    expect(normalizeSpokenLanguage("bn-Latn")).toBe("bn");
    const words = votesFromAlternative({
      languages: ["id"],
      words: [{ language: "bn" }, { language: "bn" }, { language: "en" }],
    });
    expect(majoritySpokenLanguage(words)).toBe("bn");
    expect(majoritySpokenLanguage(["en", "bn"])).toBeNull();
    expect(majoritySpokenLanguage(votesFromAlternative({ languages: ["bn", "en"] }))).toBe("bn");
    expect(transcriptNeedsRepair("bn", "Dapto clinic Saturday kokhon khola thake?")).toBe(true);
    expect(transcriptNeedsRepair("bn", "ডাপ্টো ক্লিনিক শনিবার কখন খোলা থাকে?")).toBe(false);
    expect(transcriptNeedsRepair("en", "What time does Dapto open?")).toBe(false);
    expect(micListeningNote("bn")).toBe("শুনছি · বাংলা");
    expect(micListeningNote("en")).toBe("Listening…");
    expect(formatLiveDrop({ code: 1006, reason: "abnormal", wasClean: false })).toBe("1006 abnormal unclean");
  });

  it("corrects known mishearings and leaves ordinary Buona alone", () => {
    expect(correctTranscript("隐世美多少钱")).toBe("隐适美多少钱");
    expect(correctTranscript("隐式美")).toBe("隐适美");
    expect(correctTranscript("عيادة دبتو")).toBe("عيادة دابتو");
    expect(correctTranscript("the Buona clinic")).toBe("the Woonona clinic");
    expect(correctTranscript("dentist in Buona")).toBe("dentist in Woonona");
    expect(correctTranscript("Buona sera")).toBe("Buona sera");
    expect(correctTranscript("Buona")).toBe("Buona");
    expect(correctTranscript("Buona sera at the clinic")).toBe("Buona sera at the clinic");
  });
});
