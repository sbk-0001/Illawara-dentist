import { clinicContextText, mentionedClinics, mentionsServiceArea, type ClinicFocus } from "../intent";
import type { StatusTag } from "./status-tag";

export type { StatusTag };
import { hasLetters } from "../language/detect";
import { expandQuery, mentionsIndexedTopic } from "../retrieval/search";
import type { ClinicId, ContactCard, KnowledgeChunk, KnowledgeIndex, ReplyLanguage } from "../types";

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
  /^(?:hi|hey|hello|thanks|thank you|ok|okay|hola|ciao|salut|bonjour|hallo|namaste|salam|gracias|merci|obrigado|danke|xin chao|xin chào|ধন্যবাদ|শুভেচ্ছা|नमस्ते|धन्यवाद|شكرا|شكراً|谢谢|謝謝|감사합니다|grazie)[.!?\s]*$/i;

/** Short line when the visitor asked how to book or call and the reply never gave a route. */
const CONTACT_ROUTE: Record<string, string> = {
  en: "Book or call:",
  bn: "ফোন করুন বা বুক করুন:",
  "bn-Latn": "Phone korun ba book korun:",
  ar: "اتصل أو احجز:",
  hi: "फ़ोन करें या बुक करें:",
  "hi-Latn": "Phone karein ya book karein:",
  zh: "请致电或预约：",
  es: "Llame o reserve:",
  vi: "Gọi hoặc đặt lịch:",
  ne: "फोन गर्नुहोस् वा बुक गर्नुहोस्:",
  ko: "전화하거나 예약하세요:",
  el: "Καλέστε ή κλείστε ραντεβού:",
  it: "Chiami o prenoti:",
  ur: "فون کریں یا بکنگ کریں:",
  fa: "تماس بگیرید یا نوبت بگیرید:",
  he: "התקשרו או קבעו תור:",
  fr: "Appelez ou réservez :",
  de: "Rufen Sie an oder buchen Sie:",
  pt: "Ligue ou reserve:",
};

export type DirectoryLabels = { phone: string; booking: string; email: string; address: string; hours: string; website: string };

const DIRECTORY_LABELS: Record<string, DirectoryLabels> = {
  en: { phone: "Phone:", booking: "Booking:", email: "Email:", address: "Address:", hours: "Hours:", website: "Website:" },
  bn: { phone: "ফোন:", booking: "বুকিং:", email: "ইমেইল:", address: "ঠিকানা:", hours: "সময়:", website: "ওয়েবসাইট:" },
  "bn-Latn": { phone: "Fon:", booking: "Buking:", email: "Imeil:", address: "Thikana:", hours: "Somoy:", website: "Websaite:" },
  ar: { phone: "الهاتف:", booking: "الحجز:", email: "البريد:", address: "العنوان:", hours: "الساعات:", website: "الموقع:" },
  hi: { phone: "फ़ोन:", booking: "बुकिंग:", email: "ईमेल:", address: "पता:", hours: "समय:", website: "वेबसाइट:" },
  "hi-Latn": { phone: "Fon:", booking: "Buking:", email: "Imeil:", address: "Pata:", hours: "Samay:", website: "Websaite:" },
  zh: { phone: "电话：", booking: "预约：", email: "邮箱：", address: "地址：", hours: "时间：", website: "网站：" },
  es: { phone: "Teléfono:", booking: "Reserva:", email: "Correo:", address: "Dirección:", hours: "Horario:", website: "Sitio web:" },
  vi: { phone: "Điện thoại:", booking: "Đặt lịch:", email: "Thư điện tử:", address: "Địa chỉ:", hours: "Giờ mở cửa:", website: "Trang web:" },
  ne: { phone: "फोन:", booking: "बुकिङ:", email: "इमेल:", address: "ठेगाना:", hours: "समय:", website: "वेबसाइट:" },
  ko: { phone: "전화:", booking: "예약:", email: "이메일:", address: "주소:", hours: "시간:", website: "웹사이트:" },
  el: { phone: "Τηλέφωνο:", booking: "Κράτηση:", email: "Ηλ. ταχυδρομείο:", address: "Διεύθυνση:", hours: "Ώρες:", website: "Ιστότοπος:" },
  it: { phone: "Telefono:", booking: "Prenotazione:", email: "Posta elettronica:", address: "Indirizzo:", hours: "Orari:", website: "Sito web:" },
  ur: { phone: "فون:", booking: "بکنگ:", email: "ای میل:", address: "پتہ:", hours: "اوقات:", website: "ویب سائٹ:" },
  fa: { phone: "تلفن:", booking: "نوبت:", email: "ایمیل:", address: "آدرس:", hours: "ساعات:", website: "وب‌سایت:" },
  he: { phone: "טלפון:", booking: "קביעת תור:", email: "אימייל:", address: "כתובת:", hours: "שעות:", website: "אתר:" },
  fr: { phone: "Téléphone :", booking: "Réservation :", email: "Courriel :", address: "Adresse :", hours: "Horaires :", website: "Site :" },
  de: { phone: "Telefon:", booking: "Buchung:", email: "E-Mail:", address: "Adresse:", hours: "Zeiten:", website: "Webseite:" },
  pt: { phone: "Telefone:", booking: "Reserva:", email: "E-mail:", address: "Endereço:", hours: "Horário:", website: "Site:" },
  ja: { phone: "電話:", booking: "予約:", email: "メール:", address: "住所:", hours: "時間:", website: "ウェブサイト:" },
  id: { phone: "Telepon:", booking: "Pemesanan:", email: "Surel:", address: "Alamat:", hours: "Jam:", website: "Situs:" },
  ms: { phone: "Telefon:", booking: "Tempahan:", email: "E-mel:", address: "Alamat:", hours: "Waktu:", website: "Laman:" },
  pa: { phone: "ਫ਼ੋਨ:", booking: "ਬੁਕਿੰਗ:", email: "ਈਮੇਲ:", address: "ਪਤਾ:", hours: "ਸਮਾਂ:", website: "ਵੈੱਬਸਾਈਟ:" },
  ta: { phone: "தொலைபேசி:", booking: "முன்பதிவு:", email: "மின்னஞ்சல்:", address: "முகவரி:", hours: "நேரம்:", website: "இணையதளம்:" },
  te: { phone: "ఫోన్:", booking: "బుకింగ్:", email: "ఇమెయిల్:", address: "చిరునామా:", hours: "సమయం:", website: "వెబ్‌సైట్:" },
  ru: { phone: "Телефон:", booking: "Запись:", email: "Почта:", address: "Адрес:", hours: "Часы:", website: "Сайт:" },
  th: { phone: "โทรศัพท์:", booking: "จอง:", email: "อีเมล:", address: "ที่อยู่:", hours: "เวลา:", website: "เว็บไซต์:" },
};

export function directoryLabels(code: string): DirectoryLabels {
  return DIRECTORY_LABELS[code] ?? DIRECTORY_LABELS.en;
}

export function contactLabels(code: string): { phone: string; booking: string } {
  const labels = directoryLabels(code);
  return { phone: labels.phone, booking: labels.booking };
}

function clinicContactLine(code: string, card: { name: string; phone: string; bookingUrl: string }): string {
  const labels = contactLabels(code);
  return `${card.name} — ${labels.phone} ${card.phone} — ${labels.booking} ${card.bookingUrl}`;
}

/** Short replies that mean "the site does not say", even when the model skips [[NO_ANSWER]]. */
const NO_INFO = [
  "তথ্য নেই",
  "কোনো তথ্য নেই",
  "জানি না",
  "উত্তর নেই",
  "لا توجد معلومات",
  "لا توجد إجابة",
  "لا أعرف",
  "ليس لدي معلومات",
  "जानकारी नहीं",
  "पता नहीं",
  "नहीं पता",
  "मुझे नहीं पता",
  "معلوم نہیں",
  "مجھے نہیں پتا",
  "اطلاعاتی ندارم",
  "نمی‌دانم",
  "اطلاعاتی در دسترس نیست",
  "پاسخی نیست",
  "没有相关信息",
  "没有这个信息",
  "不知道",
  "no tengo información",
  "no hay información",
  "no lo sé",
  "je ne sais pas",
  "aucune information",
  "pas cette information",
  "i don't know",
  "i do not know",
  "don't have that information",
  "no information",
  "not listed on the website",
  "não sei",
  "não tenho essa informação",
  "non so",
  "non ho questa informazione",
  "keine information",
  "ich weiß es nicht",
  "không có thông tin",
  "tôi không biết",
  "정보가 없습니다",
  "모르겠습니다",
  "δεν γνωρίζω",
  "bilmiyorum",
  "bilgi yok",
  "не знаю",
  "нет информации",
  "わかりません",
  "情報がありません",
  "tidak ada informasi",
  "saya tidak tahu",
  "tiada maklumat",
  "tidak tahu",
  "walang impormasyon",
  "hindi ko alam",
  "উল্লেখ নেই",
  "উল্লেখ করা নেই",
  "উল্লেখ করা হয়নি",
  "পাওয়া যায়নি",
  "পাওয়া যায়নি",
  "খুঁজে পাওয়া যায়নি",
  "জানা নেই",
  "ullekho nei",
  "pawa jayni",
  "jana nei",
  "उल्लेख नहीं",
  "उल्लेख नही",
  "जानकारी उपलब्ध नहीं",
  "ज़िक्र नहीं",
  "ullekh nahi",
  "jankari nahi",
  "لم يُذكر",
  "لم يذكر",
  "غير مذكور",
  "غير مذكورة",
  "لا يُذكر",
  "没有提到",
  "未提及",
  "没有提及",
  "沒有提到",
  "未找到",
  "无法确认",
  "不能确认",
  "不清楚",
  "无法回答",
  "不能回答",
  "not mentioned",
  "no mention",
  "isn't mentioned",
  "is not mentioned",
  "not on the website",
  "couldn't find",
  "could not find",
  "no se menciona",
  "no está mencionado",
  "no figura",
  "không được đề cập",
  "không thấy đề cập",
  "उल्लेख छैन",
  "जानकारी छैन",
  "언급되어 있지",
  "언급이 없",
  "δεν αναφέρεται",
  "non è menzionat",
  "non risulta",
  "ذکر نہیں",
  "معلومات نہیں",
  "ذکر نشده",
  "اشاره نشده",
  "לא מוזכר",
  "אין אזכור",
  "לא מצוין",
  "pas mentionné",
  "n'est pas mentionné",
  "ne figure pas",
  "nicht erwähnt",
  "nicht aufgeführt",
  "não é mencionad",
  "não consta",
  "tidak disebutkan",
  "tidak tercantum",
  "tidak dinyatakan",
  "tidak disebut",
  "記載されていません",
  "言及されていません",
  "載っていません",
  "не упоминается",
  "не указано",
  "ਜ਼ਿਕਰ ਨਹੀਂ",
  "ਜਾਣਕਾਰੀ ਨਹੀਂ",
  "குறிப்பிடப்படவில்லை",
  "தகவல் இல்லை",
  "ప్రస్తావన లేదు",
  "సమాచారం లేదు",
  "ไม่ได้ระบุ",
  "ไม่มีข้อมูล",
];

const TOPIC_STOP = new Set(["that", "this", "with", "from", "your", "have", "what", "when", "where", "does", "about", "please", "much", "they", "them", "then", "than", "into", "over", "also", "just", "like", "want", "need", "tell", "know", "there", "which", "would", "could", "should"]);

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
  const lines = orderedClinics(focus).map((id) => clinicContactLine(language.code, index.contacts[id]));
  return [lead, ...lines].filter(Boolean).join("\n");
}

/** Neutral contact lines. Not the “website has no answer” wording. The asked clinic is first. */
export function contactRouteFooter(index: KnowledgeIndex, language: ReplyLanguage, focus: ClinicFocus): string {
  const lead = CONTACT_ROUTE[language.code] ?? "Book or call:";
  const lines = orderedClinics(focus).map((id) => clinicContactLine(language.code, index.contacts[id]));
  return [lead, ...lines].join("\n");
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
  /** Finished reply, used to catch a no-information phrase that skipped the sentinel. */
  replyText?: string;
  /** False when the question shares no clinic or service terms with the top chunks. */
  sharesTopic?: boolean;
  /** When set, a reply that already names this clinic's phone, address or booking link is an answer. */
  index?: KnowledgeIndex;
  focus?: ClinicFocus;
  /** Text of the top retrieved pages, used to see whether a short reply states a fact from them. */
  facts?: string;
  /** Opening status tag. Null or omitted means it was missing, so the heuristics below apply. */
  statusTag?: StatusTag | null;
};

export type FooterKind = "none" | "no-answer" | "route";

function flatReply(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  return flatReply(text).split(/\s+/).filter(Boolean).length;
}

/** Latin phrases that are stored as a stem so "menzionato" still matches. */
function allowsLetterContinuation(phrase: string): boolean {
  return /(?:menzionat|mencionad)$/i.test(phrase);
}

function phraseHits(text: string, phrase: string): boolean {
  const needle = phrase.toLowerCase();
  if (!/[a-z]/i.test(needle)) return text.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const continuation = allowsLetterContinuation(needle) ? "" : "(?![\\p{L}])";
  return new RegExp(`(?:^|[^\\p{L}])${escaped}${continuation}`, "iu").test(text);
}

function matchedNoInfoPhrase(text: string): string | undefined {
  const flat = flatReply(text);
  if (!flat) return undefined;
  const lower = flat.toLowerCase();
  return NO_INFO.find((phrase) => phraseHits(lower, phrase));
}

/** A short reply that says the information is missing, in the languages the widget answers. */
export function replySignalsNoInformation(text: string): boolean {
  const flat = flatReply(text);
  const hit = matchedNoInfoPhrase(flat);
  if (!hit) return false;
  return wordCount(flat) <= 28 || hit.length >= flat.length * 0.35;
}

/** The reply itself says the site does not have the fact, even if the model opened with [[A]]. */
function replyClearlyHasNoInfo(text: string): boolean {
  if (replySignalsNoInformation(text)) return true;
  return Boolean(matchedNoInfoPhrase(text)) && wordCount(text) <= 48;
}

const CONTACT_QUESTION =
  /phone|e-?mail|\bnumber\b|\bcall\b|address|booking|\bbook\b|appointment|\bcontact\b|zavy|ফোন|নম্বর|বুকিং|ঠিকানা|फ़ोन|फोन|नंबर|पता|बुकिंग|هاتف|رقم|حجز|عنوان|电话|預約|预约|地址|전화|예약|주소|điện thoại|đặt lịch|địa chỉ|τηλέφων|ραντεβού|διεύθυνσ|telefono|prenot|indirizzo|teléfono|reserv|dirección|فون|نمبر|بکنگ|پتہ|تلفن|آدرس|نوبت|טלפון|כתובת|לקבוע|téléphon|rendez-vous|adresse|anrufen|buchen|telefone|endereço/i;

function questionAsksForContact(question: string): boolean {
  return CONTACT_QUESTION.test(question);
}

function replyLooksLikeContact(reply: string): boolean {
  if (/zavy\s*360\s*\.?\s*com|zavy360\.com|bookings\.zavy/i.test(reply)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(reply)) return true;
  const runs = reply.match(/\d[\d\s().+\-]{6,}\d/g) ?? [];
  return runs.some((run) => digits(run).length >= 8);
}

function letterCount(text: string): number {
  return text.match(/\p{L}/gu)?.length ?? 0;
}

function mostlyLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
  return latin / letters.length >= 0.6;
}

function sharesFactToken(reply: string, facts: string): boolean {
  const factTokens = new Set(
    (facts.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((token) => !TOPIC_STOP.has(token)),
  );
  const replyTokens = reply.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  if (replyTokens.some((token) => factTokens.has(token))) return true;
  const replyDigits = digits(reply);
  const factDigits = facts.match(/\d{3,}/g) ?? [];
  return factDigits.some((value) => value.length >= 3 && replyDigits.includes(value));
}

/** A reply that states something from the pages, a clock time, or a real sentence in another script. */
function looksLikeConcreteAnswer(reply: string, facts?: string): boolean {
  if (/\d{1,2}[:.]\d{2}/.test(reply) || /[$€£]\s?\d/.test(reply)) return true;
  if (facts?.trim() && sharesFactToken(reply, facts)) return true;
  if (!mostlyLatin(reply) && letterCount(reply) >= 12 && !matchedNoInfoPhrase(reply)) return true;
  return false;
}

const ADDRESS_GENERIC = new Set([
  "street",
  "suite",
  "drive",
  "highway",
  "road",
  "avenue",
  "place",
  "court",
  "lane",
  "nsw",
  "australia",
  "unit",
  "level",
  "floor",
  "shop",
]);

function relevantClinics(focus: ClinicFocus): ClinicId[] {
  if (focus.kind === "one") return [focus.clinic];
  if (focus.kind === "many") return focus.clinics;
  return CLINIC_ORDER;
}

function distinctiveAddressTokens(address: string): string[] {
  const tokens = address.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return tokens.filter((token) => !ADDRESS_GENERIC.has(token) && !/^\d+$/.test(token));
}

function coversClinicContact(reply: string, card: ContactCard): boolean {
  const flat = digits(reply);
  const phones = [card.phone, ...card.otherPhones];
  if (phones.some((phone) => {
    const value = digits(phone);
    const tail = value.slice(-8);
    return tail.length >= 8 && flat.includes(tail);
  })) {
    return true;
  }
  const lower = reply.toLowerCase();
  const booking = card.bookingUrl.toLowerCase();
  if (booking && lower.includes(booking)) return true;
  const uuid = booking.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (uuid && lower.includes(uuid[0])) return true;
  const hits = new Set(distinctiveAddressTokens(card.address).filter((token) => lower.includes(token)));
  return hits.size >= 2;
}

/**
 * True when the reply already gives the relevant clinic's phone, street address or booking link.
 * A single clinic is enough. The all-clinic contact block is a different check.
 */
/** A booking URL or phone with no clinic name is not a usable booking line. */
export function nameClinicInReply(text: string, index: KnowledgeIndex): string {
  let out = text;
  for (const id of CLINIC_ORDER) {
    const card = index.contacts[id];
    if (!card || out.includes(card.name)) continue;
    const phone = digits(card.phone);
    const hasPhone = phone.length >= 8 && digits(out).includes(phone.slice(-8));
    const uuid = card.bookingUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? "";
    const hasUrl = Boolean(card.bookingUrl) && (out.includes(card.bookingUrl) || (uuid.length > 0 && out.includes(uuid)));
    if (!hasPhone && !hasUrl) continue;
    if (card.bookingUrl && out.includes(card.bookingUrl)) {
      out = out.replace(card.bookingUrl, `${card.name}: ${card.bookingUrl}`);
    } else if (uuid && out.includes(uuid)) {
      out = out.replace(new RegExp(`https?:\\/\\/\\S*${uuid}\\S*`), (url) => `${card.name}: ${url}`);
      if (!out.includes(card.name)) out = out.replace(uuid, `${card.name}: ${uuid}`);
    } else out = `${card.name}. ${out}`;
  }
  return out;
}

export function replyCoversRelevantContact(reply: string, index: KnowledgeIndex, focus: ClinicFocus): boolean {
  return relevantClinics(focus).some((id) => coversClinicContact(reply, index.contacts[id]));
}

/**
 * Remembered clinic plus the last few user turns.
 * A follow-up that only says "their phone number" still shares the clinic named earlier.
 */
export function topicShareText(turns: string[], focus: ClinicFocus): string {
  const recent = turns.map((turn) => turn.trim()).filter(Boolean).slice(-4);
  const remembered = focus.kind === "one" ? focus.clinic : focus.kind === "many" ? focus.clinics.join(" ") : "";
  return [remembered, ...recent].filter(Boolean).join("\n");
}

/**
 * True when the text names a clinic that appears in the top chunks, a known service
 * whose English terms appear there, or a content word that appears there.
 * Pass topicShareText, not only the latest message.
 */
export function sharesClinicOrService(question: string, chunks: Pick<KnowledgeChunk, "clinic" | "title" | "heading" | "text">[]): boolean {
  if (!chunks.length) return false;
  const top = chunks.slice(0, 4);
  if (mentionedClinics(question).some((id) => top.some((chunk) => chunk.clinic === id))) return true;
  const blob = top.map((chunk) => `${chunk.title} ${chunk.heading} ${chunk.text}`).join("\n").toLowerCase();
  if (mentionsIndexedTopic(question).some((term) => blob.includes(term.toLowerCase()))) return true;
  const words = question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return words.some((word) => !TOPIC_STOP.has(word) && blob.includes(word));
}

/**
 * No-answer footer for a real miss. Neutral “Book or call” only when the visitor
 * asked for a contact route and the reply never gave one. A grounded answer that
 * does not repeat a phone stays as written.
 */
function replyHasRoute(reply: string, input: FooterDecision): boolean {
  if (!reply) return false;
  const focus = input.focus ?? { kind: "any" as const };
  if (input.index && replyCoversRelevantContact(reply, input.index, focus)) return true;
  if (replyLooksLikeContact(reply)) return true;
  if (!input.index) return false;
  const namesClinic = Object.values(input.index.contacts).some((card) => reply.includes(card.name));
  return namesClinic && /reserv|book|llam|phone|tel[eé]fono|cita|বুক|ফোন|预约|예약/i.test(reply);
}

export function chooseContactFooter(input: FooterDecision): FooterKind {
  const question = input.question.trim();
  const reply = input.replyText?.trim() ?? "";
  if (!question && !input.modelSaidNoAnswer && !reply && !input.statusTag) return "none";
  if (question && !hasLetters(question)) return "no-answer";
  if (input.statusTag === "N") return replyHasRoute(reply, input) ? "none" : "no-answer";
  if (input.statusTag === "A") {
    if (replyHasRoute(reply, input)) return "none";
    // "no mencionar" / "puedes reservar" are not "the site does not say" once a phone or booking link is in the answer.
    if (reply && replyLooksLikeContact(reply)) return "none";
    if (reply && replyClearlyHasNoInfo(reply)) return "no-answer";
    if (questionAsksForContact(question)) return "route";
    return "none";
  }
  if (input.statusTag === "G") {
    if (replyHasRoute(reply, input)) return "none";
    if (questionAsksForContact(question)) return "route";
    return "none";
  }
  if (input.modelSaidNoAnswer) return "no-answer";
  if (GREETING.test(question)) return "none";
  if (reply && replySignalsNoInformation(reply)) return "no-answer";

  if (replyHasRoute(reply, input)) return "none";

  if (reply && matchedNoInfoPhrase(reply) && wordCount(reply) <= 48) return "no-answer";

  const top = input.topScore ?? (input.sourceCount > 0 ? 1 : 0);
  const low = !retrievalHasAnswer(input.sourceCount, top);
  if (!reply) return low ? "no-answer" : "none";

  const concrete = looksLikeConcreteAnswer(reply, input.facts);
  const short = wordCount(reply) <= 14 || letterCount(reply) <= 12;
  // Low score, or a short reply that repeats nothing from the pages. A sentence in
  // another script is left alone unless it uses a no-information phrase, because
  // the English pages do not overlap that reply.
  if ((low || short) && !concrete) return "no-answer";
  if (questionAsksForContact(question)) return "route";
  return "none";
}

export function shouldAppendContactFooter(input: FooterDecision): boolean {
  return chooseContactFooter(input) !== "none";
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
 * the reply is a real miss. A reply that already lists the relevant clinic phone,
 * address or booking link is left unchanged.
 */
export function attachContactFooter<T extends FooterChunk>(
  stream: ReadableStream<T>,
  input: {
    footer: string;
    sourcesFound: boolean;
    sourceCount?: number;
    topScore?: number;
    question: string;
    covered: (text: string) => boolean;
    sharesTopic?: boolean;
    index?: KnowledgeIndex;
    focus?: ClinicFocus;
    facts?: string;
    /** Neutral “Book or call” block. Used only when the visitor asked for a contact route. */
    routeFooter?: string;
    /** Filled when the leading status tag is parsed. Read when the reply finishes. */
    replyStatus?: { tag: StatusTag | null };
  },
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
    const kind = chooseContactFooter({
      question: input.question,
      sourceCount: input.sourceCount ?? (input.sourcesFound ? 1 : 0),
      topScore: input.topScore ?? (input.sourcesFound ? 1 : 0),
      modelSaidNoAnswer: sawSentinel,
      replyText: shown,
      sharesTopic: input.sharesTopic,
      index: input.index,
      focus: input.focus,
      facts: input.facts,
      statusTag: input.replyStatus ? input.replyStatus.tag : undefined,
    });
    const block = kind === "no-answer" ? input.footer : kind === "route" ? input.routeFooter ?? "" : "";
    const lead = block.split("\n")[0]?.trim() ?? "";
    const alreadyRouted =
      kind === "route" &&
      replyHasRoute(shown, {
        question: input.question,
        sourceCount: input.sourceCount ?? (input.sourcesFound ? 1 : 0),
        index: input.index,
        focus: input.focus,
      });
    if (!block || input.covered(shown) || alreadyRouted || (lead.length >= 12 && shown.includes(lead))) return;
    const id = textId ?? "contact-footer";
    const delta = `${shown.trim() ? "\n\n" : ""}${block}`;
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
          if (drained.visible) {
            const prior = shown;
            const named = input.index ? nameClinicInReply(prior + drained.visible, input.index) : prior + drained.visible;
            const delta = named.startsWith(prior) ? named.slice(prior.length) : drained.visible;
            shown = named.startsWith(prior) ? named : prior + drained.visible;
            controller.enqueue({ ...chunk, delta });
          }
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
