import { describe, expect, it } from "vitest";
import { getKnowledgeIndex } from "./index-store";
import { messagesAfterLanguageSwitch, messagesForScriptRetry, prepareTurn } from "./chat-route";

const index = getKnowledgeIndex();

describe("spoken language on a voice turn", () => {
  it("replies in Bengali script when romanised speech was tagged Bengali", () => {
    const turn = prepareTurn(
      [{ role: "user", content: "Dapto clinic Saturday kokhon khola thake?" }],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "bn" },
    );
    expect(turn.reply.code).toBe("bn");
    expect(turn.reply.script).toBe("Bengali");
    expect(turn.langOverride).toBe(false);
    expect(turn.inputMode).toBe("voice");
    expect(turn.spokenLanguage).toBe("bn");
    expect(turn.transcriptScript).toBe("Latin");
    expect(turn.instructions).toContain("Write in Bengali, using Bengali script.");
  });

  it("answers typed Banglish in Bengali script", () => {
    const turn = prepareTurn([{ role: "user", content: "Dapto te check up er dam koto?" }], "auto", index, {
      inputMode: "text",
      spokenLanguage: "bn",
    });
    expect(turn.reply.code).toBe("bn");
    expect(turn.reply.script).toBe("Bengali");
    expect(turn.langOverride).toBe(false);
    expect(turn.spokenLanguage).toBeNull();
    expect(turn.instructions).toContain("Write in Bengali, using Bengali script.");
    expect(turn.instructions).toMatch(/Reply ONLY in বাংলা \(Bengali\) for this message, regardless of earlier messages/);
  });

  it("keeps English speech in English and ignores a language that is not allowed", () => {
    const english = prepareTurn(
      [{ role: "user", content: "What time does the Dapto clinic open on Saturday?" }],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "en" },
    );
    expect(english.reply.code).toBe("en");
    expect(english.langOverride).toBe(false);
    expect(english.spokenLanguage).toBe("en");

    const rejected = prepareTurn(
      [{ role: "user", content: "What time does Woonona open on Saturday?" }],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "not-a-language" },
    );
    expect(rejected.reply.code).toBe("en");
    expect(rejected.spokenLanguage).toBe("en");
    expect(rejected.langOverride).toBe(false);
  });

  it("derives Bengali from mixed script even when Deepgram said English or Indonesian", () => {
    const mixed = prepareTurn([{ role: "user", content: "Woonona kliniker চিkanaki." }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "id",
    });
    expect(mixed.spokenLanguage).toBe("bn");
    expect(mixed.reply.code).toBe("bn");
    expect(mixed.reply.script).toBe("Bengali");
    expect(mixed.instructions).toContain("Write in Bengali, using Bengali script.");

    const address = prepareTurn([{ role: "user", content: ".Unona clinic at ঠিকানা কি?" }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "en",
    });
    expect(address.spokenLanguage).toBe("bn");
    expect(address.reply.code).toBe("bn");
  });

  it("detects each Auto voice turn from its own script", () => {
    const bengali = "আমার দাঁতে ব্যথা করছে আজকে কি অ্যাপয়েন্টমেন্ট পাওয়া যাবে?";
    const hindi = "मेरे दांत में दर्द है आज अपॉइंटमेंट मिलेगा?";
    const afterBengali = prepareTurn(
      [
        { role: "user", content: bengali },
        { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ, অ্যাপয়েন্টমেন্ট পাওয়া যাবে।" },
        { role: "user", content: hindi },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "bn" },
    );
    expect(afterBengali.spokenLanguage).toBe("hi");
    expect(afterBengali.reply.code).toBe("hi");
    expect(afterBengali.reply.script).toBe("Devanagari");
    expect(afterBengali.instructions).toContain("Write in Hindi, using Devanagari script.");

    const afterHindi = prepareTurn(
      [
        { role: "user", content: hindi },
        { role: "assistant", metadata: { language: "hi" }, content: "हाँ, अपॉइंटमेंट मिल सकता है।" },
        { role: "user", content: bengali },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "hi" },
    );
    expect(afterHindi.spokenLanguage).toBe("bn");
    expect(afterHindi.reply.code).toBe("bn");
    expect(afterHindi.reply.script).toBe("Bengali");

    const english = prepareTurn(
      [
        { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ।" },
        { role: "user", content: "What time does the Dapto clinic open on Saturday?" },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "bn" },
    );
    expect(english.spokenLanguage).toBe("en");
    expect(english.reply.code).toBe("en");
    expect(english.instructions).toContain("Write in English.");

    const spanish = prepareTurn(
      [
        { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ।" },
        { role: "user", content: "¿Puedo reservar en Shellharbour el sábado?" },
      ],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "bn" },
    );
    expect(spanish.spokenLanguage).toBe("es");
    expect(spanish.reply.code).toBe("es");
    expect(spanish.instructions).toContain("Write in Spanish.");

    const pickedHindi = prepareTurn(
      [{ role: "user", content: "What time does the Dapto clinic open on Saturday?" }],
      "hi",
      index,
      { inputMode: "voice", spokenLanguage: "en" },
    );
    expect(pickedHindi.reply.code).toBe("hi");
    expect(pickedHindi.reply.script).toBe("Devanagari");
    expect(pickedHindi.spokenLanguage).toBe("hi");
    expect(pickedHindi.instructions).toContain("Write in Hindi, using Devanagari script.");

    const pickedBengali = prepareTurn(
      [{ role: "user", content: bengali }],
      "bn",
      index,
      { inputMode: "voice", spokenLanguage: "bn" },
    );
    expect(pickedBengali.reply.code).toBe("bn");
    expect(pickedBengali.reply.script).toBe("Bengali");
    expect(pickedBengali.instructions).toContain("Write in Bengali, using Bengali script.");
  });

  it("answers a short unidentified Latin question in English when nothing earlier was another language", () => {
    const first = prepareTurn([{ role: "user", content: "ডাপ্টো ক্লিনিকের ঠিকানা কি?" }], "auto", index);
    expect(first.reply.code).toBe("bn");
    const turn = prepareTurn([{ role: "user", content: "Woonona phone?" }], "auto", index);
    expect(turn.reply.code).toBe("en");
    expect(turn.spokenLanguage).toBeNull();
    expect(turn.instructions).toContain("Write in English.");
    expect(turn.instructions).not.toMatch(/Do not switch to English/);

    const followed = prepareTurn(
      [
        { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ।" },
        { role: "user", content: "Woonona phone?" },
      ],
      "auto",
      index,
    );
    expect(followed.reply.code).toBe("en");
    expect(followed.instructions).toContain("Write in English.");

    const banglish = prepareTurn(
      [
        { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ।" },
        { role: "user", content: "woonona er phone number ki" },
      ],
      "auto",
      index,
    );
    expect(banglish.reply.code).toBe("bn");
    expect(banglish.reply.script).toBe("Bengali");
    expect(banglish.instructions).toMatch(/Reply ONLY in বাংলা \(Bengali\) for this message, regardless of earlier messages/);
    expect(followed.instructions).toMatch(/Reply ONLY in English \(Latin\) for this message, regardless of earlier messages/);
    const switched = messagesAfterLanguageSwitch(
      [
        { role: "assistant", metadata: { language: "bn" }, content: "হ্যাঁ, ডাপ্টো খোলা।" },
        { role: "user", content: "Woonona phone?" },
      ],
      "en",
    );
    expect(String(switched[0]?.content)).toContain("switched to en");
    expect(String(switched[0]?.content)).not.toMatch(/[\u0980-\u09FF]/);
    const history = messagesForScriptRetry(
      [
        { role: "assistant", content: "হ্যাঁ, ডাপ্টো খোলা।" },
        { role: "user", content: "Woonona phone?" },
      ],
      "en",
      true,
    );
    expect(history).toEqual([{ role: "user", content: "Woonona phone?" }]);
    expect(messagesForScriptRetry(history, "bn", true)).toEqual(history);

    const freshBanglish = prepareTurn([{ role: "user", content: "dapto kokhon khola" }], "auto", index);
    expect(freshBanglish.reply.code).toBe("bn");
    expect(freshBanglish.instructions).toContain("Write in Bengali, using Bengali script.");

    const spanish = prepareTurn([{ role: "user", content: "Woonona phone?" }], "es", index, { inputMode: "voice" });
    expect(spanish.reply.code).toBe("es");
    expect(spanish.spokenLanguage).toBe("es");

    const voiced = prepareTurn([{ role: "user", content: "Woonona phone?" }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "bn",
    });
    expect(voiced.reply.code).toBe("bn");
  });

  it("does not send a Han transcript as English", () => {
    const turn = prepareTurn([{ role: "user", content: "伍诺纳诊所几点开门" }], "auto", index, {
      inputMode: "voice",
      spokenLanguage: "en",
    });
    expect(turn.spokenLanguage).toBe("zh");
    expect(turn.reply.code).toBe("zh");
    expect(turn.reply.code).not.toBe("en");
  });
});
