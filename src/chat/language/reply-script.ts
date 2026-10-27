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
