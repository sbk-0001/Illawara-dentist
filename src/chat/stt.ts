import { mentionedClinics } from "./intent";
import { languageOption } from "./language/catalog";
import { detectLanguage, isDictionaryEnglish } from "./language/detect";

/**
 * Deepgram Nova-3 keyterm prompting.
 * https://developers.deepgram.com/docs/keyterm
 * Keyterms work with multilingual Nova-3 (`model=nova-3&language=multi`), pre-recorded and streaming.
 * Repeat `keyterm` once per phrase. Do not use the Nova-2 `keywords=term:weight` syntax.
 *
 * Language hinting (Nova-3 multilingual only):
 * https://developers.deepgram.com/docs/nova-3-language-prompting
 * Repeat `language_hint`. Hints bias detection; they do not restrict it.
 * An unknown hint is HTTP 400 and, on the live socket, a rejected handshake.
 */
export const STT_KEYTERMS = [
  "Dapto",
  "Woonona",
  "Shellharbour",
  "Illawarra",
  "Invisalign",
  "Barrack Heights",
  "Zavy",
  "ঠিকানা",
  "অ্যাপয়েন্টমেন্ট",
  "ডাপ্টো",
  "ড্যাপ্টো",
  "উনোনা",
  "শেলহারবার",
  "ব্যারাক হাইটস",
  "种植牙",
  "隐适美",
] as const;

/** Native-script clinic names and the query words Nova-3 most often mishears. Latin names are omitted. */
const NATIVE_KEYTERMS: Record<string, readonly string[]> = {
  bn: ["ডাপ্টো", "ড্যাপ্টো", "উনোনা", "শেলহারবার", "ব্যারাক হাইটস", "ঠিকানা", "অ্যাপয়েন্টমেন্ট"],
  hi: ["डाप्टो", "वूनोना", "शेलहारबर", "बैरक हाइट्स"],
  ar: ["دابتو", "وونونا", "شيلهاربر"],
  ur: ["ڈاپٹو", "وونونا", "شیلہاربر"],
  fa: ["داپتو", "وونونا", "شلهاربر"],
  zh: ["达普托", "伍诺纳", "谢尔港", "种植牙", "隐适美"],
  ko: ["닥토", "울로나", "셸하버"],
  ne: ["डाप्टो", "वूनोना"],
  el: ["ντάπτο"],
};

/**
 * Codes Nova-3 multilingual accepts as `language_hint`.
 * https://developers.deepgram.com/docs/nova-3-language-prompting
 * Urdu, Nepali and Punjabi are not in that list; sending them rejects the socket.
 */
const DEEPGRAM_HINTS = new Set([
  "af", "ar", "be", "bg", "bn", "bs", "ca", "cs", "da", "de", "el", "en", "es", "et", "fa", "fi", "fr", "gl", "gu", "he", "hi", "hr", "hu", "id", "it", "ja", "kn", "ko", "lt", "lv", "mk", "mr", "ms", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sr", "sv", "ta", "te", "th", "tl", "tr", "uk", "vi", "xh", "zh", "zu",
]);

const HINT_ALIAS: Record<string, string> = {
  "en-us": "en",
  "en-gb": "en",
  "en-au": "en",
  "en-nz": "en",
  "en-in": "en",
  "en-ca": "en",
  "zh-cn": "zh",
  "zh-hans": "zh",
  "zh-hk": "zh",
  "pt-br": "pt",
  "pt-pt": "pt",
  "bn-latn": "bn",
  "hi-latn": "hi",
};

const NATIVE_SCRIPT: Record<string, RegExp> = {
  ar: /[\u0600-\u06FF]/,
  bn: /[\u0980-\u09FF]/,
  fa: /[\u0600-\u06FF]/,
  he: /[\u0590-\u05FF]/,
  hi: /[\u0900-\u097F]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/,
  ko: /[\uAC00-\uD7AF]/,
  ne: /[\u0900-\u097F]/,
  pa: /[\u0A00-\u0A7F]/,
  ru: /[\u0400-\u04FF]/,
  ta: /[\u0B80-\u0BFF]/,
  ml: /[\u0D00-\u0D7F]/,
  te: /[\u0C00-\u0C7F]/,
  th: /[\u0E00-\u0E7F]/,
  ur: /[\u0600-\u06FF]/,
  zh: /[\u4E00-\u9FFF]/,
  el: /[\u0370-\u03FF]/,
};

const LISTENING_VERB: Record<string, string> = {
  ar: "نستمع",
  bn: "শুনছি",
  de: "Ich höre zu",
  el: "Ακούω",
  es: "Escuchando",
  fa: "داریم می‌شنویم",
  fr: "J'écoute",
  he: "מקשיב",
  hi: "सुन रहे हैं",
  id: "Mendengarkan",
  it: "In ascolto",
  ja: "聞いています",
  ko: "듣는 중",
  ms: "Mendengar",
  ne: "सुन्दै",
  pa: "ਸੁਣ ਰਹੇ ਹਾਂ",
  pt: "Ouvindo",
  ru: "Слушаю",
  ta: "கேட்கிறேன்",
  ml: "കേൾക്കുന്നു",
  te: "వింటున్నాం",
  th: "กำลังฟัง",
  ur: "سن رہے ہیں",
  vi: "Đang nghe",
  zh: "正在听",
};

/** Map a picker or Deepgram tag onto a reply language, or null when it is not allowed. */
export function normalizeSpokenLanguage(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw || raw.toLowerCase() === "auto" || raw.toLowerCase() === "und") return null;
  if (languageOption(raw)) {
    if (raw === "bn-Latn") return "bn";
    if (raw === "hi-Latn") return "hi";
    return raw;
  }
  const folded = raw.toLowerCase().replace(/_/g, "-");
  const alias = HINT_ALIAS[folded];
  if (alias && languageOption(alias)) return alias;
  const base = folded.split("-")[0] || "";
  if (languageOption(base)) return base;
  return null;
}

/** Picker or last reply language, plus English. Unknown codes are dropped so Nova-3 does not reject the socket. */
export function deepgramLanguageHints(preferred: string | null | undefined): string[] {
  const code = normalizeSpokenLanguage(preferred);
  const hint = code && code !== "en" && DEEPGRAM_HINTS.has(code) ? code : null;
  return hint ? [hint, "en"] : ["en"];
}

const LATIN_CLINIC_KEYTERMS = ["Dapto", "Woonona", "Shellharbour"] as const;

/**
 * Auto sends only the Latin clinic names. A picked language may add that
 * script's names. Bengali keyterms on Auto make Hindi speech come back in Bengali.
 */
export function keytermsForHints(hints: readonly string[]): string[] {
  const nonEnglish = hints.filter((hint) => hint !== "en");
  if (!nonEnglish.length) return [...LATIN_CLINIC_KEYTERMS];
  return [...new Set([...LATIN_CLINIC_KEYTERMS, ...nonEnglish.flatMap((hint) => NATIVE_KEYTERMS[hint] ?? [])])];
}

export function deepgramListenQuery(options?: { interim?: boolean; endpointing?: boolean; hints?: string[] }): string {
  const params = new URLSearchParams();
  params.set("model", "nova-3");
  params.set("language", "multi");
  params.set("smart_format", "true");
  params.set("punctuate", "true");
  if (options?.interim) params.set("interim_results", "true");
  if (options?.endpointing) {
    params.set("endpointing", "400");
    params.set("utterance_end_ms", "1000");
  }
  const hints = options?.hints?.length ? options.hints : ["en"];
  for (const hint of hints) params.append("language_hint", hint);
  for (const term of keytermsForHints(hints)) params.append("keyterm", term);
  return params.toString();
}

/**
 * Nova-3 here is the multilingual model, so the socket stays `language=multi`.
 * Auto passes no preferred language: English hint and Latin clinic keyterms only.
 * A picked language adds that `language_hint` and its native keyterms.
 * A previous turn is never a preferred language.
 */
export function deepgramListenUrl(kind: "stream" | "prerecorded", preferredLanguage?: string | null): string {
  const hints = deepgramLanguageHints(preferredLanguage);
  const query = kind === "stream" ? deepgramListenQuery({ interim: true, endpointing: true, hints }) : deepgramListenQuery({ hints });
  const base = kind === "stream" ? "wss://api.deepgram.com/v1/listen" : "https://api.deepgram.com/v1/listen";
  return `${base}?${query}`;
}

export type DeepgramAlternative = {
  transcript?: string;
  language?: unknown;
  languages?: unknown[];
  /** Utterance-level language confidence, when Deepgram sent one. */
  language_confidence?: number;
  words?: { language?: unknown; confidence?: number; language_confidence?: number }[];
};

function languageCode(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "language" in value) {
    const code = (value as { language?: unknown }).language;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/** Word languages when Deepgram sent them, otherwise the alternative's top language. */
export function votesFromAlternative(alternative: DeepgramAlternative | undefined): string[] {
  const words = (alternative?.words ?? []).map((word) => languageCode(word?.language)).filter((code): code is string => Boolean(code));
  if (words.length) return words;
  const single = languageCode(alternative?.language);
  if (single) return [single];
  const top = languageCode(alternative?.languages?.[0]);
  return top ? [top] : [];
}

/** Pull a language off a live result, including fields Nova-3 puts beside the transcript. */
export function alternativeFromLiveResult(input: {
  alternative?: DeepgramAlternative;
  detectedLanguage?: unknown;
  channelLanguages?: unknown[];
}): DeepgramAlternative {
  const alternative = input.alternative ?? {};
  const languages = [...(alternative.languages ?? [])];
  if (input.detectedLanguage) languages.push(input.detectedLanguage);
  for (const code of input.channelLanguages ?? []) languages.push(code);
  return { ...alternative, languages };
}

/** Majority language for one utterance. A tie is not a majority. */
export function majoritySpokenLanguage(codes: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const normalized = normalizeSpokenLanguage(code);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  let second = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      second = bestCount;
      best = code;
      bestCount = count;
    } else if (count > second) {
      second = count;
    }
  }
  if (!best || bestCount === 0 || bestCount === second) return null;
  return best;
}

export function requiresNativeScript(code: string | null | undefined): boolean {
  const normalized = normalizeSpokenLanguage(code);
  return Boolean(normalized && normalized !== "en" && NATIVE_SCRIPT[normalized]);
}

export function hasNativeScript(code: string | null | undefined, text: string): boolean {
  const normalized = normalizeSpokenLanguage(code);
  if (!normalized) return false;
  return Boolean(NATIVE_SCRIPT[normalized]?.test(text));
}

const SCRIPT_COUNTS: { code: string; family: string; re: RegExp }[] = [
  { code: "bn", family: "bn", re: /[\u0980-\u09FF]/g },
  { code: "hi", family: "deva", re: /[\u0900-\u097F]/g },
  { code: "ar", family: "arab", re: /[\u0600-\u06FF]/g },
  { code: "ko", family: "ko", re: /[\uAC00-\uD7AF]/g },
  { code: "ja", family: "cjk", re: /[\u3040-\u30FF]/g },
  { code: "zh", family: "cjk", re: /[\u4E00-\u9FFF]/g },
  { code: "el", family: "el", re: /[\u0370-\u03FF]/g },
  { code: "ru", family: "ru", re: /[\u0400-\u04FF]/g },
  { code: "th", family: "th", re: /[\u0E00-\u0E7F]/g },
  { code: "he", family: "he", re: /[\u0590-\u05FF]/g },
  { code: "pa", family: "pa", re: /[\u0A00-\u0A7F]/g },
  { code: "ta", family: "ta", re: /[\u0B80-\u0BFF]/g },
  { code: "ml", family: "ml", re: /[\u0D00-\u0D7F]/g },
  { code: "te", family: "te", re: /[\u0C00-\u0C7F]/g },
  { code: "gu", family: "gu", re: /[\u0A80-\u0AFF]/g },
];

function scriptFamily(code: string): string {
  if (code === "hi" || code === "ne" || code === "mr") return "deva";
  if (code === "ar" || code === "ur" || code === "fa") return "arab";
  if (code === "zh" || code === "ja") return "cjk";
  return code;
}

function countScript(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/** Language of the dominant non-Latin script, when at least two of those characters are present. */
export function languageFromNativeScript(text: string): string | null {
  const counted = SCRIPT_COUNTS.map((item) => ({ ...item, count: countScript(text, item.re) }))
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count);
  const best = counted[0];
  const telugu = countScript(text, /[\u0C00-\u0C7F]/g);
  const kannada = countScript(text, /[\u0C80-\u0CFF]/g);
  if (best?.code === "te" || best?.code === "kn" || (telugu + kannada >= 2 && telugu + kannada > (best?.count ?? 0))) return "ml";
  if (!best) return null;
  const second = counted[1];
  if (second && second.count === best.count && second.family !== best.family) return null;
  const kana = counted.find((item) => item.code === "ja")?.count ?? 0;
  if ((best.code === "zh" || best.code === "ja") && kana >= 2) return "ja";
  if (best.code === "ar") {
    const urdu = countScript(text, /[ٹڈڑںے]/g);
    const persian = countScript(text, /[پچژگ]/g);
    if (persian >= 2 && persian > urdu) return "fa";
    if (urdu >= 2 && urdu > persian) return "ur";
    return "ar";
  }
  if (best.code === "hi" && /हुन्छ|खुल्छ|तपाईं/.test(text)) return "ne";
  return best.code;
}

/** Telugu or Kannada on Auto is a Malayalam miss, not a language we expect. */
export function malayalamMishear(text: string): boolean {
  const telugu = countScript(text, /[\u0C00-\u0C7F]/g);
  const kannada = countScript(text, /[\u0C80-\u0CFF]/g);
  return telugu + kannada >= 2;
}

/** Devanagari and Bengali in the same utterance. One stray character of either is enough. */
export function mixedIndicScripts(text: string): boolean {
  return countScript(text, /[\u0980-\u09FF]/g) >= 1 && countScript(text, /[\u0900-\u097F]/g) >= 1;
}

/**
 * Language of this transcript only. A picker wins. Otherwise the script in the
 * text wins, including Hindi after a Bengali turn. `hint` is ignored: Auto
 * must not inherit the previous turn.
 */
export function spokenLanguageForTranscript(
  heard: string | null | undefined,
  text: string,
  _hint?: string | null,
  picker?: string | null,
): string | null {
  const picked = normalizeSpokenLanguage(picker);
  if (picked) return picked;
  const fromScript = languageFromNativeScript(text);
  if (fromScript) return fromScript;
  return normalizeSpokenLanguage(heard);
}

/** Language for the gpt-4o-mini-transcribe pass. A Bengali hint wins over a Hindi tag. */
export function repairLanguageForTranscript(heard: string | null | undefined, text: string, hint?: string | null): string | null {
  return spokenLanguageForTranscript(heard, text, hint);
}

/**
 * Language sent with a voice turn. Deepgram votes and this utterance come first.
 * The transcript script fills in when Deepgram never named a language.
 */
export function spokenLanguageAtSubmit(input: {
  votes?: readonly string[];
  interim?: string | null;
  draft?: string | null;
  text: string;
  hint?: string | null;
}): string {
  const heard =
    majoritySpokenLanguage(input.votes ?? []) ||
    normalizeSpokenLanguage(input.interim) ||
    normalizeSpokenLanguage(input.draft) ||
    "";
  return spokenLanguageForTranscript(heard, input.text, input.hint) || languageFromNativeScript(input.text) || heard;
}

/** Language after the second pass. The repaired text's script decides. A picker still wins. */
export function spokenLanguageAfterSecondPass(text: string, picker?: string | null): string {
  const picked = normalizeSpokenLanguage(picker);
  if (picked) return picked;
  return languageFromNativeScript(text) || "";
}

export function languageAfterRepair(requested: string | null | undefined, repaired: string, hint?: string | null): string | null {
  const script = languageFromNativeScript(repaired);
  if (script) return script;
  return spokenLanguageForTranscript(requested, repaired, hint) || null;
}

/**
 * Language for gpt-4o-mini-transcribe. A picker is always sent. On Auto, send a
 * language only when this utterance's own text is at least 80% one native script.
 * A previous turn is not an input.
 */
export function secondPassLanguage(transcript: string, picker?: string | null): string | null {
  const picked = normalizeSpokenLanguage(picker);
  if (picked && picked !== "en") return picked;
  return scriptNoteLanguage(transcript) || null;
}

/** Deepgram language for this utterance. Auto is null: multi, Latin keyterms, no history. */
export function utteranceSpeechLanguage(picker?: string | null): string | null {
  return normalizeSpokenLanguage(picker);
}

/**
 * Nova-3 multilingual lists Tamil and not Malayalam (models overview, current docs).
 * Malayalam audio goes to gpt-4o-transcribe. Tamil stays on Nova-3 unless that
 * pass returns the wrong script, which the repair route handles.
 */
export type SpeechEngine = "deepgram" | "gpt-4o-transcribe";

export function speechEngineFor(input: { picker?: string | null; transcript?: string }): SpeechEngine {
  const picked = normalizeSpokenLanguage(input.picker);
  if (picked === "ml") return "gpt-4o-transcribe";
  const text = input.transcript || "";
  if (!text) return "deepgram";
  if (malayalamMishear(text) || languageFromNativeScript(text) === "ml") return "gpt-4o-transcribe";
  const detected = detectLanguage(text).code;
  if (detected === "ml" || detected === "ml-Latn") return "gpt-4o-transcribe";
  return "deepgram";
}

export function repairModelFor(language: string | null | undefined, transcript: string): "openai/gpt-4o-transcribe" | "openai/gpt-4o-mini-transcribe" {
  if (speechEngineFor({ picker: language, transcript }) === "gpt-4o-transcribe") return "openai/gpt-4o-transcribe";
  const requested = normalizeSpokenLanguage(language);
  if (requested === "ta" && transcript && !hasNativeScript("ta", transcript)) return "openai/gpt-4o-transcribe";
  return "openai/gpt-4o-mini-transcribe";
}

function numericConfidence(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function voteConfidence(value: unknown, fallback?: number): number | undefined {
  const direct = numericConfidence(fallback);
  if (direct !== undefined) return direct;
  if (value && typeof value === "object" && "confidence" in value) return numericConfidence((value as { confidence?: unknown }).confidence);
  return undefined;
}

/** Word languages only count when Deepgram is confident. An utterance language can stand on its own. */
function wordLanguageVotes(alternative: DeepgramAlternative | undefined): { code: string; confidence?: number }[] {
  const votes: { code: string; confidence?: number }[] = [];
  for (const word of alternative?.words ?? []) {
    const code = normalizeSpokenLanguage(languageCode(word?.language));
    if (!code) continue;
    votes.push({ code, confidence: voteConfidence(word?.language, word?.language_confidence ?? word?.confidence) });
  }
  return votes;
}

export type MicLanguageStreak = { code: string; count: number };

const NOTE_SCRIPT_MIN = 6;
const NOTE_SCRIPT_SHARE = 0.8;

function scriptCount(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

const NOTE_BLOCKS: { code: string; re: RegExp }[] = [
  { code: "bn", re: /[\u0980-\u09FF]/g },
  { code: "hi", re: /[\u0900-\u097F]/g },
  { code: "ar", re: /[\u0600-\u06FF]/g },
  { code: "he", re: /[\u0590-\u05FF]/g },
  { code: "ko", re: /[\uAC00-\uD7AF]/g },
  { code: "el", re: /[\u0370-\u03FF]/g },
  { code: "ru", re: /[\u0400-\u04FF]/g },
  { code: "th", re: /[\u0E00-\u0E7F]/g },
  { code: "pa", re: /[\u0A00-\u0A7F]/g },
  { code: "ta", re: /[\u0B80-\u0BFF]/g },
  { code: "ml", re: /[\u0D00-\u0D7F]/g },
];

/**
 * The listening note names one script only after six characters of that script,
 * and only when those characters are at least 80% of the native letters.
 * Mixed Bengali and Devanagari stays "Listening…". Telugu is not a note:
 * Deepgram tags Bengali audio as `te`, and Telugu letters are not Bengali.
 */
function scriptNoteLanguage(text: string): string {
  if (scriptCount(text, /[\u0980-\u09FF]/g) > 0 && scriptCount(text, /[\u0900-\u097F]/g) > 0) return "";
  const counts = NOTE_BLOCKS.map((block) => ({ code: block.code, count: scriptCount(text, block.re) }));
  const kana = scriptCount(text, /[\u3040-\u30FF]/g);
  const han = scriptCount(text, /[\u4E00-\u9FFF]/g);
  if (kana >= NOTE_SCRIPT_MIN) counts.push({ code: "ja", count: kana + han });
  else if (han >= NOTE_SCRIPT_MIN) counts.push({ code: "zh", count: han });
  const telugu = scriptCount(text, /[\u0C00-\u0C7F]/g);
  const kannada = scriptCount(text, /[\u0C80-\u0CFF]/g);
  const nativeTotal = counts.reduce((sum, block) => sum + block.count, 0) + telugu + kannada;
  if (telugu + kannada >= NOTE_SCRIPT_MIN && (telugu + kannada) / Math.max(nativeTotal, 1) >= NOTE_SCRIPT_SHARE) return "ml";
  const qualified = counts.filter((block) => block.count >= NOTE_SCRIPT_MIN && block.count / Math.max(nativeTotal, 1) >= NOTE_SCRIPT_SHARE);
  if (qualified.length !== 1) return "";
  const winner = qualified[0];
  if (!winner || !languageOption(winner.code) || winner.code === "te") return "";
  if (winner.code === "ar") return languageFromNativeScript(text) || "ar";
  return winner.code;
}

const ROMAN_BENGALI = /\b(?:kliniker|klinik|chikana|chikanaki|chkanaki|kanaki|thikana|ache|achen|kothay|kokhon|khola|paoa|jabe|betha|dante|amar|ki)\b/i;

/** Live Nova-3 garbled a Bengali utterance. These need the second pass before submit. */
export function bengaliTranscriptGarbled(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const bengali = trimmed.match(/[\u0980-\u09FF]/g)?.length ?? 0;
  const devanagari = trimmed.match(/[\u0900-\u097F]/g)?.length ?? 0;
  const latinWords = (trimmed.match(/[A-Za-z]{2,}/g) ?? []).filter((word) => !/^(?:dapto|woonona|shellharbour|illawarra|nsw)$/i.test(word));
  const families = [bengali > 0, devanagari > 0, latinWords.length > 0].filter(Boolean).length;
  if (families >= 2) return true;
  if (bengali > 0 && (devanagari > 0 || latinWords.length > 0)) return true;
  return ROMAN_BENGALI.test(trimmed);
}

/**
 * Language of this utterance only. Native script wins from the characters in
 * `transcript`. Latin text is named only on a final result, by the text detector.
 * The previous turn, a Deepgram tag, and a language hint are not inputs.
 * An explicit picker still wins, because the visitor chose it.
 */
export function utteranceLanguage(transcript: string, options?: { final?: boolean; picker?: string | null; heard?: string | null }): string {
  const picked = normalizeSpokenLanguage(options?.picker);
  if (picked) return picked;
  const text = transcript.replace(/\s+/g, " ").trim();
  const fromScript = scriptNoteLanguage(text);
  if (fromScript) return fromScript;
  if (/[\u0980-\u09FF\u0900-\u097F]/.test(text)) return "";
  if (!text) return "";
  const detected = detectLanguage(text);
  const detectedCode = detected.code === "bn-Latn" ? "bn" : detected.code === "hi-Latn" ? "hi" : detected.code;
  const heard = normalizeSpokenLanguage(options?.heard);
  const latinHeard = heard && !replyScriptWouldBeNative(heard) ? heard : null;
  const latinNote = latinHeard && /^(?:es|fr|pt|it|de|vi|id|ms)$/.test(latinHeard) ? latinHeard : null;
  if (!options?.final) {
    if (latinNote && detectedCode === latinNote) return latinNote;
    return "";
  }
  if (detected.code === "bn-Latn") return "bn";
  if (detected.code === "hi-Latn") return "hi";
  if (detected.code === "und" || detected.fallback) return isDictionaryEnglish(text) ? "en" : "";
  if (detectedCode === "te") return "";
  return detected.code;
}

function replyScriptWouldBeNative(code: string): boolean {
  return /^(?:bn|hi|ne|ar|ur|fa|he|zh|ja|ko|el|ru|th|pa|ta|te)$/.test(code);
}

/**
 * Listening-note language. Same answer as `utteranceLanguage`. A stale streak,
 * Deepgram language, or previous-turn hint cannot override the current transcript.
 */
export function interimMicLanguage(
  _alternative: DeepgramAlternative | undefined,
  transcript: string,
  context?: { hint?: string | null; previous?: string | null; seen?: string | null; final?: boolean; streak?: MicLanguageStreak; picker?: string | null; heard?: string | null },
): string {
  const current = `${context?.seen ?? ""} ${transcript}`.replace(/\s+/g, " ").trim();
  let code = utteranceLanguage(current, { final: context?.final, picker: context?.picker, heard: context?.heard });
  if (code === "te") code = "";
  if (code === "hi" && /[\u0980-\u09FF]/.test(current)) code = "";
  if (context?.streak) {
    context.streak.code = code;
    context.streak.count = code ? NOTE_SCRIPT_MIN : 0;
  }
  return code === "en" ? "" : code;
}

const LATIN_LETTERS = /[A-Za-z\u00C0-\u024F]/;

/** A native language still written in Latin, mixed with Latin, or split across Devanagari and Bengali, needs the second pass. */
export function transcriptNeedsRepair(code: string | null | undefined, text: string, hint?: string | null): boolean {
  if (bengaliTranscriptGarbled(text) || mixedIndicScripts(text)) return true;
  const hinted = normalizeSpokenLanguage(hint);
  const fromScript = languageFromNativeScript(text);
  const normalized = normalizeSpokenLanguage(code);
  if (hinted === "bn" && (normalized === "hi" || fromScript === "hi")) return true;
  if (!normalized || !requiresNativeScript(normalized)) return false;
  if (!NATIVE_SCRIPT[normalized]?.test(text)) return true;
  return LATIN_LETTERS.test(text);
}

const CLINIC_CONTEXT =
  /clinic|dentist|dental|invisalign|tooth|teeth|appointment|implant|dokter|doktor|gigi|klinik|عيادة|طبيب|أسنان|کلینک|دانت|क्लिनिक|दांत|ডেন্ট|দাঁত|치과|치아|诊所|牙医|牙齿|phòng khám|nha khoa|οδοντ/i;

/** Hours or place words. "ডাক্তার" itself is doctor, so it is not a cue. */
const HOURS_OR_LOCATION =
  /hour|hours|opening|open|close|address|where|location|saturday|ঠিকানা|কোথায়|খোলা|কখন|সময়|শনিবার|khola|kokhon|thikana|kothay|地址|哪里|哪儿|几点|营业|开门/i;

const IMPLANT_CONTEXT = /种植|植牙|种牙|implant/i;
const ALIGNER_CONTEXT = /矫正|隐形|牙套|隐适|invisalign|aligner/i;

/**
 * "ডাক্তার ক্লিনিক" was Dapto in an Indian Bengali hours/address question.
 * Leave it alone when the visitor is talking about a doctor.
 */
function correctDoctorClinic(text: string): string {
  if (!text.includes("ডাক্তার ক্লিনিক") || !HOURS_OR_LOCATION.test(text)) return text;
  return text.replace(/ডাক্তার ক্লিনিক(?:ের|ে)?/g, "Dapto");
}

const ADDRESS_MISHEAR = /চিকা\s*নাকি|চিকানাকি|চিকানা/g;
const ADDRESS_BEFORE = /ক্লিনিকের|ক্লিনিক|ডাপ্টো|ড্যাপ্টো|উনোনা|শেলহারবার|ব্যারাক হাইটস|\b(?:dapto|woonona|unona|shellharbour|illawarra)\b/i;

/** Indian Bengali often hears ঠিকানা as চিকানা, চিকা নাকি, or চিকানাকি after a clinic name. */
function correctBengaliAddress(text: string): string {
  return text.replace(ADDRESS_MISHEAR, (match, offset: number, whole: string) => {
    const before = whole.slice(Math.max(0, offset - 48), offset);
    if (!ADDRESS_BEFORE.test(before)) return match;
    return "ঠিকানা";
  });
}

/** "饥食美" is 种植牙 or 隐适美 only when the rest of the utterance says which. */
function correctJiShiMei(text: string): string {
  if (!text.includes("饥食美")) return text;
  const implant = IMPLANT_CONTEXT.test(text);
  const aligner = ALIGNER_CONTEXT.test(text);
  if (implant === aligner) return text;
  return text.replaceAll("饥食美", implant ? "种植牙" : "隐适美");
}

/**
 * Map known Nova-3 mishearings of local and brand names.
 * "Buona" becomes Woonona only beside a clinic or dentist word, and not in "Buona sera".
 */
export function correctTranscript(text: string): string {
  const stripped = text.replace(/^[\s.。．,،!！?？]+/u, "");
  const replaced = correctJiShiMei(
    correctDoctorClinic(correctBengaliAddress(stripped.replaceAll("隐世美", "隐适美").replaceAll("隐式美", "隐适美").replaceAll("دبتو", "دابتو"))),
  );
  return replaced.replace(/\b(?:buona|wunona|wonona|woona|voonona|woonana|unona)\b/gi, (match, offset: number, whole: string) => {
    const after = whole.slice(offset + match.length, offset + match.length + 16);
    if (/^\s+(?:sera|notte|giornata|giorno|serata)\b/i.test(after)) return match;
    const start = Math.max(0, offset - 48);
    const end = Math.min(whole.length, offset + match.length + 48);
    const window = whole.slice(start, end);
    const short = whole.trim().split(/\s+/).length <= 6;
    if (!short && !CLINIC_CONTEXT.test(window) && mentionedClinics(window).length === 0) return match;
    return "Woonona";
  });
}

/** Mic status once the utterance language is known, for example "শুনছি · বাংলা". */
export function micListeningNote(code: string | null | undefined): string {
  const normalized = normalizeSpokenLanguage(code);
  if (!normalized || normalized === "en" || normalized === "te") return "Listening…";
  const option = languageOption(normalized);
  const verb = LISTENING_VERB[normalized] ?? "Listening";
  return `${verb} · ${option?.label ?? normalized}`;
}

/** Neutral mic line before the utterance language is known. Uses the session language when there is one. */
export function micWaitingNote(code: string | null | undefined): string {
  const normalized = normalizeSpokenLanguage(code);
  if (!normalized || normalized === "en") return "Listening…";
  const verb = LISTENING_VERB[normalized] ?? "Listening";
  return /[….]$/u.test(verb) ? verb : `${verb}…`;
}

export function formatLiveDrop(input: { code?: number; reason?: string; wasClean?: boolean; fallback?: string }): string {
  const parts: string[] = [];
  if (input.fallback) parts.push(input.fallback);
  if (typeof input.code === "number") parts.push(String(input.code));
  if (input.reason) parts.push(input.reason);
  if (input.wasClean === false) parts.push("unclean");
  if (input.wasClean === true) parts.push("clean");
  return parts.join(" ").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
