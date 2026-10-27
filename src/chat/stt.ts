/**
 * Deepgram Nova-3 keyterm prompting.
 * https://developers.deepgram.com/docs/keyterm
 * Keyterms work with multilingual Nova-3 (`model=nova-3&language=multi`), pre-recorded and streaming.
 * Repeat `keyterm` once per phrase. Do not use the Nova-2 `keywords=term:weight` syntax.
 * `language=multi` stays on so code-switching and language detection are unchanged.
 */
export const STT_KEYTERMS = ["Dapto", "Woonona", "Shellharbour", "Illawarra", "Invisalign", "Barrack Heights", "Zavy"] as const;

export function deepgramListenQuery(options?: { interim?: boolean; endpointing?: boolean }): string {
  const params = new URLSearchParams();
  params.set("model", "nova-3");
  params.set("language", "multi");
  params.set("smart_format", "true");
  params.set("punctuate", "true");
  if (options?.interim) params.set("interim_results", "true");
  if (options?.endpointing) params.set("endpointing", "400");
  for (const term of STT_KEYTERMS) params.append("keyterm", term);
  return params.toString();
}

export function deepgramListenUrl(kind: "stream" | "prerecorded"): string {
  const query =
    kind === "stream" ? deepgramListenQuery({ interim: true, endpointing: true }) : deepgramListenQuery();
  const base = kind === "stream" ? "wss://api.deepgram.com/v1/listen" : "https://api.deepgram.com/v1/listen";
  return `${base}?${query}`;
}
