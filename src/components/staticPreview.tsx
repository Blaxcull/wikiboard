import { useEffect, useRef } from "react";
import { escapeHtml, extractTitle } from "../utils/wiki";
import { prefetchArticles } from "../utils/articleCache";

type Props = {
  title: string;
  html: string;
  scrollTop: number;
  onLinkClick?: (title: string) => void;
  onScrollChange?: (scrollTop: number) => void;
};

const SHADOW_STYLES = `
  :host {
    display: block;
    height: 100%;
    overflow: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #202122;
    line-height: 1.6;
    font-size: 16px;
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

  /* Links */
  .freeze a { color: #0645ad; text-decoration: none; }
  .freeze a:hover { text-decoration: underline; }
  .freeze a:visited { color: #0b0080; }
  .freeze a.new,
  .freeze a.redlink { color: #d33; }

  /* Hidden elements */
  .freeze .shortdescription,
  .freeze .mw-empty-elt,
  .freeze .noprint { display: none !important; }

  /* Hatnote */
  .freeze .hatnote {
    font-style: italic;
    color: #54595d;
    margin: 0.5em 0;
    font-size: 0.9em;
    padding-left: 1.6em;
  }

  /* ===== FIGURES / IMAGES ===== */

  .freeze figure {
    display: block !important;
    margin: 0.5em 0 !important;
    padding: 0 !important;
    width: fit-content !important;
    max-width: min(260px, 40%) !important;
    background: #f8f9fa;
    border: 1px solid #c8ccd1;
  }

  .freeze figure.mw-default-size,
  .freeze figure.mw-file-element {
    float: right !important;
    clear: right !important;
    margin: 0.5em 0 0.5em 1em !important;
    max-width: min(260px, 40%) !important;
    width: auto !important;
  }

  /* Grouped figures float as one block */
  .freeze .wiki-figure-group {
    float: right !important;
    clear: right !important;
    margin: 0.5em 0 0.5em 1em !important;
    width: min(260px, 40%) !important;
  }
  .freeze .wiki-figure-group figure {
    float: none !important;
    clear: none !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .freeze figure.mw-halign-center {
    float: none !important;
    clear: none !important;
    margin: 1em auto !important;
    max-width: min(400px, 80%) !important;
    width: fit-content !important;
  }

  .freeze figure.mw-default-size.tleft,
  .freeze figure.mw-file-element.tleft {
    float: left !important;
    margin: 0.5em 1.4em 0.5em 0 !important;
  }
  .freeze figure.mw-default-size.tnone,
  .freeze figure.mw-file-element.tnone {
    float: none !important;
    margin: 0.5em auto !important;
  }
  .freeze figure.mw-default-size.tright,
  .freeze figure.mw-file-element.tright { clear: right !important; }

  .freeze figure.tright { clear: right !important; }
  .freeze figure.tleft  { clear: left !important; }

  .freeze .mw-file-description {
    display: block !important;
    line-height: 0 !important;
  }
  .freeze figure img {
    display: block !important;
    width: 100% !important;
    height: auto !important;
  }

  .freeze figure figcaption {
    display: block !important;
    line-height: 1.4 !important;
    font-size: 0.85em !important;
    padding: 4px 2px 0 !important;
    text-align: left !important;
    color: #54595d !important;
    overflow-wrap: break-word !important;
    word-wrap: break-word !important;
  }

  /* ===== LEGACY THUMBNAILS ===== */

  .freeze .thumb {
    margin: 0.5em 0 1.3em 1.4em !important;
    float: right !important;
    overflow: hidden;
    width: auto;
  }
  .freeze .thumb.tnone,
  .freeze .thumb.floatnone { float: none !important; margin: 0.5em auto !important; }
  .freeze .thumb.tleft,
  .freeze .thumb.floatleft { float: left !important; margin: 0.5em 1.4em 1.3em 0 !important; }
  .freeze .thumb.tnone,
  .freeze .thumb.tleft,
  .freeze .thumb.floatnone,
  .freeze .thumb.floatleft  { clear: left !important; }
  .freeze .thumb.tright,
  .freeze .thumb.floatright { clear: right !important; }
  .freeze .thumbinner {
    padding: 3px;
    font-size: 94%;
    text-align: center;
    overflow: hidden;
    background: #f8f9fa;
    border: 1px solid #a2a9b1;
  }
  .freeze .thumbcaption {
    padding: 3px 6px;
    font-size: 94%;
    line-height: 1.4;
    text-align: left;
    color: #54595d;
  }

  /* ===== INFOBOX ===== */

  .freeze table.infobox,
  .freeze .infobox {
    float: right !important;
    clear: right !important;
    margin: 0.5em 0 0.5em 1em !important;
    width: 22em !important;
    border: 1px solid #a2a9b1 !important;
    border-spacing: 3px;
    background: #f8f9fa;
    color: #000;
    padding: 5px;
    font-size: 90%;
    line-height: 1.5;
  }
  .freeze .infobox caption,
  .freeze .infobox-title,
  .freeze .infobox-above {
    font-size: 125%;
    font-weight: 600;
  }
  .freeze .infobox-image { text-align: center; padding: 5px 0; }
  .freeze .infobox-image img { max-width: 100%; height: auto; }
  .freeze .infobox-header,
  .freeze .infobox-label,
  .freeze .infobox-data,
  .freeze .infobox-subheader { vertical-align: top; padding: 2px 6px; }
  .freeze .infobox-label { font-weight: 600; white-space: nowrap; width: 1%; }
  .freeze .infobox-data { word-wrap: break-word; }

  /* ===== SIDEBAR / SIDEBOX ===== */

  .freeze .side-box {
    border: 1px solid #a2a9b1;
    padding: 8px;
    margin: 0.5em 0;
    font-size: 0.85em;
  }
  .freeze .side-box-flex { display: flex; gap: 8px; align-items: flex-start; }
  .freeze .side-box-image img { max-width: 50px; }

  /* ===== REFERENCES ===== */

  .freeze .mw-references-wrap { font-size: 0.85em; margin: 0.5em 0; }
  .freeze .reference-text { font-size: 0.9em; }
  .freeze .reflist { font-size: 90%; }

  /* ===== TEXT / TYPOGRAPHY ===== */

  .freeze p {
    margin: 0.5em 0;
    line-height: 1.6;
  }
  .freeze h1, .freeze h2, .freeze h3, .freeze h4, .freeze h5, .freeze h6 {
    margin: 1em 0 0.3em;
    font-weight: 600;
    line-height: 1.3;
    font-family: 'Linux Libertine', 'Georgia', 'Times', serif;
  }
  .freeze h1 { font-size: 1.8em; }
  .freeze h2 {
    font-size: 1.5em;
    border-bottom: 1px solid #a2a9b1;
    padding-bottom: 0.2em;
  }
  .freeze h3 { font-size: 1.17em; }
  .freeze h4 { font-size: 1em; }
  .freeze ul, .freeze ol { margin: 0.3em 0 0.3em 1.6em; padding: 0; }
  .freeze li { margin: 0.2em 0; }
  .freeze blockquote {
    border-left: 3px solid #a2a9b1;
    margin: 0.5em 0 0.5em 1em;
    padding: 0.5em 1em;
    color: #54595d;
  }

  /* ===== TABLES ===== */

  .freeze table {
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: 0.9em;
  }
  .freeze th, .freeze td {
    border: 1px solid #a2a9b1;
    padding: 4px 8px;
  }
  .freeze th { background: #eaecf0; font-weight: 600; }
  .freeze .wikitable {
    background: #f8f9fa;
    border: 1px solid #a2a9b1;
    color: #000;
    margin: 1em 0;
  }
  .freeze table.wikitable.center {
    float: left !important;
    margin: 0.5em 1em 0.5em 0 !important;
    width: auto !important;
  }
  .freeze .wikitable.th { background: #eaecf0; text-align: center; }

  /* ===== CODE / PRE ===== */

  .freeze code {
    font-size: 0.9em;
    background: #f8f9fa;
    padding: 1px 4px;
    border: 1px solid #eaecf0;
  }
  .freeze pre {
    background: #f8f9fa;
    border: 1px solid #a2a9b1;
    padding: 8px;
    overflow: auto;
    font-size: 0.9em;
  }
`;

export default function StaticPreview({ title, html, scrollTop, onLinkClick, onScrollChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({ onLinkClick, onScrollChange });

  useEffect(() => {
    callbacksRef.current = { onLinkClick, onScrollChange };
  }, [onLinkClick, onScrollChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const targetScroll = scrollTop;
    let userInteracted = false;
    let isRestoring = true;

    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    root.innerHTML = `
      <style>${SHADOW_STYLES}</style>
      <div class="freeze">
        <h1 class="wiki-title">${escapeHtml(title.replace(/_/g, " "))}</h1>
        <div class="mw-parser-output">${html}</div>
      </div>
    `;

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
      const wikiTitle = extractTitle(href);
      if (wikiTitle && callbacksRef.current.onLinkClick) {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onLinkClick(wikiTitle);
      }
    };

    const handleHover = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const wikiTitle = extractTitle(href);
      if (wikiTitle) prefetchArticles([wikiTitle]);
    };

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
  }, [title, html, scrollTop]);

  return <div ref={hostRef} className="static-preview" />;
}
