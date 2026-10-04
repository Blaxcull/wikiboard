import { pipeline, env } from "@xenova/transformers";

// Disable local model check to allow fetching ONNX models from Hugging Face hub smoothly
env.allowLocalModels = false;

type SummaryEntry = {
  windowId: string;
  title: string;
  summaryText: string;
};

type ParagraphChunk = {
  chunkId: string;
  text: string;
  vector?: number[];
};

type SearchResult = {
  windowId: string;
  windowTitle: string;
  chunkId: string;
  textSnippet: string;
  score: number;
};

// In-Memory Stores inside Worker thread
const summaryStore = new Map<string, SummaryEntry>();
const chunkStore = new Map<string, ParagraphChunk[]>();

let extractorPipeline: any = null;

function normalizeQueryText(text: string): string {
  let s = text.toLowerCase().trim();
  s = s.replace(/\bww1\b|\bwwi\b/gi, "world war 1 world war i first world war");
  s = s.replace(/\bww2\b|\bwwii\b/gi, "world war 2 world war ii second world war");
  return s;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getFallbackVector(text: string, dims = 128): number[] {
  const vec = new Array(dims).fill(0);
  const words = normalizeQueryText(text).replace(/[^\w\s]/g, "").split(/\s+/);
  for (const word of words) {
    if (!word) continue;
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dims;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < dims; i++) vec[i] /= norm;
  }
  return vec;
}

async function getEmbedding(text: string): Promise<number[]> {
  if (!extractorPipeline) {
    try {
      extractorPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    } catch (err) {
      console.warn("Worker: ONNX load failed, using fallback vectorizer:", err);
      extractorPipeline = null;
    }
  }

  if (extractorPipeline) {
    try {
      const output = await extractorPipeline(normalizeQueryText(text), { pooling: "mean", normalize: true });
      return Array.from(output.data);
    } catch {
      /* fallback */
    }
  }

  return getFallbackVector(text);
}

/**
 * Fast BM25 keyword scoring algorithm for candidate pruning (< 1ms execution)
 */
function bm25Score(queryTerms: string[], text: string): number {
  const textLower = text.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (term.length < 2) continue;
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = (textLower.match(new RegExp(escapedTerm, "g")) || []).length;
    if (matches > 0) {
      const tf = matches;
      const k1 = 1.2;
      score += (tf * (k1 + 1)) / (tf + k1);
    }
  }
  return score;
}

function computeHybridScore(vecScore: number, text: string, normQuery: string, bm25Val: number): number {
  const textLower = text.toLowerCase();
  const words = normQuery.split(/\s+/).filter((w) => w.length > 2);
  let termMatches = 0;
  for (const w of words) {
    if (textLower.includes(w)) termMatches++;
  }
  const termBonus = words.length > 0 ? (termMatches / words.length) * 0.3 : 0;
  const bm25Bonus = Math.min(0.2, bm25Val * 0.05);
  const rawScore = vecScore * 0.5 + termBonus + bm25Bonus;
  return Math.min(0.99, Math.max(0.1, rawScore));
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  if (type === "WARMUP") {
    // Warm up ONNX model pipeline off main thread
    getEmbedding("warmup").catch(() => {});
  }

  if (type === "REGISTER_WINDOW") {
    const { windowId, title, summaryText, chunks } = payload;

    if (title || summaryText) {
      summaryStore.set(windowId, { windowId, title, summaryText });
    }

    if (chunks && chunks.length > 0) {
      chunkStore.set(windowId, chunks);
    }
  }

  if (type === "REMOVE_WINDOW") {
    summaryStore.delete(payload.windowId);
    chunkStore.delete(payload.windowId);
  }

  if (type === "SEARCH") {
    const { query, openWindowIds, topK = 5 } = payload;
    const normQuery = normalizeQueryText(query);
    const queryTerms = normQuery.split(/\s+/).filter((t) => t.length > 1);
    const openSet = new Set<string>(openWindowIds);

    // --- STAGE 1: Ultra-Fast BM25 Keyword Filter (< 1ms) ---
    // Evaluates all paragraph chunks in open windows and picks the top 8 candidates.
    const candidateChunks: Array<{
      windowId: string;
      windowTitle: string;
      chunkId: string;
      text: string;
      vector?: number[];
      bm25: number;
    }> = [];

    for (const winId of openSet) {
      const chunks = chunkStore.get(winId);
      if (!chunks || chunks.length === 0) continue;

      const winTitle = summaryStore.get(winId)?.title ?? "Article";

      for (const chunk of chunks) {
        const score = bm25Score(queryTerms, winTitle + " " + chunk.text);
        candidateChunks.push({
          windowId: winId,
          windowTitle: winTitle,
          chunkId: chunk.chunkId,
          text: chunk.text,
          vector: chunk.vector,
          bm25: score,
        });
      }
    }

    // Sort candidate chunks by BM25 score descending
    candidateChunks.sort((a, b) => b.bm25 - a.bm25);

    // Take top 8 candidates (or all if < 8)
    const topCandidates = candidateChunks.slice(0, Math.min(8, candidateChunks.length));

    // --- STAGE 2: Vector Embedding & Cosine Similarity on Top Candidates ONLY (~0.1s - 0.2s) ---
    const queryVector = await getEmbedding(normQuery);
    const finalResults: SearchResult[] = [];

    for (const cand of topCandidates) {
      if (!cand.vector) {
        cand.vector = await getEmbedding(cand.text);
      }
      const vecScore = cosineSimilarity(queryVector, cand.vector);
      const hybridScore = computeHybridScore(vecScore, cand.text, normQuery, cand.bm25);

      finalResults.push({
        windowId: cand.windowId,
        windowTitle: cand.windowTitle,
        chunkId: cand.chunkId,
        textSnippet: cand.text,
        score: hybridScore,
      });
    }

    finalResults.sort((a, b) => b.score - a.score);

    self.postMessage({
      id,
      type: "SEARCH_RESULTS",
      results: finalResults.slice(0, topK),
    });
  }
};
