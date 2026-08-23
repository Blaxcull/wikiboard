import { useWindows } from "../store/windows";
import { extractTitle, fetchArticle, extractFirstParagraph, extractFirstImage } from "./wiki";

export type CacheEntry = {
  html: string;
  preview: string;
  thumbnail: string | null;
  summaryHtml: string | null;
};

const cache = new Map<string, CacheEntry>();

function belongsToOpenWindow(key: string): boolean {
  return useWindows
    .getState()
    .windows.some((w) => w.url !== "" && extractTitle(w.url) === key);
}

export function evictClosedWindowArticles(): void {
  for (const key of cache.keys()) {
    if (!belongsToOpenWindow(key)) {
      cache.delete(key);
    }
  }
}

export function getCachedArticle(key: string): CacheEntry | undefined {
  return cache.get(key);
}

export function setCachedArticle(
  key: string,
  html: string,
  preview: string,
  thumbnail: string | null,
  summaryHtml?: string | null,
): void {
  const existing = cache.get(key);
  cache.set(key, {
    html,
    preview,
    thumbnail,
    summaryHtml: summaryHtml ?? existing?.summaryHtml ?? null,
  });
  evictClosedWindowArticles();
}

export async function prefetchArticles(titles: string[], concurrency = 15): Promise<void> {
  const queue = [...titles];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const title = queue.shift()!;
      if (cache.has(title)) continue;
      try {
        const html = await fetchArticle(title);
        const preview = extractFirstParagraph(html);
        const thumbnail = extractFirstImage(html);
        cache.set(title, { html, preview, thumbnail, summaryHtml: null });
      } catch {
        // skip failed articles
      }
    }
  });
  await Promise.all(workers);
}
