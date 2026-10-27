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
 * The finished text is in the wrong script for a native-script reply.
 * A phone number or a short clinic name is not enough Latin to count.
 */
export function replyScriptConflicts(text: string, code: string): boolean {
  const nativeRe = NATIVE_REPLY[code];
  if (!nativeRe) return false;
  const native = text.match(nativeRe)?.length ?? 0;
  if (native >= 4) return false;
  const latin = text.match(/[A-Za-z\u00C0-\u024F]/g)?.length ?? 0;
  return latin >= 24;
}

/** Whether a native-script reply can be shown, must wait, or must be regenerated. */
export function replyScriptGate(text: string, code: string): "release" | "wait" | "conflict" {
  if (!NATIVE_REPLY[code]) return "release";
  if (replyScriptConflicts(text, code)) return "conflict";
  const native = text.match(NATIVE_REPLY[code])?.length ?? 0;
  return native >= 4 ? "release" : "wait";
}
