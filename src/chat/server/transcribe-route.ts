import { alternativeFromLiveResult, correctTranscript, deepgramLanguageHints, deepgramListenUrl, languageAfterRepair, majoritySpokenLanguage, normalizeSpokenLanguage, repairLanguageForTranscript, repairModelFor, spokenLanguageAfterSecondPass, spokenLanguageForTranscript, transcriptNeedsRepair, votesFromAlternative, type DeepgramAlternative } from "../stt";
import { guardRequest, withCors } from "./guard";
import { TRANSCRIPT_FULL_MODEL, TRANSCRIPT_FULL_TIMEOUT_MS, repairNativeTranscript } from "./transcript-repair";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

type DeepgramListen = {
  results?: {
    channels?: {
      alternatives?: DeepgramAlternative[];
      detected_language?: unknown;
      languages?: unknown[];
    }[];
  };
};

function cleanLiveDrop(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  return cleaned || undefined;
}

function logTranscribe(line: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: "transcribe", ...line }));
}

export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request, "transcribe", 8);
  if (blocked) return withCors(request, blocked);
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    logTranscribe({ outcome: "error", error: "not_configured" });
    return withCors(request, Response.json({ error: "DEEPGRAM_API_KEY is not configured." }, { status: 503 }));
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    logTranscribe({ outcome: "error", error: "expected_audio" });
    return withCors(request, Response.json({ error: "Expected an audio upload." }, { status: 400 }));
  }
  const liveDrop = cleanLiveDrop(form.get("liveDrop"));
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    logTranscribe({ outcome: "error", error: "missing_audio", ...(liveDrop ? { liveDrop } : {}) });
    return withCors(request, Response.json({ error: "Attach an audio file in the audio field." }, { status: 400 }));
  }
  if (audio.size <= 0 || audio.size > MAX_BYTES) {
    logTranscribe({ outcome: "error", error: "audio_size", ...(liveDrop ? { liveDrop } : {}) });
    return withCors(request, Response.json({ error: "Audio must be under 8 MB." }, { status: 400 }));
  }

  const hint = typeof form.get("languageHint") === "string" ? String(form.get("languageHint")) : "";
  const hints = deepgramLanguageHints(hint);
  const requestedRepair = normalizeSpokenLanguage(typeof form.get("repairLanguage") === "string" ? String(form.get("repairLanguage")) : "");
  const garbled = form.get("garbled") === "1" || form.get("direct") === "1" || form.get("repairOnly") === "1";
  const bytes = await audio.arrayBuffer();
  if (garbled) {
    if (!process.env.AI_GATEWAY_API_KEY) {
      logTranscribe({ outcome: "error", error: "repair_unconfigured", ...(liveDrop ? { liveDrop } : {}) });
      return withCors(request, Response.json({ error: "Could not transcribe that." }, { status: 503 }));
    }
    const model = repairModelFor(requestedRepair, "");
    const next = await repairNativeTranscript({
      audio: new Uint8Array(bytes),
      ...(requestedRepair ? { language: requestedRepair } : {}),
      model,
      timeoutMs: model === TRANSCRIPT_FULL_MODEL ? TRANSCRIPT_FULL_TIMEOUT_MS : undefined,
    });
    if (!next) {
      logTranscribe({ outcome: "error", error: "repair_empty", repairLanguage: requestedRepair, ...(liveDrop ? { liveDrop } : {}) });
      return withCors(request, Response.json({ error: "Could not transcribe that." }, { status: 502 }));
    }
    const transcript = correctTranscript(next);
    const detected = spokenLanguageAfterSecondPass(transcript, hint);
    logTranscribe({ outcome: "ok", language: detected, repaired: true, repairLanguage: requestedRepair, ...(liveDrop ? { liveDrop } : {}) });
    return withCors(request, Response.json({ transcript, language: detected }));
  }
  let upstream: Response;
  try {
    upstream = await fetch(deepgramListenUrl("prerecorded", hint), {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: bytes,
    });
  } catch (error) {
    logTranscribe({
      outcome: "error",
      error: error instanceof Error ? error.name : "Error",
      ...(liveDrop ? { liveDrop } : {}),
    });
    return withCors(request, Response.json({ error: "Could not reach Deepgram." }, { status: 502 }));
  }
  if (!upstream.ok) {
    logTranscribe({ outcome: "error", error: "upstream", status: upstream.status, ...(liveDrop ? { liveDrop } : {}) });
    return withCors(request, Response.json({ error: "Transcription failed." }, { status: 502 }));
  }
  const payload = (await upstream.json()) as DeepgramListen;
  const channel = payload.results?.channels?.[0];
  const alternative = alternativeFromLiveResult({
    alternative: channel?.alternatives?.[0],
    detectedLanguage: channel?.detected_language,
    channelLanguages: channel?.languages,
  });
  let transcript = correctTranscript(alternative.transcript?.trim() || "");
  const heard = majoritySpokenLanguage(votesFromAlternative(alternative)) || "";
  let detected = repairLanguageForTranscript(heard, transcript, hint) || spokenLanguageForTranscript(heard, transcript, hint) || heard;
  let repaired = false;
  if (transcript && transcriptNeedsRepair(detected, transcript, hint) && process.env.AI_GATEWAY_API_KEY) {
    const model = repairModelFor(detected, transcript);
    const next = await repairNativeTranscript({
      audio: new Uint8Array(bytes),
      language: detected,
      model,
      timeoutMs: model === TRANSCRIPT_FULL_MODEL ? TRANSCRIPT_FULL_TIMEOUT_MS : undefined,
    });
    if (next) {
      transcript = correctTranscript(next);
      detected = languageAfterRepair(detected, transcript, hint) || detected;
      repaired = true;
    } else {
      logTranscribe({
        outcome: "repair_skipped",
        language: detected,
        ...(liveDrop ? { liveDrop } : {}),
      });
    }
  }
  if (!transcript) {
    logTranscribe({ outcome: "error", error: "empty", language: detected, ...(liveDrop ? { liveDrop } : {}) });
    return withCors(request, Response.json({ error: "Transcription failed." }, { status: 502 }));
  }
  logTranscribe({
    outcome: "ok",
    language: detected,
    repaired,
    hints,
    ...(liveDrop ? { liveDrop } : {}),
  });
  return withCors(request, Response.json({ transcript, language: detected }));
}

export function OPTIONS(request: Request): Response {
  const blocked = guardRequest(request, "transcribe-opt", 60);
  if (blocked) return withCors(request, blocked);
  return withCors(request, new Response(null, { status: 204 }));
}
