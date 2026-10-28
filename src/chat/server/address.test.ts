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
    expect(listed).toContain("এর ঠিকানা হলো");
    expect(listed).not.toContain("Woonona Dentists:");
    expect(listed).not.toContain("02 4288 0737");

    const recent = ensureAddressReply("02 4288 0737", "কোথায়?", "bn", index, { kind: "one", clinic: "dapto" });
    expect(recent).toContain("35 Baan Baan Street");
    expect(recent).not.toContain("Captain Cook");
    expect(recent).not.toContain("02 4288 0737");

    const sentence = "ডাপ্টো ক্লিনিকের বিষয়ে আরও জানতে ওয়েবসাইট দেখুন।";
    const kept = ensureAddressReply(sentence, "ঠিকানা কোথায়?", "bn", index, { kind: "one", clinic: "dapto" });
    expect(kept.startsWith(sentence)).toBe(true);
    expect(kept).toContain("35 Baan Baan Street");

    const bare = ensureAddressReply("Woonona Dentists: 379 Princes Highway, Woonona, NSW, 2517", "ঠিকানা কোথায়?", "bn", index, {
      kind: "one",
      clinic: "woonona",
    });
    expect(bare.startsWith("Woonona Dentists-এর ঠিকানা হলো 379 Princes Highway")).toBe(true);
    expect(bare).not.toContain("Woonona Dentists:");

    const already = ensureAddressReply("ঠিকানা 35 Baan Baan Street, Dapto।", "ঠিকানা কোথায়?", "bn", index, { kind: "one", clinic: "dapto" });
    expect(already).toContain("Dapto Dentists-এর ঠিকানা হলো 35 Baan Baan Street");
    expect(ensureAddressReply("02 4288 0737", "শনিবার কখন খোলা?", "bn", index, { kind: "one", clinic: "dapto" })).toBe("02 4288 0737");
  });

  it("keeps only the named clinic when a Hindi address lists all three", () => {
    const listed = [
      "Woonona Dentists का पता 379 Princes Highway, Woonona, NSW, 2517 है।",
      "Dapto Dentists का पता 35 Baan Baan Street, Dapto, NSW, 2530 है।",
      "Shellharbour Dentists का पता Suite 7, 9-25 Captain Cook Drive, Barrack Heights, NSW 2528 है।",
    ].join("\n");
    const only = ensureAddressReply(listed, "वोनोना क्लिनिक का पता क्या है?", "hi", index, { kind: "one", clinic: "woonona" });
    expect(only).toContain("379 Princes Highway");
    expect(only).not.toContain("Baan Baan");
    expect(only).not.toContain("Captain Cook");
  });

  it("turns the live Tamil address line into a full sentence", () => {
    const live = "Woonona Dentists முகவரி 379 Princes Highway, Woonona, NSW, 2517.";
    const spoken = ensureAddressReply(live, "வூனோனா முகவரி என்ன?", "ta", index, { kind: "one", clinic: "woonona" });
    expect(spoken).toBe("Woonona Dentists-இன் முகவரி 379 Princes Highway, Woonona, NSW, 2517 ஆகும்.");
    expect(ensureAddressReply(live, "വൂനോനയുടെ വിലാസം എന്താണ്?", "ml", index, { kind: "one", clinic: "woonona" })).toContain("-ന്റെ വിലാസം");
    expect(ensureAddressReply("379 Princes Highway, Woonona", "你们的地址在哪？", "zh", index, { kind: "one", clinic: "woonona" })).toContain("的地址是");
    expect(ensureAddressReply("379 Princes Highway, Woonona", "¿Cuál es la dirección?", "es", index, { kind: "one", clinic: "woonona" })).toContain("La dirección de Woonona Dentists es");
    expect(ensureAddressReply("379 Princes Highway, Woonona", "ما هو العنوان؟", "ar", index, { kind: "one", clinic: "woonona" })).toContain("عنوان Woonona Dentists هو");
    expect(ensureAddressReply("379 Princes Highway, Woonona", "What is the address?", "en", index, { kind: "one", clinic: "woonona" })).toBe(
      "The address of Woonona Dentists is 379 Princes Highway, Woonona, NSW, 2517.",
    );
  });
});
