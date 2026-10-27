import { guardRequest, withCors } from "./guard";

export const runtime = "nodejs";

const GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request, "stt", 12);
  if (blocked) return withCors(request, blocked);
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return withCors(request, Response.json({ error: "DEEPGRAM_API_KEY is not configured." }, { status: 503 }));
  }

  let upstream: Response;
  try {
    upstream = await fetch(GRANT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });
  } catch {
    return withCors(request, Response.json({ error: "Could not reach Deepgram." }, { status: 502 }));
  }

  if (!upstream.ok) {
    return withCors(request, Response.json({ error: "Could not mint a speech token." }, { status: 502 }));
  }
  const payload = (await upstream.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    return withCors(request, Response.json({ error: "Deepgram did not return a token." }, { status: 502 }));
  }
  return withCors(
    request,
    Response.json({ access_token: payload.access_token, expires_in: payload.expires_in ?? 60 }),
  );
}

export function OPTIONS(request: Request): Response {
  const blocked = guardRequest(request, "stt-opt", 60);
  if (blocked) return withCors(request, blocked);
  return withCors(request, new Response(null, { status: 204 }));
}
