import { useCallback, useRef } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag, { isDraggingWindow } from "../utils/window/drag";
import { Resize, isResizingWindow } from "../utils/window/resize";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

export default function StickyNote({ win, onClose, onActivate, onPositionChange }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const textRef = useRef<HTMLDivElement>(null);

  const isExcerpt = win.isExcerptNote;

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateWindow(win.id, { stickyText: e.target.value });
    },
    [win.id, updateWindow],
  );

  if (isExcerpt) {
    return (
      <div
        className="relative w-full h-full flex flex-col justify-center px-5 py-3.5 bg-[#f0e5d8] text-[#c26100] font-semibold text-[15px] leading-relaxed select-text rounded-[22px] border border-[#e4d5c3] shadow-sm text-center overflow-auto scrollbar-hide"
        onMouseMove={(e) => {
          if (isDraggingWindow || isResizingWindow) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const isBottomRight = e.clientX >= rect.right - 24 && e.clientY >= rect.bottom - 24;
          e.currentTarget.style.cursor = isBottomRight ? "se-resize" : "move";
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onActivate();

          const rect = e.currentTarget.getBoundingClientRect();
          const isBottomRight = e.clientX >= rect.right - 24 && e.clientY >= rect.bottom - 24;

          if (isBottomRight) {
            Resize(e, (rect) => onPositionChange(rect), onActivate);
          } else {
            startDrag(e, (pos) => onPositionChange(pos), onActivate);
          }
        }}
      >
        <div ref={textRef} className="w-full overflow-hidden select-text text-center break-words">
          {win.stickyText ?? ""}
        </div>
        <div className="absolute bottom-1 right-2.5 opacity-40 hover:opacity-80 transition-opacity pointer-events-none text-[#c26100]">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="4" cy="8" r="1.2" />
            <circle cx="8" cy="4" r="1.2" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-[#eee7a6] rounded-sm overflow-hidden select-none shadow-sm">
      {/* Top Header Drag Bar */}
      <div
        className="w-full h-7 cursor-move relative shrink-0"
        onMouseDown={(e) => {
          e.stopPropagation();
          onActivate();
          startDrag(e, (pos) => onPositionChange(pos), onActivate);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-1 right-1 w-5 h-5 rounded hover:bg-black/10 flex items-center justify-center text-[#787236] hover:text-[#222] text-base leading-none font-semibold border-none bg-transparent cursor-pointer transition-colors z-10"
          title="Close note"
        >
          <span className="flex items-center justify-center w-full h-full -mt-[2px]">
            ×
          </span>
        </button>
      </div>

      {/* Handwritten Note Content Area */}
      <textarea
        className="flex-1 w-full px-3.5 pb-3 pt-1 bg-transparent text-[#2c2a16] text-xl border-none outline-none resize-none leading-relaxed font-semibold"
        style={{
          fontFamily: "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
          fontSize: "22px",
          lineHeight: "1.3",
        }}
        placeholder="Write a note…"
        value={win.stickyText ?? ""}
        onChange={handleTextChange}
        onMouseDown={(e) => e.stopPropagation()}
        autoFocus
      />
    </div>
  );
}
