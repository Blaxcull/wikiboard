import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindows } from "../store/windows";
import { getHighlightBgColor } from "../App";

type Props = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isMaximized: boolean;
  windowId: string;
  pdfTitle?: string;
};

export default function PdfSelectionToolbox({ scrollContainerRef, isMaximized, windowId, pdfTitle }: Props) {
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

    const text = selectedTextRef.current || sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const clientRects = range.getClientRects();

    // Find the page container (positioned ancestor of the text layer)
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    const pageContainer = el?.closest("[data-page]") as HTMLElement | null;

    const noteId = crypto.randomUUID();
    const color = getHighlightBgColor("yellow");

    if (pageContainer) {
      const containerRect = pageContainer.getBoundingClientRect();
      if (containerRect.width > 0 && containerRect.height > 0) {
        for (const rect of clientRects) {
          if (rect.width === 0 || rect.height === 0) continue;
          const highlight = document.createElement("div");
          highlight.className = "pdf-highlight";
          highlight.dataset.noteId = noteId;
          highlight.style.position = "absolute";
          highlight.style.left = `${((rect.left - containerRect.left) / containerRect.width) * 100}%`;
          highlight.style.top = `${((rect.top - containerRect.top) / containerRect.height) * 100}%`;
          highlight.style.width = `${(rect.width / containerRect.width) * 100}%`;
          highlight.style.height = `${(rect.height / containerRect.height) * 100}%`;
          highlight.style.backgroundColor = color;
          highlight.style.pointerEvents = "none";
          highlight.style.zIndex = "1";
          pageContainer.appendChild(highlight);
        }
      }
    }

    const approxLines = Math.max(1, Math.ceil(text.length / 26));
    const initHeight = Math.max(64, Math.min(450, 42 + approxLines * 25));

    const pageAttr = pageContainer?.getAttribute("data-page");
    const pageNum = pageAttr ? parseInt(pageAttr, 10) : undefined;

    const cleanTitle = (pdfTitle || "PDF").replace(/^File:/i, "").replace(/_/g, " ");

    addWindow({
      id: noteId,
      contentType: "sticky",
      isExcerptNote: true,
      title: `Note (${cleanTitle})`,
      stickyText: text,
      parentId: windowId,
      pdfPage: pageNum,
      width: 260,
      height: initHeight,
      noteColor: "yellow",
    });

    sel.removeAllRanges();
    setVisible(false);
  }, [addWindow, pdfTitle, windowId]);

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
          addWindow({ title: titles[0], url: urls[0], parentId: windowId });
        } else {
          const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(text.replace(/ /g, "_"))}`;
          addWindow({ title: text, url: wikiUrl, parentId: windowId });
        }
      }
    } catch {
      /* fetch failed */
    }

    const targetWin = useWindows.getState().windows.find((w) => w.id === windowId);
    if (targetWin?.pdfPreMaximizedBounds) {
      const pre = targetWin.pdfPreMaximizedBounds;
      updateWindow(windowId, {
        x: pre.x,
        y: pre.y,
        width: pre.width,
        height: pre.height,
        pdfMaximized: false,
      });
    } else {
      updateWindow(windowId, { pdfMaximized: false });
    }
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
