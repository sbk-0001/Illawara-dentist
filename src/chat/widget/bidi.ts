export type TextPart = { kind: "text"; value: string } | { kind: "isolate"; value: string };

const EMBEDDED =
  /(?:\+?\d(?:[\s().-]*\d){7,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/[^\s<>"']+)/gi;

/** Split phones, emails and URLs out so an RTL paragraph cannot reverse them. */
export function splitIsolatedEmbeds(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(EMBEDDED)) {
    const index = match.index ?? 0;
    const value = match[0] ?? "";
    if (!value) continue;
    if (index > last) parts.push({ kind: "text", value: text.slice(last, index) });
    parts.push({ kind: "isolate", value });
    last = index + value.length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  if (!parts.length) parts.push({ kind: "text", value: text });
  return parts;
}
