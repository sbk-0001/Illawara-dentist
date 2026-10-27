import { transcribe } from "ai";
import { hasNativeScript, normalizeSpokenLanguage, requiresNativeScript } from "../stt";

/**
 * Second pass when Nova-3 names a non-Latin language but returns Latin text.
 * AI Gateway model id. Language is OpenAI's ISO-639-1 hint:
 * https://ai-sdk.dev/providers/ai-sdk-providers/openai
 * (`providerOptions.openai.language` on `transcribe`).
 */
export const TRANSCRIPT_REPAIR_MODEL = "openai/gpt-4o-mini-transcribe";
export const TRANSCRIPT_REPAIR_TIMEOUT_MS = 2_000;

type RepairCall = (input: {
  model: string;
  audio: Uint8Array;
  maxRetries: number;
  abortSignal: AbortSignal;
  providerOptions: { openai: { language: string } };
}) => Promise<{ text?: string }>;

/** Use the repaired text only when it contains the spoken script. A Latin clinic name may remain. Timeout and errors keep the original. */
export async function repairNativeTranscript(input: {
  audio: Uint8Array;
  language: string;
  timeoutMs?: number;
  transcribe?: RepairCall;
}): Promise<string | null> {
  const language = normalizeSpokenLanguage(input.language);
  if (!language || !requiresNativeScript(language)) return null;
  const run = input.transcribe ?? ((args) => transcribe(args));
  try {
    const result = await run({
      model: TRANSCRIPT_REPAIR_MODEL,
      audio: input.audio,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(input.timeoutMs ?? TRANSCRIPT_REPAIR_TIMEOUT_MS),
      providerOptions: { openai: { language } },
    });
    const text = result.text?.trim() || "";
    if (!text || !hasNativeScript(language, text)) return null;
    return text;
  } catch {
    return null;
  }
}
