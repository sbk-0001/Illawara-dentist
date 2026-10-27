export type SourceChipLike = { url: string; title: string };

function urlKey(url: string): string {
  return url.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
}

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

/** Collapse chips that repeat a page URL or the same title. */
export function dedupeSourceChips<T extends SourceChipLike>(sources: T[]): T[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const unique: T[] = [];
  for (const source of sources) {
    const url = urlKey(source.url);
    const title = titleKey(source.title);
    if ((url && seenUrl.has(url)) || (title && seenTitle.has(title))) continue;
    if (url) seenUrl.add(url);
    if (title) seenTitle.add(title);
    unique.push(source);
  }
  return unique;
}
