import { describe, expect, it } from "vitest";
import { correctTranscript, deepgramListenUrl, STT_KEYTERMS } from "./stt";

describe("Deepgram Nova-3 keyterms", () => {
  it("keeps language=multi and repeats keyterm for each clinic phrase", () => {
    for (const url of [deepgramListenUrl("stream"), deepgramListenUrl("prerecorded")]) {
      const params = new URL(url.replace(/^wss:/, "https:")).searchParams;
      expect(params.get("model")).toBe("nova-3");
      expect(params.get("language")).toBe("multi");
      expect(params.getAll("keyterm")).toEqual([...STT_KEYTERMS]);
      expect(url).not.toMatch(/keywords=/);
      expect(url).not.toMatch(/keyterm=[^&]*:/);
    }
    expect(deepgramListenUrl("stream")).toContain("interim_results=true");
    expect(deepgramListenUrl("stream")).toContain("endpointing=400");
    expect(deepgramListenUrl("prerecorded")).not.toContain("interim_results");
    expect(deepgramListenUrl("stream").startsWith("wss://")).toBe(true);
    expect(deepgramListenUrl("prerecorded").startsWith("https://")).toBe(true);
  });

  it("corrects known mishearings and leaves ordinary Buona alone", () => {
    expect(correctTranscript("隐世美多少钱")).toBe("隐适美多少钱");
    expect(correctTranscript("隐式美")).toBe("隐适美");
    expect(correctTranscript("عيادة دبتو")).toBe("عيادة دابتو");
    expect(correctTranscript("the Buona clinic")).toBe("the Woonona clinic");
    expect(correctTranscript("dentist in Buona")).toBe("dentist in Woonona");
    expect(correctTranscript("Buona sera")).toBe("Buona sera");
    expect(correctTranscript("Buona")).toBe("Buona");
    expect(correctTranscript("Buona sera at the clinic")).toBe("Buona sera at the clinic");
  });
});
