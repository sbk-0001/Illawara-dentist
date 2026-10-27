import { describe, expect, it } from "vitest";
import { getKnowledgeIndex } from "./index-store";
import { addressFocus, ensureAddressReply, isAddressQuestion } from "./address";

const index = getKnowledgeIndex();

describe("address questions", () => {
  it("recognises Bengali address wording and inherits the latest clinic", () => {
    expect(isAddressQuestion("ঠিকানা কোথায়?")).toBe(true);
    expect(isAddressQuestion("What are your Saturday hours?")).toBe(false);
    expect(addressFocus("ঠিকানা কোথায়?", ["Yes, Dapto Dentists offers whitening."], { kind: "ask" })).toEqual({
      kind: "one",
      clinic: "dapto",
    });
    expect(addressFocus("ঠিকানা কোথায়?", [], { kind: "ask" })).toEqual({
      kind: "many",
      clinics: ["dapto", "shellharbour", "woonona"],
    });
    expect(addressFocus("ডাপ্টোর ঠিকানা কী?", ["Shellharbour Dentists"], { kind: "one", clinic: "dapto" })).toEqual({
      kind: "one",
      clinic: "dapto",
    });
  });

  it("replaces a phone-only reply with street addresses and keeps a real sentence", () => {
    const phones = ["Dapto Dentists: 02 4288 0737", "Shellharbour Dentists: 02 4216 9911", "Woonona Dentists: 02 4284 4486"].join("\n");
    const listed = ensureAddressReply(phones, "ঠিকানা কোথায়?", "bn", index, {
      kind: "many",
      clinics: ["dapto", "shellharbour", "woonona"],
    });
    expect(listed).toContain("35 Baan Baan Street");
    expect(listed).toContain("Captain Cook Drive");
    expect(listed).toContain("379 Princes Highway");
    expect(listed).toContain("ঠিকানা:");
    expect(listed).not.toContain("02 4288 0737");

    const recent = ensureAddressReply("02 4288 0737", "কোথায়?", "bn", index, { kind: "one", clinic: "dapto" });
    expect(recent).toContain("35 Baan Baan Street");
    expect(recent).not.toContain("Captain Cook");
    expect(recent).not.toContain("02 4288 0737");

    const sentence = "ডাপ্টো ক্লিনিকের বিষয়ে আরও জানতে ওয়েবসাইট দেখুন।";
    const kept = ensureAddressReply(sentence, "ঠিকানা কোথায়?", "bn", index, { kind: "one", clinic: "dapto" });
    expect(kept.startsWith(sentence)).toBe(true);
    expect(kept).toContain("35 Baan Baan Street");

    const already = ensureAddressReply("ঠিকানা 35 Baan Baan Street, Dapto।", "ঠিকানা কোথায়?", "bn", index, { kind: "one", clinic: "dapto" });
    expect(already).toBe("ঠিকানা 35 Baan Baan Street, Dapto।");
    expect(ensureAddressReply("02 4288 0737", "শনিবার কখন খোলা?", "bn", index, { kind: "one", clinic: "dapto" })).toBe("02 4288 0737");
  });
});
