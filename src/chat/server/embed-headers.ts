import { parseAllowlist } from "./guard";

/**
 * Preview hosts for RidwanKhalid/illawarra-dentists-website are a single label
 * under vercel.app, for example
 * illawarra-dentists-website-git-branch-team.vercel.app.
 * CSP host wildcards have to be a whole label, so frame-ancestors uses
 * https://*.vercel.app for those previews.
 */
export const PROJECT_PREVIEW_SOURCE = "https://*.vercel.app";

/** Always allowed to frame /embed, even when CHAT_ALLOWED_ORIGINS is empty. */
export const BUILT_IN_FRAME_ANCESTORS = [
  "https://daptodentists.com.au",
  "https://shellharbourdentist.com.au",
  "https://woononadentists.com.au",
  "http://localhost:*",
  "https://localhost:*",
  "http://127.0.0.1:*",
  "https://127.0.0.1:*",
  "https://illawarra-dentists-website-git-faq-chat-embed-strategybyte.vercel.app",
];

const PREVIEW_HOST = /^illawarra-dentists-website(?:-[a-z0-9-]+)?\.vercel\.app$/i;

export function isEmbedPath(pathname: string): boolean {
  return pathname === "/embed" || pathname.startsWith("/embed/");
}

/** True for this Astro site's production and preview hosts on vercel.app. */
export function isIllawarraWebsitePreview(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && PREVIEW_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

function isOriginSource(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.pathname !== "/" && url.pathname !== "") return false;
    if (url.hostname.includes("*")) return false;
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Framing policy for one response. Only /embed can be framed, and only by
 * CHAT_ALLOWED_ORIGINS plus this project's vercel.app previews.
 * Every other path refuses to be framed. The chat API stays on this host;
 * the parent page does not call it.
 */
export function contentSecurityPolicy(pathname: string, allowlist: string | undefined, ancestor: string | null = null): string {
  if (!isEmbedPath(pathname)) return "frame-ancestors 'none'";
  const sources = ["'self'", ...BUILT_IN_FRAME_ANCESTORS];
  for (const origin of parseAllowlist(allowlist)) {
    if (isOriginSource(origin) && !sources.includes(origin)) sources.push(origin);
  }
  if (ancestor && isIllawarraWebsitePreview(ancestor) && !sources.includes(ancestor)) sources.push(ancestor);
  sources.push(PROJECT_PREVIEW_SOURCE);
  return `frame-ancestors ${sources.join(" ")}`;
}
