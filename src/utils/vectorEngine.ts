export type ParagraphChunk = {
  chunkId: string;
  text: string;
};

export type SearchResult = {
  windowId: string;
  windowTitle: string;
  chunkId: string;
  textSnippet: string;
  score: number;
};

let vectorWorker: Worker | null = null;
let requestIdCounter = 0;
const pendingRequests = new Map<number, (results: SearchResult[]) => void>();

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (!vectorWorker) {
    try {
      vectorWorker = new Worker(
        new URL("../workers/vectorWorker.ts", import.meta.url),
        { type: "module" }
      );
      vectorWorker.onmessage = (e: MessageEvent) => {
        const { id, type, results } = e.data;
        if (type === "SEARCH_RESULTS" && id != null) {
          const resolver = pendingRequests.get(id);
          if (resolver) {
            resolver(results);
            pendingRequests.delete(id);
          }
        }
      };
    } catch (err) {
      console.warn("Failed to spawn vector worker:", err);
      vectorWorker = null;
    }
  }
  return vectorWorker;
}

/**
 * Pre-warm the Web Worker and ONNX transformer model on Spotlight open.
 */
export function warmupVectorEngine() {
  const worker = getWorker();
  if (worker) {
    worker.postMessage({ type: "WARMUP" });
  }
}

/**
 * Register article summary & chunks with the background worker.
 * The background worker immediately computes embeddings on its separate worker thread.
 */
export function registerWindowVectorData(
  windowId: string,
  title: string,
  summaryText: string,
  chunks?: ParagraphChunk[]
) {
  const worker = getWorker();
  if (worker) {
    worker.postMessage({
      type: "REGISTER_WINDOW",
      payload: { windowId, title, summaryText, chunks },
    });
  }
}

/**
 * Clean up vectors when a window is closed.
 */
export function removeWindowVectors(windowId: string) {
  const worker = getWorker();
  if (worker) {
    worker.postMessage({
      type: "REMOVE_WINDOW",
      payload: { windowId },
    });
  }
}

/**
 * Search query across open windows on background worker thread.
 */
export async function searchVectorQuery(
  query: string,
  openWindowIds: string[],
  topK = 5
): Promise<SearchResult[]> {
  const worker = getWorker();
  if (!worker || !query.trim() || openWindowIds.length === 0) return [];

  const id = ++requestIdCounter;
  return new Promise((resolve) => {
    pendingRequests.set(id, resolve);
    worker.postMessage({
      type: "SEARCH",
      id,
      payload: { query, openWindowIds, topK },
    });
  });
}
