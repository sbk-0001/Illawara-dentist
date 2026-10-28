import { experimental_transcribe } from "ai";
import { confidentLatinLanguage, detectLanguage } from "../language/detect";
import { latinManglish, malayalamMarkersWin } from "../language/indic";
import { needsServerFinalTranscript, normalizeSpokenLanguage } from "../stt";

/**
 * Bake-off winner for Bengali, Hindi, and Tamil, and the first pass on Auto.
 * The AI SDK sends this id to the gateway transcription endpoint
 * (`POST /v4/ai/transcription-model`, `ai-model-id`, specification version 4).
 * `openai/gpt-transcribe` is not in the generated model union, but that union
 * accepts any string and the gateway routes it.
 */
export const GPT_TRANSCRIBE_MODEL = "openai/gpt-transcribe";

/** Malayalam rescuer only. Never the primary engine for Tamil, Hindi, or Bengali. */
export const GEMINI_RESCUE_MODEL = "google/gemini-2.5-flash";

export const GPT_TRANSCRIBE_TIMEOUT_MS = 2_500;
export const GEMINI_RESCUE_TIMEOUT_MS = 3_000;

const GATEWAY_CHAT = "https://ai-gateway.vercel.sh/v1/chat/completions";

/** The prompt from the bake-off. Malayalam picker appends a language hint. */
export const STT_CLINIC_PROMPT =
  "Dental clinic callers. Spell clinic names exactly as Dapto, Woonona, or Shellharbour. Dapto is not doctor, dokter, ഡോക്ടർ, ডাক্তার, or डॉक्टर. Terms: dentist, implant, Invisalign, whitening, appointment, toothache, cleaning.";

export const GEMINI_STT_PROMPT =
  'Identify the spoken language of this audio and transcribe it. Return ONLY JSON {"lang": one of "en","zh","ml","ta","hi","ar","es","bn","other", "transcript": the words in that language\'s native script (Malayalam script for ml, Tamil script for ta, Devanagari for hi, Bengali script for bn)}. ' +
  "Context: callers ask a dental clinic chatbot about Dapto, Woonona or Shellharbour clinics; keep those clinic names in Latin script. Dapto is a place name, not the word for doctor. Malayalam and Tamil are different languages: decide by vocabulary/grammar (e.g. Malayalam -ന്റെ, എന്താണ്, ഉണ്ട്; Tamil -இன், என்ன, இருக்கு), not by accent.";

export function geminiSttPrompt(hint: "ml" | null): string {
  if (hint !== "ml") return GEMINI_STT_PROMPT;
  return `${GEMINI_STT_PROMPT} The caller selected Malayalam. Set lang to "ml" and write the transcript in Malayalam script.`;
}

const TIER1_LETTER =
  /^(?:\p{Script=Latin}|\p{Script=Han}|\p{Script=Malayalam}|\p{Script=Tamil}|\p{Script=Devanagari}|\p{Script=Arabic}|\p{Script=Bengali})$/u;

export type TranscriptAnomaly = "empty" | "foreign-script" | "assamese" | "tamil-markers" | "manglish";

export type SttEngine = "deepgram" | "gpt-transcribe" | "gemini";

export type FinalTranscript = {
  transcript: string;
  language: string;
  sttEngine: SttEngine;
  sttFallback: boolean;
};

function countScript(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function foreignLetterCount(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    if (/\p{Script=Common}|\p{Script=Inherited}/u.test(ch)) continue;
    if (!TIER1_LETTER.test(ch)) count += 1;
  }
  return count;
}

/**
 * gpt-transcribe on Malayalam audio sometimes returns another script.
 * Sinhala, Thaana, Kannada, Telugu, and Gujarati are outside the eight
 * tier-1 scripts. Assamese ৰ/ৱ inside Bengali, Tamil letters with Malayalam
 * markers, Manglish, and an empty string are the other misses.
 */
export function transcriptAnomaly(text: string): TranscriptAnomaly | null {
  const value = text.trim();
  if (!value) return "empty";
  if (/çelevakum|chelavakum|chelevakum|\bethra\b|endaan/i.test(value)) return "manglish";
  if (foreignLetterCount(value) > 0) return "foreign-script";
  if (/[ৰৱ]/.test(value)) return "assamese";
  const tamil = countScript(value, /[\u0B80-\u0BFF]/g);
  const malayalam = countScript(value, /[\u0D00-\u0D7F]/g);
  if (tamil > 0 && tamil >= malayalam && malayalamMarkersWin(value)) return "tamil-markers";
  const latin = countScript(value, /[A-Za-z\u00C0-\u024F]/g);
  const native =
    countScript(value, /[\u0980-\u09FF]/g) +
    countScript(value, /[\u0900-\u097F]/g) +
    tamil +
    malayalam +
    countScript(value, /[\u0600-\u06FF]/g) +
    countScript(value, /[\u4E00-\u9FFF]/g);
  if (latin > native && (malayalamMarkersWin(value) || /inde\b/i.test(value) || detectLanguage(value).code === "ml-Latn")) return "manglish";
  return null;
}

/** bn, hi, ta, or ml when the text is in that script and is not an anomaly. */
export function cleanIndicLanguage(text: string): "bn" | "hi" | "ta" | "ml" | null {
  if (transcriptAnomaly(text)) return null;
  const scores: { code: "bn" | "hi" | "ta" | "ml"; count: number }[] = [
    { code: "bn", count: countScript(text, /[\u0980-\u09FF]/g) },
    { code: "hi", count: countScript(text, /[\u0900-\u097F]/g) },
    { code: "ta", count: countScript(text, /[\u0B80-\u0BFF]/g) },
    { code: "ml", count: countScript(text, /[\u0D00-\u0D7F]/g) },
  ];
  scores.sort((a, b) => b.count - a.count);
  const best = scores[0];
  if (!best || best.count < 2) return null;
  return best.code;
}

export type GeminiStt = { lang: string; transcript: string };

type GptCall = (language?: string) => Promise<string>;
type GeminiCall = (hint: "ml" | null, signal: AbortSignal) => Promise<GeminiStt | null>;

function withTimeout(ms: number, parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!parent) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([parent, timeout]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function mediaTypeOf(value: string): string {
  const base = value.split(";")[0]?.trim().toLowerCase() || "";
  return base.startsWith("audio/") ? base : "audio/webm";
}

export function parseGeminiStt(body: string): GeminiStt | null {
  const match = body.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { lang?: unknown; transcript?: unknown };
    const lang = typeof parsed.lang === "string" ? parsed.lang.trim().toLowerCase() : "";
    const transcript = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    if (!lang || !transcript) return null;
    return { lang, transcript };
  } catch {
    return null;
  }
}

/** OpenAI transcription `prompt`. The gateway forwards `providerOptions.openai`. */
export function openAiTranscribeProviderOptions(language?: string): { openai: { language?: string; prompt: string } } {
  return { openai: { ...(language ? { language } : {}), prompt: STT_CLINIC_PROMPT } };
}

async function defaultGpt(audio: Uint8Array, language: string | undefined, signal: AbortSignal): Promise<string> {
  const options = openAiTranscribeProviderOptions(language);
  console.log(JSON.stringify({ event: "transcribe-prompt", model: GPT_TRANSCRIBE_MODEL, language: language || null, prompt: options.openai.prompt }));
  const result = await experimental_transcribe({
    model: GPT_TRANSCRIBE_MODEL,
    audio,
    maxRetries: 0,
    abortSignal: signal,
    providerOptions: options,
  });
  return result.text?.trim() || "";
}

async function defaultGemini(audio: Uint8Array, mediaType: string, hint: "ml" | null, signal: AbortSignal): Promise<GeminiStt | null> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return null;
  const type = mediaTypeOf(mediaType);
  const bytes = Buffer.from(audio).toString("base64");
  const response = await fetch(GATEWAY_CHAT, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_RESCUE_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: geminiSttPrompt(hint) },
            { type: "file", file: { filename: `speech.${type.split("/")[1] || "webm"}`, file_data: `data:${type};base64,${bytes}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content || "";
  return parseGeminiStt(content);
}

function malayalamRescue(value: GeminiStt | null): string {
  if (!value || value.lang !== "ml") return "";
  return value.transcript.trim();
}

/** First non-empty transcript. Gemini Malayalam, then gpt-transcribe, then Deepgram. */
export function firstTranscript(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Auto: gpt-transcribe first. Gemini 2.5 Flash (no thinking) starts in parallel
 * and is awaited only when the gpt transcript is an anomaly, and only if it says Malayalam.
 * Otherwise the existing Malayalam/Tamil judge decides.
 * Picker ml: Gemini is primary and gpt-transcribe language=ml is the timeout fallback.
 * Picker ta/hi/bn: gpt-transcribe with that language.
 */
/**
 * The transcribe route's fused decision for one Deepgram final.
 * A confident English final still enters the fuse when the words are Manglish.
 * Returns `fused: false` only when Deepgram's text is kept as-is.
 */
export async function resolveFusedLiveFinal(input: {
  liveTranscript: string;
  picker?: string | null;
  audio?: Uint8Array;
  mediaType?: string;
  signal?: AbortSignal;
  gpt?: GptCall;
  gemini?: GeminiCall;
}): Promise<{ fused: boolean } & FinalTranscript> {
  const picker = input.picker ?? null;
  if (!needsServerFinalTranscript(input.liveTranscript, picker)) {
    const latin = confidentLatinLanguage(input.liveTranscript);
    return {
      fused: false,
      transcript: input.liveTranscript,
      language: latin === "es" ? "es" : "en",
      sttEngine: "deepgram",
      sttFallback: false,
    };
  }
  const result = await resolveFinalTranscript({
    audio: input.audio ?? new Uint8Array(),
    mediaType: input.mediaType,
    picker,
    deepgram: input.liveTranscript,
    signal: input.signal,
    gpt: input.gpt,
    gemini: input.gemini,
  });
  return { fused: true, ...result };
}

export async function resolveFinalTranscript(input: {
  audio: Uint8Array;
  mediaType?: string;
  picker?: string | null;
  deepgram?: string;
  signal?: AbortSignal;
  gpt?: GptCall;
  gemini?: GeminiCall;
}): Promise<FinalTranscript> {
  const picked = normalizeSpokenLanguage(input.picker);
  const deepgram = input.deepgram || "";
  const gpt: GptCall =
    input.gpt ??
    ((language) => defaultGpt(input.audio, language, withTimeout(GPT_TRANSCRIBE_TIMEOUT_MS, input.signal)));
  const gemini: GeminiCall =
    input.gemini ??
    ((hint, signal) => defaultGemini(input.audio, input.mediaType || "audio/webm", hint, signal));

  if (picked === "ml") return resolvePickerMalayalam(deepgram, gpt, gemini);
  if (picked === "ta" || picked === "hi" || picked === "bn") return resolvePickerLanguage(picked, deepgram, gpt);
  return resolveAuto(deepgram, gpt, gemini);
}

async function resolvePickerLanguage(language: "ta" | "hi" | "bn", deepgram: string, gpt: GptCall): Promise<FinalTranscript> {
  let text = "";
  try {
    text = (await gpt(language)).trim();
  } catch {
    text = "";
  }
  if (text) return { transcript: text, language, sttEngine: "gpt-transcribe", sttFallback: false };
  return { transcript: deepgram.trim(), language, sttEngine: "deepgram", sttFallback: true };
}

async function resolvePickerMalayalam(deepgram: string, gpt: GptCall, gemini: GeminiCall): Promise<FinalTranscript> {
  const gptTask = gpt("ml").then((value) => value.trim()).catch(() => "");
  const geminiTask = gemini("ml", withTimeout(GEMINI_RESCUE_TIMEOUT_MS)).catch(() => null);
  const rescued = await geminiTask;
  const rescuedText = malayalamRescue(rescued);
  if (rescuedText) {
    return { transcript: rescuedText, language: "ml", sttEngine: "gemini", sttFallback: false };
  }
  const text = (await gptTask).trim();
  if (text) return { transcript: text, language: "ml", sttEngine: "gpt-transcribe", sttFallback: true };
  return { transcript: deepgram.trim(), language: "ml", sttEngine: "deepgram", sttFallback: true };
}

async function resolveAuto(deepgram: string, gpt: GptCall, gemini: GeminiCall): Promise<FinalTranscript> {
  const rescue = new AbortController();
  const geminiTask = gemini(null, withTimeout(GEMINI_RESCUE_TIMEOUT_MS, rescue.signal)).catch(() => null);
  let gptText = "";
  try {
    gptText = (await gpt(undefined)).trim();
  } catch {
    gptText = "";
  }
  const clean = cleanIndicLanguage(gptText);
  if (clean) {
    rescue.abort();
    return { transcript: gptText, language: clean, sttEngine: "gpt-transcribe", sttFallback: false };
  }
  const deepgramManglish = latinManglish(deepgram) || transcriptAnomaly(deepgram) === "manglish";
  if (gptText && !transcriptAnomaly(gptText) && !deepgramManglish) {
    rescue.abort();
    const latin = detectLanguage(gptText);
    const language = latin.code === "es" ? "es" : latin.code === "zh" ? "zh" : latin.code === "ar" ? "ar" : "en";
    return { transcript: gptText, language, sttEngine: "gpt-transcribe", sttFallback: false };
  }
  const rescued = await geminiTask;
  const rescuedText = malayalamRescue(rescued);
  const transcript = firstTranscript(rescuedText, gptText, deepgram);
  if (rescuedText) {
    return { transcript: rescuedText, language: "ml", sttEngine: "gemini", sttFallback: true };
  }
  if (transcript) {
    const manglish = deepgramManglish || latinManglish(transcript);
    const markers = malayalamMarkersWin(transcript) || transcriptAnomaly(gptText) === "tamil-markers" || transcriptAnomaly(deepgram) === "tamil-markers";
    return {
      transcript,
      language: manglish || markers ? "ml" : "",
      sttEngine: gptText.trim() ? "gpt-transcribe" : "deepgram",
      sttFallback: true,
    };
  }
  return { transcript: "", language: "", sttEngine: "deepgram", sttFallback: true };
}
