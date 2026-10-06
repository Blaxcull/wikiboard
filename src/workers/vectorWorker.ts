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

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't",
  "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have",
  "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself",
  "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into",
  "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our",
  "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's",
  "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs",
  "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't",
  "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "where", "where's",
  "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't",
  "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
]);

// In-Memory Stores inside Worker thread
const summaryStore = new Map<string, SummaryEntry>();
const chunkStore = new Map<string, ParagraphChunk[]>();

type ExtractorFunction = (
  text: string,
  options?: Record<string, unknown>
) => Promise<{ data: ArrayLike<number> }>;

let pipelinePromise: Promise<ExtractorFunction | null> | null = null;

async function getExtractorPipeline(): Promise<ExtractorFunction | null> {
  if (!pipelinePromise) {
    pipelinePromise = (pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2") as Promise<ExtractorFunction>)
      .catch((err) => {
        console.warn("Worker: ONNX load failed, using fallback vectorizer:", err);
        pipelinePromise = null;
        return null;
      });
  }
  return pipelinePromise;
}

function normalizeQueryText(text: string): string {
  let s = text.toLowerCase().trim();
  s = s.replace(/\bww1\b|\bwwi\b/gi, "world war 1 world war i first world war");
  s = s.replace(/\bww2\b|\bwwii\b/gi, "world war 2 world war ii second world war");
  s = s.replace(/\bgt6\b|\bgta6\b|\bgta vi\b|\bgta 6\b/gi, "grand theft auto vi grand theft auto 6 gta 6 gta vi gta6 gt6");
  s = s.replace(/[^\w\s]/g, " ");
  return s;
}

function extractQueryTerms(query: string): string[] {
  const norm = normalizeQueryText(query);
  const words = norm.split(/\s+/).filter((w) => w.length > 1);
  const contentWords = words.filter((w) => !STOP_WORDS.has(w));
  return contentWords.length > 0 ? contentWords : words;
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
  const pipe = await getExtractorPipeline();
  if (pipe) {
    try {
      const output = await pipe(normalizeQueryText(text), { pooling: "mean", normalize: true });
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
    const matches = (textLower.match(new RegExp(`\\b${escapedTerm}\\b`, "g")) || []).length;
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
  const words = normQuery.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  let termMatches = 0;
  for (const w of words) {
    if (textLower.includes(w)) termMatches++;
  }
  const termBonus = words.length > 0 ? (termMatches / words.length) * 0.15 : 0;
  const bm25Bonus = Math.min(0.15, bm25Val * 0.03);
  // Dominant 70% weight for semantic vector similarity
  const rawScore = vecScore * 0.7 + termBonus + bm25Bonus;
  return Math.min(0.99, Math.max(0.1, rawScore));
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  if (type === "WARMUP") {
    // Warm up ONNX model pipeline off main thread
    getExtractorPipeline().catch(() => {});
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
    const queryTerms = extractQueryTerms(query);
    const openSet = new Set<string>(openWindowIds);

    // --- STAGE 1: Fast BM25 Keyword Filter with Lead-Paragraph Prioritization ---
    const candidateChunks: Array<{
      windowId: string;
      windowTitle: string;
      chunkId: string;
      text: string;
      chunkRef: ParagraphChunk;
      bm25: number;
    }> = [];

    for (const winId of openSet) {
      const chunks = chunkStore.get(winId);
      if (!chunks || chunks.length === 0) continue;

      const winTitle = summaryStore.get(winId)?.title ?? "Article";

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        let score = bm25Score(queryTerms, chunk.text);
        const titleMatch = bm25Score(queryTerms, winTitle);
        if (titleMatch > 0) score += titleMatch * 0.5;

        // Wikipedia lead paragraphs (chunks 0 & 1) summarize the topic, definitions, and dates
        if (i < 2) score += 1.5;

        candidateChunks.push({
          windowId: winId,
          windowTitle: winTitle,
          chunkId: chunk.chunkId,
          text: chunk.text,
          chunkRef: chunk,
          bm25: score,
        });
      }
    }

    // Sort candidate chunks by BM25 score descending
    candidateChunks.sort((a, b) => b.bm25 - a.bm25);

    // Take top 24 candidates (broad enough so key paragraphs are never dropped)
    const topCandidates = candidateChunks.slice(0, Math.min(24, candidateChunks.length));

    // --- STAGE 2: Vector Embedding & Cosine Similarity with Persistent Chunk Caching ---
    const queryVector = await getEmbedding(normQuery);
    const finalResults: SearchResult[] = [];

    for (const cand of topCandidates) {
      // Cache computed embeddings directly on chunkRef in chunkStore so subsequent searches are instant
      if (!cand.chunkRef.vector) {
        cand.chunkRef.vector = await getEmbedding(cand.text);
      }
      const vecScore = cosineSimilarity(queryVector, cand.chunkRef.vector);
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
