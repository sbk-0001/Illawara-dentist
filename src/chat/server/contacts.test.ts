import { describe, expect, it } from "vitest";
import { detectLanguage, hasLetters } from "../language/detect";
import { mentionedClinics } from "../intent";
import {
  attachContactFooter,
  chooseContactFooter,
  contactFooter,
  contactLabels,
  contactRouteFooter,
  ensureContactFooter,
  isClearlyOffTopic,
  replyHasContactRoute,
  sharesClinicOrService,
  shouldAppendContactFooter,
  topicShareText,
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
    expect(mentionedClinics("울로나 전화번호")).toEqual(["woonona"]);
    expect(mentionedClinics("닥토 치과")).toEqual(["dapto"]);
    expect(mentionedClinics("다프토 치과")).toEqual(["dapto"]);
    expect(mentionedClinics("셸하버 치과")).toEqual(["shellharbour"]);
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

  it("uses a missing term overlap only when the top score is also low", () => {
    expect(
      shouldAppendContactFooter({
        question: "Who won the world cup in 2022?",
        sourceCount: 4,
        topScore: 0.9,
        sharesTopic: false,
      }),
    ).toBe(false);
    expect(
      shouldAppendContactFooter({
        question: "Who won the world cup in 2022?",
        sourceCount: 4,
        topScore: 0.05,
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

  it("does not append when the reply already has the relevant clinic phone, address or booking link", () => {
    const woonona = { kind: "one" as const, clinic: "woonona" as const };
    const phone = "울로나 전화번호는 02 4284 4486 입니다.";
    expect(
      shouldAppendContactFooter({
        question: "울로나 치과 전화번호",
        sourceCount: 3,
        topScore: 0.86,
        sharesTopic: false,
        replyText: phone,
        index,
        focus: woonona,
      }),
    ).toBe(false);
    expect(
      shouldAppendContactFooter({
        question: "और उनका फ़ोन नंबर?",
        sourceCount: 2,
        topScore: 0.04,
        sharesTopic: false,
        replyText: "वूनोना का फ़ोन नंबर 02 4284 4486 है।",
        index,
        focus: woonona,
      }),
    ).toBe(false);
    expect(
      shouldAppendContactFooter({
        question: "울로나 주소",
        sourceCount: 1,
        topScore: 0.04,
        sharesTopic: false,
        replyText: "379 Princes Highway, Woonona",
        index,
        focus: woonona,
      }),
    ).toBe(false);
    expect(
      shouldAppendContactFooter({
        question: "울로나 예약",
        sourceCount: 1,
        topScore: 0.04,
        sharesTopic: false,
        replyText: index.contacts.woonona.bookingUrl,
        index,
        focus: woonona,
      }),
    ).toBe(false);
    expect(
      shouldAppendContactFooter({
        question: "울로나 전화번호",
        sourceCount: 2,
        topScore: 0.9,
        sharesTopic: false,
        modelSaidNoAnswer: true,
        replyText: "02 4284 4486",
        index,
        focus: woonona,
      }),
    ).toBe(true);
    expect(
      shouldAppendContactFooter({
        question: "울로나 전화번호",
        sourceCount: 2,
        topScore: 0.9,
        sharesTopic: false,
        replyText: "정보가 없습니다. 02 4284 4486",
        index,
        focus: woonona,
      }),
    ).toBe(true);
    expect(
      shouldAppendContactFooter({
        question: "12345 ???",
        sourceCount: 1,
        topScore: 0.9,
        replyText: "02 4284 4486",
        index,
        focus: woonona,
      }),
    ).toBe(true);
  });

  it("shares clinic terms across the remembered clinic and recent user turns", () => {
    const chunks = [{ clinic: "woonona" as const, title: "Contact", heading: "Phone", text: "Call the Woonona clinic on 02 4284 4486." }];
    const turns = ["울로나 치과 어디예요?", "और उनका फ़ोन नंबर?"];
    expect(sharesClinicOrService("और उनका फ़ोन नंबर?", chunks)).toBe(false);
    expect(sharesClinicOrService(topicShareText(turns, { kind: "any" }), chunks)).toBe(true);
    expect(sharesClinicOrService(topicShareText(turns, { kind: "one", clinic: "woonona" }), chunks)).toBe(true);
    expect(topicShareText(turns, { kind: "one", clinic: "woonona" })).toContain("woonona");
    expect(topicShareText(turns, { kind: "one", clinic: "woonona" })).toContain("울로나");
  });

  it("does not append the footer after a correct phone when retrieval looked off topic", async () => {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "울로나 전화번호는 02 4284 4486 입니다." });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const chunks = await readChunks(
      attachContactFooter(source, {
        footer: contactFooter(index, detectLanguage("울로나 전화번호"), { kind: "one", clinic: "woonona" }),
        sourcesFound: false,
        sourceCount: 3,
        topScore: 0.84,
        question: "울로나 치과 전화번호",
        covered: (text) => replyHasContactRoute(text, index),
        sharesTopic: false,
        index,
        focus: { kind: "one", clinic: "woonona" },
      }),
    );
    const text = chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text).toContain("02 4284 4486");
    expect(text).not.toContain("답이 없습니다");
    expect(text).not.toContain("02 4288 0737");
  });

  it("appends the no-answer footer when the reply has no contact route and says the site does not mention it", async () => {
    const facts = "Dapto Dentists whitening teeth";
    expect(
      chooseContactFooter({
        question: "এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?",
        sourceCount: 3,
        topScore: 0.84,
        replyText: "ওয়েবসাইটে রোবট দাঁতের উল্লেখ নেই।",
        index,
        focus: { kind: "any" },
        facts,
      }),
    ).toBe("no-answer");
    expect(
      shouldAppendContactFooter({
        question: "क्या व्हाइटनिंग है?",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "वेबसाइट पर इसका उल्लेख नहीं है।",
        facts: "whitening",
      }),
    ).toBe(true);
    expect(
      shouldAppendContactFooter({
        question: "هل توجد هذه الخدمة؟",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "هذه الخدمة غير مذكور في الموقع.",
        facts: "whitening service",
      }),
    ).toBe(true);
    expect(
      shouldAppendContactFooter({
        question: "有美白吗？",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "网站没有提到这项服务。",
        facts: "whitening",
      }),
    ).toBe(true);
    expect(
      shouldAppendContactFooter({
        question: "Does Dapto offer whitening?",
        sourceCount: 3,
        topScore: 0.9,
        replyText: "Yes, they do.",
        index,
        focus: { kind: "one", clinic: "dapto" },
        facts,
      }),
    ).toBe(true);

    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "ওয়েবসাইটে রোবট দাঁতের উল্লেখ নেই।" });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const language = detectLanguage("এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?");
    const chunks = await readChunks(
      attachContactFooter(source, {
        footer: contactFooter(index, language, { kind: "any" }),
        routeFooter: contactRouteFooter(index, language, { kind: "any" }),
        sourcesFound: true,
        sourceCount: 3,
        topScore: 0.84,
        question: "এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?",
        covered: (text) => replyHasContactRoute(text, index),
        index,
        focus: { kind: "any" },
        facts,
      }),
    );
    const text = chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text).toContain("উল্লেখ নেই");
    expect(text).toContain("উত্তর নেই");
    expect(text).toContain("02 4288 0737");
    expect(text).toContain("zavy360.com");
  });

  it("leaves a grounded answer alone and uses a neutral line only for a contact question", async () => {
    const facts = "Dapto Dentists whitening teeth";
    const focus = { kind: "one" as const, clinic: "dapto" as const };
    expect(
      chooseContactFooter({
        question: "Does Dapto offer teeth whitening?",
        sourceCount: 3,
        topScore: 0.91,
        replyText: "Yes, Dapto offers whitening.",
        index,
        focus,
        facts,
      }),
    ).toBe("none");
    expect(shouldAppendContactFooter({ question: "thanks", sourceCount: 0, topScore: 0, replyText: "উল্লেখ নেই" })).toBe(false);
    expect(
      shouldAppendContactFooter({
        question: "What is the Woonona phone?",
        sourceCount: 2,
        topScore: 0.88,
        replyText: "The phone is 02 4284 4486.",
        index,
        focus: { kind: "one", clinic: "woonona" },
        facts,
      }),
    ).toBe(false);
    expect(
      chooseContactFooter({
        question: "What is the Woonona phone number?",
        sourceCount: 3,
        topScore: 0.9,
        replyText: "Yes, Dapto offers whitening.",
        index,
        focus,
        facts,
      }),
    ).toBe("route");

    const language = detectLanguage("What is the Woonona phone number?");
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "Yes, Dapto offers whitening." });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const routed = await readChunks(
      attachContactFooter(source, {
        footer: contactFooter(index, language, focus),
        routeFooter: contactRouteFooter(index, language, focus),
        sourcesFound: true,
        sourceCount: 3,
        topScore: 0.9,
        question: "What is the Woonona phone number?",
        covered: (text) => replyHasContactRoute(text, index),
        index,
        focus,
        facts,
      }),
    );
    const routedText = routed.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(routedText).toContain("Yes, Dapto offers whitening.");
    expect(routedText).toContain("Book or call:");
    expect(routedText).toContain("02 4284 4486");
    expect(routedText).not.toContain("does not list an answer");

    const answered = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", id: "t1", delta: "Yes, Dapto offers whitening." });
        controller.enqueue({ type: "text-end", id: "t1" });
        controller.close();
      },
    });
    const clean = await readChunks(
      attachContactFooter(answered, {
        footer: contactFooter(index, detectLanguage("Does Dapto offer teeth whitening?"), focus),
        routeFooter: contactRouteFooter(index, detectLanguage("Does Dapto offer teeth whitening?"), focus),
        sourcesFound: true,
        sourceCount: 3,
        topScore: 0.91,
        question: "Does Dapto offer teeth whitening?",
        covered: (text) => replyHasContactRoute(text, index),
        index,
        focus,
        facts,
      }),
    );
    const cleanText = clean.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(cleanText).toBe("Yes, Dapto offers whitening.");
    expect(cleanText).not.toContain("Book or call:");
    expect(cleanText).not.toContain("does not list an answer");
  });

  it("follows the status tag and falls back to the heuristic only when the tag is missing", async () => {
    const hours = "Ouvert de 8h à 18h.";
    const facts = "Monday to Friday 8:00 AM to 6:00 PM";
    const hoursQuestion = "Quels sont les horaires du lundi ?";
    expect(
      chooseContactFooter({ question: hoursQuestion, sourceCount: 3, topScore: 0.9, replyText: hours, facts, statusTag: "A" }),
    ).toBe("none");
    expect(
      chooseContactFooter({ question: hoursQuestion, sourceCount: 3, topScore: 0.9, replyText: hours, facts }),
    ).toBe("no-answer");
    expect(
      chooseContactFooter({
        question: "有种植牙吗？",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "抱歉，我无法确认这项服务。",
        facts: "implants",
        statusTag: "A",
      }),
    ).toBe("no-answer");
    expect(
      chooseContactFooter({
        question: "এই ক্লিনিকে কি রোবট দাঁত বসানো হয়?",
        sourceCount: 3,
        topScore: 0.84,
        replyText: "ওয়েবসাইটে এটি উল্লেখ নেই।",
        facts: "implants",
        statusTag: "A",
      }),
    ).toBe("no-answer");
    expect(
      chooseContactFooter({
        question: "울로나 전화번호",
        sourceCount: 2,
        topScore: 0.9,
        replyText: "抱歉，我无法确认。02 4284 4486",
        index,
        focus: { kind: "one", clinic: "woonona" },
        statusTag: "A",
      }),
    ).toBe("none");
    expect(
      chooseContactFooter({
        question: "有种植牙吗？",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "抱歉，我无法确认这项服务。",
        facts: "implants",
        statusTag: null,
      }),
    ).toBe("no-answer");
    expect(
      chooseContactFooter({
        question: "Does Dapto offer whitening?",
        sourceCount: 3,
        topScore: 0.91,
        replyText: "Yes, Dapto offers whitening.",
        index,
        focus: { kind: "one", clinic: "dapto" },
        facts: "Dapto Dentists whitening teeth",
        statusTag: "N",
      }),
    ).toBe("no-answer");
    expect(
      chooseContactFooter({
        question: "울로나 전화번호",
        sourceCount: 2,
        topScore: 0.9,
        replyText: "电话是 02 4284 4486。",
        index,
        focus: { kind: "one", clinic: "woonona" },
        statusTag: "N",
      }),
    ).toBe("none");
    expect(
      chooseContactFooter({ question: "Xin chào", sourceCount: 0, topScore: 0, replyText: "Xin chào.", statusTag: "G" }),
    ).toBe("none");
    expect(
      chooseContactFooter({
        question: "What is the Woonona phone number?",
        sourceCount: 3,
        topScore: 0.9,
        replyText: "Oui.",
        facts,
        statusTag: "A",
      }),
    ).toBe("route");
    expect(
      chooseContactFooter({ question: "12345 ???", sourceCount: 4, topScore: 1.2, replyText: "Hello", statusTag: "A" }),
    ).toBe("no-answer");
    expect(
      chooseContactFooter({
        question: "Does Dapto offer whitening?",
        sourceCount: 3,
        topScore: 0.9,
        replyText: "Yes, they do.",
        facts: "Dapto Dentists whitening teeth",
        statusTag: null,
      }),
    ).toBe("no-answer");
    const spanishBooking =
      "Puedes reservar en Dapto Dentists. No mencionar otra clínica. Teléfono 02.4261.3131 https://bookings.zavy360.com/booking/shellharbourdentists/locations/a";
    expect(
      chooseContactFooter({
        question: "¿Puedo reservar en Dapto?",
        sourceCount: 3,
        topScore: 0.92,
        replyText: spanishBooking,
        index,
        focus: { kind: "one", clinic: "dapto" },
        statusTag: "A",
      }),
    ).toBe("none");
    expect(
      chooseContactFooter({
        question: "¿Hacen implantes en Dapto?",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "Puedes preguntar en la clínica. No mencionar un precio fijo.",
        statusTag: "A",
      }),
    ).toBe("none");
    expect(
      chooseContactFooter({
        question: "¿Hacen implantes en Dapto?",
        sourceCount: 2,
        topScore: 0.8,
        replyText: "No se menciona esa información.",
        statusTag: "A",
      }),
    ).toBe("no-answer");

    const french = detectLanguage("Faites-vous des traitements de canal à Woonona?");
    const replyStatus = { tag: "A" as const };
    const answered = await readChunks(
      attachContactFooter(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "t1" });
            controller.enqueue({ type: "text-delta", id: "t1", delta: hours });
            controller.enqueue({ type: "text-end", id: "t1" });
            controller.close();
          },
        }),
        {
          footer: contactFooter(index, french, { kind: "any" }),
          routeFooter: contactRouteFooter(index, french, { kind: "any" }),
          sourcesFound: true,
          sourceCount: 3,
          topScore: 0.9,
          question: hoursQuestion,
          covered: (text) => replyHasContactRoute(text, index),
          facts,
          replyStatus,
        },
      ),
    );
    const answeredText = answered.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(answeredText).toBe(hours);
    expect(answeredText).not.toContain("Le site ne donne pas");
    expect(answeredText).not.toContain("does not list an answer");

    const spanish = detectLanguage("¿Puedo reservar en Dapto?");
    const spanishFooter = contactFooter(index, spanish, { kind: "one", clinic: "dapto" });
    const lead = spanishFooter.split("\n")[0] ?? "";
    const echoed = await readChunks(
      attachContactFooter(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "t1" });
            controller.enqueue({
              type: "text-delta",
              id: "t1",
              delta: `Puedes reservar en Dapto Dentists. No mencionar otra clínica. 02.4261.3131\n\n${spanishFooter}`,
            });
            controller.enqueue({ type: "text-end", id: "t1" });
            controller.close();
          },
        }),
        {
          footer: spanishFooter,
          routeFooter: contactRouteFooter(index, spanish, { kind: "one", clinic: "dapto" }),
          sourcesFound: true,
          sourceCount: 3,
          topScore: 0.92,
          question: "¿Puedo reservar en Dapto?",
          covered: (text) => replyHasContactRoute(text, index),
          index,
          focus: { kind: "one", clinic: "dapto" },
          replyStatus: { tag: "A" },
        },
      ),
    );
    const echoedText = echoed.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(echoedText.split(lead).length - 1).toBe(1);
    expect(echoedText).not.toContain("Llame o reserve:");

    const missed = await readChunks(
      attachContactFooter(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "t1" });
            controller.enqueue({ type: "text-delta", id: "t1", delta: "Yes, Dapto offers whitening." });
            controller.enqueue({ type: "text-end", id: "t1" });
            controller.close();
          },
        }),
        {
          footer: contactFooter(index, french, { kind: "any" }),
          routeFooter: contactRouteFooter(index, french, { kind: "any" }),
          sourcesFound: true,
          sourceCount: 3,
          topScore: 0.91,
          question: "Does Dapto offer whitening?",
          covered: (text) => replyHasContactRoute(text, index),
          index,
          focus: { kind: "one", clinic: "dapto" },
          facts: "Dapto Dentists whitening teeth",
          replyStatus: { tag: "N" },
        },
      ),
    );
    const missedText = missed.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(missedText).toContain("Yes, Dapto offers whitening.");
    expect(missedText).toContain("Le site ne donne pas");
    expect(missedText).toContain("Téléphone :");
    expect(missedText).toContain("Réservation :");
    expect(missedText).not.toContain("Phone:");
    expect(missedText).not.toContain("Appelez ou réservez :");
  });

  it("localises Phone and Booking on the contact lines", () => {
    expect(contactLabels("fr")).toEqual({ phone: "Téléphone :", booking: "Réservation :" });
    expect(contactLabels("zh")).toEqual({ phone: "电话：", booking: "预约：" });
    expect(contactLabels("en")).toEqual({ phone: "Phone:", booking: "Booking:" });
    const french = detectLanguage("Faites-vous des traitements de canal à Woonona?");
    const block = contactFooter(index, french, { kind: "any" });
    expect(block).toContain("Téléphone :");
    expect(block).toContain("Réservation :");
    expect(block).toContain("02 4288 0737");
    expect(block).not.toContain("Phone:");
    expect(block).not.toContain("Booking:");
    const route = contactRouteFooter(index, french, { kind: "any" });
    expect(route.startsWith("Appelez ou réservez :")).toBe(true);
    expect(route).toContain("Téléphone :");
    expect(route).not.toContain("Phone:");
    const english = contactFooter(index, detectLanguage("What is the phone number?"), { kind: "any" });
    expect(english).toContain("Phone:");
    expect(english).toContain("Booking:");
    const chinese = contactFooter(index, detectLanguage("抱歉，我无法确认"), { kind: "any" });
    expect(chinese).toContain("电话：");
    expect(chinese).toContain("预约：");
    expect(chinese).not.toContain("Phone:");
  });
});
