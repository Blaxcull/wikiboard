import { useCallback } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag from "../utils/window/drag";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

export default function StickyNote({ win, onClose, onActivate, onPositionChange }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateWindow(win.id, { stickyText: e.target.value });
    },
    [win.id, updateWindow],
  );

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
