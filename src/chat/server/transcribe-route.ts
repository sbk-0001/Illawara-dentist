import { correctTranscript, deepgramListenUrl } from "../stt";
import { guardRequest, withCors } from "./guard";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

type DeepgramListen = {
  results?: {
    channels?: {
      alternatives?: { transcript?: string; languages?: string[] }[];
      detected_language?: string;
    }[];
  };
};

export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request, "transcribe", 8);
  if (blocked) return withCors(request, blocked);
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return withCors(request, Response.json({ error: "DEEPGRAM_API_KEY is not configured." }, { status: 503 }));
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return withCors(request, Response.json({ error: "Expected an audio upload." }, { status: 400 }));
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return withCors(request, Response.json({ error: "Attach an audio file in the audio field." }, { status: 400 }));
  }
  if (audio.size <= 0 || audio.size > MAX_BYTES) {
    return withCors(request, Response.json({ error: "Audio must be under 8 MB." }, { status: 400 }));
  }

  const bytes = await audio.arrayBuffer();
  let upstream: Response;
  try {
    upstream = await fetch(
      deepgramListenUrl("prerecorded"),
      {
        method: "POST",
        headers: {
          Authorization: `Token ${key}`,
          "Content-Type": audio.type || "audio/webm",
        },
        body: bytes,
      },
    );
  } catch {
    return withCors(request, Response.json({ error: "Could not reach Deepgram." }, { status: 502 }));
  }
  if (!upstream.ok) {
    return withCors(request, Response.json({ error: "Transcription failed." }, { status: 502 }));
  }
  const payload = (await upstream.json()) as DeepgramListen;
  const alternative = payload.results?.channels?.[0]?.alternatives?.[0];
  const transcript = correctTranscript(alternative?.transcript?.trim() || "");
  const language = alternative?.languages?.[0] || payload.results?.channels?.[0]?.detected_language || "";
  return withCors(request, Response.json({ transcript, language }));
}

export function OPTIONS(request: Request): Response {
  const blocked = guardRequest(request, "transcribe-opt", 60);
  if (blocked) return withCors(request, blocked);
  return withCors(request, new Response(null, { status: 204 }));
}
