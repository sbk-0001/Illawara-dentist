import { mentionedClinics, type ClinicFocus } from "../intent";
import { expandQuery } from "../retrieval/search";
import type { ClinicId, KnowledgeIndex, ReplyLanguage } from "../types";

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

export function isClearlyOffTopic(question: string): boolean {
  const trimmed = question.trim();
  if (!trimmed || GREETING.test(trimmed)) return false;
  if (mentionedClinics(trimmed).length > 0) return false;
  if (ON_TOPIC.test(trimmed)) return false;
  if (expandQuery(trimmed) !== trimmed) return false;
  return trimmed.replace(/\s/g, "").length >= 12;
}

/** No-answer and off-topic replies get the contact block. A bare greeting does not. */
export function shouldAppendContactFooter(question: string, sourceCount: number): boolean {
  const trimmed = question.trim();
  if (!trimmed) return false;
  if (GREETING.test(trimmed)) return false;
  if (sourceCount === 0) return true;
  return isClearlyOffTopic(trimmed);
}

type FooterChunk = { type: string; id?: string; delta?: string };

/**
 * Append the contact block as a text-delta before the text part closes.
 * Skips the append when the model's own text already has every clinic phone and a booking link.
 */
export function attachContactFooter<T extends FooterChunk>(
  stream: ReadableStream<T>,
  footer: string,
  covered: (text: string) => boolean,
): ReadableStream<T> {
  let textId: string | undefined;
  let accumulated = "";
  let sealed = false;

  const inject = (controller: TransformStreamDefaultController<T>) => {
    if (sealed) return;
    sealed = true;
    if (!footer || covered(accumulated)) return;
    const id = textId ?? "contact-footer";
    const delta = `${accumulated.trim() ? "\n\n" : ""}${footer}`;
    if (!textId) controller.enqueue({ type: "text-start", id } as T);
    controller.enqueue({ type: "text-delta", id, delta } as T);
    if (!textId) controller.enqueue({ type: "text-end", id } as T);
  };

  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (chunk.type === "text-start" && chunk.id) textId = chunk.id;
        if (chunk.type === "text-delta" && typeof chunk.delta === "string") accumulated += chunk.delta;
        if (chunk.type === "text-end" || chunk.type === "finish") inject(controller);
        controller.enqueue(chunk);
      },
      flush(controller) {
        inject(controller);
      },
    }),
  );
}
