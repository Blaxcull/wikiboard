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
  "link[rel=dns-prefetch]",
  "meta",
  "base",
  ".shortdescription",
].join(",");

export function cleanArticleHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Before removing .mw-empty-elt, hoist any <style> children out so
  // Wikipedia's template styles (hlist, navbar, navbox, etc.) survive.
  doc.querySelectorAll(".mw-empty-elt").forEach((el) => {
    el.querySelectorAll("style").forEach((s) => el.parentElement?.insertBefore(s, el));
  });

  doc.querySelectorAll(STRIP_SELECTORS).forEach((el) => el.remove());

  // Wrap consecutive <figure> elements in a single container so they float
  // as one block (text wraps around the group, not between individual images).
  function wrapConsecutiveFigures(parent: Element) {
    let figures: Element[] = [];
    const toWrap: Element[][] = [];

    for (const child of Array.from(parent.children)) {
      if (child.tagName === "FIGURE") {
        figures.push(child);
      } else {
        if (figures.length > 1) toWrap.push(figures);
        figures = [];
      }
    }
    if (figures.length > 1) toWrap.push(figures);

    // Process in reverse so earlier indices stay valid
    for (let k = toWrap.length - 1; k >= 0; k--) {
      const group = toWrap[k];
      const wrapper = doc.createElement("div");
      wrapper.className = "wiki-figure-group";
      group[0].parentNode?.insertBefore(wrapper, group[0]);
      group.forEach((fig) => wrapper.appendChild(fig));
    }
  }

  doc.querySelectorAll("p, section, div").forEach(wrapConsecutiveFigures);

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      // Preserve typeof on <figure> — Wikipedia's CSS uses figure[typeof~='mw:File/Thumb']
      if (attr.name === "typeof" && el.tagName === "FIGURE") continue;
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

export async function fetchFileUrl(title: string): Promise<{ url: string; width: number; height: number } | null> {
  const res = await fetch(
    `${WIKI_ORIGIN}/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0] as Record<string, unknown>;
  const imageinfo = page?.imageinfo as Array<Record<string, unknown>> | undefined;
  if (!imageinfo?.[0]) return null;
  const info = imageinfo[0];
  const mime = info.mime as string;
  if (!mime?.startsWith("image/")) return null;
  return {
    url: info.url as string,
    width: (info.width as number) ?? 300,
    height: (info.height as number) ?? 300,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
