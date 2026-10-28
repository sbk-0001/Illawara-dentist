import type { ReplyLanguage } from "../types";

export type LanguageOption = {
  code: string;
  label: string;
  script: string;
  dir: "ltr" | "rtl";
  /** How the model should write, including romanised registers. */
  instruction: string;
};

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en", label: "English", script: "Latin", dir: "ltr", instruction: "Write in English." },
  { code: "zh", label: "中文", script: "Han", dir: "ltr", instruction: "Write in Chinese, using the same simplified or traditional characters as the visitor." },
  { code: "ml", label: "മലയാളം", script: "Malayalam", dir: "ltr", instruction: "Write in Malayalam, using Malayalam script." },
  { code: "ta", label: "தமிழ்", script: "Tamil", dir: "ltr", instruction: "Write in Tamil script." },
  { code: "hi", label: "हिन्दी", script: "Devanagari", dir: "ltr", instruction: "Write in Hindi, using Devanagari script." },
  { code: "ar", label: "العربية", script: "Arabic", dir: "rtl", instruction: "Write in Arabic, using Arabic script, right to left." },
  { code: "es", label: "Español", script: "Latin", dir: "ltr", instruction: "Write in Spanish." },
  { code: "bn", label: "বাংলা", script: "Bengali", dir: "ltr", instruction: "Write in Bengali, using Bengali script." },
  {
    code: "bn-Latn",
    label: "Banglish",
    script: "Latin",
    dir: "ltr",
    instruction: "Write in romanised Bengali (Banglish), using Latin letters only. Do not use Bengali script at all, not even one character. Match the visitor's Latin-script register.",
  },
  {
    code: "hi-Latn",
    label: "Hinglish",
    script: "Latin",
    dir: "ltr",
    instruction: "Write in romanised Hindi (Hinglish), using Latin letters only. Do not use Devanagari at all, not even one character. Match the visitor's Latin-script register.",
  },
  { code: "ne", label: "नेपाली", script: "Devanagari", dir: "ltr", instruction: "Write in Nepali, using Devanagari script." },
  { code: "ja", label: "日本語", script: "Japanese", dir: "ltr", instruction: "Write in Japanese." },
  { code: "ko", label: "한국어", script: "Hangul", dir: "ltr", instruction: "Write in Korean, using Hangul." },
  { code: "vi", label: "Tiếng Việt", script: "Latin", dir: "ltr", instruction: "Write in Vietnamese, with Vietnamese diacritics." },
  { code: "el", label: "Ελληνικά", script: "Greek", dir: "ltr", instruction: "Write in Greek, using the Greek alphabet." },
  { code: "it", label: "Italiano", script: "Latin", dir: "ltr", instruction: "Write in Italian." },
  { code: "ur", label: "اردو", script: "Arabic", dir: "rtl", instruction: "Write in Urdu, using Urdu script, right to left." },
  { code: "fa", label: "فارسی", script: "Arabic", dir: "rtl", instruction: "Write in Persian, using Persian script, right to left." },
  { code: "he", label: "עברית", script: "Hebrew", dir: "rtl", instruction: "Write in Hebrew, using Hebrew script, right to left." },
  { code: "fr", label: "Français", script: "Latin", dir: "ltr", instruction: "Write in French." },
  { code: "de", label: "Deutsch", script: "Latin", dir: "ltr", instruction: "Write in German." },
  { code: "pt", label: "Português", script: "Latin", dir: "ltr", instruction: "Write in Portuguese." },
  { code: "id", label: "Bahasa Indonesia", script: "Latin", dir: "ltr", instruction: "Write in Indonesian (Bahasa Indonesia)." },
  { code: "ms", label: "Bahasa Melayu", script: "Latin", dir: "ltr", instruction: "Write in Malay (Bahasa Melayu)." },
  { code: "pa", label: "ਪੰਜਾਬੀ", script: "Gurmukhi", dir: "ltr", instruction: "Write in Punjabi, using Gurmukhi script." },
  { code: "te", label: "తెలుగు", script: "Telugu", dir: "ltr", instruction: "Write in Telugu script." },
  { code: "ru", label: "Русский", script: "Cyrillic", dir: "ltr", instruction: "Write in Russian, using Cyrillic." },
  { code: "th", label: "ไทย", script: "Thai", dir: "ltr", instruction: "Write in Thai script." },
];

const BY_CODE = new Map(LANGUAGE_OPTIONS.map((option) => [option.code, option]));

export function languageOption(code: string): LanguageOption | undefined {
  return BY_CODE.get(code);
}

export function replyFromOption(option: LanguageOption, source: ReplyLanguage["source"], fallback = false): ReplyLanguage {
  return {
    code: option.code,
    label: option.label,
    script: option.script,
    dir: option.dir,
    fallback,
    source,
  };
}

export const PICKER_CODES = ["auto", ...LANGUAGE_OPTIONS.map((option) => option.code)];
