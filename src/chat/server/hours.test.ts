import { describe, expect, it } from "vitest";
import { attachHoursWording, bareHoursClinic, formatClinicHours, guardBareHoursReply, hoursRangeClause, hoursRelevant, hoursSource, mayBeBareHours, rewriteEnglishHours } from "./hours";

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
    expect(unnamed.startsWith("Here are the opening hours.")).toBe(true);
    expect(unnamed).toContain("Dapto Dentists is open:");
    expect(unnamed).toContain("Shellharbour Dentists is open:");
    expect(unnamed).toContain("Woonona Dentists is open:");
    expect(unnamed).not.toMatch(/Dentists:\s/);
    const named = guardBareHoursReply(line, "en", { kind: "one", clinic: "dapto" });
    expect(named.startsWith("Dapto Dentists is open:")).toBe(true);
    expect(named).toContain("Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM.");
    expect(named.split("Monday–Friday").length - 1).toBe(1);
    expect(named).not.toContain("Dapto Dentists: ");
    expect(guardBareHoursReply("We are open on Saturday.", "en", { kind: "ask" })).toBe("We are open on Saturday.");
  });

  it("adds a Chinese lead-in to a hours-only line that already names the clinic", () => {
    const line = "Dapto Dentists：周一至周五 上午8:00–下午6:00, 周六 上午8:00–下午4:00。";
    expect(mayBeBareHours("Dapto Dentists：周一至周五", "zh")).toBe(true);
    expect(mayBeBareHours(line, "zh")).toBe(true);
    const guarded = guardBareHoursReply(line, "zh", { kind: "one", clinic: "dapto" });
    expect(guarded.startsWith("Dapto Dentists的营业时间如下：")).toBe(true);
    expect(guarded.split("周一至周五").length - 1).toBe(1);
    expect(guarded).toContain("周一至周五");
    expect(guarded).toContain("上午8:00–下午6:00");
    expect(guarded).toContain("周六 上午8:00–下午4:00");
    expect(guardBareHoursReply("Dapto Dentists周六也营业。", "zh", { kind: "one", clinic: "dapto" })).toBe("Dapto Dentists周六也营业。");
  });

  it("puts the clinic before hours when the model names it only in a later sentence", () => {
    const english = "Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM. You can contact Dapto Dentists for an appointment.";
    const guarded = guardBareHoursReply(english, "en", { kind: "one", clinic: "dapto" });
    expect(guarded.startsWith("Dapto Dentists is open:")).toBe(true);
    expect(guarded.indexOf("is open:")).toBeLessThan(guarded.indexOf("Monday–Friday"));
    expect(guarded.split("Monday–Friday").length - 1).toBe(1);
    expect(guarded).toContain("You can contact Dapto Dentists");
    expect(guarded).not.toContain('"');

    const unnamed = guardBareHoursReply(english, "en", { kind: "ask" });
    expect(unnamed.startsWith("Here are the opening hours.")).toBe(true);
    expect(unnamed).toContain("Shellharbour Dentists is open:");
    expect(unnamed).toContain("Woonona Dentists is open:");

    const chinese = "周一至周五 上午8:00–下午6:00, 周六 上午8:00–下午4:00。Dapto Dentists 的营业时间就是这样。";
    const zh = guardBareHoursReply(chinese, "zh", { kind: "one", clinic: "dapto" });
    expect(zh.startsWith("Dapto Dentists的营业时间如下：")).toBe(true);
    expect(zh.indexOf("的营业时间如下")).toBeLessThan(zh.indexOf("周一至周五"));
    expect(zh.split("周一至周五").length - 1).toBe(1);

    const quoted = guardBareHoursReply(
      'Dapto Dentists: "Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM".',
      "en",
      { kind: "one", clinic: "dapto" },
    );
    expect(quoted.startsWith("Dapto Dentists is open:")).toBe(true);
    expect(quoted).not.toContain('"');
    expect(quoted.split("8:00 AM–6:00 PM").length - 1).toBe(1);

    const persian = guardBareHoursReply(`Dapto Dentists: ${formatClinicHours("dapto", "fa")}`, "fa", { kind: "one", clinic: "dapto" });
    expect(persian.startsWith("ساعات کاری Dapto Dentists:")).toBe(true);
    expect(persian.split("دوشنبه").length - 1).toBe(1);
    expect(persian).not.toMatch(/(?:^|\n)Dapto Dentists:/);
  });

  it("adds the open and close when a Saturday answer only says when Dapto opens", async () => {
    const question = "Does Dapto open on Saturday?";
    const reply = "opens at 8:00 AM";
    expect(hoursRangeClause(reply, question, "en")).toBe("Dapto Dentists: Saturday 8:00 AM–4:00 PM");
    expect(hoursRangeClause("Dapto is open Saturday 8:00 AM–4:00 PM.", question, "en")).toBe("");
    const stream = attachHoursWording(
      new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "t1" });
          controller.enqueue({ type: "text-delta", id: "t1", delta: reply });
          controller.enqueue({ type: "text-end", id: "t1" });
          controller.close();
        },
      }),
      "en",
      true,
      question,
    );
    const reader = stream.getReader();
    let text = "";
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value.delta) text += next.value.delta;
    }
    expect(text).toContain("opens at 8:00 AM");
    expect(text).toContain("Dapto Dentists: Saturday 8:00 AM–4:00 PM");
  });

  it("treats an hours question or an hours chunk as relevant", () => {
    expect(hoursRelevant("ساعات کاری وونونا چیست؟", [])).toBe(true);
    expect(hoursRelevant("Do you offer dental implants?", [])).toBe(false);
    expect(hoursRelevant("implants", [{ heading: "Clinic Hours", text: "Mon – Fri : 8:00 AM – 6:00 PM" }])).toBe(true);
  });
});
