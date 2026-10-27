import { mentionedClinics } from "./intent";
import { languageOption } from "./language/catalog";

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
  ta: "கேட்கிறோம்",
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

/** Latin clinic names stay only for an English-only hint. A non-English hint uses that script's names. */
export function keytermsForHints(hints: readonly string[]): string[] {
  const nonEnglish = hints.filter((hint) => hint !== "en");
  if (!nonEnglish.length) return [...STT_KEYTERMS];
  return [...new Set(nonEnglish.flatMap((hint) => NATIVE_KEYTERMS[hint] ?? []))];
}

export function deepgramListenQuery(options?: { interim?: boolean; endpointing?: boolean; hints?: string[] }): string {
  const params = new URLSearchParams();
  params.set("model", "nova-3");
  params.set("language", "multi");
  params.set("smart_format", "true");
  params.set("punctuate", "true");
  if (options?.interim) params.set("interim_results", "true");
  if (options?.endpointing) params.set("endpointing", "400");
  const hints = options?.hints?.length ? options.hints : ["en"];
  for (const hint of hints) params.append("language_hint", hint);
  for (const term of keytermsForHints(hints)) params.append("keyterm", term);
  return params.toString();
}

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

/** Devanagari and Bengali in the same utterance. One stray character of either is enough. */
export function mixedIndicScripts(text: string): boolean {
  return countScript(text, /[\u0980-\u09FF]/g) >= 1 && countScript(text, /[\u0900-\u097F]/g) >= 1;
}

/**
 * Do not keep an English or Indonesian Deepgram tag once the transcript contains
 * Bengali, Devanagari, Arabic, Han, or another non-Latin script.
 * Mixed Devanagari and Bengali, or a Bengali session hint, does not settle on Hindi.
 */
export function spokenLanguageForTranscript(heard: string | null | undefined, text: string, hint?: string | null): string | null {
  const normalized = normalizeSpokenLanguage(heard);
  const hinted = normalizeSpokenLanguage(hint);
  const fromScript = languageFromNativeScript(text);
  if (mixedIndicScripts(text) || (hinted === "bn" && (normalized === "hi" || fromScript === "hi"))) return "bn";
  if (!fromScript) return normalized;
  if (!normalized || normalized === "en" || normalized === "id") return fromScript;
  if (scriptFamily(normalized) === scriptFamily(fromScript)) return normalized;
  if (!requiresNativeScript(normalized)) return fromScript;
  return fromScript;
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

/**
 * After the second pass, pure Hindi can stand when this turn was not hinted as Bengali.
 * A bn hint does not settle on hi.
 */
export function languageAfterRepair(requested: string | null | undefined, repaired: string, hint?: string | null): string | null {
  const hinted = normalizeSpokenLanguage(hint);
  const script = languageFromNativeScript(repaired);
  if (hinted === "bn") return "bn";
  if (script === "hi" && !mixedIndicScripts(repaired)) return "hi";
  return spokenLanguageForTranscript(requested, repaired, hint) || script;
}

/**
 * Language of this Deepgram result. The script on the current text wins over a tag
 * left over from the previous turn, so Hindi speech does not keep a Bengali note.
 */
const NOTE_SCRIPT: { code: string; re: RegExp }[] = [
  { code: "bn", re: /[\u0980-\u09FF]/ },
  { code: "hi", re: /[\u0900-\u097F]/ },
  { code: "ar", re: /[\u0600-\u06FF]/ },
  { code: "ko", re: /[\uAC00-\uD7AF]/ },
  { code: "ja", re: /[\u3040-\u30FF]/ },
  { code: "zh", re: /[\u4E00-\u9FFF]/ },
  { code: "el", re: /[\u0370-\u03FF]/ },
  { code: "ru", re: /[\u0400-\u04FF]/ },
  { code: "th", re: /[\u0E00-\u0E7F]/ },
  { code: "he", re: /[\u0590-\u05FF]/ },
];

/** One native character is enough for the mic note. It does not decide the reply language. */
function noteScript(text: string): string {
  return NOTE_SCRIPT.find((item) => item.re.test(text))?.code ?? "";
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

function utteranceLanguage(alternative: DeepgramAlternative | undefined): string | null {
  return (
    normalizeSpokenLanguage(languageCode(alternative?.language)) ||
    normalizeSpokenLanguage(languageCode(alternative?.languages?.[0])) ||
    null
  );
}

export type MicLanguageStreak = { code: string; count: number };

function detectedInterimLanguage(alternative: DeepgramAlternative | undefined): string {
  const fromWords = majoritySpokenLanguage(wordLanguageVotes(alternative).map((vote) => vote.code));
  return fromWords || utteranceLanguage(alternative) || "";
}

/**
 * Language for the listening note.
 * Native-script characters can name it immediately. Bengali characters never
 * show Hindi or Telugu. Any other non-English guess waits until the same
 * language appears on two interim results in a row. Deepgram confidence alone
 * does not switch the note.
 */
export function interimMicLanguage(
  alternative: DeepgramAlternative | undefined,
  transcript: string,
  context?: { hint?: string | null; previous?: string | null; seen?: string | null; streak?: MicLanguageStreak },
): string {
  const seen = `${context?.seen ?? ""} ${transcript}`.replace(/\s+/g, " ").trim();
  const script = languageFromNativeScript(seen) || noteScript(seen);
  const picker = normalizeSpokenLanguage(context?.hint) || "";
  const previous = normalizeSpokenLanguage(context?.previous) || "";
  const fallback = picker || previous;
  if (/[\u0980-\u09FF]/.test(seen) || (picker === "bn" && (script === "hi" || detectedInterimLanguage(alternative) === "hi") && /[\u0900-\u097F]/.test(seen))) {
    if (context?.streak) {
      context.streak.code = "bn";
      context.streak.count = 2;
    }
    return "bn";
  }
  if (script) {
    if (context?.streak) {
      context.streak.code = script;
      context.streak.count = 2;
    }
    return script;
  }
  const detected = detectedInterimLanguage(alternative);
  if (!detected || detected === "en") {
    if (context?.streak) {
      context.streak.code = "";
      context.streak.count = 0;
    }
    return fallback;
  }
  if (detected === "hi" || detected === "te") {
    if (/[\u0980-\u09FF]/.test(seen)) return "bn";
  }
  const streak = context?.streak;
  if (!streak) return fallback;
  if (streak.code === detected) streak.count += 1;
  else {
    streak.code = detected;
    streak.count = 1;
  }
  if (streak.count >= 2) return detected;
  return fallback;
}

const LATIN_LETTERS = /[A-Za-z\u00C0-\u024F]/;

/** A native language still written in Latin, mixed with Latin, or split across Devanagari and Bengali, needs the second pass. */
export function transcriptNeedsRepair(code: string | null | undefined, text: string, hint?: string | null): boolean {
  if (mixedIndicScripts(text)) return true;
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
  const replaced = correctJiShiMei(
    correctDoctorClinic(correctBengaliAddress(text.replaceAll("隐世美", "隐适美").replaceAll("隐式美", "隐适美").replaceAll("دبتو", "دابتو"))),
  );
  return replaced.replace(/\bBuona\b/gi, (match, offset: number, whole: string) => {
    const after = whole.slice(offset + match.length, offset + match.length + 12);
    if (/^\s+(?:sera|notte|giornata|giorno|serata)\b/i.test(after)) return match;
    const start = Math.max(0, offset - 48);
    const end = Math.min(whole.length, offset + match.length + 48);
    const window = whole.slice(start, end);
    if (!CLINIC_CONTEXT.test(window) && mentionedClinics(window).length === 0) return match;
    return "Woonona";
  });
}

/** Mic status once Deepgram has a language, for example "শুনছি · বাংলা". */
export function micListeningNote(code: string | null | undefined): string {
  const normalized = normalizeSpokenLanguage(code);
  if (!normalized || normalized === "en") return "Listening…";
  const option = languageOption(normalized);
  const verb = LISTENING_VERB[normalized] ?? "Listening";
  return `${verb} · ${option?.label ?? normalized}`;
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
