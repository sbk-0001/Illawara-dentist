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
  { re: /fee|fees|cost|price|payment|fund|hicaps|afterpay|খরচ|ফি|फीस|शुल्क|费用|phí|비용|κόστ|costa|cuesta|cuánto|cuanto|dam|kitna|kitni|معائنہ|معاینه|فحص|تنظيف|जांच|सफाई|检查|洗牙|洁牙|revisión|limpieza|khám|스케일링|검진|έλεγχος|καθαρισμ|controllo|pulizia|চেকআপ|পরিষ্কার/i, terms: "fees payment cost price check-up clean" },
  { re: /hour|hours|saturday|sunday|open|opening|খোলা|শনি|बजे|खुल|घंट|营业|几点|开门|giờ|mở|ώρα|orari|sabato|horario|sábado|shonibar|khula|khola|baje/i, terms: "hours opening Saturday" },
  { re: /ঠিকানা|কোথায়|\bthikana\b|\bkothay\b|\bkothai\b/i, terms: "address location located" },
  { re: /emergency|pain|broken|tooth|swelling|ব্যথা|দাঁত|दर्द|दांत|牙疼|牙齿|đau|răng|δόντι|πονά|dente|diente|daat|daant|byatha|dard/i, terms: "emergency toothache appointment" },
  { re: /implant|ইমপ্লান্ট|زراعة|زرعات|इम्प्लांट|प्रत्यारोपण|种植牙|植牙|implante|امپلانٹ|ایمپلنت|کاشت|cấy ghép|임플란트|εμφυτευ|impiant/i, terms: "dental implants" },
  { re: /invisalign|aligner|ইনভিজালাইন|অ্যালাইনার|إنفزلاين|تقويم شفاف|इनविज़लाइन|एलाइनर|隐适美|隐形矫正|隐形牙套|alineador|انویزلائن|اینویزالاین|niềng trong suốt|인비절라인|투명교정|ευθυγραμμ|allineator/i, terms: "invisalign aligners" },
  { re: /child|children|kids|paediatric|pediatric|শিশু|বাচ্চা|أطفال|الأطفال|बच्चों|बच्चे|儿童|小孩|niños|infantil|بچوں|کودکان|اطفال|trẻ em|어린이|소아|παιδοδοντ|παιδικ|παιδιά|bambini|pedodonzia/i, terms: "children kids dentistry" },
  { re: /whiten|সাদা|सफेद|सफ़ेद|सफ़ेद|व्हाइटनिंग|दांत\s*स|تبييض|تبيض|美白|洁白|牙齿变白|blanque|سفید|بلیچینگ|tẩy trắng|trắng răng|미백|λεύκανση|sbiancamento|blanchiment|clareamento|pemutih/i, terms: "teeth whitening" },
  { re: /crown|veneer|ক্রাউন|ভিনিয়ার|تيجان|قشور|فينير|क्राउन|विनियर|牙冠|贴面|carilla|کراؤن|وینیر|روکش|ونیر|mão răng|mặt dán|크라운|베니어|στεφάνη|faccetta/i, terms: "crowns veneers" },
  { re: /root canal|endodont|রুট ক্যানাল|علاج العصب|قناة الجذر|रूट कैनाल|根管|endodoncia|روٹ کینال|عصب‌کشی|درمان ریشه|điều trị tủy|신경치료|απονεύρωση|devitalizz|canale radicolare/i, terms: "root canal" },
  { re: /sedation|sleep dentistry|সেডেশন|تخدير|تنويم|बेहोशी|镇静|sedación|بے ہوشی|بیهوشی|آرام‌بخش|gây mê|an thần|진정|καταστολή|sedazione/i, terms: "sedation sleep dentistry" },
];

export function expandQuery(query: string): string {
  const extras: string[] = [];
  for (const clinic of mentionedClinics(query)) extras.push(clinicName(clinic));
  const matched = EXPANSIONS.filter((item) => item.re.test(query));
  const specific = matched.some((item) => /whitening|implant|invisalign|crown|canal|sedation|children/.test(item.terms));
  for (const item of matched) {
    // "दांत" also marks a toothache. A whitening question should not be pulled into emergency pages.
    if (specific && item.terms.startsWith("emergency ")) continue;
    extras.push(item.terms);
  }
  return extras.length ? `${query} ${extras.join(" ")}` : query;
}

/** English service words added when the question names a known clinic topic, in any supported script. */
export function mentionsIndexedTopic(text: string): string[] {
  const terms: string[] = [];
  for (const item of EXPANSIONS) {
    if (item.re.test(text)) terms.push(...item.terms.split(" "));
  }
  return terms;
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

/** Drop weak neighbours. Multilingual vectors for related pages usually sit above this. */
export const SEMANTIC_FLOOR = 0.33;

function cosineSlice(query: ArrayLike<number>, matrix: ArrayLike<number>, offset: number, dimensions: number): number {
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let i = 0; i < dimensions; i += 1) {
    const a = query[i] || 0;
    const b = matrix[offset + i] || 0;
    dot += a * b;
    left += a * a;
    right += b * b;
  }
  if (left <= 0 || right <= 0) return 0;
  return dot / (Math.sqrt(left) * Math.sqrt(right));
}

export function searchByVectors(
  index: KnowledgeIndex,
  query: string,
  queryVector: ArrayLike<number>,
  matrix: ArrayLike<number>,
  dimensions: number,
  limit = 8,
): ScoredChunk[] {
  if (!dimensions || queryVector.length < dimensions) return [];
  const rows = Math.min(index.chunks.length, Math.floor(matrix.length / dimensions));
  const focus = clinicFocus(query);
  const scored: ScoredChunk[] = [];
  for (let row = 0; row < rows; row += 1) {
    const chunk = index.chunks[row];
    if (!chunk) continue;
    let score = cosineSlice(queryVector, matrix, row * dimensions, dimensions);
    if (score < SEMANTIC_FLOOR) continue;
    if (focus.kind === "one") score *= chunk.clinic === focus.clinic ? 1.15 : 0.8;
    if (focus.kind === "many") score *= focus.clinics.includes(chunk.clinic) ? 1.08 : 0.9;
    scored.push({ ...chunk, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Union of lexical hits and embedding hits. A page found by either path stays in the list. */
export function fuseRetrieval(wordHits: ScoredChunk[], semanticHits: ScoredChunk[], limit = 6): ScoredChunk[] {
  const lexicalMax = Math.max(...wordHits.map((hit) => hit.score), 1);
  const semanticMax = Math.max(...semanticHits.map((hit) => hit.score), 1e-6);
  const byId = new Map<string, ScoredChunk>();
  for (const hit of wordHits) byId.set(hit.id, { ...hit, score: hit.score / lexicalMax });
  for (const hit of semanticHits) {
    const semantic = hit.score / semanticMax;
    const existing = byId.get(hit.id);
    if (!existing) {
      byId.set(hit.id, { ...hit, score: semantic });
      continue;
    }
    existing.score = existing.score * 0.45 + semantic * 0.55;
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
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
