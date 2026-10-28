import { describe, expect, it } from "vitest";
import { getKnowledgeIndex } from "./index-store";
import { attachContactLabels, isLabelValueLine, isOnlyContactLine, isShortLabelReply, restoreClinicNames, rewriteContactLabels } from "./label-fix";

const index = getKnowledgeIndex();

async function readChunks(stream: ReadableStream<{ type: string; id?: string; delta?: string }>) {
  const reader = stream.getReader();
  const chunks: { type: string; id?: string; delta?: string }[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
}

function source(parts: string[]) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "text-start", id: "t1" });
      for (const delta of parts) controller.enqueue({ type: "text-delta", id: "t1", delta });
      controller.enqueue({ type: "text-end", id: "t1" });
      controller.close();
    },
  });
}

describe("contact label rewrite", () => {
  it("rewrites line-leading English labels and leaves a sentence alone", () => {
    expect(rewriteContactLabels("ফোন নম্বর\nPhone: 02 4216 9911", "bn")).toBe("ফোন নম্বর\nফোন: 02 4216 9911");
    expect(rewriteContactLabels("Booking: https://bookings.zavy360.com/a", "ar")).toContain("الحجز:");
    expect(rewriteContactLabels("Email: info@shellharbourdentist.com.au", "hi")).toContain("ईमेल:");
    expect(rewriteContactLabels("Email: info@woononadentists.com.au", "vi")).toContain("Thư điện tử:");
    expect(rewriteContactLabels("Email: info@woononadentists.com.au", "vi")).not.toContain("Email:");
    expect(rewriteContactLabels("Hours: Monday", "vi")).toContain("Giờ mở cửa:");
    expect(rewriteContactLabels("Website: https://woononadentists.com.au", "vi")).toContain("Trang web:");
    expect(rewriteContactLabels("Address: 35 Baan Baan Street", "id")).toContain("Alamat:");
    expect(rewriteContactLabels("Phone: 02 4216 9911", "en")).toBe("Phone: 02 4216 9911");
    expect(rewriteContactLabels("Call the phone: 02 4216 9911", "bn")).toContain("phone:");
  });

  it("does not hold a real sentence, and rewrites a label split across chunks", async () => {
    let releaseEnd: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseEnd = resolve;
    });
    const early = new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "হ্যাঁ, ড্যাপ্টোতে হোয়াইটেনিং আছে।" });
        await gate;
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const reader = attachContactLabels(early, { code: "bn", index, replyStatus: { missing: true } }).getReader();
    let first = await reader.read();
    if (first.value?.type === "text-start") first = await reader.read();
    expect(first.value?.type).toBe("text-delta");
    expect(first.value?.delta).toContain("হোয়াইটেনিং");
    releaseEnd();
    await reader.cancel();

    const split = await readChunks(
      attachContactLabels(source(["Pho", "ne: 02 4284 4486"]), { code: "hi", index, replyStatus: { missing: false } }),
    );
    const text = split.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text.startsWith("Woonona Dentists का फ़ोन नंबर 02 4284 4486 है।")).toBe(true);
    expect(text.match(/02 4284 4486/g)).toHaveLength(1);
    expect(text).not.toContain("Phone");
    expect(split.some((chunk) => chunk.delta?.includes("Pho"))).toBe(false);
  });

  it("prepends a localized sentence when a missing tag left only a contact line", async () => {
    expect(isOnlyContactLine("Phone: 02 4216 9911")).toBe(true);
    expect(isOnlyContactLine("হ্যাঁ, ড্যাপ্টোতে হোয়াইটেনিং আছে।")).toBe(false);
    const bn = await readChunks(
      attachContactLabels(source(["Phone: 02 4216 9911"]), { code: "bn", index, replyStatus: { missing: true } }),
    );
    const bnText = bn.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(bnText.startsWith("Shellharbour Dentists-এর ফোন নম্বর 02 4216 9911।")).toBe(true);
    expect(bnText.match(/02 4216 9911/g)).toHaveLength(1);
    expect(bnText).not.toContain("Phone:");

    const id = await readChunks(
      attachContactLabels(source(["Phone: ", "02 4284 4486"]), { code: "id", index, replyStatus: { missing: true } }),
    );
    const idText = id.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(idText).toContain("Nomor telepon Woonona Dentists adalah 02 4284 4486.");
    expect(idText.match(/02 4284 4486/g)).toHaveLength(1);
    expect(idText).not.toContain("Phone:");

    const tagged = await readChunks(
      attachContactLabels(source(["Phone: 02 4284 4486"]), { code: "ar", index, replyStatus: { missing: false } }),
    );
    const arText = tagged.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(arText.startsWith("رقم هاتف Woonona Dentists هو 02 4284 4486.")).toBe(true);
    expect(arText.match(/02 4284 4486/g)).toHaveLength(1);
    expect(arText).not.toContain("Phone:");
  });

  it("prepends a sentence for a short label line even when the tag is present", async () => {
    const greekLine = "Τηλέφωνο: 02 4284 4486.";
    expect(greekLine.length).toBeLessThan(60);
    expect(isShortLabelReply(greekLine, "el")).toBe(true);
    expect(isShortLabelReply("Call the phone: 02 4216 9911", "bn")).toBe(false);
    expect(isLabelValueLine("Ανοιχτά 8:00–18:00.", "el")).toBe(false);

    const greek = await readChunks(
      attachContactLabels(source([greekLine]), { code: "el", index, replyStatus: { missing: false } }),
    );
    const text = greek.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text.startsWith("Το τηλέφωνο του Woonona Dentists είναι 02 4284 4486.")).toBe(true);
    expect(text.match(/02 4284 4486/g)).toHaveLength(1);

    let releaseEnd: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseEnd = resolve;
    });
    const early = new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "Ναι, το ιατρείο Woonona είναι ανοιχτό από τις 8." });
        await gate;
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const reader = attachContactLabels(early, { code: "el", index, replyStatus: { missing: false } }).getReader();
    let first = await reader.read();
    if (first.value?.type === "text-start") first = await reader.read();
    expect(first.value?.type).toBe("text-delta");
    expect(first.value?.delta).toContain("Woonona");
    expect(first.value?.delta?.startsWith("Το τηλέφωνο")).toBe(false);
    releaseEnd();
    await reader.cancel();
  });

  it("names every clinic when an hours-only reply does not say which clinic", async () => {
    const line = "Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM.";
    const unnamed = await readChunks(
      attachContactLabels(source([line]), { code: "en", index, replyStatus: { missing: false }, focus: { kind: "ask" } }),
    );
    const text = unnamed.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text.startsWith("Here are the opening hours.")).toBe(true);
    expect(text).toContain("Dapto Dentists is open: Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM");
    expect(text).toContain("Shellharbour Dentists is open:");
    expect(text).toContain("Woonona Dentists is open:");
    expect(isShortLabelReply(text, "en")).toBe(false);
    expect(text.startsWith("Monday")).toBe(false);

    const named = await readChunks(
      attachContactLabels(source(["Monday–Fri", "day 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM."]), {
        code: "en",
        index,
        replyStatus: { missing: false },
        focus: { kind: "one", clinic: "dapto" },
      }),
    );
    const dapto = named.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(dapto.startsWith("Dapto Dentists is open:")).toBe(true);
    expect(dapto).not.toContain("Dapto Dentists: ");
    expect(dapto).toContain("Saturday 8:00 AM–4:00 PM.");
    expect(dapto).not.toContain("Shellharbour");

    const sentence = await readChunks(
      attachContactLabels(source(["Dapto is open Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM."]), {
        code: "en",
        index,
        replyStatus: { missing: false },
        focus: { kind: "ask" },
      }),
    );
    const prose = sentence.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(prose).toBe("Dapto is open Monday–Friday 8:00 AM–6:00 PM, Saturday 8:00 AM–4:00 PM.");

    const chinese = await readChunks(
      attachContactLabels(source(["Dapto Dentists：周一至周五 上午8:00–下午6:00, 周六 上午8:00–下午4:00。"]), {
        code: "zh",
        index,
        replyStatus: { missing: false },
        focus: { kind: "one", clinic: "dapto" },
      }),
    );
    const zh = chinese.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(zh.startsWith("Dapto Dentists的营业时间如下：")).toBe(true);
    expect(zh).toContain("上午8:00–下午6:00");
    expect(zh).toContain("下午4:00");
  });

  it("answers an address question with the focused clinic street, not a phone alone", async () => {
    const replaced = await readChunks(
      attachContactLabels(source(["02 4288 0737"]), {
        code: "bn",
        index,
        replyStatus: { missing: false },
        focus: { kind: "one", clinic: "dapto" },
        question: "ঠিকানা কোথায়?",
      }),
    );
    const street = replaced.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(street).toContain("35 Baan Baan Street");
    expect(street).toContain("এর ঠিকানা হলো");
    expect(street).not.toContain("02 4288 0737");
    expect(street).not.toContain("Captain Cook");
  });

  it("turns a tagged Korean phone label into a sentence", async () => {
    expect(isLabelValueLine("전화: 02 4284 4486", "ko")).toBe(true);
    expect(isLabelValueLine("전화번호: 02 4288 0737", "ko")).toBe(true);
    expect(isShortLabelReply("연락처 02 4284 4486", "ko")).toBe(true);
    expect(isOnlyContactLine("Dapto Dentists 전화 02 4288 0737")).toBe(true);

    const labeled = await readChunks(
      attachContactLabels(source(["전화: 02 4284 4486"]), { code: "ko", index, replyStatus: { missing: false } }),
    );
    const labeledText = labeled.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(labeledText.startsWith("Woonona Dentists의 전화번호는 02 4284 4486입니다.")).toBe(true);
    expect(labeledText.match(/02 4284 4486/g)).toHaveLength(1);

    const bare = await readChunks(
      attachContactLabels(source(["Dapto Dentists 전화 02 4288 0737"]), { code: "ko", index, replyStatus: { missing: false } }),
    );
    const bareText = bare.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(bareText.startsWith("Dapto Dentists의 전화번호는 02 4288 0737입니다.")).toBe(true);
    expect(bareText.match(/02 4288 0737/g)).toHaveLength(1);

    const sentence = "울로나 치과의 전화번호는 02 4284 4486입니다.";
    expect(restoreClinicNames(sentence)).toBe("Woonona Dentists의 전화번호는 02 4284 4486입니다.");
    const duplicated = await readChunks(
      attachContactLabels(source([sentence]), { code: "ko", index, replyStatus: { missing: true }, focus: { kind: "one", clinic: "woonona" } }),
    );
    const once = duplicated.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(once).toBe("Woonona Dentists의 전화번호는 02 4284 4486입니다.");
    expect(once.match(/02 4284 4486/g)).toHaveLength(1);
    expect(once).not.toContain("울로나");
    expect(restoreClinicNames("ড্যাপ্টো ডেন্টিস্টস এবং উনোনা ডেন্টিস্টস")).toBe("Dapto Dentists এবং Woonona Dentists");

    const hinglish = "Dapto Dentists का फ़ोन नंबर 02 4288 0737 है।\nDapto Dentists का फ़ोन 02 4288 0737 है।";
    const hi = await readChunks(attachContactLabels(source([hinglish]), { code: "hi", index, replyStatus: { missing: false } }));
    const hiText = hi.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(hiText.match(/02 4288 0737/g)).toHaveLength(1);

    const korean = "Dapto Dentists의 전화번호는 02 4288 0737입니다.\n전화: 02 4288 0737 입니다";
    const ko = await readChunks(attachContactLabels(source([korean]), { code: "ko", index, replyStatus: { missing: false } }));
    const koText = ko.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(koText.match(/02 4288 0737/g)).toHaveLength(1);
  });
});
