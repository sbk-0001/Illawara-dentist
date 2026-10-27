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

/**
 * English words a native-script reply may keep. Hindi and the other Indic
 * replies use these as loanwords; they are not a wrong-script answer.
 */
const LOAN_LATIN =
  /\b(?:dental|dentist|dentists|implant|implants|appointment|appointments|emergency|emergencies|invisalign|check-?ups?|urgent|whitening|crown|crowns|filling|fillings|veneer|veneers|denture|dentures|braces|aligner|aligners|orthodontic|orthodontics|sedation|extraction|extractions|wisdom|cleaning|cleanings|canal|toothache|cosmetic)\b/gi;

/**
 * Regenerate only when the target script is a clear minority of the counted
 * letters. A Hindi reply that is mostly Devanagari, plus clinic names and
 * loanwords, is left as written.
 */
export const NATIVE_SCRIPT_FLOOR = 0.4;

/** @deprecated Use NATIVE_SCRIPT_FLOOR. Kept so older callers still import. */
export const LATIN_SCRIPT_LIMIT = 1 - NATIVE_SCRIPT_FLOOR;

/** Release a native-script reply once this many counted letters, or the first sentence, are in. */
export const SCRIPT_SAMPLE_LETTERS = 40;

function countPattern(text: string, re: RegExp): number {
  return text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))?.length ?? 0;
}

function withoutProperNouns(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, " ")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, " ")
    .replace(new RegExp(PROPER_LATIN.source, PROPER_LATIN.flags), " ")
    .replace(/([A-Za-z\u00C0-\u024F])[-‐‑‒–—](?![A-Za-z\u00C0-\u024F])/g, "$1 ");
}

function countableReply(text: string): string {
  return withoutProperNouns(text).replace(new RegExp(LOAN_LATIN.source, LOAN_LATIN.flags), " ");
}

/**
 * Longest run of consecutive Latin words after proper nouns are removed.
 * Single clinical terms may stay. A run of three or more is an English phrase.
 */
export function latinWordRun(text: string): number {
  const tokens = withoutProperNouns(text).split(/[^\p{L}\p{M}]+/u).filter(Boolean);
  let run = 0;
  let longest = 0;
  for (const token of tokens) {
    const letters = [...token].filter((ch) => /\p{L}/u.test(ch));
    const latin = letters.length >= 2 && letters.every((ch) => LATIN_LETTER.test(ch));
    if (latin) {
      run += 1;
      if (run > longest) longest = run;
    } else if (letters.length > 0) {
      run = 0;
    }
  }
  return longest;
}

export type ScriptMeasure = { ratio: number | null; conflicts: boolean };

/**
 * Share of counted letters that are in the target script, after names, URLs,
 * emails, phones and loanwords are removed. Null when there is nothing to judge.
 * A conflict is a target script below 40%, not a handful of English loanwords.
 */
export function measureReplyScript(text: string, code: string): ScriptMeasure {
  const nativeRe = NATIVE_REPLY[code];
  if (!nativeRe) return { ratio: null, conflicts: false };
  const body = countableReply(text);
  const latin = countPattern(body, LATIN_LETTER);
  const native = countPattern(body, nativeRe);
  const total = latin + native;
  const phrase = latinWordRun(text) >= 3;
  if (total < 16) return { ratio: null, conflicts: phrase };
  const ratio = native / total;
  return { ratio, conflicts: ratio < NATIVE_SCRIPT_FLOOR || phrase };
}

/** The finished text is in the wrong script when the target script is under 40%. */
export function replyScriptConflicts(text: string, code: string): boolean {
  return measureReplyScript(text, code).conflicts;
}

/** Target-script share used for the timing log. Null when the reply was not judged. */
export function replyScriptRatio(text: string, code: string): number | null {
  const ratio = measureReplyScript(text, code).ratio;
  return ratio === null ? null : Math.round(ratio * 1000) / 1000;
}

function countedLetters(text: string, code: string): number {
  const nativeRe = NATIVE_REPLY[code];
  if (!nativeRe) return 0;
  const body = countableReply(text);
  return countPattern(body, LATIN_LETTER) + countPattern(body, nativeRe);
}

/** A sentence end. A decimal point before a digit is not one. */
function hasSentenceEnd(text: string): boolean {
  return /[.!?।。？！](?!\d)/.test(text);
}

/**
 * Hold a native-script reply only until the first sentence or about 40 counted
 * letters. An opening that is clearly in the target script streams the rest.
 * An opening that looks like the wrong script waits for the finished reply, and
 * only that finished reply can ask for the one regenerate.
 */
export function replyScriptGate(text: string, code: string, final: boolean): "release" | "wait" | "conflict" {
  if (!NATIVE_REPLY[code]) return "release";
  if (!final && !hasSentenceEnd(text) && countedLetters(text, code) < SCRIPT_SAMPLE_LETTERS) return "wait";
  const judged = final ? text : stripSample(text);
  if (!measureReplyScript(judged, code).conflicts) return "release";
  return final ? "conflict" : "wait";
}

/** Judge the opening, not a fee sentence that is rewritten after the script check. */
function stripSample(text: string): string {
  const end = text.search(/[.!?।。？！](?!\d)/);
  return end >= 0 ? text.slice(0, end + 1) : text;
}
