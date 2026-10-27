import { mentionedClinics } from "./intent";

/**
 * Deepgram Nova-3 keyterm prompting.
 * https://developers.deepgram.com/docs/keyterm
 * Keyterms work with multilingual Nova-3 (`model=nova-3&language=multi`), pre-recorded and streaming.
 * Repeat `keyterm` once per phrase. Do not use the Nova-2 `keywords=term:weight` syntax.
 * `language=multi` stays on so code-switching and language detection are unchanged.
 */
export const STT_KEYTERMS = ["Dapto", "Woonona", "Shellharbour", "Illawarra", "Invisalign", "Barrack Heights", "Zavy"] as const;

export function deepgramListenQuery(options?: { interim?: boolean; endpointing?: boolean }): string {
  const params = new URLSearchParams();
  params.set("model", "nova-3");
  params.set("language", "multi");
  params.set("smart_format", "true");
  params.set("punctuate", "true");
  if (options?.interim) params.set("interim_results", "true");
  if (options?.endpointing) params.set("endpointing", "400");
  for (const term of STT_KEYTERMS) params.append("keyterm", term);
  return params.toString();
}

export function deepgramListenUrl(kind: "stream" | "prerecorded"): string {
  const query =
    kind === "stream" ? deepgramListenQuery({ interim: true, endpointing: true }) : deepgramListenQuery();
  const base = kind === "stream" ? "wss://api.deepgram.com/v1/listen" : "https://api.deepgram.com/v1/listen";
  return `${base}?${query}`;
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
