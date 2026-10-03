import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindows } from "../store/windows";

type Props = {
  hostRef: React.RefObject<HTMLDivElement | null>;
  winId?: string;
  articleTitle: string;
};

export default function ArticleSelectionToolbox({ hostRef, winId, articleTitle }: Props) {
  const addWindow = useWindows((s) => s.addWindow);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const selectedTextRef = useRef("");
  const toolboxRef = useRef<HTMLDivElement>(null);

  const checkSelection = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const root = host.shadowRoot;
    const rootWithSel = root as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
    const sel = rootWithSel?.getSelection ? rootWithSel.getSelection() : window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setVisible(false);
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setVisible(false);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setVisible(false);
      return;
    }

    selectedTextRef.current = text;

    const toolboxW = 72;
    const toolboxH = 34;

    let x = rect.left + (rect.width - toolboxW) / 2;
    let y = rect.top - toolboxH - 8;

    x = Math.max(8, Math.min(x, window.innerWidth - toolboxW - 8));
    if (y < 8) y = rect.bottom + 8;

    setPos({ x, y });
    setVisible(true);
  }, [hostRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onMouseUp = () => {
      requestAnimationFrame(checkSelection);
    };

    host.addEventListener("mouseup", onMouseUp);
    return () => host.removeEventListener("mouseup", onMouseUp);
  }, [hostRef, checkSelection]);

  // Dismiss on click outside
  useEffect(() => {
    if (!visible) return;
    const handle = (e: MouseEvent) => {
      if (toolboxRef.current && !toolboxRef.current.contains(e.target as HTMLElement)) {
        setVisible(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handle);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handle);
    };
  }, [visible]);

  const handleCreateNoteBox = useCallback(() => {
    const text = selectedTextRef.current;
    if (!text) return;

    const approxLines = Math.max(1, Math.ceil(text.length / 28));
    const initHeight = Math.max(64, Math.min(450, 32 + approxLines * 22));

    const noteId = crypto.randomUUID();

    addWindow({
      id: noteId,
      contentType: "sticky",
      isExcerptNote: true,
      title: `Note (${articleTitle.replace(/^File:/i, "").replace(/_/g, " ")})`,
      stickyText: text,
      parentId: winId,
      width: 260,
      height: initHeight,
      noteColor: "yellow",
    });

    const host = hostRef.current;
    if (host) {
      const root = host.shadowRoot;
      const rootWithSel = root as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
      const sel = rootWithSel?.getSelection ? rootWithSel.getSelection() : window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        try {
          const mark = document.createElement("mark");
          mark.className = "wiki-highlight";
          mark.dataset.noteId = noteId;
          mark.style.backgroundColor = "rgba(254, 240, 138, 0.85)";
          mark.style.color = "inherit";
          mark.style.borderRadius = "3px";
          mark.style.padding = "0 2px";
          mark.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
          range.surroundContents(mark);
        } catch {
          /* Fallback for cross-container selection */
          try {
            const fragment = range.extractContents();
            const mark = document.createElement("mark");
            mark.className = "wiki-highlight";
            mark.dataset.noteId = noteId;
            mark.style.backgroundColor = "rgba(254, 240, 138, 0.85)";
            mark.style.color = "inherit";
            mark.style.borderRadius = "3px";
            mark.style.padding = "0 2px";
            mark.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
            mark.appendChild(fragment);
            range.insertNode(mark);
          } catch {
            /* Range detached fallback */
          }
        }
        sel.removeAllRanges();
      }
    }
    setVisible(false);
  }, [addWindow, articleTitle, hostRef, winId]);

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
          addWindow({ title: titles[0], url: urls[0], parentId: winId });
        } else {
          const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(text.replace(/ /g, "_"))}`;
          addWindow({ title: text, url: wikiUrl, parentId: winId });
        }
      }
    } catch {
      const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(text.replace(/ /g, "_"))}`;
      addWindow({ title: text, url: wikiUrl, parentId: winId });
    }

    const host = hostRef.current;
    if (host) {
      const root = host.shadowRoot;
      const rootWithSel = root as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
    const sel = rootWithSel?.getSelection ? rootWithSel.getSelection() : window.getSelection();
      sel?.removeAllRanges();
    }
    setVisible(false);
  }, [addWindow, hostRef, winId]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={toolboxRef}
      className="pdf-selection-toolbox"
      style={{ left: pos.x, top: pos.y }}
    >
      <button className="pdf-selection-toolbox-btn" onClick={handleCreateNoteBox} title="Create Note Box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
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
