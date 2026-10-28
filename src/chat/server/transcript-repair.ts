import { transcribe } from "ai";
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
