import { describe, expect, it } from "vitest";
import { getKnowledgeIndex } from "./index-store";
import { prepareTurn } from "./chat-route";

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
    expect(turn.langOverride).toBe(true);
    expect(turn.inputMode).toBe("voice");
    expect(turn.spokenLanguage).toBe("bn");
    expect(turn.transcriptScript).toBe("Latin");
    expect(turn.instructions).toContain("Write in Bengali, using Bengali script.");
  });

  it("leaves typed Banglish in Latin script", () => {
    const turn = prepareTurn([{ role: "user", content: "Dapto te check up er dam koto?" }], "auto", index, {
      inputMode: "text",
      spokenLanguage: "bn",
    });
    expect(turn.reply.code).toBe("bn-Latn");
    expect(turn.langOverride).toBe(false);
    expect(turn.spokenLanguage).toBeNull();
    expect(turn.instructions).toContain("Latin letters only");
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
      [{ role: "user", content: "Dapto clinic Saturday kokhon khola thake?" }],
      "auto",
      index,
      { inputMode: "voice", spokenLanguage: "not-a-language" },
    );
    expect(rejected.reply.code).toBe("en");
    expect(rejected.spokenLanguage).toBeNull();
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
