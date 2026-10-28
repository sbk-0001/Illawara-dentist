/**
 * Precompute multilingual embeddings for every knowledge chunk.
 *
 * Uses AI_GATEWAY_API_KEY and google/text-multilingual-embedding-002.
 * Without the key this exits 0 so a build can continue; the server then
 * embeds lazily on the first chat request that has the key.
 *
 * Writes src/chat/data/knowledge-embeddings.bin and knowledge-embeddings.meta.json.
 * Keep EMBEDDING_MODEL in sync with src/chat/retrieval/embeddings.ts.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { embedMany } from "ai";

const EMBEDDING_MODEL = "google/text-multilingual-embedding-002";
const DATA = path.join(process.cwd(), "src/chat/data");
const INDEX = path.join(DATA, "knowledge-index.json");
const META = path.join(DATA, "knowledge-embeddings.meta.json");
const BIN = path.join(DATA, "knowledge-embeddings.bin");

function chunkText(chunk) {
  return `${chunk.title}\n${chunk.heading}\n${chunk.text}`.replace(/\s+/g, " ").trim().slice(0, 2000);
}

function idsHash(chunks) {
  return createHash("sha256").update(chunks.map((chunk) => chunk.id).join("\n")).digest("hex");
}

function alreadyCurrent(chunks, hash) {
  try {
    const meta = JSON.parse(readFileSync(META, "utf8"));
    if (meta.model !== EMBEDDING_MODEL || meta.count !== chunks.length || meta.idsHash !== hash) return false;
    const bin = readFileSync(BIN);
    return bin.byteLength === meta.count * meta.dimensions * 4;
  } catch {
    return false;
  }
}

async function main() {
  const index = JSON.parse(readFileSync(INDEX, "utf8"));
  const chunks = index.chunks || [];
  const hash = idsHash(chunks);
  if (alreadyCurrent(chunks, hash)) {
    console.log("EMBED_STATUS=cached");
    return;
  }
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.log("EMBED_STATUS=skipped");
    console.log("AI_GATEWAY_API_KEY is not set. Chunk vectors will be built on the server when the key is present.");
    return;
  }
  const rows = [];
  for (let start = 0; start < chunks.length; start += 64) {
    const slice = chunks.slice(start, start + 64);
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: slice.map((chunk) => chunkText(chunk)),
      maxRetries: 2,
    });
    rows.push(...embeddings);
    console.log(`embedded ${Math.min(start + 64, chunks.length)}/${chunks.length}`);
  }
  const dimensions = rows[0]?.length ?? 0;
  if (!dimensions || rows.length !== chunks.length) {
    console.log("EMBED_STATUS=failed");
    return;
  }
  const matrix = new Float32Array(rows.length * dimensions);
  rows.forEach((row, index) => matrix.set(row, index * dimensions));
  mkdirSync(DATA, { recursive: true });
  writeFileSync(BIN, Buffer.from(matrix.buffer));
  writeFileSync(
    META,
    JSON.stringify({ model: EMBEDDING_MODEL, dimensions, count: chunks.length, idsHash: hash }),
  );
  console.log(`EMBED_STATUS=wrote dimensions=${dimensions} count=${chunks.length}`);
}

main().catch((error) => {
  console.log("EMBED_STATUS=failed");
  console.log(error instanceof Error ? error.message : "embedding failed");
  process.exit(0);
});
