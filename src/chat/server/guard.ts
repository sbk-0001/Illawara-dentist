const hits = new Map<string, number[]>();

export function resetRateLimits(): void {
  hits.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local";
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function originAllowed(origin: string | null, host: string | null, allowlist: string[]): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const hostname = url.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (host && (hostname === host.split(":")[0] || origin === `https://${host}` || origin === `http://${host}`)) return true;
  const normalised = origin.replace(/\/$/, "");
  return allowlist.some((allowed) => allowed === normalised);
}

export function takeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function guardRequest(request: Request, bucket: string, limit: number): Response | null {
  const allowlist = parseAllowlist(process.env.CHAT_ALLOWED_ORIGINS);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!originAllowed(origin, host, allowlist)) {
    return Response.json({ error: "This origin is not allowed to use the chat API." }, { status: 403 });
  }
  const ip = clientIp(request);
  if (!takeRateLimit(`${bucket}:${ip}`, limit, 60_000)) {
    return Response.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }
  return null;
}

export function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const allowlist = parseAllowlist(process.env.CHAT_ALLOWED_ORIGINS);
  if (!origin || !originAllowed(origin, host, allowlist)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
