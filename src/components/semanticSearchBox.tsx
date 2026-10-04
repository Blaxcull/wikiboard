import { useState, useRef, useEffect, useMemo } from "react";
import { useWindows } from "../store/windows";
import { searchVectorQuery, type SearchResult } from "../utils/vectorEngine";
import { focusWindowAndParent } from "../utils/canvas/zoom";

export type UniqueArticleMatch = {
  windowId: string;
  windowTitle: string;
  topChunkId: string;
  topSnippet: string;
  topScore: number;
};

export default function SemanticSearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const windows = useWindows((s) => s.windows);
  const setActive = useWindows((s) => s.setActive);

  const openWindowIdsStr = useMemo(() => {
    return windows.filter((w) => w.url && !w.stacked).map((w) => w.id).join(",");
  }, [windows]);

  const totalOpenPages = openWindowIdsStr ? openWindowIdsStr.split(",").length : 0;

  // Group raw chunk matches by unique Article Title
  const articleMatches = useMemo(() => {
    const map = new Map<string, UniqueArticleMatch>();
    for (const res of results) {
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
    return Array.from(map.values()).sort((a, b) => b.topScore - a.topScore);
  }, [results]);

  // Support Alt+P hotkey to focus the Ask Bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigateToArticleMatch = (match: UniqueArticleMatch) => {
    setIsOpen(false);

    // 1. Bring target window to front
    setActive(match.windowId);

    // 2. Move canvas camera to center on target Wikipedia article window
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

    // 3. Scroll Shadow DOM & highlight matching paragraph position
    window.dispatchEvent(
      new CustomEvent("wikiboard:vector-highlight", {
        detail: {
          windowId: match.windowId,
          chunkId: match.topChunkId,
        },
      })
    );
  };

  /**
   * Execute vector search on Enter key press or Search submit
   */
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    const targetWindowIds = openWindowIdsStr ? openWindowIdsStr.split(",") : [];

    if (trimmed.length < 2 || targetWindowIds.length === 0) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    // If dropdown results are already open and user hits Enter, navigate to selected/top result
    if (isOpen && articleMatches.length > 0) {
      const targetMatch = articleMatches[selectedIndex] || articleMatches[0];
      if (targetMatch) {
        navigateToArticleMatch(targetMatch);
        return;
      }
    }

    setIsSearching(true);
    setIsOpen(true);
    setSelectedIndex(0);

    setTimeout(async () => {
      try {
        const matches = await searchVectorQuery(trimmed, targetWindowIds, 8);
        setResults(matches);

        // Group into unique articles
        const map = new Map<string, UniqueArticleMatch>();
        for (const res of matches) {
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

        // Automatically navigate to top matching article if available
        if (grouped.length > 0) {
          navigateToArticleMatch(grouped[0]);
        }
      } catch (err) {
        console.error("Semantic search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 50);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (articleMatches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % articleMatches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + articleMatches.length) % articleMatches.length);
    }
  };

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative z-[1000] w-full max-w-[420px]">
      <form onSubmit={handleSearchSubmit} className="relative flex items-center w-full">
        <button
          type="submit"
          title="Search open pages (Alt+P)"
          className="absolute left-3 text-amber-500 text-sm select-none cursor-pointer hover:scale-110 transition-transform"
        >
          ✨
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) {
              setResults([]);
              setIsOpen(false);
            }
          }}
          onKeyDown={handleInputKeyDown}
          onFocus={() => {
            if (query.trim().length >= 2 && articleMatches.length > 0) setIsOpen(true);
          }}
          placeholder={
            totalOpenPages > 0
              ? `Ask across ${totalOpenPages} pages (Alt+P, Press Enter)...`
              : "Open articles to ask questions..."
          }
          className="w-full pl-9 pr-14 py-1.5 text-xs bg-gray-800/90 border border-gray-700/80 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 shadow-sm transition-all"
        />
        <button
          type="submit"
          className="absolute right-2.5 px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/30 transition-colors cursor-pointer"
        >
          Search
        </button>
        {isSearching && (
          <span className="absolute right-14 text-xs text-amber-400 animate-pulse">
            •••
          </span>
        )}
      </form>

      {/* Clean Dropdown Suggestion List — Articles Only (No Percentages, No Duplicates) */}
      {isOpen && articleMatches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-gray-900/95 backdrop-blur-md border border-gray-700/80 rounded-xl shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-amber-400/90 uppercase border-b border-gray-800 flex justify-between items-center bg-gray-950/60">
            <span>Matching Articles</span>
            <span className="text-gray-400">{articleMatches.length} {articleMatches.length === 1 ? 'article' : 'articles'}</span>
          </div>

          <div className="divide-y divide-gray-800/60">
            {articleMatches.map((match, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={match.windowId}
                  onClick={() => navigateToArticleMatch(match)}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-center justify-between cursor-pointer ${
                    isSelected ? "bg-amber-500/20 text-amber-300 font-medium" : "text-gray-200 hover:bg-amber-500/10"
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate text-xs font-semibold">
                    <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] shrink-0">
                      📄
                    </span>
                    <span className="truncate">{match.windowTitle}</span>
                  </span>

                  <span className="text-[10px] text-gray-400 group-hover:text-amber-300 shrink-0 ml-2">
                    Jump to position ↵
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isOpen && query.trim() && !isSearching && articleMatches.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-gray-900/95 border border-gray-800 rounded-xl p-3 text-center text-xs text-gray-400 shadow-xl">
          No matching articles found across open pages.
        </div>
      )}
    </div>
  );
}
