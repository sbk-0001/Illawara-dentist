import { describe, expect, it } from "vitest";
import { correctTranscript, deepgramLanguageHints, deepgramListenUrl, formatLiveDrop, interimMicLanguage, keytermsForHints, languageAfterRepair, majoritySpokenLanguage, micListeningNote, normalizeSpokenLanguage, spokenLanguageAtSubmit, spokenLanguageForTranscript, STT_KEYTERMS, transcriptNeedsRepair, votesFromAlternative } from "./stt";

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
    expect(terms).toContain("ঠিকানা");
    expect(terms).toContain("অ্যাপয়েন্টমেন্ট");
    expect(terms).not.toContain("Dapto");
    const chinese = new URL(deepgramListenUrl("prerecorded", "zh").replace(/^wss:/, "https:")).searchParams.getAll("keyterm");
    expect(chinese).toContain("种植牙");
    expect(chinese).toContain("隐适美");
    expect(chinese).not.toContain("Dapto");
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
    expect(transcriptNeedsRepair("bn", ".Unona clinic at ঠিকানা কি?")).toBe(true);
    expect(transcriptNeedsRepair("bn", "Woonona kliniker চিkanaki.")).toBe(true);
    expect(transcriptNeedsRepair("zh", "伍诺纳诊所 Dapto")).toBe(true);
    expect(transcriptNeedsRepair("en", "What time does Dapto open?")).toBe(false);
    expect(spokenLanguageForTranscript("en", ".Unona clinic at ঠিকানা কি?")).toBe("bn");
    expect(spokenLanguageForTranscript("id", "Woonona kliniker চিkanaki.")).toBe("bn");
    expect(spokenLanguageForTranscript("en", "伍诺纳诊所几点开门")).toBe("zh");
    expect(spokenLanguageForTranscript("id", "伍诺纳诊所几点开门")).toBe("zh");
    expect(spokenLanguageForTranscript("bn", ".Unona clinic at ঠিকানা কি?")).toBe("bn");
    expect(spokenLanguageForTranscript("en", "What time does Dapto open?")).toBe("en");
    expect(spokenLanguageForTranscript("hi", "डाप्टो क्लिनिक कब खुलेगा?")).toBe("hi");
    expect(spokenLanguageForTranscript("hi", "डाप्टো ক্লিনিকের ঠিকানা absentment", "bn")).toBe("bn");
    expect(spokenLanguageForTranscript("hi", "डाप्टो ক্লিনিকের চিকানা")).toBe("bn");
    expect(spokenLanguageForTranscript("hi", "डाप्टो क्लिनिक कब खुलेगा?", "bn")).toBe("bn");
    expect(transcriptNeedsRepair("hi", "डाप्टো ক্লিনিকের ঠিকানা absentment", "bn")).toBe(true);
    expect(languageAfterRepair("bn", "डाप्टो क्लिनिक कब खुलेगा?", "bn")).toBe("bn");
    expect(languageAfterRepair("bn", "डाप्टो क्लिनिक कब खुलेगा?")).toBe("hi");
    expect(interimMicLanguage({ languages: ["bn"], words: [{ language: "hi" }, { language: "hi" }] }, "डाप्टो क्लिनिक")).toBe("hi");
    expect(interimMicLanguage({ languages: ["es"] }, "¿A qué hora abre Dapto?")).toBe("es");
    expect(interimMicLanguage({ languages: ["es"] }, "")).toBe("es");
    expect(spokenLanguageAtSubmit({ interim: "es", text: "¿A qué hora abre Dapto?" })).toBe("es");
    expect(spokenLanguageAtSubmit({ text: "ডাপ্টো ক্লিনিকের ঠিকানা কি?" })).toBe("bn");
    expect(spokenLanguageAtSubmit({ votes: ["hi"], text: "डाप्टো ক্লিনিকের ঠিকানা absentment", hint: "bn" })).toBe("bn");
    expect(spokenLanguageAtSubmit({ draft: "es", text: "¿A qué hora abre Dapto el sábado?" })).toBe("es");
    expect(micListeningNote("es")).toContain("Escuchando");
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
    expect(correctTranscript("ডাক্তার ক্লিনিক কখন খোলা?")).toBe("Dapto কখন খোলা?");
    expect(correctTranscript("ডাক্তার ক্লিনিকের ঠিকানা কি?")).toBe("Dapto ঠিকানা কি?");
    expect(correctTranscript("আমি ডাক্তার ক্লিনিকে যাব")).toBe("আমি ডাক্তার ক্লিনিকে যাব");
    expect(correctTranscript("উনোনা ক্লিনিকের চিকানা কি?")).toBe("উনোনা ক্লিনিকের ঠিকানা কি?");
    expect(correctTranscript("Dapto চিকা নাকি")).toBe("Dapto ঠিকানা");
    expect(correctTranscript("Woonona চিকানাকি")).toBe("Woonona ঠিকানা");
    expect(correctTranscript("চিকানা কি?")).toBe("চিকানা কি?");
    expect(correctTranscript("饥食美矫正多少钱")).toBe("隐适美矫正多少钱");
    expect(correctTranscript("我想做饥食美种植")).toBe("我想做种植牙种植");
    expect(correctTranscript("饥食美多少钱")).toBe("饥食美多少钱");
  });
});
