import { clinicContextText, mentionsServiceArea, type ClinicFocus } from "../intent";
import { expandQuery } from "../retrieval/search";
import type { ClinicId, KnowledgeIndex, ReplyLanguage } from "../types";

/** The model emits this only when it did not answer. It is removed before display. */
export const NO_ANSWER_SENTINEL = "[[NO_ANSWER]]";

/**
 * Fused retrieval scores are about 0–1 (the top hit is usually near 1).
 * Raw BM25 scores are larger than 1. Below this, treat the hit list as no answer.
 */
export const RETRIEVAL_SCORE_FLOOR = 0.2;

const CLINIC_ORDER: ClinicId[] = ["dapto", "shellharbour", "woonona"];

const LEAD: Record<string, string> = {
  en: "The website does not list an answer for that. Call or book here:",
  bn: "ওয়েবসাইটে এই বিষয়ের উত্তর নেই। এই নম্বরে ফোন করুন অথবা বুকিং লিঙ্কে সময় ধরুন:",
  "bn-Latn": "Website e er uttor nei. Phone korun ba booking link theke time nin:",
  ar: "لا توجد إجابة على الموقع. يمكنكم الاتصال أو الحجز عبر الرابط:",
  hi: "वेबसाइट पर इसका उत्तर नहीं है। फ़ोन करें या बुकिंग लिंक से समय लें:",
  "hi-Latn": "Website par iska jawab nahi hai. Phone karein ya booking link se samay lein:",
  zh: "网站没有这个问题的答案。请致电或通过预约链接联系：",
  es: "El sitio no tiene esa respuesta. Llame o reserve con el enlace:",
  vi: "Trang web không có câu trả lời cho điều này. Hãy gọi điện hoặc đặt lịch qua liên kết:",
  ne: "वेबसाइटमा यसको उत्तर छैन। फोन गर्नुहोस् वा बुकिङ लिंकबाट समय लिनुहोस्:",
  ko: "웹사이트에 이 질문의 답이 없습니다. 전화하거나 예약 링크로 연락하세요:",
  el: "Ο ιστότοπος δεν έχει απάντηση. Καλέστε ή κλείστε ραντεβού από τον σύνδεσμο:",
  it: "Il sito non riporta questa risposta. Chiami o prenoti dal link:",
  ur: "ویب سائٹ پر اس کا جواب موجود نہیں۔ فون کریں یا بکنگ لنک سے وقت لیں:",
  fa: "در وب‌سایت پاسخی برای این مورد نیست. تماس بگیرید یا از لینک نوبت بگیرید:",
  he: "אין תשובה באתר. אפשר להתקשר או לקבוע תור בקישור:",
  fr: "Le site ne donne pas cette réponse. Appelez ou réservez via le lien :",
  de: "Die Website enthält dazu keine Antwort. Rufen Sie an oder buchen Sie über den Link:",
  pt: "O site não tem essa resposta. Ligue ou reserve pelo link:",
};

const GREETING =
  /^(?:hi|hey|hello|thanks|thank you|ok|okay|hola|ciao|salut|bonjour|hallo|namaste|salam|gracias|merci|obrigado|danke|xin chao|xin chào)[.!?\s]*$/i;

const ON_TOPIC =
  /\b(dentist|dental|tooth|teeth|implant|invisalign|crown|veneer|whiten|canal|clean|check-?up|fee|fees|price|cost|hour|hours|open|appointment|book|clinic|pain|swell|emergency|child|children|kids|gum|aligner|denture|sedation|dapto|woonona|shellharbour|illawarra|phone|address|parking|saturday|sunday|monday|zavy|root|brace|filling|extract|wisdom|ortho|tratamiento|implante|diente|horario|dentista|impianto|appuntamento|zahn|termin|nha|khoa)\b/i;

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function orderedClinics(focus: ClinicFocus): ClinicId[] {
  if (focus.kind !== "one") return CLINIC_ORDER;
  return [focus.clinic, ...CLINIC_ORDER.filter((id) => id !== focus.clinic)];
}

/** Phones and booking links for every clinic. Shellharbour's other published number is left out. */
export function contactFooter(index: KnowledgeIndex, language: ReplyLanguage, focus: ClinicFocus): string {
  const lead = LEAD[language.code] ?? "";
  const lines = orderedClinics(focus).map((id) => {
    const card = index.contacts[id];
    return `${card.name} — ${card.phone} — ${card.bookingUrl}`;
  });
  return [lead, ...lines].filter(Boolean).join("\n");
}

export function replyHasContactRoute(reply: string, index: KnowledgeIndex): boolean {
  const flat = digits(reply);
  const phones = CLINIC_ORDER.every((id) => {
    const phone = digits(index.contacts[id].phone);
    return phone.length >= 10 && flat.includes(phone);
  });
  return phones && /zavy360\.com/i.test(reply);
}

export function ensureContactFooter(reply: string, index: KnowledgeIndex, language: ReplyLanguage, focus: ClinicFocus): string {
  if (replyHasContactRoute(reply, index)) return reply;
  const block = contactFooter(index, language, focus);
  const trimmed = reply.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function modelSignalsNoAnswer(text: string): boolean {
  return text.includes(NO_ANSWER_SENTINEL);
}

export function stripNoAnswerSentinel(text: string): string {
  return text.replaceAll(NO_ANSWER_SENTINEL, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A retrieval hit the reply can be grounded on. Empty lists and tiny scores are not. */
export function retrievalHasAnswer(sourceCount: number, topScore = 0): boolean {
  if (sourceCount <= 0) return false;
  if (topScore >= 1) return true;
  return topScore >= RETRIEVAL_SCORE_FLOOR;
}

/**
 * Off-topic only when the recent user turns name no clinic and no dental topic.
 * This does not by itself add the contact footer. A found answer is never "off topic" for that purpose.
 */
export function isClearlyOffTopic(question: string, priorTurns: string[] = []): boolean {
  const conversation = clinicContextText([...priorTurns, question].filter(Boolean));
  const trimmed = conversation.trim();
  if (!trimmed || GREETING.test(question.trim())) return false;
  if (mentionsServiceArea(trimmed)) return false;
  if (ON_TOPIC.test(trimmed)) return false;
  if (expandQuery(trimmed) !== trimmed) return false;
  return question.trim().replace(/\s/g, "").length >= 12;
}

export type FooterDecision = {
  question: string;
  sourceCount: number;
  topScore?: number;
  /** True when the model emitted the no-answer sentinel. Sources do not block the footer in that case. */
  modelSaidNoAnswer?: boolean;
};

/**
 * Append when retrieval found nothing usable, or the model marked the reply unanswered.
 * Never append when sources were found and the model answered.
 */
export function shouldAppendContactFooter(input: FooterDecision): boolean {
  if (!input.question.trim() && !input.modelSaidNoAnswer) return false;
  if (input.modelSaidNoAnswer) return true;
  if (GREETING.test(input.question.trim())) return false;
  const top = input.topScore ?? (input.sourceCount > 0 ? 1 : 0);
  return !retrievalHasAnswer(input.sourceCount, top);
}

type FooterChunk = { type: string; id?: string; delta?: string };

/** Drop a complete sentinel, and hold back a suffix that might still grow into one. */
export function takeVisibleReply(buffer: string, final: boolean): { visible: string; hold: string; sawSentinel: boolean } {
  let sawSentinel = false;
  let visible = "";
  let rest = buffer;
  while (rest.length) {
    const at = rest.indexOf(NO_ANSWER_SENTINEL);
    if (at >= 0) {
      sawSentinel = true;
      visible += rest.slice(0, at);
      rest = rest.slice(at + NO_ANSWER_SENTINEL.length);
      continue;
    }
    if (final) {
      visible += rest;
      rest = "";
      break;
    }
    let hold = 0;
    const max = Math.min(rest.length, NO_ANSWER_SENTINEL.length - 1);
    for (let n = max; n > 0; n -= 1) {
      if (NO_ANSWER_SENTINEL.startsWith(rest.slice(-n))) {
        hold = n;
        break;
      }
    }
    visible += rest.slice(0, rest.length - hold);
    rest = rest.slice(rest.length - hold);
    break;
  }
  return { visible, hold: rest, sawSentinel };
}

/**
 * Strip the no-answer sentinel from the stream. Append the contact block only when
 * retrieval found nothing usable, or the sentinel was present. A reply that already
 * lists every clinic phone and a booking link is left unchanged.
 */
export function attachContactFooter<T extends FooterChunk>(
  stream: ReadableStream<T>,
  input: { footer: string; sourcesFound: boolean; question: string; covered: (text: string) => boolean },
): ReadableStream<T> {
  let textId: string | undefined;
  let pending = "";
  let shown = "";
  let sawSentinel = false;
  let sealed = false;

  const finishText = (controller: TransformStreamDefaultController<T>) => {
    if (sealed) return;
    sealed = true;
    const drained = takeVisibleReply(pending, true);
    pending = "";
    if (drained.sawSentinel) sawSentinel = true;
    shown += drained.visible;
    if (drained.visible && textId) controller.enqueue({ type: "text-delta", id: textId, delta: drained.visible } as T);
    const append = shouldAppendContactFooter({
      question: input.question,
      sourceCount: input.sourcesFound ? 1 : 0,
      topScore: input.sourcesFound ? 1 : 0,
      modelSaidNoAnswer: sawSentinel,
    });
    if (!append || !input.footer || input.covered(shown)) return;
    const id = textId ?? "contact-footer";
    const delta = `${shown.trim() ? "\n\n" : ""}${input.footer}`;
    if (!textId) controller.enqueue({ type: "text-start", id } as T);
    controller.enqueue({ type: "text-delta", id, delta } as T);
    if (!textId) controller.enqueue({ type: "text-end", id } as T);
  };

  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (chunk.type === "text-start" && chunk.id) textId = chunk.id;
        if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
          pending += chunk.delta;
          const drained = takeVisibleReply(pending, false);
          pending = drained.hold;
          if (drained.sawSentinel) sawSentinel = true;
          shown += drained.visible;
          if (drained.visible) controller.enqueue({ ...chunk, delta: drained.visible });
          return;
        }
        if (chunk.type === "text-end" || chunk.type === "finish") {
          finishText(controller);
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        finishText(controller);
      },
    }),
  );
}
