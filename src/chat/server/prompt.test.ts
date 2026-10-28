import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language/detect";
import { getKnowledgeIndex } from "./index-store";
import { acheReply, dropDenialBesideAnswer, whiteningReply } from "./care-reply";
import { implantPriceSentence } from "./implant-price";
import { postCheckReply } from "./post-check";
import { buildInstructions, scriptRetryInstruction } from "./prompt";
import { fullyEnglishReply, replyScriptGate } from "../language/reply-script";
import { guardBareHoursReply, guardUnclearDay } from "./hours";
import { prepareTurn } from "./chat-route";
import { FEE_CAVEAT_EN } from "./system-text";

const index = getKnowledgeIndex();

describe("prompt rules", () => {
  it("answers Banglish in Bengali script and includes real contacts", () => {
    const turn = prepareTurn([{ role: "user", parts: [{ type: "text", text: "Dapto te check up er dam koto?" }] }], "auto", index);
    expect(turn.reply.code).toBe("bn");
    expect(turn.instructions).toContain("Write in Bengali, using Bengali script.");
    expect(turn.instructions.trimEnd()).toMatch(/Reply ONLY in বাংলা \(Bengali\) for this message, regardless of earlier messages\.$/);
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
    expect(instructions).toMatch(/start with the clinic name/i);
    expect(instructions).toMatch(/do not put the clinic name after the hours/i);
    expect(instructions).toMatch(/دوشنبه تا جمعه/);
    expect(instructions).toContain("8:00 تا 18:00");
    expect(instructions).not.toMatch(/8\.00 AM/);
    expect(instructions).not.toMatch(/Monday – Friday/);
    expect(instructions).toMatch(/answer in Bengali or Hindi script, not Latin/i);
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

  it("uses the latest clinic for an address question that names none, and lists all three otherwise", () => {
    const recent = prepareTurn(
      [
        { role: "user", content: "Do you do whitening?" },
        { role: "assistant", content: "Yes, Dapto Dentists offers teeth whitening." },
        { role: "user", content: "ঠিকানা কোথায়?" },
      ],
      "bn",
      index,
    );
    expect(recent.focus).toEqual({ kind: "one", clinic: "dapto" });
    expect(recent.instructions).toContain("35 Baan Baan Street");
    expect(recent.instructions).toMatch(/Do not answer with only a phone number/);
    expect(recent.instructions).not.toMatch(/Ask which of Dapto, Shellharbour or Woonona/i);

    const none = prepareTurn([{ role: "user", content: "ঠিকানা কোথায়?" }], "bn", index);
    expect(none.focus).toEqual({ kind: "many", clinics: ["dapto", "shellharbour", "woonona"] });
    expect(none.instructions).toContain("35 Baan Baan Street");
    expect(none.instructions).toContain("Captain Cook Drive");
    expect(none.instructions).toContain("379 Princes Highway");
    expect(none.instructions).toMatch(/Do not ask which clinic/i);
  });

  it("strips the English fee sentence from retrieved pages and asks for a reply-language version", () => {
    const language = { code: "bn", label: "বাংলা", script: "Bengali", dir: "ltr" as const, fallback: false, source: "detected" as const };
    const instructions = buildInstructions({
      index,
      language,
      focus: { kind: "one", clinic: "dapto" },
      severe: false,
      chunks: [
        {
          id: "whiten",
          clinic: "dapto",
          url: "https://daptodentists.com.au/teeth-whitening/",
          title: "Teeth whitening",
          heading: "Fees",
          text: `Whitening is available. ${FEE_CAVEAT_EN}`,
          score: 1,
        },
      ],
      question: "হোয়াইটেনিং আছে?",
    });
    expect(instructions).not.toContain(FEE_CAVEAT_EN);
    expect(instructions).toContain("Whitening is available.");
    expect(instructions).toMatch(/write that sentence in the reply language/i);
    expect(instructions).toContain("দাঁত সাদা করা");
    expect(instructions).toMatch(/same-day appointment/i);
    expect(instructions).toMatch(/urgent care/i);
    expect(instructions).toMatch(/cosmetic dentistry/i);
    expect(instructions).toMatch(/Only proper nouns stay in Latin/i);
    expect(instructions).toMatch(/Do not transliterate them/i);
    expect(instructions).toMatch(/Do not leave English words/i);
    expect(instructions).toContain("Dapto Dentists ശനിയാഴ്ച രാവിലെ 8 മണി മുതൽ വൈകുന്നേരം 4 മണി വരെ തുറന്നിരിക്കും.");
    expect(instructions).toContain("Dapto Dentists-ന്റെ ഫോൺ നമ്പർ 02 4288 0737 ആണ്.");
    expect(instructions).toContain("Dapto Dentists சனிக்கிழமை காலை 8 மணி முதல் மாலை 4 மணி வரை திறந்திருக்கும்.");
    expect(instructions).toContain("Dapto Dentists का फ़ोन नंबर 02 4288 0737 है।");
    expect(instructions).toContain("Dapto Dentists শনিবার সকাল 8টা থেকে বিকাল 4টা পর্যন্ত খোলা থাকে।");
    expect(instructions).toContain("Answer only for that clinic");
    expect(scriptRetryInstruction(language)).toMatch(/Bengali/);
    expect(scriptRetryInstruction(language)).toMatch(/Do not write English sentences/);
    expect(scriptRetryInstruction(language)).toMatch(/teeth whitening/);
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

  it("treats a garbled open-verb as hours, and other mixed garbage as a clarification", () => {
    const language = { code: "ml" as const, label: "മലയാളം", script: "Malayalam", dir: "ltr" as const, fallback: false, source: "detected" as const };
    const hours = buildInstructions({
      index,
      language,
      focus: { kind: "one", clinic: "dapto" },
      severe: false,
      chunks: [],
      question: "Dapto cliniceനി ആർച്ചൈ പോൾതുറക്കും",
    });
    expect(hours).toContain("Answer with the opening hours only");
    expect(hours).not.toContain("words are unclear");
    const garbage = buildInstructions({
      index,
      language,
      focus: { kind: "any" },
      severe: false,
      chunks: [],
      question: "Dapto cliniceനി ആർച്ചൈ",
    });
    expect(garbage).toContain("Ask one short clarifying question");
    expect(garbage).toContain("at most once each");
  });

  it("does not delete clinic names from an off-script reply", () => {
    const raw = "Dapto Dentists மற்றும் Woonona Dentists இரண்டிலும் உண்டு. Dapto Dentists-ல் பேசலாம். Woonona Dentists-லும் உண்டு. Shellharbour Dentists-லும் உண்டு.";
    expect(postCheckReply(raw, "ta", "Do you do check-ups?", { kind: "any" }, index)).toBe(raw);
  });

  it("keeps $4500* on Shellharbour and $5000 on Woonona", () => {
    const unnamed = implantPriceSentence("en", { kind: "any" });
    expect(unnamed).toContain("Shellharbour Dentists");
    expect(unnamed).toContain("$4500*");
    expect(unnamed).toContain("Woonona Dentists");
    expect(unnamed).toContain("$5000");
    expect(unnamed).toMatch(/Conditions apply/i);
    expect(unnamed).toMatch(/free implant consult/i);
    expect(unnamed).toContain("$50");
    expect(unnamed).not.toMatch(/does not list/i);
    expect(unnamed).toMatch(/\$4500\* at Shellharbour Dentists/);
    expect(unnamed).toMatch(/\$5000 at Woonona Dentists/);
    expect(implantPriceSentence("en", { kind: "one", clinic: "shellharbour" })).toContain("$4500*");
    expect(implantPriceSentence("en", { kind: "one", clinic: "shellharbour" })).not.toContain("$5000");
    expect(implantPriceSentence("en", { kind: "one", clinic: "woonona" })).not.toContain("$4500");
    expect(implantPriceSentence("en", { kind: "one", clinic: "dapto" })).toMatch(/free implant consult/i);
    expect(implantPriceSentence("en", { kind: "one", clinic: "dapto" })).not.toMatch(/\$4500|\$5000/);
    expect(implantPriceSentence("ml", { kind: "one", clinic: "shellharbour" })).toContain("$4500*");
    expect(implantPriceSentence("ml", { kind: "any" })).not.toContain("പേജിൽ ഇല്ല");
    expect(implantPriceSentence("ta", { kind: "one", clinic: "woonona" })).toContain("$5000");
  });

  it("asks which day instead of guessing Sunday, and regenerates a fully English Tamil reply", () => {
    expect(guardUnclearDay("We are open on Sunday from 8.", "Dapto cliniceനി ആർച്ചൈ പോൾതുറക്കും", "ml")).toBe("ഏത് ദിവസമാണ് അറിയേണ്ടത്?");
    expect(guardUnclearDay("Dapto Dentists ശനിയാഴ്ച തുറന്നിരിക്കും.", "ശനിയാഴ്ച എപ്പോൾ തുറക്കും?", "ml")).toContain("ശനി");
    const english = "The clinic offers dental implants and a crown for a set fee this week.";
    expect(fullyEnglishReply(english, "ta")).toBe(true);
    expect(replyScriptGate(english, "ta", true)).toBe("conflict");
    expect(replyScriptGate(english, "ta", false)).toBe("wait");
  });

  it("does not answer a mixed hours miss in English when Malayalam was the previous language", () => {
    const turn = prepareTurn(
      [
        { role: "assistant", metadata: { language: "ml" }, content: "വിലാസം ഇതാണ്." },
        { role: "user", content: "Dapto cliniceനി ആർച്ചൈ പോൾതുറക്കും" },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "en" },
    );
    expect(turn.reply.code).toBe("ml");
    const first = prepareTurn([{ role: "user", content: "Dapto cliniceനി ആർച്ചൈ പോൾതുറക്കും" }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "ta",
    });
    expect(first.reply.code).toBe("ml");
  });

  it("answers toothache and whitening with a warm sentence, and drops a denial next to a real answer", () => {
    const ache = acheReply("ml", { kind: "one", clinic: "dapto" }, index);
    expect(ache).toContain("വേദനയുണ്ടെന്ന് കേട്ടതിൽ വിഷമമുണ്ട്");
    expect(ache).toContain("02 4288 0737");
    expect(ache).not.toContain("ലഭ്യത");
    const all = acheReply("en", { kind: "any" }, index);
    expect(all).toContain("I'm sorry you're in pain");
    expect(all).toContain("02 4288 0737");
    expect(all).toContain("02 4216 9911");
    expect(all).toContain("02 4284 4486");
    expect(all.split("Dapto Dentists").length - 1).toBe(1);

    const white = whiteningReply("ta", { kind: "one", clinic: "woonona" }, index);
    expect(white).toContain("வெண்மையாக்க");
    expect(white).not.toContain("தகவல்");
    expect(white).toContain("$650");
    expect(white).toContain(index.contacts.woonona.bookingUrl);
    const mlWhite = whiteningReply("ml", { kind: "any" }, index);
    expect(mlWhite).toContain("പല്ല് വെളുപ്പിക്കൽ");
    expect(mlWhite).not.toContain("വിവരങ്ങൾ");

    const mixed = dropDenialBesideAnswer("ওয়েবসাইটে এই বিষয়ের উত্তর নেই। ফোন 02 4288 0737।");
    expect(mixed).toContain("02 4288 0737");
    expect(mixed).not.toContain("উত্তর নেই");
    expect(guardBareHoursReply("Dapto is open Saturday 08:00–16:00.", "en", { kind: "one", clinic: "dapto" }, "Saturday hours?")).toBe(
      "Dapto Dentists is open Saturday from 8am to 4pm.",
    );
  });
});
