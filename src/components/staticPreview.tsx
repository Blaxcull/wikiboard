import { useEffect, useRef } from "react";
import { WIKI_STYLESHEET_URL, escapeHtml, extractTitle } from "../utils/wiki";

type Props = {
  title: string;
  html: string;
  scrollTop: number;
  onLinkClick?: (title: string) => void;
  onScrollChange?: (scrollTop: number) => void;
};

const SHADOW_STYLES = `
  :host { display: block; height: 100%; overflow: auto; }
  .wiki-title {
    font-family: sans-serif;
    font-size: 1.75rem;
    font-weight: 400;
    line-height: 1.3;
    margin: 0 0 0.2em;
    padding-bottom: 0.1em;
    border-bottom: 1px solid #a2a9b1;
  }
  .freeze {
    padding: 8px;
    user-select: text;
  }
  .freeze a {
    color: #0645ad;
    text-decoration: none;
    cursor: pointer;
  }
  .freeze a:hover {
    text-decoration: underline;
  }
`;

let sharedShadowSheet: CSSStyleSheet | null = null;
function getSharedShadowSheet(): CSSStyleSheet | null {
  if (typeof CSSStyleSheet === "undefined" || !("adoptedStyleSheets" in Document.prototype || "adoptedStyleSheets" in ShadowRoot.prototype)) {
    return null;
  }
  if (!sharedShadowSheet) {
    try {
      sharedShadowSheet = new CSSStyleSheet();
      sharedShadowSheet.replaceSync(SHADOW_STYLES);
    } catch {
      sharedShadowSheet = null;
    }
  }
  return sharedShadowSheet;
}

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
    const sharedSheet = getSharedShadowSheet();
    const hasAdoptedSheets = Boolean(sharedSheet && root.adoptedStyleSheets);

    if (hasAdoptedSheets && sharedSheet) {
      if (!root.adoptedStyleSheets.includes(sharedSheet)) {
        root.adoptedStyleSheets = [sharedSheet];
      }
      root.innerHTML = `
        <link rel="stylesheet" href="${WIKI_STYLESHEET_URL}">
        <div class="freeze">
          <h1 class="wiki-title">${escapeHtml(title.replace(/_/g, " "))}</h1>
          ${html}
        </div>
      `;
    } else {
      root.innerHTML = `
        <style>${SHADOW_STYLES}</style>
        <link rel="stylesheet" href="${WIKI_STYLESHEET_URL}">
        <div class="freeze">
          <h1 class="wiki-title">${escapeHtml(title.replace(/_/g, " "))}</h1>
          ${html}
        </div>
      `;
    }

    // Unconditionally set host.scrollTop to targetScroll (0 for new windows)
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

    root.addEventListener("click", handleClick);
    host.addEventListener("scroll", handleScroll, { passive: true });
    host.addEventListener("wheel", markUserInteraction, { passive: true });
    host.addEventListener("pointerdown", markUserInteraction, { passive: true });
    host.addEventListener("touchstart", markUserInteraction, { passive: true });
    host.addEventListener("keydown", markUserInteraction, { passive: true });

    restore();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            restore();
          })
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
    const link = root.querySelector("link[rel=stylesheet]");
    let linkLoad: (() => void) | undefined;
    if (link) {
      linkLoad = () => {
        raf = requestAnimationFrame(() => {
          restore();
          setTimeout(() => {
            isRestoring = false;
          }, 300);
        });
      };
      if ((link as HTMLLinkElement).sheet) {
        linkLoad();
      } else {
        link.addEventListener("load", linkLoad, { once: true });
      }
    } else {
      raf = requestAnimationFrame(() => {
        restore();
        setTimeout(() => {
          isRestoring = false;
        }, 300);
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      if (resizeObserver) resizeObserver.disconnect();
      images.forEach((img) => img.removeEventListener("load", onImgLoad));
      if (link && linkLoad) link.removeEventListener("load", linkLoad);
      host.removeEventListener("scroll", handleScroll);
      host.removeEventListener("wheel", markUserInteraction);
      host.removeEventListener("pointerdown", markUserInteraction);
      host.removeEventListener("touchstart", markUserInteraction);
      host.removeEventListener("keydown", markUserInteraction);
      root.removeEventListener("click", handleClick);
    };
  }, [title, html, scrollTop]);

  return <div ref={hostRef} className="static-preview" />;
}
