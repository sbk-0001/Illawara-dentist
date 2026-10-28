import { describe, expect, it } from "vitest";
import { attachScriptFix, fixReplyScript } from "./script-fix";
import { applyGlossary } from "./glossary";

async function readText(stream: ReadableStream<{ type: string; delta?: string }>): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const next = await reader.read();
    if (next.done) return text;
    if (next.value.type === "text-delta") text += next.value.delta || "";
  }
}

describe("reply script fix", () => {
  it("turns a Banglish slip back into Latin letters", () => {
    expect(fixReplyScript("Chaiলে", "bn-Latn")).toBe("Chaile");
    expect(fixReplyScript("Chaiলে", "bn-Latn")).not.toMatch(/[\u0980-\u09FF]/);
  });

  it("turns a Hinglish slip back into Latin letters", () => {
    const fixed = fixReplyScript("aapका", "hi-Latn");
    expect(fixed).toBe("aapka");
    expect(fixed).not.toMatch(/[\u0900-\u097F]/);
  });

  it("maps stray Bengali letters into Devanagari and the reverse", () => {
    expect(fixReplyScript("सাদা", "hi")).toBe("सादा");
    expect(fixReplyScript("सাদা", "hi")).not.toMatch(/[\u0980-\u09FF]/);
    expect(fixReplyScript("সাदा", "bn")).toBe("সাদা");
    expect(fixReplyScript("সাदा", "bn")).not.toMatch(/[\u0900-\u097F]/);
    expect(fixReplyScript("সাদা", "bn")).toBe("সাদা");
    expect(fixReplyScript("सादा", "hi")).toBe("सादा");
    const mixed = "সোমবার–শুক্রवार";
    expect(mixed).toMatch(/\u0935/);
    expect(fixReplyScript(mixed, "bn")).toBe("সোমবার–শুক্রবার");
    expect(fixReplyScript(mixed, "bn")).not.toMatch(/[\u0900-\u097F]/);
  });

  it("maps a stray traditional character only for simplified Chinese", () => {
    expect(fixReplyScript("製作", "zh", "洗牙")).toBe("制作");
    expect(fixReplyScript("製作", "zh", "製作")).toBe("製作");
  });

  it("fixes a cluster that arrives across stream chunks", async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "Chai" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "লে" });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const text = await readText(attachScriptFix(source, "bn-Latn", "chai"));
    expect(text).toBe("Chaile");
  });

  it("drops a dangling hyphen left when a foreign suffix was stripped", () => {
    expect(fixReplyScript("Dapto Dentists- தொலைபேசி: 02 4288 0737.", "ta")).toBe("Dapto Dentists தொலைபேசி: 02 4288 0737.");
    expect(fixReplyScript("Woonona Dentists- முகவரி 379 Princes Highway.", "ta")).toBe("Woonona Dentists முகவரி 379 Princes Highway.");
    expect(fixReplyScript("Dapto Dentists-ന്റെ ഫോൺ നമ്പർ 02 4288 0737 ആണ്.", "ml")).toContain("Dentists-ന്റെ");
    expect(fixReplyScript("Woonona Dentists-এর ঠিকানা।", "bn")).toContain("Dentists-এর");
  });

  it("translates implant product words and keeps the All-on-4 brand", () => {
    const ml = applyGlossary("All-on-4 Arch and All-on-X Arch on the Upper Jaw, plus existing dental work, a professional same-day booking link on the website", "ml");
    expect(ml).toContain("All-on-4");
    expect(ml).not.toMatch(/\bArch\b/);
    expect(ml).not.toContain("Upper Jaw");
    expect(ml).not.toContain("existing dental work");
    expect(ml).toContain("ആർച്ച്");
    expect(applyGlossary("All-on-4 Arch", "zh")).toBe("All-on-4 全口");
    expect(applyGlossary("booking link", "ta")).toBe("முன்பதிவு இணைப்பு");
    expect(applyGlossary("professional", "hi")).toBe("विशेषज्ञ");
    expect(applyGlossary("same-day", "bn")).toBe("একই দিনে");
    expect(applyGlossary("website", "es")).toBe("sitio web");
    expect(applyGlossary("Lower Jaw", "ar")).toBe("الفك السفلي");
  });
});
