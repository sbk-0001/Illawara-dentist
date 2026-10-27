import { describe, expect, it } from "vitest";
import { detectLanguage, hasLetters } from "../language/detect";
import { mentionedClinics } from "../intent";
import {
  attachContactFooter,
  contactFooter,
  ensureContactFooter,
  isClearlyOffTopic,
  replyHasContactRoute,
  shouldAppendContactFooter,
} from "./contacts";
import { prepareTurn } from "./chat-route";
import { getKnowledgeIndex } from "./index-store";

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

describe("contact footer", () => {
  it("ends a Bengali no-answer with every clinic phone and booking link", () => {
    const language = detectLanguage("এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?");
    const block = contactFooter(index, language, { kind: "any" });
    expect(language.code).toBe("bn");
    expect(block).toMatch(/[\u0980-\u09FF]/);
    expect(block).toContain("02 4288 0737");
    expect(block).toContain("02 4216 9911");
    expect(block).toContain("02 4284 4486");
    expect(block).toContain("zavy360.com");
    expect(block).not.toContain("02 4062 8706");
    expect(shouldAppendContactFooter({ question: "এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?", sourceCount: 0, topScore: 0 })).toBe(true);
  });

  it("does not duplicate a reply that already has the contact route", () => {
    const reply = [
      "I don't know.",
      "Dapto Dentists — 02 4288 0737 — https://bookings.zavy360.com/booking/shellharbourdentists/locations/a",
      "Shellharbour Dentists — 02 4216 9911 — https://bookings.zavy360.com/booking/shellharbourdentists/locations/b",
      "Woonona Dentists — 02 4284 4486 — https://bookings.zavy360.com/booking/shellharbourdentists/locations/c",
    ].join("\n");
    expect(replyHasContactRoute(reply, index)).toBe(true);
    expect(ensureContactFooter(reply, index, detectLanguage(reply), { kind: "any" })).toBe(reply);
  });

  it("appends only when retrieval missed or the model marked the reply unanswered", () => {
    expect(shouldAppendContactFooter({ question: "Who won the world cup in 2022?", sourceCount: 4, topScore: 0.9 })).toBe(false);
    expect(shouldAppendContactFooter({ question: "우노나 치과 전화번호", sourceCount: 2, topScore: 0.8 })).toBe(false);
    expect(shouldAppendContactFooter({ question: "ڈاپٹو کا پتہ کیا ہے؟", sourceCount: 3, topScore: 1.4 })).toBe(false);
    expect(shouldAppendContactFooter({ question: "Who won the world cup in 2022?", sourceCount: 0, topScore: 0 })).toBe(true);
    expect(shouldAppendContactFooter({ question: "How much is a check-up?", sourceCount: 2, topScore: 0.05 })).toBe(true);
    expect(
      shouldAppendContactFooter({ question: "وما هو رقم الهاتف؟", sourceCount: 2, topScore: 0.9, modelSaidNoAnswer: true }),
    ).toBe(true);
    expect(shouldAppendContactFooter({ question: "hello", sourceCount: 0, topScore: 0 })).toBe(false);
    expect(hasLetters("12345 ???")).toBe(false);
    expect(shouldAppendContactFooter({ question: "12345 ???", sourceCount: 4, topScore: 1.2 })).toBe(true);
  });

  it("treats a letterless message as English fallback with no retrieved pages", () => {
    const turn = prepareTurn([{ role: "user", content: "12345 ???" }], "auto", index);
    expect(turn.reply).toMatchObject({ code: "en", fallback: true });
    expect(turn.sources).toEqual([]);
    expect(turn.chunks).toEqual([]);
    expect(turn.instructions).toMatch(/could not be detected/i);
    expect(turn.instructions).toContain("NO RELEVANT PAGES");
  });

  it("keeps a follow-up phone question on the clinic named earlier", () => {
    const follow = prepareTurn(
      [
        { role: "user", content: "What is the Shellharbour address?" },
        { role: "assistant", content: "Suite 7, Barrack Heights." },
        { role: "user", content: "وما هو رقم الهاتف؟" },
      ],
      "auto",
      index,
    );
    expect(follow.focus).toEqual({ kind: "one", clinic: "shellharbour" });
    expect(follow.query).toContain("shellharbour");
    expect(follow.reply.code).toBe("ar");
    expect(isClearlyOffTopic("وما هو رقم الهاتف؟", ["What is the Shellharbour address?"])).toBe(false);
    expect(mentionedClinics("ڈاپٹو کا لوکیشن")).toEqual(["dapto"]);
    expect(mentionedClinics("우노나 전화번호")).toEqual(["woonona"]);
    expect(mentionedClinics("伍诺纳诊所")).toEqual(["woonona"]);
    expect(mentionedClinics("شيلهاربر")).toEqual(["shellharbour"]);
    if (follow.sources.length) {
      expect(
        shouldAppendContactFooter({ question: follow.text, sourceCount: follow.sources.length, topScore: follow.chunks[0]?.score ?? 1 }),
      ).toBe(false);
    }
  });

  it("writes the contact block into the answer stream before the text closes", async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "জানি না।" });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });
    const language = detectLanguage("জানি না কেন");
    const chunks = await readChunks(
      attachContactFooter(source, {
        footer: contactFooter(index, language, { kind: "any" }),
        sourcesFound: false,
        question: "জানি না কেন",
        covered: (text) => replyHasContactRoute(text, index),
      }),
    );
    const end = chunks.findIndex((chunk) => chunk.type === "text-end");
    const injected = chunks.slice(0, end).filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(injected).toContain("02 4288 0737");
    expect(injected).toContain("02 4216 9911");
    expect(injected).toContain("02 4284 4486");
    expect(injected).toContain("zavy360.com");
    expect(injected).not.toContain("02 4062 8706");
  });

  it("does not append the footer when sources were found and the model answered", async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "The Woonona phone is 02 4284 4486." });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });
    const chunks = await readChunks(
      attachContactFooter(source, {
        footer: contactFooter(index, detectLanguage("hello"), { kind: "one", clinic: "woonona" }),
        sourcesFound: true,
        question: "우노나 전화번호",
        covered: (text) => replyHasContactRoute(text, index),
      }),
    );
    const text = chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text).toContain("02 4284 4486");
    expect(text).not.toContain("02 4288 0737");
    expect(text).not.toContain("does not list an answer");
    expect(text).not.toContain("답이 없습니다");
  });

  it("strips the no-answer sentinel and then appends the contact block", async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "I can't answer that.\n[[NO_ANS" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "WER]]" });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const chunks = await readChunks(
      attachContactFooter(source, {
        footer: contactFooter(index, detectLanguage("hello"), { kind: "any" }),
        sourcesFound: true,
        question: "Who won the world cup?",
        covered: (text) => replyHasContactRoute(text, index),
      }),
    );
    const text = chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text).not.toContain("[[NO_ANSWER]]");
    expect(text).toContain("I can't answer that.");
    expect(text).toContain("02 4288 0737");
    expect(text).toContain("zavy360.com");
  });

  it("appends the footer when a Bengali reply says there is no information and sources scored", async () => {
    expect(
      shouldAppendContactFooter({
        question: "এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "তথ্য নেই",
      }),
    ).toBe(true);
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "তথ্য নেই" });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const chunks = await readChunks(
      attachContactFooter(source, {
        footer: contactFooter(index, detectLanguage("এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?"), { kind: "any" }),
        sourcesFound: true,
        question: "এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?",
        covered: (text) => replyHasContactRoute(text, index),
      }),
    );
    const text = chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text).toContain("তথ্য নেই");
    expect(text).toContain("02 4288 0737");
    expect(text).toContain("02 4216 9911");
  });

  it("appends the footer when the question shares no clinic or service terms with the hits", () => {
    expect(
      shouldAppendContactFooter({
        question: "Who won the world cup in 2022?",
        sourceCount: 4,
        topScore: 0.9,
        sharesTopic: false,
      }),
    ).toBe(true);
    expect(
      shouldAppendContactFooter({
        question: "우노나 치과 전화번호",
        sourceCount: 2,
        topScore: 0.8,
        sharesTopic: true,
        replyText: "The phone is 02 4284 4486.",
      }),
    ).toBe(false);
  });
});
