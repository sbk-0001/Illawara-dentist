import { generateText, transcribe } from "ai";
import { hasNativeScript, languageFromNativeScript, normalizeSpokenLanguage, requiresNativeScript } from "../stt";

/**
 * Second pass when Nova-3 names a non-Latin language but returns Latin text.
 * AI Gateway model id. Language is OpenAI's ISO-639-1 hint:
 * https://ai-sdk.dev/providers/ai-sdk-providers/openai
 * (`providerOptions.openai.language` on `transcribe`).
 */
export const TRANSCRIPT_REPAIR_MODEL = "openai/gpt-4o-mini-transcribe";
export const TRANSCRIPT_FULL_MODEL = "openai/gpt-4o-transcribe";
export const TRANSCRIPT_REPAIR_TIMEOUT_MS = 2_000;
export const TRANSCRIPT_FULL_TIMEOUT_MS = 2_500;
/** Malayalam and Tamil passes share this cap and run together. */
export const INDIC_PAIR_TIMEOUT_MS = 2_200;
/** Script conversion after the pair. Together they stay under the 4s voice budget. */
export const SCRIPT_CONVERT_TIMEOUT_MS = 600;
export const SCRIPT_CONVERT_MODEL = "openai/gpt-4o-mini";

export function indicVoiceBudgetMs(): number {
  return INDIC_PAIR_TIMEOUT_MS + SCRIPT_CONVERT_TIMEOUT_MS;
}

/** A full-model pass that came back short is not run again. A second 2.5s call is what pushed a Tamil clip past 4s. */
export function shouldRetryShortTranscript(model: string): boolean {
  return model !== TRANSCRIPT_FULL_MODEL;
}

/** Both language passes start before either one finishes. */
export async function transcribeLanguagePair<T>(run: (language: "ml" | "ta") => Promise<T>): Promise<[T, T]> {
  return Promise.all([run("ml"), run("ta")]) as Promise<[T, T]>;
}

type RepairCall = (input: {
  model: string;
  audio: Uint8Array;
  maxRetries: number;
  abortSignal: AbortSignal;
  providerOptions: { openai: { language?: string } };
}) => Promise<{ text?: string }>;

/**
 * Second pass on the full audio. A Bengali interim passes `language: "bn"`.
 * Auto with no Bengali interim omits the language. Timeout stays under 3s.
 * Latin-only results are discarded.
 */
export async function repairNativeTranscript(input: {
  audio: Uint8Array;
  language?: string;
  model?: string;
  timeoutMs?: number;
  /** Unconstrained pass: keep English or any other script the model returns. */
  acceptAny?: boolean;
  transcribe?: RepairCall;
}): Promise<string | null> {
  const language = normalizeSpokenLanguage(input.language);
  if (input.language?.trim() && (!language || !requiresNativeScript(language))) return null;
  const run = input.transcribe ?? ((args) => transcribe(args));
  const model = input.model || TRANSCRIPT_REPAIR_MODEL;
  try {
    const result = await run({
      model,
      audio: input.audio,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(input.timeoutMs ?? TRANSCRIPT_REPAIR_TIMEOUT_MS),
      providerOptions: { openai: language ? { language } : {} },
    });
    const text = result.text?.trim() || "";
    if (!text) return null;
    if (language) {
      if (!hasNativeScript(language, text) && !languageFromNativeScript(text)) return null;
      return text;
    }
    if (input.acceptAny) return /\p{L}/u.test(text) ? text : null;
    if (!languageFromNativeScript(text)) return null;
    return text;
  } catch {
    return null;
  }
}

const SCRIPT_NAME: Record<string, string> = {
  ml: "Malayalam",
  ta: "Tamil",
  bn: "Bengali",
  hi: "Hindi",
  ar: "Arabic",
  zh: "Chinese",
};

/**
 * A picker or judge chose the language, but the transcript is Sinhala, Cyrillic,
 * Tamil letters, or Latin. Rewrite it into that language's script. Clinic names stay Latin.
 */
export async function transliterateToNativeScript(input: {
  text: string;
  language: string;
  timeoutMs?: number;
  generate?: (prompt: string, signal: AbortSignal) => Promise<string | null>;
}): Promise<string | null> {
  const language = normalizeSpokenLanguage(input.language);
  const text = input.text.trim();
  if (!language || !text || !requiresNativeScript(language)) return null;
  if (hasNativeScript(language, text) && languageFromNativeScript(text) === language) return text;
  const script = SCRIPT_NAME[language] || language;
  const prompt = `Rewrite this speech transcript in ${script} script only. Keep the clinic names Dapto, Shellharbour and Woonona in Latin. Output only the transcript.\n\n${text}`;
  const run =
    input.generate ??
    (async (body: string, signal: AbortSignal) => {
      const result = await generateText({ model: SCRIPT_CONVERT_MODEL, prompt: body, maxRetries: 0, abortSignal: signal });
      return result.text?.trim() || null;
    });
  try {
    const converted = (await run(prompt, AbortSignal.timeout(input.timeoutMs ?? SCRIPT_CONVERT_TIMEOUT_MS)))?.trim() || "";
    if (converted && hasNativeScript(language, converted)) return converted;
    return null;
  } catch {
    return null;
  }
}
