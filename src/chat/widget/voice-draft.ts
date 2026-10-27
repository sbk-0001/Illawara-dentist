export type VoiceDraft = {
  transcript: string;
  spokenLanguage: string;
  liveDrop: string;
};

function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Share of characters that would have to change. 1 means a different utterance. */
function editRatio(bound: string, edited: string): number {
  const max = Math.max(bound.length, edited.length);
  if (max === 0) return 0;
  if (Math.abs(bound.length - edited.length) / max > 0.35) return 1;
  const rows = new Array<number>(edited.length + 1);
  for (let column = 0; column <= edited.length; column += 1) rows[column] = column;
  for (let row = 1; row <= bound.length; row += 1) {
    let previous = rows[0] ?? 0;
    rows[0] = row;
    for (let column = 1; column <= edited.length; column += 1) {
      const current = rows[column] ?? 0;
      const cost = bound[row - 1] === edited[column - 1] ? 0 : 1;
      const insert = (rows[column - 1] ?? 0) + 1;
      const remove = current + 1;
      rows[column] = Math.min(insert, remove, previous + cost);
      previous = current;
    }
  }
  return (rows[edited.length] ?? max) / max;
}

/**
 * The voice language stays with the transcript until send.
 * A small correction keeps it. A fresh sentence or an empty box does not.
 */
export function voiceDraftStillApplies(draft: Pick<VoiceDraft, "transcript">, text: string): boolean {
  const bound = normalize(draft.transcript);
  const edited = normalize(text);
  if (!bound || !edited) return false;
  return editRatio(bound, edited) <= 0.35;
}
