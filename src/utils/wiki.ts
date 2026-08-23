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
    return new URL(url, `${WIKI_ORIGIN}/`).href;
  } catch {
    return url;
  }
}

/** Resolve relative URLs so content also renders outside the iframe (static preview) */
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

/** Page chrome & template fluff that has no place inside a board window */
const STRIP_SELECTORS = [
  "script",
  "noscript",
  ".mw-editsection", // [edit] links next to headings
  ".navbox", // bottom-of-article template navigation boxes
  ".vertical-navbox",
  ".navigation-not-searchable",
  ".mw-jump-link", // "jump to content" accessibility link
  ".mw-indicators",
  "#siteSub", // "From Wikipedia, the free encyclopedia"
  "#contentSub",
  "#contentSub2",
  ".metadata", // maintenance tags
  ".noprint", // print-hidden chrome (coordinates banners etc.)
  ".side-box", // sister-project boxes
  ".spoken-wikipedia",
  ".catlinks", // category links
  ".mw-empty-elt", // empty elements
].join(",");

/** Slim a parsed Wikipedia article: drop scripts/chrome/fluff, lazy images,
 *  absolute URLs, and heavy metadata attributes. Runs once per article before
 *  the HTML is cached/reused. */
export function cleanArticleHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll(STRIP_SELECTORS).forEach((el) => el.remove());

  // Strip all inline event handlers, RDFa, and Wikipedia data attributes
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

export async function fetchArticle(title: string): Promise<string> {
  const api = `${WIKI_ORIGIN}/w/api.php?action=parse&page=${encodeURIComponent(
    title,
  )}&format=json&origin=*&redirects=1&prop=text`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info);
  return cleanArticleHtml(data.parse.text["*"] as string);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
