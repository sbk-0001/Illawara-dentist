import { readFileSync } from "node:fs";
import path from "node:path";
import type { KnowledgeIndex } from "../types";

let cached: KnowledgeIndex | null = null;

export function getKnowledgeIndex(): KnowledgeIndex {
  if (cached) return cached;
  const file = path.join(process.cwd(), "src/chat/data/knowledge-index.json");
  cached = JSON.parse(readFileSync(file, "utf8")) as KnowledgeIndex;
  return cached;
}
