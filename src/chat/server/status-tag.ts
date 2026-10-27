/** The model starts every reply with one of these. The visitor never sees it. */
export type StatusTag = "A" | "N" | "G";

const TAGS = ["[[A]]", "[[N]]", "[[G]]"] as const;

export type StatusDrain = {
  visible: string;
  hold: string;
  decided: boolean;
  tag: StatusTag | null;
  missing: boolean;
  /** The tag ended at the end of this buffer, so a following space or newline may arrive later. */
  bare: boolean;
};

/**
 * Hold text until the opening status tag is closed. A prefix of [[A]], [[N]] or [[G]]
 * is not released, so the tag cannot flash. Anything else is a missing tag.
 */
export function drainStatusTag(buffer: string, final: boolean): StatusDrain {
  const leading = buffer.match(/^\s*/)?.[0] ?? "";
  const rest = buffer.slice(leading.length);
  for (const tag of TAGS) {
    if (!rest.startsWith(tag)) continue;
    const after = rest.slice(tag.length);
    const visible = after.replace(/^[ \t]*\r?\n?/, "");
    return { visible, hold: "", decided: true, tag: tag[2] as StatusTag, missing: false, bare: after.length === 0 };
  }
  const pending = TAGS.some((tag) => tag.startsWith(rest));
  const waitingOnSpace = rest.length === 0 && leading.length <= 8;
  if (!final && buffer.length <= 16 && (pending || waitingOnSpace)) {
    return { visible: "", hold: buffer, decided: false, tag: null, missing: false, bare: false };
  }
  return { visible: buffer, hold: "", decided: true, tag: null, missing: true, bare: false };
}
