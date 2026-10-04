import { useEffect, useRef, useState, useMemo } from "react";
import { useWindows } from "../store/windows";
import { prefetchArticles } from "../utils/articleCache";
import { searchVectorQuery, warmupVectorEngine } from "../utils/vectorEngine";
import { focusWindowAndParent } from "../utils/canvas/zoom";

type Suggestion = { title: string; url: string };

type VectorArticleMatch = {
  windowId: string;
  windowTitle: string;
  topChunkId: string;
  topSnippet: string;
  topScore: number;
};

type SearchMode = "wikipedia" | "vector";

export default function SearchBox() {
  const addWindow = useWindows((s) => s.addWindow);
  const windows = useWindows((s) => s.windows);
  const setActive = useWindows((s) => s.setActive);

  const [mode, setMode] = useState<SearchMode>("wikipedia");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [vectorMatches, setVectorMatches] = useState<VectorArticleMatch[]>([]);
  const [visible, setVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mouseMovedRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const openWindowIds = useMemo(() => {
    return windows.filter((w) => w.url && !w.stacked).map((w) => w.id);
  }, [windows]);

  useEffect(() => {
    if (visible) {
      mouseMovedRef.current = false;
      lastMousePosRef.current = null;
      // Always default to Wikipedia search mode on Spotlight open
      setMode("wikipedia");
      setSuggestions([]);
      setVectorMatches([]);
      setSelectedIndex(0);
      // Pre-warm ONNX transformer model in background Web Worker on Spotlight open
      warmupVectorEngine();
    } else {
      // Clear message text, suggestions, and vector matches when Spotlight closes
      setQuery("");
      setSuggestions([]);
      setVectorMatches([]);
      setSelectedIndex(0);
    }
  }, [visible]);

  // Alt + Space opens Spotlight Search (Alt + P removed)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.code === "Space" || e.key === " " || e.key === "Spacebar")) {
        e.preventDefault();
        mouseMovedRef.current = false;
        lastMousePosRef.current = null;
        setVisible(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 0);
      } else if (e.key === "Escape" && visible) {
        e.preventDefault();
        setQuery("");
        setSuggestions([]);
        setVectorMatches([]);
        setSelectedIndex(0);
        setVisible(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [visible]);

  // Autocomplete fetching for Wikipedia mode ONLY
  useEffect(() => {
    const q = query.trim();
    if (mode !== "wikipedia" || !q) {
      setSuggestions([]);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=8&search=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const [, titles, , urls]: [string, string[], string[], string[]] = await res.json();
        setSuggestions(titles.map((title, i) => ({ title, url: urls[i] })));
        setSelectedIndex(0);
        prefetchArticles(titles.slice(0, 3));
      } catch {
        /* aborted or failed */
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, mode]);

  // Continuous background vector search when typing in Vector mode
  useEffect(() => {
    const q = query.trim();
    if (mode !== "vector" || !q || openWindowIds.length === 0) {
      if (mode === "vector" && !q) {
        setVectorMatches([]);
        setSelectedIndex(0);
      }
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const rawResults = await searchVectorQuery(q, openWindowIds, 8);
        const map = new Map<string, VectorArticleMatch>();
        for (const res of rawResults) {
          const existing = map.get(res.windowId);
          if (!existing || res.score > existing.topScore) {
            map.set(res.windowId, {
              windowId: res.windowId,
              windowTitle: res.windowTitle,
              topChunkId: res.chunkId,
              topSnippet: res.textSnippet,
              topScore: res.score,
            });
          }
        }
        const grouped = Array.from(map.values()).sort((a, b) => b.topScore - a.topScore);
        setVectorMatches(grouped);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Continuous vector search error:", err);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, mode, openWindowIds]);

  function openArticle(title: string, url: string) {
    addWindow({ title, url });
    setQuery("");
    setSuggestions([]);
    setVisible(false);
  }

  function navigateToVectorMatch(match: VectorArticleMatch) {
    setVisible(false);
    setQuery("");
    setVectorMatches([]);

    // 1. Set window active
    setActive(match.windowId);

    // 2. Move canvas camera to center on target Wikipedia window
    const targetWin = windows.find((w) => w.id === match.windowId);
    if (targetWin) {
      const rect = {
        x: targetWin.x ?? 0,
        y: targetWin.y ?? 0,
        width: targetWin.width ?? 750,
        height: targetWin.height ?? 550,
      };
      focusWindowAndParent(rect);
    }

    // 3. Dispatch scroll & highlight event to Shadow DOM (with multi-stage retries)
    const dispatchHighlight = () => {
      window.dispatchEvent(
        new CustomEvent("wikiboard:vector-highlight", {
          detail: {
            windowId: match.windowId,
            chunkId: match.topChunkId,
            snippet: match.topSnippet,
          },
        })
      );
    };

    dispatchHighlight();
    setTimeout(dispatchHighlight, 60);
    setTimeout(dispatchHighlight, 250);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    if (mode === "wikipedia") {
      if (suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        const item = suggestions[selectedIndex];
        openArticle(item.title, item.url);
        return;
      }

      abortRef.current?.abort();
      try {
        const res = await fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const [, titles, , urls]: [string, string[], string[], string[]] = await res.json();
          if (titles[0] && urls[0]) {
            openArticle(titles[0], urls[0]);
            return;
          }
        }
      } catch {
        /* ignore fetch error */
      }

      const formattedTitle = q.replace(/ /g, "_");
      openArticle(q, `https://en.wikipedia.org/wiki/${encodeURIComponent(formattedTitle)}`);
    } else {
      // Vector Search mode on Submit
      if (vectorMatches.length > 0 && selectedIndex >= 0 && selectedIndex < vectorMatches.length) {
        navigateToVectorMatch(vectorMatches[selectedIndex]);
        return;
      }

      setLoading(true);
      try {
        const rawResults = await searchVectorQuery(q, openWindowIds, 8);
        const map = new Map<string, VectorArticleMatch>();
        for (const res of rawResults) {
          const existing = map.get(res.windowId);
          if (!existing || res.score > existing.topScore) {
            map.set(res.windowId, {
              windowId: res.windowId,
              windowTitle: res.windowTitle,
              topChunkId: res.chunkId,
              topSnippet: res.textSnippet,
              topScore: res.score,
            });
          }
        }
        const grouped = Array.from(map.values()).sort((a, b) => b.topScore - a.topScore);
        setVectorMatches(grouped);
        setSelectedIndex(0);

        if (grouped.length > 0) {
          navigateToVectorMatch(grouped[0]);
        }
      } catch (err) {
        console.error("Vector search error:", err);
      } finally {
        setLoading(false);
      }
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    // Tab key toggles between Wikipedia search and Vector search
    if (e.key === "Tab") {
      e.preventDefault();
      setQuery("");
      setSuggestions([]);
      setVectorMatches([]);
      setSelectedIndex(0);
      setMode((prev) => (prev === "wikipedia" ? "vector" : "wikipedia"));
      return;
    }

    const currentListLength = mode === "wikipedia" ? suggestions.length : vectorMatches.length;
    if (currentListLength === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % currentListLength);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + currentListLength) % currentListLength);
    }
  };

  const handleContainerMouseMoveCapture = (e: React.MouseEvent) => {
    if (mouseMovedRef.current) return;
    if (lastMousePosRef.current === null) {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.clientX !== lastMousePosRef.current.x || e.clientY !== lastMousePosRef.current.y) {
      mouseMovedRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleItemHover = (i: number) => {
    if (mouseMovedRef.current) {
      setSelectedIndex(i);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-start justify-center pt-[10vh] bg-black/30 backdrop-blur-[8px] transition-all duration-200"
      onClick={() => setVisible(false)}
      onMouseMoveCapture={handleContainerMouseMoveCapture}
    >
      <div
        className="w-[660px] max-w-[92vw] bg-white/90 backdrop-blur-2xl border border-black/10 shadow-[0_24px_60px_rgba(0,0,0,0.18)] rounded-2xl overflow-hidden flex flex-col animate-[spotlight-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <form className="flex items-center px-5 py-4 border-b border-gray-200/50" onSubmit={handleFormSubmit}>
          {loading ? (
            <svg className="w-5 h-5 text-gray-500 mr-3.5 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : mode === "vector" ? (
            <span className="text-amber-500 text-lg mr-3.5 flex-shrink-0 select-none">✨</span>
          ) : (
            <svg className="w-5 h-5 text-gray-400 mr-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}

          <input
            ref={inputRef}
            className="flex-1 text-xl bg-transparent text-gray-900 placeholder-gray-400/80 border-none outline-none font-sans font-normal tracking-tight"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              mode === "vector"
                ? "Ask open pages (e.g. 'when did WWI occur?')..."
                : "Spotlight Search Wikipedia…"
            }
            autoFocus
          />

          {/* Mode Indicator Badge */}
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setVectorMatches([]);
              setSelectedIndex(0);
              setMode((prev) => (prev === "wikipedia" ? "vector" : "wikipedia"));
            }}
            className="ml-2 cursor-pointer border-none bg-transparent"
            title="Press Tab to toggle search mode"
          >
            {mode === "vector" ? (
              <span className="px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-400 rounded-md border border-amber-500 shadow-sm tracking-wider flex items-center gap-1">
                <span>✨</span> SEARCH
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-semibold text-gray-400 bg-black/5 rounded border border-black/5 uppercase tracking-wider hover:bg-black/10 transition-colors">
                WIKIPEDIA
              </span>
            )}
          </button>
        </form>

        {/* Suggestions Body: Mode 1 - Wikipedia Autocomplete */}
        {mode === "wikipedia" && query.trim() !== "" && suggestions.length > 0 && (
          <ul className="m-0 p-2 list-none max-h-[400px] overflow-y-auto">
            {suggestions.map((s, i) => {
              const isSelected = i === selectedIndex;
              return (
                <li key={s.url} className="py-0.5">
                  <button
                    type="button"
                    className={`flex items-center justify-between w-full text-left py-3 px-4 rounded-xl text-base font-sans transition-all duration-100 border-none cursor-pointer ${
                      isSelected
                        ? "bg-black/10 text-gray-900 font-normal shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                        : "text-gray-700 hover:bg-black/5"
                    }`}
                    onMouseEnter={() => handleItemHover(i)}
                    onMouseMove={() => handleItemHover(i)}
                    onClick={() => openArticle(s.title, s.url)}
                  >
                    <span className="flex items-center gap-3.5 truncate">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-serif text-sm font-bold ${isSelected ? "bg-black/15 text-gray-900" : "bg-black/5 text-gray-500"}`}>
                        W
                      </span>
                      <span className="truncate text-base">{s.title}</span>
                    </span>
                    <span className={`text-xs ml-3 flex items-center gap-1.5 ${isSelected ? "text-gray-700 font-medium" : "text-gray-400 opacity-0 group-hover:opacity-100"}`}>
                      {isSelected ? (
                        <>
                          <span>Open Window</span>
                          <kbd className="px-1.5 py-0.5 text-xs font-sans bg-black/10 rounded">↵</kbd>
                        </>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Suggestions Body: Mode 2 - Vector Search Article Names Only */}
        {mode === "vector" && vectorMatches.length > 0 && (
          <div className="p-2 border-t border-gray-100 bg-amber-50/30">
            <div className="px-3 py-1 text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
              Matching Open Articles ({vectorMatches.length})
            </div>
            <ul className="m-0 p-0 list-none max-h-[400px] overflow-y-auto">
              {vectorMatches.map((m, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <li key={m.windowId} className="py-0.5">
                    <button
                      type="button"
                      className={`flex items-center justify-between w-full text-left py-3 px-4 rounded-xl text-base font-sans transition-all duration-100 border-none cursor-pointer ${
                        isSelected
                          ? "bg-amber-500/20 text-amber-950 font-semibold shadow-sm"
                          : "text-gray-800 hover:bg-amber-500/10"
                      }`}
                      onMouseEnter={() => handleItemHover(i)}
                      onMouseMove={() => handleItemHover(i)}
                      onClick={() => navigateToVectorMatch(m)}
                    >
                      <span className="flex items-center gap-3 truncate">
                        <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center text-xs shrink-0">
                          📄
                        </span>
                        <span className="truncate text-base font-medium">{m.windowTitle}</span>
                      </span>

                      <span className="text-xs text-amber-800/80 font-medium">
                        Jump to position ↵
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
