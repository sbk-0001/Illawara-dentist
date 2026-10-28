/** The model starts every reply with one of these. The visitor never sees it. */
export type StatusTag = "A" | "N" | "G";

const TAGS = new Set<StatusTag>(["A", "N", "G"]);

export type StatusDrain = {
  visible: string;
  hold: string;
  decided: boolean;
  tag: StatusTag | null;
  missing: boolean;
  /** The tag ended at the end of this buffer, so a following space or newline may arrive later. */
  bare: boolean;
};

const HOLD_LIMIT = 12;

/**
 * Hold text only until the opening status tag closes.
 * Release on the first `]]`, or once 12 characters arrive with no `[[`.
 * A non-tag character is released immediately so the first token is not delayed.
 */
export function drainStatusTag(buffer: string, final: boolean): StatusDrain {
  const miss = (): StatusDrain => ({ visible: buffer, hold: "", decided: true, tag: null, missing: true, bare: false });
  const hold = (): StatusDrain => ({ visible: "", hold: buffer, decided: false, tag: null, missing: false, bare: false });

  const leading = buffer.match(/^\s*/)?.[0] ?? "";
  const rest = buffer.slice(leading.length);

  if (rest.startsWith("[[")) {
    const close = rest.indexOf("]]");
    if (close >= 0) {
      const inner = rest.slice(2, close);
      if (TAGS.has(inner as StatusTag)) {
        const after = rest.slice(close + 2);
        const visible = after.replace(/^[ \t]*\r?\n?/, "");
        return { visible, hold: "", decided: true, tag: inner as StatusTag, missing: false, bare: after.length === 0 };
      }
      return miss();
    }
    if (!final && buffer.length < HOLD_LIMIT) return hold();
    return miss();
  }

  const pendingOpen = rest === "" || rest === "[";
  if (!final && pendingOpen && buffer.length < HOLD_LIMIT) return hold();
  return miss();
}
