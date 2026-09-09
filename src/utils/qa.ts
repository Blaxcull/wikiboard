import { useWindows } from "../store/windows";
import { extractTitle } from "./wiki";
import { getCachedArticle } from "./articleCache";

// ── HTML content extraction (NOT stripping infoboxes) ───────

interface ArticleContent {
  title: string;
  infobox: Map<string, string>;
  firstParagraph: string;
  allText: string;
  paragraphs: string[];
}

function htmlToArticleContent(html: string, articleTitle: string): ArticleContent {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Extract infobox as key→value pairs (critical for factual answers)
  const infobox = new Map<string, string>();
  const infoboxEl = doc.querySelector("table.infobox, .infobox");
  if (infoboxEl) {
    const rows = infoboxEl.querySelectorAll("tr");
    for (const row of rows) {
      const th = row.querySelector("th, .infobox-label, .infobox-header");
      const td = row.querySelector("td, .infobox-data");
      if (th && td) {
        const key = th.textContent?.trim().toLowerCase() ?? "";
        const val = td.textContent?.trim() ?? "";
        if (key && val) infobox.set(key, val);
      }
    }
    // Also check caption / title
    const caption = infoboxEl.querySelector("caption, .infobox-title, .infobox-above");
    if (caption) {
      infobox.set("_caption", caption.textContent?.trim() ?? "");
    }
  }

  // Extract paragraphs
  const paragraphs: string[] = [];
  const pEls = doc.querySelectorAll("p");
  for (const p of pEls) {
    const text = p.textContent?.trim() ?? "";
    if (text.length > 30) paragraphs.push(text);
  }

  const firstParagraph = paragraphs[0] ?? "";

  // Full text (remove only non-content elements, keep infobox text)
  doc.querySelectorAll(
    "script, noscript, link[rel=dns-prefetch], meta, base, .mw-empty-elt, .navbox, .sistersitebox, .mw-editsection, .printfooter, .visualClear, #catlinks, .gallery, .toc, .ambox, .portal, .mbox-small, .mbox, .metadata, .noprint, .article-alert, .alert, .reference-text, sup",
  ).forEach((el) => el.remove());

  const allText = doc.body?.textContent?.trim() ?? "";

  return { title: articleTitle, infobox, firstParagraph, allText, paragraphs };
}

// ── Question parsing ────────────────────────────────────────

function normalizeArticleTitle(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .trim();
}

function extractSubjectFromQuestion(q: string): string {
  const lower = q.toLowerCase();

  // Patterns like "where is X", "when was X born", "who is X", "what is X"
  const patterns = [
    // "what is the capital of X" → X
    /(?:what\s+(?:is|are|was|were)\s+the\s+\w+\s+of)\s+(.+)/i,
    // "who is/was the X of Y" → Y
    /(?:who\s+(?:is|was|are)\s+(?:the\s+)?\w+\s+of)\s+(.+)/i,
    // "who founded X" → X
    /(?:who\s+(?:founded|created|invented|started|built|established))\s+(.+)/i,
    // "where is/are X" → X
    /(?:where\s+(?:is|are|was|were|do|does|did))\s+(.+)/i,
    // "when was X born/died" → X
    /(?:when\s+(?:was|were|did)\s+)\s*(.+?)(?:\s+(?:born|die|died|killed|founded|built|established|started|created|invented))?$/i,
    // "how old is X" → X
    /(?:how\s+old\s+(?:is|are|was|were))\s+(.+)/i,
    // "how many X in Y" → Y
    /(?:how\s+many\s+\w+\s+(?:in|of|are))\s+(.+)/i,
    // "how big/long/far is X" → X
    /(?:how\s+(?:big|large|long|far|wide|tall|deep)\s+(?:is|are|was|were))\s+(.+)/i,
    // "who is X" → X
    /(?:who\s+(?:is|was|are))\s+(.+)/i,
    // "what is X" → X
    /(?:what\s+(?:is|are|was|were))\s+(?:a\s+|an\s+|the\s+)?(.+)/i,
    // "when X" → X (fallback)
    /(?:when\s+(?:is|are|was|were|did|do))\s+(.+)/i,
    // "X" (just the entity name as a question — "Jalandhar?")
    /^(.+?)\s*\?$/,
  ];

  for (const pat of patterns) {
    const m = lower.match(pat);
    if (m && m[1]) {
      let subject = m[1].trim();
      // Strip trailing question words
      subject = subject.replace(/\s*\?$/, "");
      subject = subject.replace(/\s+(born|die|died|founded|built|established|located|situated)\s*$/, "");
      subject = subject.trim();
      if (subject.length > 0) return subject;
    }
  }

  // Fallback: remove question words and return remaining
  return q
    .replace(/^(who|what|where|when|why|how|which)\s+(is|are|was|were|do|does|did|can|could|would|should|has|have|had)\s+(the\s+)?/i, "")
    .replace(/\s*\?$/, "")
    .trim();
}

function detectQuestionType(q: string): string {
  const lower = q.toLowerCase();
  if (/\bhow\s+old\b/.test(lower)) return "how_old";
  if (/\bhow\s+many\b/.test(lower)) return "how_many";
  if (/\bhow\s+long\b/.test(lower)) return "how_long";
  if (/\bhow\s+(big|large|wide)\b/.test(lower)) return "how_big";
  if (/\bhow\s+far\b/.test(lower)) return "how_far";
  if (/\bhow\s+tall\b/.test(lower)) return "how_tall";
  if (/\bwhat\s+is\s+the\s+capital\b/.test(lower)) return "capital_of";
  if (/\bwhat\s+is\s+the\s+population\b/.test(lower)) return "population_of";
  if (/\bwhat\s+is\s+the\s+area\b/.test(lower)) return "area_of";
  if (/\bwhat\s+is\s+the\s+(?:currency|money)\b/.test(lower)) return "currency_of";
  if (/\bwhat\s+is\s+the\s+(?:language|official\s+language)\b/.test(lower)) return "language_of";
  if (/\bwhat\s+is\s+the\s+(?:flag|coat)\b/.test(lower)) return "symbols_of";
  if (/\bwho\s+(?:is|was)\s+the\s+(?:president|leader|prime\s+minister|king|queen|monarch)\b/.test(lower)) return "leader_of";
  if (/\bwho\s+(?:founded|created|invented|started|built|established)\b/.test(lower)) return "founder_of";
  if (/\bwho\s+(?:is|was)\b/.test(lower)) return "who_is";
  if (/\bwhere\s+(?:is|are|was|were|do|does|did)\b/.test(lower)) return "where_is";
  if (/\bwhen\s+(?:was|were|did)\b/.test(lower)) {
    if (/\b(born|birth)\b/.test(lower)) return "when_born";
    if (/\b(died|death|killed)\b/.test(lower)) return "when_died";
    if (/\b(founded|established|created|built|started)\b/.test(lower)) return "when_founded";
    return "when";
  }
  if (/\bwhat\s+(?:is|are|was|were)\b/.test(lower)) return "what_is";
  if (/\bwho\b/.test(lower)) return "who";
  if (/\bwhere\b/.test(lower)) return "where_is";
  if (/\bwhen\b/.test(lower)) return "when";
  return "general";
}

// ── Answer extraction from ArticleContent ────────────────────

function fuzzyMatchTitle(articleTitle: string, subject: string): number {
  const a = normalizeArticleTitle(articleTitle);
  const s = normalizeArticleTitle(subject);

  // Exact match
  if (a === s) return 1.0;
  // Subject is fully contained in title (e.g. "mount arthur" in "mount arthur tanzania")
  if (a.includes(s)) return 0.95;
  // Title is fully contained in subject (unlikely but handle)
  if (s.includes(a)) return 0.9;
  // Word overlap — require ALL subject words to be in title for a meaningful match
  const aWords = new Set(a.split(/\s+/));
  const sWords = s.split(/\s+/);
  let overlap = 0;
  for (const w of sWords) {
    if (aWords.has(w)) overlap++;
  }
  // Only match if every word in the subject appears in the title
  if (overlap === sWords.length && sWords.length >= 2) return 0.85;
  // Partial word overlap — very strict, need most words
  if (sWords.length > 2 && overlap >= sWords.length - 1) return 0.6;
  return 0;
}

function extractInfoboxValue(infobox: Map<string, string>, keyPatterns: string[]): string | null {
  for (const [key, val] of infobox) {
    if (key === "_caption") continue;
    for (const pat of keyPatterns) {
      if (key.includes(pat)) return val;
    }
  }
  return null;
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseDate(s: string): Date | null {
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  const dmy = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (dmy && MONTHS[dmy[2].toLowerCase()] !== undefined) {
    return new Date(+dmy[3], MONTHS[dmy[2].toLowerCase()], +dmy[1]);
  }

  const mdy = s.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mdy && MONTHS[mdy[1].toLowerCase()] !== undefined) {
    return new Date(+mdy[3], MONTHS[mdy[1].toLowerCase()], +mdy[2]);
  }

  const yearOnly = s.match(/\b(\d{3,4})\b/);
  if (yearOnly) return new Date(+yearOnly[1], 0, 1);

  return null;
}

function computeAge(birthDateStr: string): number | null {
  const d = parseDate(birthDateStr);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

function extractLocationFromText(text: string, entityName: string): string | null {
  const entityLower = entityName.toLowerCase();

  // "X is a city/town/state/country/mountain/peak in/on REGION"
  const inPattern = new RegExp(
    `${entityLower}\\s+is\\s+(?:a\\s+|an\\s+|the\\s+)?(?:city|town|village|state|country|district|county|province|region|municipality|metropolitan|island|port|harbour|harbor|university|school|hospital|lake|river|mountain|peak|summit|ridge|range|forest|park|reserve|volcano|glacier|peninsula|cape|strait|canal|dam|bridge|monument|memorial)\\s+(?:located\\s+)?(?:in|on|at|near|of)\\s+(.+?)(?:\\.|,|;|\\(|$)`,
    "i",
  );
  const m = text.match(inPattern);
  if (m) return m[1].trim();

  // "X, located in/situated in/near/on REGION"
  const locatedPattern = new RegExp(
    `${entityLower}[^.]*?(?:located|situated|positioned|found|lies|stands?)\\s+(?:in|near|on|at)\\s+(.+?)(?:\\.|,|;|\\(|$)`,
    "i",
  );
  const m2 = text.match(locatedPattern);
  if (m2) return m2[1].trim();

  // "X is in/on REGION"
  const isIn = new RegExp(`${entityLower}\\s+is\\s+(?:in|on|at)\\s+(.+?)(?:\\.|,|;|\\(|$)`, "i");
  const m3 = text.match(isIn);
  if (m3) return m3[1].trim();

  // "X, in/on REGION," (appositive)
  const appositive = new RegExp(`${entityLower}\\s*,\\s*(?:in|on|at)\\s+(.+?)\\s*,`, "i");
  const m4 = text.match(appositive);
  if (m4) return m4[1].trim();

  // "in/on REGION, X" or "in/on REGION where X"
  const preEntity = new RegExp(`(?:in|on|at)\\s+([A-Z][^.]{2,40}?)\\s*[,;]\\s*(?:where|which|the\\s+)\\s+.*?${entityLower}`, "i");
  const m5 = text.match(preEntity);
  if (m5) return m5[1].trim();

  return null;
}

function extractDateFromText(text: string, entityName: string, contextKeywords: string[]): string | null {
  const entityLower = entityName.toLowerCase();

  // "X was founded/established/built in DATE"
  for (const kw of contextKeywords) {
    const pat = new RegExp(`${entityLower}[^.]*?${kw}\\s+(?:in\\s+)?(?:on\\s+)?(\\d{1,2}\\s+\\w+\\s+\\d{4}|\\w+\\s+\\d{1,2},?\\s+\\d{4}|\\d{4})`, "i");
    const m = text.match(pat);
    if (m) return m[1];
  }

  // "X (born DATE)" or "X was born on DATE"
  const bornPat = new RegExp(`${entityLower}[^.]*?(?:born|birth)[^.]*?(\\d{1,2}\\s+\\w+\\s+\\d{4}|\\w+\\s+\\d{1,2},?\\s+\\d{4}|\\d{4})`, "i");
  const mBorn = text.match(bornPat);
  if (mBorn) return mBorn[1];

  // Generic date near entity mention
  const anyDate = new RegExp(`${entityLower}[^.]*?(\\d{1,2}\\s+\\w+\\s+\\d{4}|\\w+\\s+\\d{1,2},?\\s+\\d{4})`, "i");
  const mAny = text.match(anyDate);
  if (mAny) return mAny[1];

  return null;
}

function extractPersonFromText(text: string, contextKeywords: string[]): string | null {
  for (const kw of contextKeywords) {
    // "founded by X", "created by X", "invented by X"
    const pat = new RegExp(`${kw}\\s+(?:by\\s+)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,3})`, "i");
    const m = text.match(pat);
    if (m) return m[1].trim();
  }
  return null;
}

function extractNumberFromText(text: string): string | null {
  // "X has a population of NUMBER" or "population of NUMBER"
  const m1 = text.match(/([\d,]+(?:\.\d+)?)\s*(million|billion|thousand|hundred)/i);
  if (m1) return `${m1[1]} ${m1[2]}`;

  const m2 = text.match(/([\d,]+(?:\.\d+)?)\s*(km|mi|ft|m|km2|mi2|sq\s*mi|sq\s*km|sq\s*ft|km²|mi²)/i);
  if (m2) return `${m2[1]} ${m2[2]}`;

  const m3 = text.match(/\b([\d,]+(?:\.\d+)?)\b/);
  return m3 ? m3[1] : null;
}

function extractDefinitionFromText(text: string, entityName: string): string | null {
  const entityLower = entityName.toLowerCase();

  // "X is a/an Y" or "X is the Y" — extract the definition part
  const defPat = new RegExp(
    `${entityLower}\\s+is\\s+(?:a\\s+|an\\s+|the\\s+)?(.+?)(?:\\.|,\\s+which|,\\s+and|,\\s+but|\\s+that\\s|\\s+who\\s|\\s+which\\s)`,
    "i",
  );
  const m = text.match(defPat);
  if (m) return m[1].trim();

  // Simpler: "X is Y." — extract Y
  const simplePat = new RegExp(`${entityLower}\\s+is\\s+(.+?)\\.`, "i");
  const m2 = text.match(simplePat);
  if (m2) return m2[1].trim();

  return null;
}

function buildAnswer(
  content: ArticleContent,
  intent: string,
  entityName: string,
): { answer: string; sourceSentence: string; confidence: number } | null {
  const { infobox, firstParagraph, paragraphs, allText } = content;

  // ── Infobox-based answers (highest precision) ──
  switch (intent) {
    case "capital_of": {
      const val = extractInfoboxValue(infobox, ["capital", "seat"]);
      if (val) return { answer: val, sourceSentence: `Capital: ${val}`, confidence: 0.95 };
      break;
    }
    case "population_of": {
      const val = extractInfoboxValue(infobox, ["population"]);
      if (val) return { answer: val, sourceSentence: `Population: ${val}`, confidence: 0.95 };
      break;
    }
    case "area_of": {
      const val = extractInfoboxValue(infobox, ["area", "total area", "total_area"]);
      if (val) return { answer: val, sourceSentence: `Area: ${val}`, confidence: 0.95 };
      break;
    }
    case "currency_of": {
      const val = extractInfoboxValue(infobox, ["currency"]);
      if (val) return { answer: val, sourceSentence: `Currency: ${val}`, confidence: 0.95 };
      break;
    }
    case "language_of": {
      const val = extractInfoboxValue(infobox, ["language", "official language", "languages"]);
      if (val) return { answer: val, sourceSentence: `Language: ${val}`, confidence: 0.95 };
      break;
    }
    case "leader_of": {
      const val = extractInfoboxValue(infobox, [
        "president", "prime minister", "leader", "governor",
        "monarch", "king", "queen", "chancellor", "mayor",
      ]);
      if (val) return { answer: val, sourceSentence: `Leader: ${val}`, confidence: 0.95 };
      break;
    }
    case "founder_of": {
      const val = extractInfoboxValue(infobox, ["founder", "founders", "created by"]);
      if (val) return { answer: val, sourceSentence: `Founder: ${val}`, confidence: 0.95 };
      // Fallback to text search
      const person = extractPersonFromText(allText, ["founded by", "established by", "created by", "invented by"]);
      if (person) return { answer: person, sourceSentence: `Founded by ${person}`, confidence: 0.8 };
      break;
    }
    case "how_old": {
      const birthVal = extractInfoboxValue(infobox, ["birth date", "born", "birth_date", "date of birth"]);
      if (birthVal) {
        const age = computeAge(birthVal);
        if (age !== null) return { answer: `${age} years old`, sourceSentence: `Born: ${birthVal}`, confidence: 0.95 };
        return { answer: `Born ${birthVal}`, sourceSentence: `Born: ${birthVal}`, confidence: 0.9 };
      }
      // Search text for birth date
      const dateStr = extractDateFromText(allText, entityName, ["born", "birth"]);
      if (dateStr) {
        const age = computeAge(dateStr);
        if (age !== null) return { answer: `${age} years old`, sourceSentence: `Born ${dateStr}`, confidence: 0.8 };
        return { answer: `Born ${dateStr}`, sourceSentence: `Born ${dateStr}`, confidence: 0.75 };
      }
      break;
    }
    case "when_born": {
      const val = extractInfoboxValue(infobox, ["birth date", "born", "birth_date", "date of birth"]);
      if (val) return { answer: val, sourceSentence: `Born: ${val}`, confidence: 0.95 };
      const dateStr = extractDateFromText(allText, entityName, ["born", "birth"]);
      if (dateStr) return { answer: dateStr, sourceSentence: `Born ${dateStr}`, confidence: 0.8 };
      break;
    }
    case "when_died": {
      const val = extractInfoboxValue(infobox, ["death date", "died", "death_date", "date of death"]);
      if (val) return { answer: val, sourceSentence: `Died: ${val}`, confidence: 0.95 };
      const dateStr = extractDateFromText(allText, entityName, ["died", "death", "killed"]);
      if (dateStr) return { answer: dateStr, sourceSentence: `Died ${dateStr}`, confidence: 0.8 };
      break;
    }
    case "when_founded": {
      const val = extractInfoboxValue(infobox, ["founded", "established", "founded_established", "opened", "built"]);
      if (val) return { answer: val, sourceSentence: `Founded: ${val}`, confidence: 0.95 };
      const dateStr = extractDateFromText(allText, entityName, ["founded", "established", "built", "created"]);
      if (dateStr) return { answer: dateStr, sourceSentence: `Founded ${dateStr}`, confidence: 0.8 };
      break;
    }
    case "when": {
      // Try infobox dates first
      for (const key of ["founded", "established", "built", "opened", "creation date"]) {
        const val = extractInfoboxValue(infobox, [key]);
        if (val) return { answer: val, sourceSentence: `${key}: ${val}`, confidence: 0.95 };
      }
      // Try text
      const dateStr = extractDateFromText(allText, entityName, ["founded", "established", "born", "built"]);
      if (dateStr) return { answer: dateStr, sourceSentence: dateStr, confidence: 0.8 };
      break;
    }
    case "where_is": {
      // First try infobox location fields
      const val = extractInfoboxValue(infobox, [
        "location", "country", "state", "region", "province",
        "coordinates", "address", "seat", "capital",
      ]);
      if (val) return { answer: val, sourceSentence: `Location: ${val}`, confidence: 0.95 };

      // Try to extract location from first paragraph / text
      const location = extractLocationFromText(firstParagraph, entityName)
        ?? extractLocationFromText(paragraphs.slice(0, 5).join(" "), entityName)
        ?? extractLocationFromText(allText, entityName);
      if (location) return { answer: location, sourceSentence: `Located in ${location}`, confidence: 0.85 };

      // Fallback: first paragraph itself is often a good answer for "where"
      if (firstParagraph) {
        return { answer: firstParagraph, sourceSentence: firstParagraph, confidence: 0.5 };
      }
      break;
    }
    case "what_is": {
      const def = extractDefinitionFromText(firstParagraph, entityName)
        ?? extractDefinitionFromText(allText, entityName);
      if (def) return { answer: def, sourceSentence: `${entityName} is ${def}`, confidence: 0.85 };
      // Fallback: first sentence
      if (firstParagraph) {
        return { answer: firstParagraph, sourceSentence: firstParagraph, confidence: 0.5 };
      }
      break;
    }
    case "how_many": {
      const num = extractNumberFromText(allText);
      if (num) return { answer: num, sourceSentence: num, confidence: 0.75 };
      break;
    }
    case "how_long":
    case "how_big":
    case "how_far":
    case "how_tall": {
      const val = extractInfoboxValue(infobox, [
        "length", "height", "width", "depth", "area",
        "elevation", "altitude", "distance", "size",
      ]);
      if (val) return { answer: val, sourceSentence: `${val}`, confidence: 0.9 };
      const num = extractNumberFromText(allText);
      if (num) return { answer: num, sourceSentence: num, confidence: 0.7 };
      break;
    }
    case "who_is":
    case "who": {
      const def = extractDefinitionFromText(firstParagraph, entityName);
      if (def) return { answer: def, sourceSentence: `${entityName} is ${def}`, confidence: 0.85 };
      if (firstParagraph) return { answer: firstParagraph, sourceSentence: firstParagraph, confidence: 0.5 };
      break;
    }
  }

  // ── Fallback: return first paragraph ──
  if (firstParagraph) {
    return { answer: firstParagraph, sourceSentence: firstParagraph, confidence: 0.3 };
  }

  return null;
}

// ── Cross-article search (when entity doesn't match any title) ──

function searchAcrossArticles(keywords: string[], subject: string): { answer: string; sourceSentence: string; title: string; score: number }[] {
  const windows = useWindows.getState().windows;
  const results: { answer: string; sourceSentence: string; title: string; score: number }[] = [];

  for (const win of windows) {
    if (!win.url) continue;
    const title = extractTitle(win.url);
    if (!title || title.startsWith("Special:") || title.startsWith("File:")) continue;

    const cached = getCachedArticle(title);
    if (!cached?.html) continue;

    const content = htmlToArticleContent(cached.html, title);

    // Check if the subject words appear in the article title — huge relevance boost
    const titleLower = normalizeArticleTitle(title);
    const subjectLower = normalizeArticleTitle(subject);
    const titleBoost = titleLower.includes(subjectLower) ? 2.0
      : keywords.every((kw) => titleLower.includes(kw)) ? 1.5
      : 0;

    // Score paragraphs by keyword density
    const allParagraphs = [content.firstParagraph, ...content.paragraphs];
    let bestParaScore = 0;
    let bestPara = "";
    for (const para of allParagraphs) {
      const lower = para.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score++;
      }
      if (score > bestParaScore) {
        bestParaScore = score;
        bestPara = para;
      }
    }

    // Also check infobox for keyword matches
    let infoboxScore = 0;
    let infoboxAnswer = "";
    for (const [, val] of content.infobox) {
      const lower = val.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score++;
      }
      if (score > infoboxScore) {
        infoboxScore = score;
        infoboxAnswer = val;
      }
    }

    const totalScore = Math.max(bestParaScore, infoboxScore) + titleBoost;
    if (totalScore > 0 && bestPara) {
      const answer = infoboxScore >= bestParaScore && infoboxAnswer
        ? infoboxAnswer
        : (bestPara.length > 300 ? bestPara.slice(0, 300) + "…" : bestPara);
      results.push({
        answer,
        sourceSentence: bestPara,
        title: title.replace(/_/g, " "),
        score: totalScore,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

// ── Main entry point ────────────────────────────────────────

export type QAResult = {
  answer: string;
  articleTitle: string;
  articleUrl: string;
  windowId: string;
  score: number;
};

export function searchArticles(question: string): QAResult[] {
  const rawQuestion = question.trim();
  if (rawQuestion.length < 2) return [];

  const intent = detectQuestionType(rawQuestion);
  const subject = extractSubjectFromQuestion(rawQuestion);
  const windows = useWindows.getState().windows;

  // Build keyword list for cross-article search fallback
  const subjectTokens = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const results: QAResult[] = [];

  // ── Phase 1: Match subject to open article titles ──
  let bestMatch: { windowId: string; url: string; title: string; score: number } | null = null;

  for (const win of windows) {
    if (!win.url) continue;
    const articleTitle = extractTitle(win.url);
    if (!articleTitle || articleTitle.startsWith("Special:") || articleTitle.startsWith("File:")) continue;

    const matchScore = fuzzyMatchTitle(articleTitle, subject);
    if (matchScore >= 0.6 && (!bestMatch || matchScore > bestMatch.score)) {
      bestMatch = { windowId: win.id, url: win.url, title: articleTitle, score: matchScore };
    }
  }

  // ── Phase 2: Extract answer from best-matching article ──
  if (bestMatch) {
    const cached = getCachedArticle(bestMatch.title);
    if (cached?.html) {
      const content = htmlToArticleContent(cached.html, bestMatch.title);
      // Use the article's actual title as entity name for more accurate text extraction
      const entityName = bestMatch.title.replace(/_/g, " ").replace(/\s*\([^)]*\)\s*$/, "");
      const result = buildAnswer(content, intent, entityName);
      if (result) {
        results.push({
          answer: result.answer,
          articleTitle: bestMatch.title.replace(/_/g, " "),
          articleUrl: bestMatch.url,
          windowId: bestMatch.windowId,
          score: result.confidence,
        });
      }
    }
  }

  // ── Phase 3: Cross-article keyword search (only if NO title matched at all) ──
  if (!bestMatch && subjectTokens.length > 0) {
    const crossResults = searchAcrossArticles(subjectTokens, subject);
    for (const cr of crossResults) {
      const win = windows.find((w) => {
        const t = extractTitle(w.url);
        return t && t.replace(/_/g, " ") === cr.title;
      });
      if (win) {
        results.push({
          answer: cr.answer,
          articleTitle: cr.title,
          articleUrl: win.url,
          windowId: win.id,
          score: 0.5,
        });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique: QAResult[] = [];
  for (const r of results) {
    const key = r.answer.toLowerCase().slice(0, 80);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  return unique.slice(0, 5);
}
