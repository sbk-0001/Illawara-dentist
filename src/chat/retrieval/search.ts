import type { ClinicId, KnowledgeChunk, KnowledgeIndex, SourceChip } from "../types";
import { clinicFocus, mentionedClinics } from "../intent";

export type ScoredChunk = KnowledgeChunk & { score: number };

const ENGLISH_STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "it", "at", "my", "your", "our", "with", "do", "does", "can", "i", "we", "you", "me", "this", "that", "what", "when", "where", "who", "how", "why", "are", "was", "were", "be", "from", "by", "about"]);

function tokens(text: string): string[] {
  const words = text.toLowerCase().replace(/['’]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const word of words) {
    if (word.length === 1 && /[a-z]/.test(word)) continue;
    if (ENGLISH_STOP.has(word)) continue;
    out.push(word);
    if (/^[\u4e00-\u9fff]+$/u.test(word)) {
      for (let i = 0; i < word.length - 1; i += 1) out.push(word.slice(i, i + 2));
    }
  }
  return out;
}

type Built = {
  chunks: KnowledgeChunk[];
  docTokens: string[][];
  df: Map<string, number>;
  avg: number;
};

const builtCache = new WeakMap<KnowledgeIndex, Built>();

function build(index: KnowledgeIndex): Built {
  const cached = builtCache.get(index);
  if (cached) return cached;
  const df = new Map<string, number>();
  const docTokens = index.chunks.map((chunk) => {
    const unique = new Set(tokens(`${chunk.title} ${chunk.heading} ${chunk.heading} ${chunk.text}`));
    for (const token of unique) df.set(token, (df.get(token) || 0) + 1);
    return tokens(`${chunk.title} ${chunk.heading} ${chunk.text}`);
  });
  const avg = docTokens.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docTokens.length);
  const built = { chunks: index.chunks, docTokens, df, avg };
  builtCache.set(index, built);
  return built;
}

function bm25(query: string[], doc: string[], df: Map<string, number>, avg: number, n: number): number {
  const tf = new Map<string, number>();
  for (const token of doc) tf.set(token, (tf.get(token) || 0) + 1);
  const k1 = 1.2;
  const b = 0.75;
  let score = 0;
  for (const token of new Set(query)) {
    const freq = tf.get(token) || 0;
    if (!freq) continue;
    const documentFrequency = df.get(token) || 0;
    const idf = Math.log(1 + (n - documentFrequency + 0.5) / (documentFrequency + 0.5));
    const denom = freq + k1 * (1 - b + b * (doc.length / Math.max(1, avg)));
    score += idf * ((freq * (k1 + 1)) / denom);
  }
  return score;
}

const EXPANSIONS: { re: RegExp; terms: string }[] = [
  { re: /fee|fees|cost|price|payment|fund|hicaps|afterpay|খরচ|ফি|फीस|शुल्क|费用|phí|비용|κόστ|costa|cuesta|cuánto|cuanto|dam|kitna|kitni/i, terms: "fees payment cost price" },
  { re: /hour|hours|saturday|sunday|open|opening|খোলা|শনি|बजे|खुल|घंट|营业|几点|开门|giờ|mở|ώρα|orari|sabato|horario|sábado|shonibar|khula|khola|baje/i, terms: "hours opening Saturday" },
  { re: /emergency|pain|broken|tooth|swelling|ব্যথা|দাঁত|दर्द|दांत|牙疼|牙齿|đau|răng|δόντι|πονά|dente|diente|daat|daant|byatha|dard/i, terms: "emergency toothache appointment" },
];

function expandQuery(query: string): string {
  const extras: string[] = [];
  for (const clinic of mentionedClinics(query)) extras.push(clinicName(clinic));
  for (const item of EXPANSIONS) {
    if (item.re.test(query)) extras.push(item.terms);
  }
  return extras.length ? `${query} ${extras.join(" ")}` : query;
}

function overlapCount(query: string, chunk: KnowledgeChunk): number {
  const wanted = new Set(tokens(query));
  const seen = new Set(tokens(`${chunk.title} ${chunk.heading} ${chunk.text}`));
  let count = 0;
  for (const token of wanted) if (seen.has(token)) count += 1;
  return count;
}

export function searchIndex(index: KnowledgeIndex, query: string, limit = 6): ScoredChunk[] {
  const built = build(index);
  const expanded = expandQuery(query);
  const queryTokens = tokens(expanded);
  if (!queryTokens.length) return [];
  const focus = clinicFocus(query);
  const scored = built.chunks.map((chunk, i) => {
    let score = bm25(queryTokens, built.docTokens[i] || [], built.df, built.avg, built.chunks.length);
    if (focus.kind === "one") score *= chunk.clinic === focus.clinic ? 1.45 : 0.72;
    if (focus.kind === "many") score *= focus.clinics.includes(chunk.clinic) ? 1.3 : 0.8;
    const titleTokens = new Set(tokens(`${chunk.title} ${chunk.heading}`));
    let titleHits = 0;
    for (const token of queryTokens) if (titleTokens.has(token)) titleHits += 1;
    score += titleHits * 0.35;
    return { ...chunk, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((item) => item.score > 0).slice(0, limit);
  if (!top.length || !top[0]) return [];
  const overlap = overlapCount(expanded, top[0]);
  const querySize = new Set(queryTokens).size;
  if (overlap < 1) return [];
  if (querySize >= 2 && overlap < 2) return [];
  const floor = top[0].score * 0.28;
  return top.filter((item) => item.score >= floor);
}

export function sourcesFromChunks(chunks: ScoredChunk[]): SourceChip[] {
  const seen = new Set<string>();
  const sources: SourceChip[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.url)) continue;
    seen.add(chunk.url);
    sources.push({ title: chunk.title, url: chunk.url, clinic: chunk.clinic });
    if (sources.length >= 4) break;
  }
  return sources;
}

export function clinicName(clinic: ClinicId): string {
  if (clinic === "dapto") return "Dapto Dentists";
  if (clinic === "shellharbour") return "Shellharbour Dentists";
  return "Woonona Dentists";
}
