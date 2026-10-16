import { useState, useEffect } from "react";
import { saveCanvasToFile, loadCanvasFromFile } from "../utils/canvasPersistence";
import { useWindows } from "../store/windows";

export default function RightMenu() {
  const [showNewModal, setShowNewModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleNewClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const state = useWindows.getState();
    const hasContent = state.windows.length > 0 || state.groups.length > 0;
    if (!hasContent) {
      state.clearBoard();
      return;
    }
    setShowNewModal(true);
  };

  const handleSaveAndClear = async () => {
    setIsSaving(true);
    const saved = await saveCanvasToFile();
    setIsSaving(false);
    if (saved) {
      useWindows.getState().clearBoard();
      setShowNewModal(false);
    }
  };

  const handleClearWithoutSaving = () => {
    useWindows.getState().clearBoard();
    setShowNewModal(false);
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    saveCanvasToFile();
  };

  const handleLoad = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    loadCanvasFromFile();
  };

  useEffect(() => {
    if (!showNewModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowNewModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNewModal]);

  return (
    <>
      <aside
        aria-label="Right actions menu"
        className="right-menu fixed right-4 top-10 z-[9990] flex flex-col items-center bg-white/80 backdrop-blur-2xl border border-black/10 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-1.5 select-none"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-1.5">
          {/* Plus / New Board Option */}
          <div className="relative group">
            <button
              type="button"
              onClick={handleNewClick}
              aria-label="New Board"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-900 hover:text-gray-950 hover:bg-black/6 active:scale-95 transition-all duration-150 cursor-pointer border-none outline-none"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {/* Left Flyout Tooltip */}
            <div
              role="tooltip"
              className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
            >
              <span>New Board</span>
            </div>
          </div>

          {/* Folder / Save Option */}
          <div className="relative group">
            <button
              type="button"
              onClick={handleSave}
              aria-label="Save Xboard"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-900 hover:text-gray-950 hover:bg-black/6 active:scale-95 transition-all duration-150 cursor-pointer border-none outline-none"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
                  fill="currentColor"
                  fillOpacity="0.12"
                />
                <path d="M2 10h20" />
              </svg>
            </button>

            {/* Left Flyout Tooltip */}
            <div
              role="tooltip"
              className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
            >
              <span>Save Xboard</span>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-sans leading-none text-gray-200">
                Ctrl + S
              </kbd>
            </div>
          </div>

          {/* Divider before Upload */}
          <div className="w-6 h-px bg-black/10 my-0.5" />

          {/* Upload / Open Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={handleLoad}
              aria-label="Open Xboard"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-900 hover:text-gray-950 hover:bg-black/6 active:scale-95 transition-all duration-150 cursor-pointer border-none outline-none"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>

            {/* Left Flyout Tooltip */}
            <div
              role="tooltip"
              className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
            >
              <span>Open Xboard</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Confirmation Modal when clearing canvas */}
      {showNewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-board-title"
          className="dialog-overlay fixed inset-0 z-[10000] bg-black/25 backdrop-blur-[6px] flex items-center justify-center p-4 select-none animate-[spotlight-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSaving) setShowNewModal(false);
          }}
        >
          <div
            className="w-[360px] max-w-[92vw] bg-white/95 backdrop-blur-2xl border border-black/10 shadow-[0_20px_50px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-5 flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Title and Close (X) */}
            <div className="flex items-center justify-between pb-2">
              <h2 id="new-board-title" className="text-sm font-semibold text-gray-900 tracking-tight m-0">
                Create New Board
              </h2>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setShowNewModal(false)}
                aria-label="Close"
                title="Close (Esc)"
                className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 active:scale-95 transition-all cursor-pointer border-none outline-none disabled:opacity-50"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Message */}
            <p className="text-[13px] text-gray-500 m-0 pb-4 leading-normal">
              Do you want to save your current board before clearing the screen?
            </p>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleClearWithoutSaving}
                className="px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:text-red-600 bg-black/[0.04] hover:bg-red-50/80 border border-black/[0.08] hover:border-red-200/80 rounded-full transition-all cursor-pointer outline-none active:scale-95 disabled:opacity-50"
              >
                Clear Without Saving
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAndClear}
                className="px-4 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-black rounded-full shadow-sm transition-all cursor-pointer border-none outline-none active:scale-95 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save & Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
