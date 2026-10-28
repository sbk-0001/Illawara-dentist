import { describe, expect, it } from "vitest";
import type { ClinicFocus } from "../intent";
import { getKnowledgeIndex } from "./index-store";
import { coreTemplate } from "./core-reply";
import { postCheckReply } from "./post-check";

const index = getKnowledgeIndex();
const LANGS = ["en", "zh", "ml", "ta", "hi", "ar", "es", "bn"] as const;

const QUESTIONS = {
  hours: "What are your opening hours?",
  address: "What is the address?",
  phone: "What is the phone number?",
  ache: "I have a toothache and need a same-day appointment",
  white: "Do you offer teeth whitening?",
  implant: "How much does a dental implant cost?",
} as const;

const FOCUSES: ClinicFocus[] = [
  { kind: "any" },
  { kind: "one", clinic: "dapto" },
  { kind: "one", clinic: "shellharbour" },
  { kind: "one", clinic: "woonona" },
];

const ORPHANS = ["ഒപ്പം എന്നിവയിൽ", "और में", "மூன்று கிளினிக்குகளிலும்-ல்", "மூன்று கிளினிக்குகளிலும்-ൽ", "ক্লিনিকেই-এ", "তিনটি ক্লিনিকেই-এ"];

function assertNoOrphans(text: string) {
  for (const orphan of ORPHANS) expect(text, text).not.toContain(orphan);
  expect(text).not.toMatch(/-\s+(?:എന്നിവയിൽ|এ|ൽ|ல்|में)/);
}

describe("core templates", () => {
  it("renders every core intent in all eight languages without orphan connectors", () => {
    for (const code of LANGS) {
      for (const question of Object.values(QUESTIONS)) {
        for (const focus of FOCUSES) {
          const text = coreTemplate(question, code, focus, index);
          expect(text, `${code} ${question} ${focus.kind}`).toBeTruthy();
          assertNoOrphans(text ?? "");
        }
      }
    }
  });

  it("replaces a garbled open-verb with the Dapto hours sentence", () => {
    const question = "Dapto cliniceനി ആർച്ചൈ പോൾതുറക്കും.";
    const focus = { kind: "one" as const, clinic: "dapto" as const };
    const hours = coreTemplate(question, "ml", focus, index) ?? "";
    expect(hours).toContain("തുറന്നിരിക്കും");
    expect(hours).toContain("Dapto Dentists");
    expect(hours).not.toContain("Shellharbour");
    expect(hours).not.toContain("ആർച്ച്");
    expect(hours).not.toMatch(/ഉത്തരം ഇല്ല|does not list/i);
    const replaced = postCheckReply("ആർച്ച് വെബ്‌സൈറ്റിൽ ഈ ഉത്തരം ഇല്ല. ഞായറാഴ്ച തുറക്കും.", "ml", question, focus, index);
    expect(replaced).toContain("തുറന്നിരിക്കും");
    expect(replaced).not.toContain("ആർച്ച്");
    expect(replaced).not.toContain("ഞായറാഴ്ച");
  });

  it("lists each clinic on its own toothache line", () => {
    const ache = coreTemplate(QUESTIONS.ache, "bn", { kind: "any" }, index) ?? "";
    expect(ache).toContain("Dapto Dentists");
    expect(ache).toContain("02 4288 0737");
    expect(ache).toContain("02 4216 9911");
    expect(ache).toContain("02 4284 4486");
    expect(ache.split("\n").filter((line) => line.includes("02 ")).length).toBe(3);
    const named = coreTemplate(QUESTIONS.ache, "ml", { kind: "one", clinic: "dapto" }, index) ?? "";
    expect(named).toContain("വേദനയുണ്ടെന്ന് കേട്ടതിൽ വിഷമമുണ്ട്");
    expect(named).toContain("02 4288 0737");
    expect(named).not.toContain("02 4216 9911");
  });

  it("keeps whitening prices on the clinic that published them", () => {
    const all = coreTemplate(QUESTIONS.white, "en", { kind: "any" }, index) ?? "";
    expect(all.indexOf("Woonona Dentists")).toBeLessThan(all.indexOf("$650"));
    expect(all).toContain("existing dental work");
    expect(all).toContain("Philips Zoom");
    const woonona = coreTemplate(QUESTIONS.white, "ta", { kind: "one", clinic: "woonona" }, index) ?? "";
    expect(woonona).toContain("வெண்மையாக்க");
    expect(woonona).toContain("$650");
    expect(woonona).not.toContain("தகவல்");
    expect(woonona).toContain(index.contacts.woonona.bookingUrl);
    const shell = coreTemplate(QUESTIONS.white, "en", { kind: "one", clinic: "shellharbour" }, index) ?? "";
    expect(shell).not.toContain("$650");
    expect(shell).toContain("Philips Zoom");
    expect(shell).not.toContain("Woonona");
    const dapto = coreTemplate(QUESTIONS.white, "ml", { kind: "one", clinic: "dapto" }, index) ?? "";
    expect(dapto).toContain("പല്ല് വെളുപ്പിക്കൽ");
    expect(dapto).not.toContain("$650");
    expect(dapto).not.toContain("വിവരങ്ങൾ");
    expect(dapto).not.toContain("Woonona");
  });

  it("states the published implant figures and never says the fee is missing", () => {
    const all = coreTemplate(QUESTIONS.implant, "en", { kind: "any" }, index) ?? "";
    expect(all).toContain("$4500*");
    expect(all).toContain("$5000");
    expect(all).toMatch(/Conditions apply/i);
    expect(all).toMatch(/free implant consult/i);
    expect(all).toContain("$50");
    expect(all).toContain(index.contacts.shellharbour.bookingUrl);
    expect(all).toContain(index.contacts.woonona.bookingUrl);
    expect(all).toContain(index.contacts.dapto.bookingUrl);
    expect(all).not.toMatch(/does not list|പേജിൽ ഇല്ല|not on the (?:page|website)/i);
    const dapto = coreTemplate("ഇംപ്ലാന്റ് എത്ര", "ml", { kind: "one", clinic: "dapto" }, index) ?? "";
    expect(dapto).not.toMatch(/\$4500|\$5000/);
    expect(dapto).toContain("$50");
    expect(dapto).not.toContain("പേജിൽ ഇല്ല");
    expect(dapto).toContain(index.contacts.dapto.bookingUrl);
    expect(dapto).not.toContain(index.contacts.woonona.bookingUrl);
    for (const heard of ["இம்ப்ளாண்ட் விலை எவ்வளவு", "इम्प्लांट की कीमत कितनी है", "ইমপ্ল্যান্ট দাম কত"]) {
      const heardReply = coreTemplate(heard, "en", { kind: "any" }, index) ?? "";
      expect(heardReply, heard).toContain("$4500*");
      expect(heardReply).not.toMatch(/does not list/i);
    }
    const shell = coreTemplate(QUESTIONS.implant, "en", { kind: "one", clinic: "shellharbour" }, index) ?? "";
    expect(shell).toContain("$4500*");
    expect(shell).not.toContain("$5000");
    expect(shell).not.toContain("Woonona");
    const woonona = coreTemplate(QUESTIONS.implant, "en", { kind: "one", clinic: "woonona" }, index) ?? "";
    expect(woonona).toContain("$5000");
    expect(woonona).not.toContain("$4500");
  });
});
