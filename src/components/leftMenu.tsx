import { useState, useEffect } from "react";
import { toggleSearchBox } from "../utils/search";
import { useWindows } from "../store/windows";

export default function LeftMenu() {
  const isTextToolActive = useWindows((s) => s.isTextToolActive);
  const toggleTextTool = useWindows((s) => s.toggleTextTool);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handleSearchState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === "boolean") {
        setSearchOpen(customEvent.detail.open);
      }
    };
    window.addEventListener("wikiboard:search-state", handleSearchState as EventListener);
    return () => {
      window.removeEventListener("wikiboard:search-state", handleSearchState as EventListener);
    };
  }, []);

  return (
    <aside
      aria-label="Side menu"
      className="left-menu fixed left-4 top-1/2 -translate-y-1/2 z-[9990] flex flex-col items-center bg-white/80 backdrop-blur-2xl border border-black/10 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-1.5 select-none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center gap-1.5">
        {/* Search Icon Button (First item in the menu) */}
        <div className="relative group">
          <button
            type="button"
            onClick={toggleSearchBox}
            aria-label="Search Wikipedia"
            aria-pressed={searchOpen}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
              searchOpen
                ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                : "text-gray-600 hover:text-gray-900 hover:bg-black/6 active:scale-95"
            }`}
          >
            <svg
              className="w-5 h-5 transition-transform duration-150 group-hover:scale-105"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16" y2="16" />
            </svg>
          </button>

          {/* Right Flyout Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
          >
            <span>Search</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-sans leading-none text-gray-200">
              Alt + Space
            </kbd>
          </div>
        </div>

        {/* Text Box / Note Button ('T') (Second item in the menu) */}
        <div className="relative group">
          <button
            type="button"
            onClick={toggleTextTool}
            aria-label="Text Tool (Click anywhere to write)"
            aria-pressed={isTextToolActive}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
              isTextToolActive
                ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                : "text-gray-600 hover:text-gray-900 hover:bg-black/6 active:scale-95"
            }`}
          >
            <svg
              className="w-5 h-5 transition-transform duration-150 group-hover:scale-105"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="9" y1="20" x2="15" y2="20" />
            </svg>
          </button>

          {/* Right Flyout Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
          >
            <span>{isTextToolActive ? "Cancel Text Tool" : "Text Tool"}</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-sans leading-none text-gray-200">
              T
            </kbd>
          </div>
        </div>
      </div>
    </aside>
  );
}
