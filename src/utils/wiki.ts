const WIKI_ORIGIN = "https://en.wikipedia.org";

export function extractTitle(url: string): string | null {
  const match = url.match(/\/wiki\/([^#?]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export const WIKI_STYLESHEET_URL =
  `${WIKI_ORIGIN}/w/load.php?lang=en&modules=site.styles%7Cmediawiki.page.media%7Cskins.vector.styles&only=styles`;

function absolutize(url: string): string {
  try {
    return new URL(url, `${WIKI_ORIGIN}/wiki/`).href;
  } catch {
    return url;
  }
}

function absolutizeSrcset(value: string): string {
  return value
    .split(",")
    .map((part) => {
      const tokens = part.trim().split(/\s+/);
      if (tokens[0]) tokens[0] = absolutize(tokens[0]);
      return tokens.join(" ");
    })
    .join(", ");
}

const STRIP_SELECTORS = [
  "script",
  "noscript",
  ".mw-empty-elt",
  "style",
  "link[rel=dns-prefetch]",
  "meta",
  "base",
  ".shortdescription",
].join(",");

export function cleanArticleHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll(STRIP_SELECTORS).forEach((el) => el.remove());

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (
        attr.name.startsWith("data-") ||
        attr.name.startsWith("on") ||
        attr.name === "typeof" ||
        attr.name === "about" ||
        attr.name === "resource" ||
        attr.name === "property"
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });

  doc.querySelectorAll("img").forEach((img) => {
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  });

  doc.querySelectorAll("a[href], link[href], area[href]").forEach((el) => {
    el.setAttribute("href", absolutize(el.getAttribute("href") ?? ""));
  });
  doc.querySelectorAll("img[src], source[src]").forEach((el) => {
    el.setAttribute("src", absolutize(el.getAttribute("src") ?? ""));
  });
  doc
    .querySelectorAll("img[srcset], source[srcset]")
    .forEach((el) =>
      el.setAttribute("srcset", absolutizeSrcset(el.getAttribute("srcset") ?? "")),
    );

  return doc.body.innerHTML;
}

export type ArticleSummary = {
  title: string;
  description: string;
  extractHtml: string;
  thumbnail: string | null;
};

export async function fetchArticleSummary(title: string): Promise<ArticleSummary> {
  const res = await fetch(
    `${WIKI_ORIGIN}/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
  );
  if (!res.ok) throw new Error(`Wikipedia summary API error ${res.status}`);
  const data = await res.json();
  return {
    title: data.title ?? title,
    description: data.description ?? "",
    extractHtml: data.extract_html ?? "",
    thumbnail: data.thumbnail?.source ?? null,
  };
}

export async function fetchArticle(title: string): Promise<string> {
  const res = await fetch(
    `${WIKI_ORIGIN}/api/rest_v1/page/html/${encodeURIComponent(title)}`,
  );
  if (!res.ok) throw new Error(`Wikipedia REST API error ${res.status}`);
  const html = await res.text();
  return cleanArticleHtml(html);
}

export function extractFirstParagraph(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const firstP = doc.querySelector("p");
  return firstP?.textContent?.trim() ?? "";
}

export function extractFirstImage(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img");
  return img?.getAttribute("src") ?? null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
