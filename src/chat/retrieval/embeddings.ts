import { cosineSimilarity, embedMany } from "ai";
import type { ScoredChunk } from "./search";

/** Multilingual query/chunk rerank. Lexical search still runs when this key is absent. */
export const EMBEDDING_MODEL = "google/text-multilingual-embedding-002";

export async function rerankWithEmbeddings(query: string, chunks: ScoredChunk[]): Promise<ScoredChunk[]> {
  if (!process.env.AI_GATEWAY_API_KEY || chunks.length < 2) return chunks;
  try {
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: [query, ...chunks.map((chunk) => `${chunk.title}. ${chunk.heading}. ${chunk.text}`.slice(0, 1500))],
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
