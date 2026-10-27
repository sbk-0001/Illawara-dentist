import { describe, expect, it } from "vitest";
import { bareHoursClinic, formatClinicHours, guardBareHoursReply, hoursRelevant, hoursSource, mayBeBareHours, rewriteEnglishHours } from "./hours";

const ENGLISH_DAY = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const AMPM = /\b(am|pm)\b/i;

describe("localised opening hours", () => {
  it("cites the indexed pages and records the Woonona disagreement", () => {
    expect(hoursSource("dapto").sources).toEqual(["https://daptodentists.com.au/"]);
    expect(hoursSource("shellharbour").sources).toEqual(["https://shellharbourdentist.com.au/dentist-shell-cove/"]);
    expect(hoursSource("woonona").sources).toEqual(["https://woononadentists.com.au/", "https://woononadentists.com.au/contact-us/"]);
    expect(hoursSource("woonona").disagreement).toMatch(/new-patient-offer/);
    expect(hoursSource("woonona").disagreement).toMatch(/17:00/);
  });

  it("formats Persian, French, Malay and Bengali hours without English days or AM/PM", () => {
    const fa = formatClinicHours("woonona", "fa");
    expect(fa).toContain("دوشنبه تا جمعه");
    expect(fa).toContain("8:00 تا 18:00");
    expect(fa).toContain("شنبه");
    expect(fa).not.toMatch(ENGLISH_DAY);
    expect(fa).not.toMatch(AMPM);
    expect(fa).not.toMatch(/[۰-۹]/);

    const fr = formatClinicHours("shellharbour", "fr");
    expect(fr).toContain("lundi–vendredi 8h00–17h00");
    expect(fr).toContain("samedi sur rendez-vous");
    expect(fr).not.toMatch(AMPM);
    expect(fr).not.toMatch(ENGLISH_DAY);

    const ms = formatClinicHours("dapto", "ms");
    expect(ms).toContain("Isnin–Jumaat 8.00–18.00");
    expect(ms).toContain("Sabtu 8.00–16.00");
    expect(ms).not.toMatch(AMPM);

    const bn = formatClinicHours("woonona", "bn");
    expect(bn).toContain("সোমবার–শুক্রবার");
    expect(bn).toContain("সকাল 8:00");
    expect(bn).toContain("শনিবার");
    expect(bn).not.toMatch(ENGLISH_DAY);
    expect(bn).not.toMatch(AMPM);
  });

  it("keeps English AM/PM, uses 24-hour English days for an unknown language, and keeps Banglish in Latin", () => {
    expect(formatClinicHours("dapto", "en")).toBe("Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM");
    const unknown = formatClinicHours("shellharbour", "xx");
    expect(unknown).toContain("Monday–Friday 08:00–17:00");
    expect(unknown).toContain("Saturday by appointment");
    expect(unknown).not.toMatch(AMPM);
    const banglish = formatClinicHours("dapto", "bn-Latn");
    expect(banglish).toContain("Shombar–Shukrobar 8:00–18:00");
    expect(banglish).toContain("Shonibar");
    expect(banglish).not.toMatch(/[\u0980-\u09FF]/);
    expect(banglish).not.toMatch(AMPM);
  });

  it("rewrites leftover English hours in non-English replies", () => {
    expect(rewriteEnglishHours("8.00 AM تا 6.00 PM", "fa")).toBe("8:00 تا 18:00");
    expect(rewriteEnglishHours("8.00 AM à 5.00 PM", "fr")).toBe("8h00 à 17h00");
    expect(rewriteEnglishHours("8am hingga 4pm", "ms")).toBe("8.00 hingga 16.00");
    expect(rewriteEnglishHours("Monday থেকে Friday, 8.00 AM", "bn")).toBe("সোমবার থেকে শুক্রবার, সকাল 8:00");
    expect(rewriteEnglishHours("Monday 8:00 AM", "en")).toBe("Monday 8:00 AM");
    expect(rewriteEnglishHours("Shonibar 8am", "bn-Latn")).toBe("Shonibar 8am");
  });

  it("names the clinic on a hours-only line, and names every clinic when the question did not", () => {
    const line = "Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM.";
    expect(bareHoursClinic(line, "en")).toBe("dapto");
    expect(mayBeBareHours("Monday–Friday 8:00 AM–6:00", "en")).toBe(true);
    expect(mayBeBareHours("Dapto is open Monday–Friday 8:00 AM–6:00 PM.", "en")).toBe(false);
    const unnamed = guardBareHoursReply(line, "en", { kind: "ask" });
    expect(unnamed).toContain("Dapto Dentists:");
    expect(unnamed).toContain("Shellharbour Dentists:");
    expect(unnamed).toContain("Woonona Dentists:");
    expect(guardBareHoursReply(line, "en", { kind: "one", clinic: "dapto" }).startsWith("Dapto Dentists:")).toBe(true);
    expect(guardBareHoursReply("We are open on Saturday.", "en", { kind: "ask" })).toBe("We are open on Saturday.");
  });

  it("treats an hours question or an hours chunk as relevant", () => {
    expect(hoursRelevant("ساعات کاری وونونا چیست؟", [])).toBe(true);
    expect(hoursRelevant("Do you offer dental implants?", [])).toBe(false);
    expect(hoursRelevant("implants", [{ heading: "Clinic Hours", text: "Mon – Fri : 8:00 AM – 6:00 PM" }])).toBe(true);
  });
});
