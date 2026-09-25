import { memo, useEffect, useRef } from "react";
import { escapeHtml, extractTitle, isPdfUrl, isWaybackUrl, isOriginalRefLabel, WIKI_STYLESHEET_URL } from "../utils/wiki";
import { prefetchArticles } from "../utils/articleCache";
import { prefetchPdf } from "../utils/pdfCache";
import { useWindows } from "../store/windows";

// Fetch Wikipedia CSS once, share via adoptedStyleSheets across all shadow DOMs
let sharedWikiStyleSheet: CSSStyleSheet | null = null;
let wikiStyleSheetPromise: Promise<CSSStyleSheet> | null = null;

function getWikiStyleSheet(): CSSStyleSheet | null {
  return sharedWikiStyleSheet;
}

function ensureWikiStyleSheet(): Promise<CSSStyleSheet> {
  if (sharedWikiStyleSheet) return Promise.resolve(sharedWikiStyleSheet);
  if (wikiStyleSheetPromise) return wikiStyleSheetPromise;
  wikiStyleSheetPromise = fetch(WIKI_STYLESHEET_URL)
    .then((res) => res.text())
    .then((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      sharedWikiStyleSheet = sheet;
      return sheet;
    })
    .catch(() => {
      // Fallback: return empty sheet
      const sheet = new CSSStyleSheet();
      sharedWikiStyleSheet = sheet;
      return sheet;
    });
  return wikiStyleSheetPromise;
}

// Kick off fetch immediately
ensureWikiStyleSheet();

type Props = {
  winId?: string;
  title: string;
  html: string;
  scrollTop: number;
  onLinkClick?: (title: string, imageUrl?: string, href?: string) => void;
  onScrollChange?: (scrollTop: number) => void;
};

const FALLBACK_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #a2a9b1; padding: 4px 8px; }
  th { background: #eaecf0; font-weight: 600; }
  img { max-width: 100%; height: auto; }
`;

const SHADOW_STYLES = `
  :host {
    display: block;
    height: 100%;
    overflow: auto;
    scrollbar-width: none;
    font-size: 18px;
    color: #202122;
  }

  .wiki-title {
    font-family: 'Linux Libertine', 'Georgia', 'Times', serif;
    font-size: 1.8em;
    font-weight: 400;
    line-height: 1.3;
    margin: 0 0 0.25em;
    padding-bottom: 0.2em;
    border-bottom: 1px solid #a2a9b1;
  }

  .freeze {
    padding: 0 16px 16px;
    user-select: text;
    overflow: visible;
  }

  .freeze .mw-parser-output {
    overflow-wrap: anywhere;
    word-break: break-word;
    min-width: 0;
  }

  .freeze .mw-parser-output > p {
    text-align: justify;
  }

  .freeze a { color: #0645ad; text-decoration: none; }
  .freeze a:hover { text-decoration: underline; }
  .freeze a:visited { color: #0b0080; }
  .freeze a.new,
  .freeze a.redlink { color: #d33; }

  .freeze a.opened-link {
    display: inline-block;
    padding: 1px 9px;
    margin: -1px 2px;
    border: 1px solid rgba(156, 163, 175, 0.6);
    background: linear-gradient(135deg, rgba(107, 114, 128, 0.55), rgba(75, 85, 99, 0.4));
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border-radius: 9999px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    font-weight: 500;
    color: #ffffff !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    text-decoration: none !important;
    animation: opened-link-pop 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .freeze a.opened-link:has(img),
  .freeze a.opened-link:has(.image),
  .freeze a.opened-link img {
    border: none !important;
    background: transparent !important;
    padding: 0 !important;
    margin: 0 !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    border-radius: 0 !important;
    animation: none !important;
  }

  @keyframes opened-link-pop {
    0% {
      transform: scale(0.9);
      opacity: 0.8;
    }
    65% {
      transform: scale(1.06);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .freeze .shortdescription,
  .freeze .mw-empty-elt,
  .freeze .noprint { display: none !important; }

  .freeze .mw-references-wrap { font-size: 0.85em; margin: 0.5em 0; }
  .freeze .reference-text { font-size: 0.9em; }
  .freeze .reflist { font-size: 90%; }

  /* Tables — Wikipedia's CSS doesn't fully style these in shadow DOM */
  .freeze table { border-collapse: collapse; margin: 0.5em 0; font-size: 0.9em; }
  .freeze th, .freeze td { border: 1px solid #a2a9b1; padding: 4px 8px; }
  .freeze th { background: #eaecf0; font-weight: 600; }

  /* Thumbnails */
  .freeze .thumb { margin: 0.5em 0 1.3em 1.4em; overflow: hidden; width: auto; }
  .freeze .thumb.tnone, .freeze .thumb.floatnone { float: none; margin: 0.5em auto; }
  .freeze .thumb.tleft, .freeze .thumb.floatleft { float: left; margin: 0.5em 1.4em 1.3em 0; }
  .freeze .thumb.tright, .freeze .thumb.floatright { float: right; margin: 0.5em 0 1.3em 1.4em; }
  .freeze .thumb.tnone, .freeze .thumb.tleft, .freeze .thumb.floatnone, .freeze .thumb.floatleft { clear: left; }
  .freeze .thumb.tright, .freeze .thumb.floatright { clear: right; }
  .freeze .thumbinner { padding: 3px; font-size: 94%; text-align: center; overflow: hidden; background: #f8f9fa; border: 1px solid #a2a9b1; }
  .freeze .thumbcaption { padding: 3px 6px; font-size: 94%; line-height: 1.4; text-align: left; color: #54595d; }

  /* Figures */
  .freeze figure { display: block; margin: 0.5em 0; padding: 0; background: #f8f9fa; border: 1px solid #c8ccd1; }
  .freeze figure.mw-default-size, .freeze figure.mw-file-element { float: right; clear: right; margin: 0.5em 0 0.5em 1em; width: auto; max-width: min(260px, 40%); }
  .freeze figure.mw-halign-center { float: none; clear: none; margin: 1em auto; max-width: min(400px, 80%); width: fit-content; }
  .freeze figure.mw-default-size.tleft, .freeze figure.mw-file-element.tleft { float: left; margin: 0.5em 1.4em 0.5em 0; }
  .freeze figure.mw-default-size.tnone, .freeze figure.mw-file-element.tnone { float: none; margin: 0.5em auto; }
  .freeze figure img { display: block; width: 100%; height: auto; }
  .freeze figure figcaption { display: block; line-height: 1.4; font-size: 0.85em; padding: 4px 2px 0; text-align: left; color: #54595d; overflow-wrap: break-word; }
  .freeze .mw-file-description { display: block; line-height: 0; }

  /* Infobox */
  .freeze table.infobox, .freeze .infobox { float: right; clear: right; margin: 0.5em 0 0.5em 1em; width: 22em; border: 1px solid #a2a9b1; border-spacing: 3px; background: #f8f9fa; color: #000; padding: 5px; font-size: 90%; line-height: 1.5; }
  .freeze .infobox caption, .freeze .infobox-title, .freeze .infobox-above { font-size: 125%; font-weight: 600; }
  .freeze .infobox-image { text-align: center; padding: 5px 0; }
  .freeze .infobox-image img { max-width: 100%; height: auto; }
  .freeze .infobox-header, .freeze .infobox-label, .freeze .infobox-data, .freeze .infobox-subheader { vertical-align: top; padding: 2px 6px; }
  .freeze .infobox-label { font-weight: 600; white-space: nowrap; width: 1%; }
  .freeze .infobox-data { word-wrap: break-word; }

  /* Hatnote */
  .freeze .hatnote { font-style: italic; color: #54595d; margin: 0.5em 0; font-size: 0.9em; padding-left: 1.6em; }
`;

const StaticPreview = memo(function StaticPreview({ winId, title, html, scrollTop, onLinkClick, onScrollChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({ onLinkClick, onScrollChange });
  const scrollTopRef = useRef(scrollTop);

  useEffect(() => {
    callbacksRef.current = { onLinkClick, onScrollChange };
  }, [onLinkClick, onScrollChange]);

  // Sync scrollTop ref without rebuilding the Shadow DOM
  useEffect(() => {
    scrollTopRef.current = scrollTop;
    const host = hostRef.current;
    if (host && !host.contains(document.activeElement)) {
      host.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const targetScroll = scrollTopRef.current;
    let userInteracted = false;
    let isRestoring = true;

    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    root.innerHTML = `
      <style>${FALLBACK_STYLES}</style>
      <style>${SHADOW_STYLES}</style>
      <div class="freeze mediawiki sitedir-ltr s-talk mw-body-content">
        <h1 class="wiki-title">${escapeHtml(title.replace(/_/g, " "))}</h1>
        <div class="mw-parser-output">${html}</div>
      </div>
    `;

    // Restore opened-link highlights for currently open child windows spawned by this parent window
    if (winId) {
      const openChildHrefs = useWindows
        .getState()
        .windows.filter((w) => w.parentId === winId && w.sourceHref)
        .map((w) => w.sourceHref!);

      if (openChildHrefs.length > 0) {
        const links = root.querySelectorAll("a[href]");
        links.forEach((a) => {
          const h = a.getAttribute("href") || "";
          const wikiTitle = extractTitle(h);
          if (
            openChildHrefs.some(
              (oh) => oh === h || (wikiTitle && extractTitle(oh) === wikiTitle),
            )
          ) {
            if (!a.querySelector("img")) {
              a.classList.add("opened-link");
            }
          }
        });
      }
    }

    // Share Wikipedia CSS via adoptedStyleSheets (1 fetch, reused by all windows)
    const wikiSheet = getWikiStyleSheet();
    if (wikiSheet && root.adoptedStyleSheets) {
      root.adoptedStyleSheets = [wikiSheet];
    } else if (!wikiSheet) {
      // Not fetched yet — fetch async and apply when ready
      ensureWikiStyleSheet().then((sheet) => {
        if (host.isConnected && root.adoptedStyleSheets) {
          root.adoptedStyleSheets = [sheet];
        }
      });
    }

    host.scrollTop = targetScroll;

    const markUserInteraction = () => {
      userInteracted = true;
      isRestoring = false;
    };

    const handleScroll = () => {
      if (!isRestoring && host.isConnected) {
        callbacksRef.current.onScrollChange?.(host.scrollTop);
      }
    };

    const restore = () => {
      if (userInteracted || !host.isConnected) return;
      host.scrollTop = targetScroll;
    };

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const linkText = (a.textContent || "").trim();

      if (isOriginalRefLabel(linkText)) {
        e.preventDefault();
        e.stopPropagation();
        alert("This 'original' link is a dead Wikipedia citation that no longer exists on the web. Please use the archived copy link instead.");
        return;
      }

      if (isWaybackUrl(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }

      let anchorId: string | null = null;
      if (href.startsWith("#")) {
        anchorId = href.slice(1);
      } else if (href.includes("#") && extractTitle(href) === title) {
        anchorId = href.split("#")[1];
      }

      if (anchorId) {
        e.preventDefault();
        e.stopPropagation();
        const el = root.querySelector(`[id="${CSS.escape(anchorId)}"]`) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      const wikiTitle = extractTitle(href);
      if (wikiTitle && callbacksRef.current.onLinkClick) {
        e.preventDefault();
        e.stopPropagation();
        if (!a.querySelector("img")) {
          a.classList.add("opened-link");
        }
        const imageUrl = wikiTitle.startsWith("File:")
          ? (a.querySelector("img")?.getAttribute("src") ?? undefined)
          : undefined;
        callbacksRef.current.onLinkClick(wikiTitle, imageUrl, href);
      } else if (href && !href.startsWith("#")) {
        e.preventDefault();
        e.stopPropagation();
        if (!a.querySelector("img")) {
          a.classList.add("opened-link");
        }
        if (isPdfUrl(href) && callbacksRef.current.onLinkClick) {
          const pdfTitle = decodeURIComponent(href.split("/").pop()?.split("?")[0]?.split("#")[0] ?? "PDF Document");
          callbacksRef.current.onLinkClick(pdfTitle, undefined, href);
        } else {
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }
    };

    const handleHover = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const linkText = (a.textContent || "").trim();
      if (isWaybackUrl(href) || isOriginalRefLabel(linkText)) return;
      const wikiTitle = extractTitle(href);
      if (wikiTitle && !isPdfUrl(wikiTitle) && !isPdfUrl(href)) {
        prefetchArticles([wikiTitle]);
      } else if (href && (isPdfUrl(href) || (wikiTitle && isPdfUrl(wikiTitle)))) {
        prefetchPdf(href);
      }
    };

    const handleLinkClosed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !winId || detail.parentId !== winId) return;

      const remaining = useWindows
        .getState()
        .windows.filter(
          (w) =>
            w.id !== detail.closingId &&
            w.parentId === detail.parentId &&
            w.sourceHref === detail.href,
        );

      if (remaining.length === 0) {
        const targetHref = detail.href;
        const targetWikiTitle = extractTitle(targetHref);
        const links = root.querySelectorAll("a.opened-link");
        links.forEach((a) => {
          const h = a.getAttribute("href") || "";
          if (h === targetHref || (targetWikiTitle && extractTitle(h) === targetWikiTitle)) {
            a.classList.remove("opened-link");
          }
        });
      }
    };

    window.addEventListener("wikiboard:link-closed", handleLinkClosed);

    root.addEventListener("click", handleClick);
    root.addEventListener("mouseover", handleHover);
    host.addEventListener("scroll", handleScroll, { passive: true });
    host.addEventListener("wheel", markUserInteraction, { passive: true });
    host.addEventListener("pointerdown", markUserInteraction, { passive: true });
    host.addEventListener("touchstart", markUserInteraction, { passive: true });
    host.addEventListener("keydown", markUserInteraction, { passive: true });

    restore();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => { restore(); })
        : null;

    const contentDiv = root.querySelector(".freeze");
    if (contentDiv && resizeObserver) {
      resizeObserver.observe(contentDiv);
    }

    const images = root.querySelectorAll("img");
    const onImgLoad = () => restore();
    images.forEach((img) =>
      img.addEventListener("load", onImgLoad, { once: true }),
    );

    let raf = 0;
    raf = requestAnimationFrame(() => {
      restore();
      setTimeout(() => { isRestoring = false; }, 300);
    });

    return () => {
      window.removeEventListener("wikiboard:link-closed", handleLinkClosed);
      cancelAnimationFrame(raf);
      if (resizeObserver) resizeObserver.disconnect();
      images.forEach((img) => img.removeEventListener("load", onImgLoad));
      host.removeEventListener("scroll", handleScroll);
      host.removeEventListener("wheel", markUserInteraction);
      host.removeEventListener("pointerdown", markUserInteraction);
      host.removeEventListener("touchstart", markUserInteraction);
      host.removeEventListener("keydown", markUserInteraction);
      root.removeEventListener("click", handleClick);
      root.removeEventListener("mouseover", handleHover);
    };
  }, [title, html, winId]);

  return <div ref={hostRef} className="w-full h-full overflow-auto scrollbar-hide bg-white" />;
});

export default StaticPreview;
