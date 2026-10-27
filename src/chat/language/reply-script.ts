import { languageOption } from "./catalog";

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/** Checks the writing system of a reply, not a perfect language-ID of the model output. */
export function replyMatchesLanguage(reply: string, code: string): boolean {
  const option = languageOption(code);
  if (!option) return false;
  const arabic = count(reply, /[\u0600-\u06FF]/g);
  const hebrew = count(reply, /[\u0590-\u05FF]/g);
  const bengali = count(reply, /[\u0980-\u09FF]/g);
  const devanagari = count(reply, /[\u0900-\u097F]/g);
  const han = count(reply, /[\u4E00-\u9FFF]/g);
  const hangul = count(reply, /[\uAC00-\uD7AF]/g);
  const greek = count(reply, /[\u0370-\u03FF]/g);
  const latin = count(reply, /[A-Za-z\u00C0-\u024F]/g);

  if (code === "ar" || code === "ur" || code === "fa") return arabic >= 12;
  if (code === "he") return hebrew >= 8;
  if (code === "bn") return bengali >= 8;
  if (code === "hi" || code === "ne") return devanagari >= 8;
  if (code === "zh") return han >= 8;
  if (code === "ko") return hangul >= 8;
  if (code === "el") return greek >= 8;
  if (code === "bn-Latn") return latin >= 20 && bengali < 4;
  if (code === "hi-Latn") return latin >= 20 && devanagari < 4;
  if (code === "vi") return latin >= 20 && /[ăâêôơưđáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(reply);
  return latin >= 20 && arabic < 4 && han < 4 && hangul < 4 && greek < 4 && bengali < 4 && devanagari < 4 && hebrew < 4;
}

const NATIVE_REPLY: Record<string, RegExp> = {
  bn: /[\u0980-\u09FF]/g,
  hi: /[\u0900-\u097F]/g,
  ne: /[\u0900-\u097F]/g,
  ar: /[\u0600-\u06FF]/g,
  ur: /[\u0600-\u06FF]/g,
  fa: /[\u0600-\u06FF]/g,
  he: /[\u0590-\u05FF]/g,
  zh: /[\u4E00-\u9FFF]/g,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/g,
  ko: /[\uAC00-\uD7AF]/g,
  el: /[\u0370-\u03FF]/g,
  ru: /[\u0400-\u04FF]/g,
  th: /[\u0E00-\u0E7F]/g,
  pa: /[\u0A00-\u0A7F]/g,
  ta: /[\u0B80-\u0BFF]/g,
  te: /[\u0C00-\u0C7F]/g,
};

/**
 * Clinic, brand, street and suburb names may stay in Latin. Generic service
 * words may not. URLs and email addresses are not service words either.
 */
const PROPER_LATIN =
  /\b(?:illawarra dentists|dapto dentists|shellharbour dentists|woonona dentists|barrack heights|shell cove|oak flats|albion park|lake heights|fairy meadow|mount pleasant|baan baan|captain cook|princes highway|zavy ?360|invisalign|shellharbour|shell harbor|woonona|illawarra|dapto|warilla|kiama|windang|blackbutt|tullimbar|warrawong|calderwood|bulli|thirroul|corrimal|balgownie|helensburgh|fernhill|nsw|suite|street|drive|highway)\b/gi;

const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;

/** Above this share of non-name Latin letters, the reply is in the wrong script. */
export const LATIN_SCRIPT_LIMIT = 0.35;

function countPattern(text: string, re: RegExp): number {
  return text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))?.length ?? 0;
}

function countableReply(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, " ")
    .replace(new RegExp(PROPER_LATIN.source, PROPER_LATIN.flags), " ");
}

/**
 * The finished text is in the wrong script for a native-script reply.
 * Proper nouns are ignored. A minor mix under 35% Latin letters is allowed.
 */
export function replyScriptConflicts(text: string, code: string): boolean {
  const nativeRe = NATIVE_REPLY[code];
  if (!nativeRe) return false;
  const body = countableReply(text);
  const latin = countPattern(body, LATIN_LETTER);
  const native = countPattern(body, nativeRe);
  const total = latin + native;
  if (total < 16) return false;
  return latin / total > LATIN_SCRIPT_LIMIT;
}

/**
 * A native-script reply is judged when it is finished, so a Bengali opening
 * is not released before later English service words can be measured.
 * Other languages can be shown as they arrive.
 */
export function replyScriptGate(text: string, code: string, final: boolean): "release" | "wait" | "conflict" {
  if (!NATIVE_REPLY[code]) return "release";
  if (!final) return "wait";
  return replyScriptConflicts(text, code) ? "conflict" : "release";
}
