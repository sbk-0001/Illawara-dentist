import { describe, expect, it } from "vitest";
import { detectLanguage, confidentIndonesian } from "../language/detect";
import { judgeIndicPair, malayalamMarkersWin } from "../language/indic";
import { replyScriptGate, sanitizeForeignScript, unexpectedLatinWords } from "../language/reply-script";
import { finishedMicLanguage, hasNativeScript, noteAfterRecheck, shouldHoldLiveTranscript } from "../stt";
import { prepareTurn } from "./chat-route";
import { canonicalKnownUrls, ensureBookingReply, expandBookTokens } from "./contacts";
import { applyGlossary } from "./glossary";
import { getKnowledgeIndex } from "./index-store";
import { attachContactLabels, dedupeSentenceFinal } from "./label-fix";
import {
  INDIC_PAIR_TIMEOUT_MS,
  SCRIPT_CONVERT_TIMEOUT_MS,
  TRANSCRIPT_FULL_MODEL,
  indicVoiceBudgetMs,
  shouldRetryShortTranscript,
  transcribeLanguagePair,
  transliterateToNativeScript,
} from "./transcript-repair";

const index = getKnowledgeIndex();

async function readText(stream: ReadableStream<{ type: string; delta?: string }>): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const next = await reader.read();
    if (next.done) return text;
    if (next.value.type === "text-delta" && next.value.delta) text += next.value.delta;
  }
}

function deltas(parts: string[]) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "text-start", id: "t1" });
      for (const delta of parts) controller.enqueue({ type: "text-delta", id: "t1", delta });
      controller.enqueue({ type: "text-end", id: "t1" });
      controller.close();
    },
  });
}

describe("live reply and voice fixes", () => {
  it("rewrites a translated booking path from the location id and expands [[BOOK:]]", () => {
    const stored = index.contacts.dapto.bookingUrl;
    const id = "fc73148c-a1a3-425d-91f9-b97eaaea1e04";
    for (const segment of ["reserva", "बुकिंग", "বুকিং", "الحجز", "முன்பதிவு", "ബുക്കിംഗ്"]) {
      const translated = `https://bookings.zavy360.com/${segment}/shellharbourdentists/locations/${id}/patient-type`;
      expect(canonicalKnownUrls(translated, index)).toBe(stored);
      expect(canonicalKnownUrls(translated, index)).not.toContain(segment);
    }
    expect(expandBookTokens("[[BOOK:dapto]]", index)).toBe(`Dapto Dentists: ${stored}`);
    expect(canonicalKnownUrls("see [[BOOK:woonona]]", index)).toContain(index.contacts.woonona.bookingUrl);
    expect(canonicalKnownUrls("see https://bookings.zavy360.com/booking/not-a-clinic", index)).not.toContain("zavy360");
  });

  it("names the clinic and the stored URL when a Spanish booking answer has neither", () => {
    const vague = "Puede hacer la reserva en línea a través de este sitio web";
    const dapto = ensureBookingReply(vague, "¿Puedo reservar en Dapto?", index, { kind: "one", clinic: "dapto" });
    expect(dapto).toContain("Dapto Dentists");
    expect(dapto).toContain(index.contacts.dapto.bookingUrl);
    const unnamed = ensureBookingReply(vague, "¿Puedo reservar?", index, { kind: "any" });
    expect(unnamed).toContain("Dapto Dentists");
    expect(unnamed).toContain("Shellharbour Dentists");
    expect(unnamed).toContain("Woonona Dentists");
    expect(unnamed).toContain(index.contacts.shellharbour.bookingUrl);
  });

  it("drops a second sentence-final है। even when the chunks split", async () => {
    expect(dedupeSentenceFinal("Dapto Dentists का फ़ोन नंबर 02 4288 0737 है।है।")).toBe(
      "Dapto Dentists का फ़ोन नंबर 02 4288 0737 है।",
    );
    const lead = "Dapto Dentists का फ़ोन नंबर 02 4288 0737 है और यह वाक्य काफी लंबा है ताकि यह तुरंत बाहर जाए ";
    const text = await readText(
      attachContactLabels(deltas([lead, "है।", "है।"]), {
        code: "hi",
        index,
        replyStatus: { missing: false },
        question: "फोन नंबर क्या है?",
      }),
    );
    expect(text).toContain("है।");
    expect(text).not.toContain("है।है।");
    expect(text.match(/है।/g)?.length).toBe(1);
  });

  it("treats Malayalam dental words as native and rejects leftover English", () => {
    const implant = "വെബ്‌സൈറ്റിൽ singular dental implants and ക്രൗൺ ഫീസ് from $5000 എന്നാണ് നൽകിയിരിക്കുന്നത്.";
    expect(replyScriptGate(implant, "ml", true)).toBe("conflict");
    const ml = applyGlossary("checkup cleaning Invisalign emergency booking whitening fees hours payment plan interest free", "ml");
    expect(ml).not.toMatch(/checkup|cleaning|Invisalign|emergency|booking|whitening|fees|hours|payment plan|interest free/i);
    const ta = applyGlossary("checkup cleaning Invisalign emergency booking whitening fees hours singular dental implants", "ta");
    expect(ta).not.toMatch(/checkup|cleaning|Invisalign|emergency|whitening|singular dental/i);
    expect(unexpectedLatinWords(applyGlossary(implant, "ml"))).toEqual([]);
    expect(applyGlossary(implant, "bn")).not.toContain("singular dental implants");
    expect(applyGlossary(implant, "hi")).not.toContain("singular dental implants");
  });

  it("hears Malayalam in Tamil letters and Manglish, and does not answer in Indonesian", () => {
    const tamilLetters = "எனக்கு பல்லு வேதனையுண்டு இன்ன அப்பாயிண்ட்மென்ட்டுக்கிட்டுமோ";
    expect(malayalamMarkersWin(tamilLetters)).toBe(true);
    const judged = judgeIndicPair({
      deepgram: tamilLetters,
      malayalam: tamilLetters,
      tamil: "எனக்கு பல் வலிக்கிறது இன்று அப்பாயிண்ட்மெண்ட் கிடைக்குமா",
    });
    expect(judged.language).toBe("ml");
    expect(judged.needsScript).toBe(true);
    const voice = prepareTurn([{ role: "user", content: tamilLetters }], "auto", index, { inputMode: "voice", spokenLanguage: "ta" });
    expect(voice.reply.code).toBe("ml");

    expect(detectLanguage("Woonona klinikinde vilasem endan").code).toBe("ml-Latn");
    const manglish = prepareTurn([{ role: "user", content: "Woonona klinikinde vilasem endan" }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "und",
    });
    expect(manglish.reply.code).toBe("ml");

    expect(detectLanguage("Dapto klinik inde phone number and then").code).toBe("ml-Latn");
    expect(confidentIndonesian("Dapto klinik inde phone number and then")).toBe(false);
    const indonesian = prepareTurn([{ role: "user", content: "Dapto klinik inde phone number and then" }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "id",
    });
    expect(indonesian.reply.code).toBe("ml");

    const devanagari = judgeIndicPair({
      deepgram: "डाक्टर क्लिनिकको फोन नम्बर के हो?",
      malayalam: "ഡാപ്റ്റോ ക്ലിനിക്കിന്റെ ഫോൺ നമ്പർ എന്താണ്?",
      tamil: "டாப்டோ கிளினிக்கின் தொலைபேசி எண் என்ன?",
    });
    expect(devanagari.language).toBe("ml");
    expect(devanagari.transcript).toMatch(/[\u0D00-\u0D7F]/);
    expect(devanagari.language).not.toBe("hi");
  });

  it("converts a Malayalam picker transcript that arrived in the wrong script", async () => {
    const samples = [
      "Woonoone klinikinde vilasam entāṇ?",
      "මූනෝන ක්ලිනික්කින්ගේ විලාසම එන ද?",
      "Dapto клиникасынен арчаепол турокум.",
      "டாப்டோ கிளினிக்கி சனியார்ச்சையே பொல் திறக்கும்.",
    ];
    for (const sample of samples) {
      expect(hasNativeScript("ml", sample)).toBe(false);
      expect(shouldHoldLiveTranscript(sample, "ml")).toBe(true);
      const converted = await transliterateToNativeScript({
        text: sample,
        language: "ml",
        generate: async () => "വൂനോന ക്ലിനിക്കിന്റെ വിലാസം എന്താണ്?",
      });
      expect(converted).toMatch(/[\u0D00-\u0D7F]/);
    }
    let called = false;
    const native = "വൂനോന ക്ലിനിക്കിന്റെ വിലാസം എന്താണ്?";
    const kept = await transliterateToNativeScript({
      text: native,
      language: "ml",
      generate: async () => {
        called = true;
        return "no";
      },
    });
    expect(kept).toBe(native);
    expect(called).toBe(false);
  });

  it("shows Malayalam or Tamil on the mic note once the recheck confirms it", () => {
    expect(noteAfterRecheck("ta")).toContain("தமிழ்");
    expect(noteAfterRecheck("ml")).toContain("മലയാളം");
    expect(noteAfterRecheck("ta")).not.toBe("Transcribing…");
    expect(noteAfterRecheck("ml")).not.toBe("Transcribing…");
    const tamil = "வூனோனா கிளினிக்கின் முகவரி என்ன?";
    expect(malayalamMarkersWin(tamil)).toBe(false);
    expect(finishedMicLanguage(tamil)).toBe("ta");
    expect(shouldHoldLiveTranscript(tamil, null)).toBe(true);
  });

  it("strips a foreign script from the reply and regenerates an English implant run", () => {
    expect(sanitizeForeignScript("Woonona Dentists 的 முகவரி 379 Princes Highway.", "ta")).not.toContain("的");
    expect(sanitizeForeignScript("Woonona Dentists-এর വിലാസം 379 Princes Highway, Woonona, NSW, 2517 ആണ്.", "ml")).not.toMatch(
      /[\u0980-\u09FF]/,
    );
    expect(sanitizeForeignScript("വെബ്‌സൈറ്റിൽ singular dental implants and ක්‍රൗൺ ഫീസ് from $5000", "ml")).not.toMatch(/[\u0D80-\u0DFF]/);
    const indonesian = "Nomor telepon adalah दांत सफ़ेद करना di klinik.";
    expect(replyScriptGate(indonesian, "id", true)).toBe("conflict");
    expect(sanitizeForeignScript(indonesian, "id")).not.toMatch(/[\u0900-\u097F]/);
  });

  it("lets the clinic named in the current message beat the previous turn", () => {
    const turn = prepareTurn(
      [
        { role: "user", content: "What time does the Dapto clinic open on Saturday?" },
        { role: "assistant", content: "Dapto Dentists is open Saturday 8:00–16:00." },
        { role: "user", content: "উনা ক্লিনিকের ঠিকানা কি ঠিকানা" },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "bn" },
    );
    expect(turn.focus).toEqual({ kind: "one", clinic: "woonona" });
    expect(turn.reply.code).toBe("bn");
  });

  it("runs the Malayalam and Tamil passes together inside the 4s voice budget", async () => {
    expect(indicVoiceBudgetMs()).toBe(INDIC_PAIR_TIMEOUT_MS + SCRIPT_CONVERT_TIMEOUT_MS);
    expect(indicVoiceBudgetMs()).toBeLessThanOrEqual(4_000);
    expect(shouldRetryShortTranscript(TRANSCRIPT_FULL_MODEL)).toBe(false);
    let running = 0;
    let peak = 0;
    const pair = await transcribeLanguagePair(async (language) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 30));
      running -= 1;
      return language;
    });
    expect(peak).toBe(2);
    expect(pair).toEqual(["ml", "ta"]);
  });
});
