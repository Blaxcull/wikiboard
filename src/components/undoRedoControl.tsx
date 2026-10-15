import { useSyncExternalStore } from "react";
import { undo, redo, canUndo, canRedo, subscribeHistory } from "../utils/history";

export default function UndoRedoControl() {
  const hasUndo = useSyncExternalStore(subscribeHistory, canUndo, () => false);
  const hasRedo = useSyncExternalStore(subscribeHistory, canRedo, () => false);

  const handleUndo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    undo();
  };

  const handleRedo = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    redo();
  };

  return (
    <aside
      aria-label="Undo and redo controls"
      className="undo-redo-control flex items-center bg-[#eaedf5]/95 backdrop-blur-md border border-black/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06)] rounded-xl px-1.5 py-1 select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Undo Button */}
      <button
        type="button"
        onClick={handleUndo}
        disabled={!hasUndo}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-black/5 active:bg-black/10 active:scale-95 disabled:opacity-25 disabled:pointer-events-none rounded-lg transition-all duration-100 cursor-pointer border-none outline-none"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
        </svg>
      </button>

      {/* Redo Button */}
      <button
        type="button"
        onClick={handleRedo}
        disabled={!hasRedo}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-black/5 active:bg-black/10 active:scale-95 disabled:opacity-25 disabled:pointer-events-none rounded-lg transition-all duration-100 cursor-pointer border-none outline-none"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
        </svg>
      </button>
    </aside>
  );
}
