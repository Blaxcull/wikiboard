import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindows } from "../store/windows";
import { getCamera } from "../utils/camera";

type Props = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isMaximized: boolean;
  windowId: string;
};

export default function PdfSelectionToolbox({ scrollContainerRef, isMaximized, windowId }: Props) {
  const addWindow = useWindows((s) => s.addWindow);
  const updateWindow = useWindows((s) => s.updateWindow);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const selectedTextRef = useRef("");
  const toolboxRef = useRef<HTMLDivElement>(null);

  const getSelectedText = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    return { text, range: sel.getRangeAt(0) };
  }, []);

  const showToolbox = useCallback(
    (e: MouseEvent) => {
      if (!isMaximized) {
        setVisible(false);
        return;
      }

      const target = e.target as HTMLElement;
      if (toolboxRef.current?.contains(target)) return;

      if (!target.closest(".pdf-text-layer")) {
        setVisible(false);
        return;
      }

      // Defer to let the browser finalize the selection
      requestAnimationFrame(() => {
        const sel = getSelectedText();
        if (!sel) {
          setVisible(false);
          return;
        }

        selectedTextRef.current = sel.text;

        const toolboxW = 72;
        const toolboxH = 32;
        const rect = sel.range.getBoundingClientRect();

        let x = rect.left + (rect.width - toolboxW) / 2;
        let y = rect.top - toolboxH - 8;

        x = Math.max(8, Math.min(x, window.innerWidth - toolboxW - 8));
        if (y < 8) y = rect.bottom + 8;

        setPos({ x, y });
        setVisible(true);
      });
    },
    [getSelectedText, isMaximized],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("mouseup", showToolbox);
    return () => container.removeEventListener("mouseup", showToolbox);
  }, [scrollContainerRef, showToolbox]);

  // Dismiss on click outside
  useEffect(() => {
    if (!visible) return;
    const handle = (e: MouseEvent) => {
      if (toolboxRef.current && !toolboxRef.current.contains(e.target as HTMLElement)) {
        setVisible(false);
      }
    };
    // Delay to avoid catching the same mouseup that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handle);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handle);
    };
  }, [visible]);

  const handleHighlight = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const clientRects = range.getClientRects();

    // Find the page container (positioned ancestor of the text layer)
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
    const pageContainer = el?.closest("[data-page]") as HTMLElement | null;

    if (pageContainer) {
      const containerRect = pageContainer.getBoundingClientRect();
      const { zoom } = getCamera();
      const containerW = pageContainer.clientWidth;
      const containerH = pageContainer.clientHeight;
      if (containerW > 0 && containerH > 0) {
        for (const rect of clientRects) {
          const highlight = document.createElement("div");
          highlight.className = "pdf-highlight";
          highlight.style.position = "absolute";
          highlight.style.left = `${((rect.left - containerRect.left) / zoom / containerW) * 100}%`;
          highlight.style.top = `${((rect.top - containerRect.top) / zoom / containerH) * 100}%`;
          highlight.style.width = `${(rect.width / zoom / containerW) * 100}%`;
          highlight.style.height = `${(rect.height / zoom / containerH) * 100}%`;
          highlight.style.backgroundColor = "rgba(255, 255, 0, 0.4)";
          highlight.style.pointerEvents = "none";
          highlight.style.zIndex = "0";
          pageContainer.appendChild(highlight);
        }
      }
    }

    sel.removeAllRanges();
    setVisible(false);
  }, []);

  const handleSearchWikipedia = useCallback(async () => {
    const text = selectedTextRef.current;
    if (!text) return;

    try {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=${encodeURIComponent(text)}`
      );
      if (res.ok) {
        const [, titles, , urls]: [string, string[], string[], string[]] = await res.json();
        if (titles.length > 0 && urls.length > 0) {
          addWindow({ title: titles[0], url: urls[0] });
        }
      }
    } catch {
      /* fetch failed */
    }

    updateWindow(windowId, { pdfMaximized: false });
    setVisible(false);
  }, [addWindow, updateWindow, windowId]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={toolboxRef}
      className="pdf-selection-toolbox"
      style={{ left: pos.x, top: pos.y }}
    >
      <button className="pdf-selection-toolbox-btn" onClick={handleHighlight} title="Highlight">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>
      <div className="pdf-selection-toolbox-divider" />
      <button className="pdf-selection-toolbox-btn" onClick={handleSearchWikipedia} title="Search Wikipedia">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
