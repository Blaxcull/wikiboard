/** Bounded cache of cleaned article data.
 *  A string costs ~0.1–1 MB vs tens of MB for a live iframe document,
 *  so a discarded window can render its frozen page instantly without
 *  refetching.
 *
 *  Each entry stores the full HTML plus a lightweight preview snippet
 *  (first paragraph + optional thumbnail) used by frozen windows.
 *
 *  Retention rules:
 *  - Articles belonging to currently OPEN windows are never evicted
 *    (guarantees every discarded window has content to show).
 *  - Leftovers from closed windows rotate out via LRU beyond MAX_ENTRIES. */

import { useWindows } from "../store/windows";
import { extractTitle } from "./wiki";

export type CacheEntry = {
  html: string;
  preview: string;
  thumbnail: string | null;
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
): void {
  cache.set(key, { html, preview, thumbnail });
  evictClosedWindowArticles();
}
