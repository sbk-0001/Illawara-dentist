import { LANGUAGE_OPTIONS, languageOption, replyFromOption } from "./catalog";
import type { ReplyLanguage } from "../types";

export type Detection = ReplyLanguage & { confidence: "high" | "low" };

const SCRIPT_TESTS: { script: string; code: string; re: RegExp }[] = [
  { script: "Hebrew", code: "he", re: /[\u0590-\u05FF]/g },
  { script: "Arabic", code: "ar", re: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g },
  { script: "Bengali", code: "bn", re: /[\u0980-\u09FF]/g },
  { script: "Gurmukhi", code: "pa", re: /[\u0A00-\u0A7F]/g },
  { script: "Gujarati", code: "gu", re: /[\u0A80-\u0AFF]/g },
  { script: "Devanagari", code: "hi", re: /[\u0900-\u097F]/g },
  { script: "Tamil", code: "ta", re: /[\u0B80-\u0BFF]/g },
  { script: "Telugu", code: "te", re: /[\u0C00-\u0C7F]/g },
  { script: "Kannada", code: "kn", re: /[\u0C80-\u0CFF]/g },
  { script: "Malayalam", code: "ml", re: /[\u0D00-\u0D7F]/g },
  { script: "Thai", code: "th", re: /[\u0E00-\u0E7F]/g },
  { script: "Hangul", code: "ko", re: /[\uAC00-\uD7AF]/g },
  { script: "Kana", code: "ja", re: /[\u3040-\u30FF]/g },
  { script: "Han", code: "zh", re: /[\u4E00-\u9FFF]/g },
  { script: "Greek", code: "el", re: /[\u0370-\u03FF\u1F00-\u1FFF]/g },
  { script: "Cyrillic", code: "ru", re: /[\u0400-\u04FF]/g },
  { script: "Latin", code: "en", re: /[A-Za-z\u00C0-\u024F]/g },
];

const BANGLISH_STRONG = ["kemon", "acho", "achen", "kothay", "kothai", "kotha", "kivabe", "nombor", "bolben", "tumi", "apni", "apnar", "bhalo", "hocche", "daktar", "dakter", "byatha", "bytha", "ekhon", "korbo", "koto", "shonibar", "thaken", "pabo", "daat", "dant", "kobe", "amar", "valo"];
const BANGLISH_WEAK = ["chai", "chan", "ashen", "asbo", "ajke", "kalke", "taka", "khula", "khola", "hobe", "keno", "kene", "ki", "er", "ar", "ache", "din"];
const HINGLISH_STRONG = ["kya", "kaise", "mujhe", "chahiye", "kitna", "kitne", "kitni", "aapka", "kahan", "nahi", "nahin", "daant", "dard", "baje", "khulti", "khulta", "shaniwar", "samay"];
const HINGLISH_WEAK = ["hai", "hain", "kal", "aaj", "mera", "meri", "aap", "karo", "karna", "wala", "wali", "baat"];
const ENGLISH = ["what", "when", "where", "hours", "hour", "saturday", "sunday", "monday", "friday", "appointment", "clinic", "fee", "fees", "much", "open", "opening", "pain", "tooth", "broken", "emergency", "payment", "health", "fund", "please", "your", "the", "are", "how", "cost", "price", "book", "booking", "address", "parking", "dentist", "which", "does", "do", "can", "need", "have", "who", "won"];
const SPANISH = ["horario", "sabado", "sábado", "clinica", "clínica", "cita", "duele", "diente", "cuanto", "cuánto", "cuesta", "donde", "dónde", "precio", "abierto", "cual", "cuál", "ustedes", "hola", "revision", "revisión", "limpieza", "noche", "perros", "quien", "quién", "gano", "ganó", "copa", "mundo", "roto"];
const ITALIAN = ["orari", "orario", "sabato", "clinica", "appuntamento", "dente", "dolore", "quanto", "dove", "aperto", "quali", "sono", "gli", "della", "del", "costa", "chi", "vinto", "coppa", "mondo", "rotto", "notte", "cani", "tenete", "durante"];
const FRENCH = ["horaires", "samedi", "clinique", "rendez", "dent", "douleur", "combien", "ouvert", "vous", "est"];
const GERMAN = ["öffnungszeiten", "zahnarzt", "samstag", "termin", "zahn", "schmerzen", "wie", "nicht", "ich", "uhr", "geöffnet"];
const PORTUGUESE = ["horário", "horario", "sábado", "sabado", "clínica", "clinica", "consulta", "dente", "quanto", "onde", "aberto", "vocês", "voces"];
const VIETNAMESE = ["phong", "phòng", "kham", "khám", "gio", "giờ", "thu", "thứ", "bay", "bảy", "mo", "mở", "cua", "cửa", "bao", "nhieu", "nhiêu", "dau", "đau", "rang", "răng", "khong", "không", "luc", "lúc", "may", "mấy"];

const ARABIC_WORDS = ["ما", "هي", "ساعات", "العمل", "عيادة", "السبت", "ألم", "سن", "رسوم", "موعد", "كم"];
const URDU_WORDS = ["کیا", "ہے", "ہیں", "کلینک", "بجے", "کھلتا", "ہفتہ", "درد", "دانت", "کتنے", "میں"];
const PERSIAN_WORDS = ["ساعت", "کاری", "چیست", "کلینیک", "شنبه", "دندان", "سلام", "لطفا", "در", "روز"];
const URDU_LETTERS = /[ٹڈڑںےھۃۂ]/g;
const PERSIAN_LETTERS = /[پچژگ]/g;

const HINDI_WORDS = ["है", "हैं", "क्या", "कितने", "कितना", "खुलता", "शनिवार", "मुझे", "नहीं", "आप"];
const NEPALI_WORDS = ["हुन्छ", "छैन", "तपाईं", "कति", "खुल्छ", "शनिबार", "के", "हो", "बजे"];

const GREETINGS = new Set(["hi", "hey", "hello", "ok", "okay", "thanks", "thankyou", "yo"]);

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function tokensOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
}

function scoreWords(tokens: string[], words: string[], weight = 1): number {
  const wanted = new Set(words);
  let score = 0;
  const seen = new Map<string, number>();
  for (const token of tokens) {
    if (!wanted.has(token)) continue;
    const used = seen.get(token) ?? 0;
    if (used >= 2) continue;
    seen.set(token, used + 1);
    score += weight;
  }
  return score;
}

function englishReply(fallback: boolean, confidence: "high" | "low"): Detection {
  const option = languageOption("en")!;
  return { ...replyFromOption(option, fallback ? "fallback" : "detected", fallback), confidence };
}

function fromCode(code: string, confidence: "high" | "low"): Detection {
  const known = languageOption(code);
  if (known) return { ...replyFromOption(known, "detected", false), confidence };
  const extra = LANGUAGE_OPTIONS.find((option) => option.code === code);
  if (extra) return { ...replyFromOption(extra, "detected", false), confidence };
  return {
    code,
    label: code,
    script: "Latin",
    dir: "ltr",
    fallback: false,
    source: "detected",
    confidence,
  };
}

function arabicFamily(text: string, tokens: string[]): Detection {
  const urduLetters = countMatches(text, URDU_LETTERS);
  const persianLetters = countMatches(text, PERSIAN_LETTERS);
  const urdu = scoreWords(tokens, URDU_WORDS, 2) + urduLetters * 2;
  const persian = scoreWords(tokens, PERSIAN_WORDS, 2) + persianLetters * 2;
  const arabic = scoreWords(tokens, ARABIC_WORDS, 1);
  if (persian >= 2 && persian > urdu && persian >= arabic) return fromCode("fa", "high");
  if (urdu >= 2 && urdu > persian) return fromCode("ur", "high");
  return fromCode("ar", "high");
}

function devanagariFamily(tokens: string[]): Detection {
  const nepali = scoreWords(tokens, NEPALI_WORDS, 2);
  const hindi = scoreWords(tokens, HINDI_WORDS, 2);
  if (nepali >= 2 && nepali > hindi) return fromCode("ne", "high");
  return fromCode("hi", "high");
}

function latinFamily(text: string, tokens: string[]): Detection {
  const joined = tokens.join(" ");
  if (tokens.length === 1 && GREETINGS.has(tokens[0] || "")) return englishReply(false, "high");
  let banglish = scoreWords(tokens, BANGLISH_STRONG, 2) + scoreWords(tokens, BANGLISH_WEAK, 1);
  if (tokens.length <= 18 && /\bki\s*\?\s*$/i.test(text.trim())) banglish += 4;
  const hinglish = scoreWords(tokens, HINGLISH_STRONG, 2) + scoreWords(tokens, HINGLISH_WEAK, 1);
  const english = scoreWords(tokens, ENGLISH, 1);
  const spanish = scoreWords(tokens, SPANISH, 2);
  const italian = scoreWords(tokens, ITALIAN, 2);
  const french = scoreWords(tokens, FRENCH, 2);
  const german = scoreWords(tokens, GERMAN, 2);
  const portuguese = scoreWords(tokens, PORTUGUESE, 2);
  const vietnameseDiacritics = /[ăơưđắằẳẵặấầẩẫậếềểễệốồổỗộớờởỡợứừửữựạẹịọụỵảẽỉỏủỷỹ]/i.test(text) ? 3 : 0;
  const vietnamese = scoreWords(tokens, VIETNAMESE, 2) + vietnameseDiacritics;

  const ranked: { code: string; score: number }[] = [
    { code: "bn-Latn", score: banglish },
    { code: "hi-Latn", score: hinglish },
    { code: "en", score: english },
    { code: "es", score: spanish },
    { code: "it", score: italian },
    { code: "fr", score: french },
    { code: "de", score: german },
    { code: "pt", score: portuguese },
    { code: "vi", score: vietnamese },
  ].sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 2) {
    const letters = text.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
    if (letters.length >= 8) return englishReply(true, "low");
    if (english >= 1) return englishReply(false, "low");
    return englishReply(true, "low");
  }
  if (best.code === "en") return englishReply(false, best.score >= 2 ? "high" : "low");
  if (best.code === "bn-Latn" && banglish >= english && banglish >= hinglish) return fromCode("bn-Latn", "high");
  if (best.code === "hi-Latn" && hinglish >= english && hinglish > banglish) return fromCode("hi-Latn", "high");
  if (best.score >= 2 && (!second || best.score >= second.score)) {
    if ((best.code === "bn-Latn" || best.code === "hi-Latn") && english > best.score) return englishReply(false, "high");
    return fromCode(best.code, "high");
  }
  void joined;
  return englishReply(true, "low");
}

export function detectLanguage(text: string): Detection {
  const input = text.trim();
  if (!input) return englishReply(true, "low");

  const counts = SCRIPT_TESTS.map((item) => ({
    ...item,
    count: countMatches(input, item.re),
  })).sort((a, b) => b.count - a.count);
  const latin = counts.find((item) => item.script === "Latin")?.count ?? 0;
  const tokens = tokensOf(input);

  if (counts.every((item) => item.count === 0)) return englishReply(true, "low");

  const nonLatin = counts.find((item) => item.script !== "Latin" && item.count > 0);
  const dominant = Boolean(
    nonLatin && ((nonLatin.count >= 4 && nonLatin.count >= latin) || nonLatin.count >= 8),
  );
  if (!dominant || !nonLatin) return latinFamily(input, tokens);

  if (nonLatin.script === "Arabic") return arabicFamily(input, tokens);
  if (nonLatin.script === "Devanagari") return devanagariFamily(tokens);
  if (nonLatin.script === "Kana") return fromCode("ja", "high");
  if (nonLatin.script === "Han") {
    const kana = counts.find((item) => item.script === "Kana")?.count ?? 0;
    return fromCode(kana > 0 ? "ja" : "zh", "high");
  }
  return fromCode(nonLatin.code, "high");
}

export function resolveReplyLanguage(text: string, picker: string | null | undefined): Detection {
  const selected = (picker || "auto").trim();
  if (selected && selected !== "auto") {
    const option = languageOption(selected);
    if (option) return { ...replyFromOption(option, "picker", false), confidence: "high" };
  }
  return detectLanguage(text);
}

export function isRtlLanguage(code: string): boolean {
  return languageOption(code)?.dir === "rtl";
}
