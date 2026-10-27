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
export const STT_KEYTERMS = ["Dapto", "Woonona", "Shellharbour", "Illawarra", "Invisalign", "Barrack Heights", "Zavy"] as const;

/** Native-script clinic names. Used instead of the Latin list when a non-English hint is set. */
const NATIVE_KEYTERMS: Record<string, readonly string[]> = {
  bn: ["ডাপ্টো", "ড্যাপ্টো", "উনোনা", "শেলহারবার", "ব্যারাক হাইটস"],
  hi: ["डाप्टो", "वूनोना", "शेलहारबर", "बैरक हाइट्स"],
  ar: ["دابتو", "وونونا", "شيلهاربر"],
  ur: ["ڈاپٹو", "وونونا", "شیلہاربر"],
  fa: ["داپتو", "وونونا", "شلهاربر"],
  zh: ["达普托", "伍诺纳", "谢尔港"],
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
  languages?: string[];
  words?: { language?: string }[];
};

/** Word languages when Deepgram sent them, otherwise the alternative's top language. */
export function votesFromAlternative(alternative: DeepgramAlternative | undefined): string[] {
  const words = (alternative?.words ?? []).map((word) => word.language).filter((code): code is string => Boolean(code));
  if (words.length) return words;
  const top = alternative?.languages?.[0];
  return top ? [top] : [];
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

export function transcriptNeedsRepair(code: string | null | undefined, text: string): boolean {
  const normalized = normalizeSpokenLanguage(code);
  if (!normalized || !requiresNativeScript(normalized)) return false;
  return !NATIVE_SCRIPT[normalized]?.test(text);
}

const CLINIC_CONTEXT =
  /clinic|dentist|dental|invisalign|tooth|teeth|appointment|implant|dokter|doktor|gigi|klinik|عيادة|طبيب|أسنان|کلینک|دانت|क्लिनिक|दांत|ডেন্ট|দাঁত|치과|치아|诊所|牙医|牙齿|phòng khám|nha khoa|οδοντ/i;

/**
 * Map known Nova-3 mishearings of local and brand names.
 * "Buona" becomes Woonona only beside a clinic or dentist word, and not in "Buona sera".
 */
export function correctTranscript(text: string): string {
  const replaced = text.replaceAll("隐世美", "隐适美").replaceAll("隐式美", "隐适美").replaceAll("دبتو", "دابتو");
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
