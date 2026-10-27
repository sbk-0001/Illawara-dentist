import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cosineSimilarity, embed, embedMany } from "ai";
import type { KnowledgeChunk, KnowledgeIndex } from "../types";
import { expandQuery, fuseRetrieval, searchByVectors, type ScoredChunk } from "./search";

/** Multilingual vectors. The same id is used by scripts/embed-index.mjs. */
export const EMBEDDING_MODEL = "google/text-multilingual-embedding-002";
export const EMBEDDING_META = "knowledge-embeddings.meta.json";
export const EMBEDDING_BIN = "knowledge-embeddings.bin";

/** Query embedding must not eat the 8s first-token budget. Word search is the fallback. */
export const RETRIEVAL_TIMEOUT_MS = 2_000;

export type EmbeddingMeta = {
  model: string;
  dimensions: number;
  count: number;
  idsHash: string;
};

export type StoredMatrix = {
  dimensions: number;
  matrix: Float32Array;
};

const memory = new Map<string, StoredMatrix>();
let pending: Promise<StoredMatrix | null> | null = null;
let pendingHash = "";

export function chunkEmbeddingText(chunk: Pick<KnowledgeChunk, "title" | "heading" | "text">): string {
  return `${chunk.title}\n${chunk.heading}\n${chunk.text}`.replace(/\s+/g, " ").trim().slice(0, 2000);
}

export function embeddingIdsHash(index: KnowledgeIndex): string {
  return createHash("sha256").update(index.chunks.map((chunk) => chunk.id).join("\n")).digest("hex");
}

function dataDirs(): string[] {
  return [path.join(process.cwd(), "src/chat/data"), path.join(os.tmpdir(), "illawarra-chat-embeddings")];
}

function readMatrix(dir: string, index: KnowledgeIndex): StoredMatrix | null {
  try {
    const meta = JSON.parse(readFileSync(path.join(dir, EMBEDDING_META), "utf8")) as EmbeddingMeta;
    if (meta.model !== EMBEDDING_MODEL) return null;
    if (meta.count !== index.chunks.length || meta.idsHash !== embeddingIdsHash(index)) return null;
    if (!meta.dimensions) return null;
    const bin = readFileSync(path.join(dir, EMBEDDING_BIN));
    if (bin.byteLength !== meta.count * meta.dimensions * 4) return null;
    const matrix = new Float32Array(meta.count * meta.dimensions);
    Buffer.from(matrix.buffer).set(bin);
    return { dimensions: meta.dimensions, matrix };
  } catch {
    return null;
  }
}

export function readStoredEmbeddings(index: KnowledgeIndex): StoredMatrix | null {
  const hash = embeddingIdsHash(index);
  const cached = memory.get(hash);
  if (cached) return cached;
  for (const dir of dataDirs()) {
    const found = readMatrix(dir, index);
    if (found) {
      memory.set(hash, found);
      return found;
    }
  }
  return null;
}

function writeMatrix(index: KnowledgeIndex, dimensions: number, matrix: Float32Array): void {
  const meta: EmbeddingMeta = {
    model: EMBEDDING_MODEL,
    dimensions,
    count: index.chunks.length,
    idsHash: embeddingIdsHash(index),
  };
  const body = Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength);
  for (const dir of dataDirs()) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, EMBEDDING_BIN), body);
      writeFileSync(path.join(dir, EMBEDDING_META), JSON.stringify(meta));
      return;
    } catch {
      // Serverless filesystems are often read-only. The memory cache still serves this instance.
    }
  }
}

async function buildMatrix(index: KnowledgeIndex): Promise<StoredMatrix | null> {
  if (!process.env.AI_GATEWAY_API_KEY || !index.chunks.length) return null;
  const values = index.chunks.map((chunk) => chunkEmbeddingText(chunk));
  const rows: number[][] = [];
  for (let start = 0; start < values.length; start += 64) {
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: values.slice(start, start + 64),
      maxRetries: 2,
    });
    rows.push(...embeddings);
  }
  const dimensions = rows[0]?.length ?? 0;
  if (!dimensions || rows.length !== index.chunks.length) return null;
  const matrix = new Float32Array(rows.length * dimensions);
  rows.forEach((row, rowIndex) => {
    matrix.set(row, rowIndex * dimensions);
  });
  const stored = { dimensions, matrix };
  memory.set(embeddingIdsHash(index), stored);
  writeMatrix(index, dimensions, matrix);
  return stored;
}

/** Load committed vectors, or embed the corpus once per process when the gateway key exists. */
export async function ensureEmbeddings(index: KnowledgeIndex): Promise<StoredMatrix | null> {
  const stored = readStoredEmbeddings(index);
  if (stored) return stored;
  if (!process.env.AI_GATEWAY_API_KEY) return null;
  const hash = embeddingIdsHash(index);
  if (!pending || pendingHash !== hash) {
    pendingHash = hash;
    pending = buildMatrix(index)
      .then((result) => {
        if (!result) pending = null;
        return result;
      })
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}

/**
 * Run the embedding path until `timeoutMs`. On timeout or failure the caller
 * gets `fallback` (the lexical hits). The losing call is aborted.
 */
export async function withRetrievalDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  fallback: T,
  timeoutMs = RETRIEVAL_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      onTimeout?.();
      resolve(fallback);
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal).catch(() => fallback), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function semanticRetrieve(
  index: KnowledgeIndex,
  query: string,
  lexical: ScoredChunk[],
  signal: AbortSignal,
): Promise<ScoredChunk[]> {
  const stored = await ensureEmbeddings(index);
  if (signal.aborted) return lexical;
  if (!stored) return lexical.length ? rerankWithEmbeddings(query, lexical, signal) : lexical;
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: expandQuery(query).slice(0, 2000),
    maxRetries: 0,
    abortSignal: signal,
  });
  const semantic = searchByVectors(index, query, embedding, stored.matrix, stored.dimensions, 8);
  return fuseRetrieval(lexical, semantic, 6);
}

export async function hybridRetrieve(index: KnowledgeIndex, query: string, lexical: ScoredChunk[]): Promise<ScoredChunk[]> {
  return (await hybridRetrieveDetailed(index, query, lexical)).chunks;
}

/** Lexical hits, plus whether the embedding path missed its deadline. */
export async function hybridRetrieveDetailed(
  index: KnowledgeIndex,
  query: string,
  lexical: ScoredChunk[],
): Promise<{ chunks: ScoredChunk[]; timedOut: boolean }> {
  let timedOut = false;
  const chunks = await withRetrievalDeadline(
    (signal) => semanticRetrieve(index, query, lexical, signal),
    lexical,
    RETRIEVAL_TIMEOUT_MS,
    () => {
      timedOut = true;
    },
  );
  return { chunks, timedOut };
}

export async function rerankWithEmbeddings(query: string, chunks: ScoredChunk[], signal?: AbortSignal): Promise<ScoredChunk[]> {
  if (!process.env.AI_GATEWAY_API_KEY || chunks.length < 2) return chunks;
  try {
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: [query, ...chunks.map((chunk) => chunkEmbeddingText(chunk))],
      maxRetries: 0,
      abortSignal: signal,
    });
    const queryVector = embeddings[0];
    if (!queryVector) return chunks;
    const lexicalMax = Math.max(...chunks.map((chunk) => chunk.score), 1e-6);
    const blended = chunks.map((chunk, index) => {
      const vector = embeddings[index + 1];
      const cosine = vector ? cosineSimilarity(queryVector, vector) : 0;
      const lexical = chunk.score / lexicalMax;
      return { ...chunk, score: lexical * 0.45 + cosine * 0.55 };
    });
    blended.sort((a, b) => b.score - a.score);
    return blended;
  } catch {
    return chunks;
  }
}
