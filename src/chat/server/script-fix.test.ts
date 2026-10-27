import { describe, expect, it } from "vitest";
import { attachScriptFix, fixReplyScript } from "./script-fix";

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
});
