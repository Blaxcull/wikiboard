import { useCallback, useEffect, useRef, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag, { isDraggingWindow } from "../utils/window/drag";
import { Resize, isResizingWindow } from "../utils/window/resize";
import { getNoteColor } from "../App";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

const STICKY_COLORS = [
  { id: "yellow", name: "Yellow", bg: "#fef08a" },
  { id: "lime", name: "Lime", bg: "#e2f89f" },
  { id: "green", name: "Green", bg: "#bbf7d0" },
  { id: "tan", name: "Tan", bg: "#fed7aa" },
  { id: "dark", name: "Dark", bg: "#292524", isDark: true },
];

function MiniStickyIcon({ bg, isDark }: { bg: string; isDark?: boolean }) {
  return (
    <div className="relative w-6 h-6 shrink-0 flex items-center justify-center">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        {/* Main Sticky Note Body with cut bottom-left corner */}
        <path
          d="M 3.5 2 H 20.5 C 21.328 2 22 2.672 22 3.5 V 20.5 C 22 21.328 21.328 22 20.5 22 H 7.5 L 2 16.5 V 3.5 C 2 2.672 2.672 2 3.5 2 Z"
          fill={bg}
        />
        {/* Soft shadow underneath folded corner */}
        <path
          d="M 2 16.5 L 7.5 22 L 7.5 16.5 Z"
          fill="rgba(0,0,0,0.2)"
        />
        {/* Folded paper corner flap curling from bottom-left */}
        <path
          d="M 2 16.5 L 7.5 22 C 5.5 19.5 4 18 2 16.5 Z"
          fill={bg}
          style={{ filter: isDark ? "brightness(1.5)" : "brightness(0.82)" }}
        />
        {/* Crease line shadow */}
        <path
          d="M 2 16.5 L 7.5 22"
          stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}
          strokeWidth="0.75"
        />
      </svg>
    </div>
  );
}

function StickyColorPicker({
  winId,
  currentColor = "yellow",
  isOpen,
  onClose,
}: {
  winId: string;
  currentColor?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 300);
  };

  const currentOpt = STICKY_COLORS.find((c) => c.id === currentColor) || STICKY_COLORS[0];

  return (
    <div
      ref={pickerRef}
      className="absolute -bottom-14 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center pointer-events-auto select-none py-2 px-4"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`bg-white/95 border border-black/70 shadow-lg backdrop-blur-md flex items-center justify-center transition-all duration-300 ease-out ${
          isHovered
            ? "w-[204px] h-10 px-3.5 py-1.5 gap-2.5 rounded-[18px] overflow-hidden"
            : "w-10 h-10 p-1.5 rounded-xl cursor-pointer"
        }`}
        onClick={() => {
          if (!isHovered) setIsHovered(true);
        }}
      >
        {!isHovered ? (
          <div className="w-7 h-7 flex items-center justify-center cursor-pointer transition-transform hover:scale-105">
            <MiniStickyIcon bg={currentOpt.bg} isDark={currentOpt.isDark} />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 shrink-0 animate-in fade-in duration-200">
            {STICKY_COLORS.map((opt) => {
              const isSelected = (currentColor || "yellow") === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateWindow(winId, { noteColor: opt.id });
                    // Keep palette open on color selection
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`relative p-0.5 rounded cursor-pointer transition-all duration-150 shrink-0 bg-transparent border-none ${
                    isSelected
                      ? "scale-110 opacity-100"
                      : "opacity-75 hover:opacity-100 hover:scale-105 active:scale-95"
                  }`}
                  title={opt.name}
                >
                  <MiniStickyIcon bg={opt.bg} isDark={opt.isDark} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StickyNote({ win, onClose, onActivate, onPositionChange }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const textRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const isExcerpt = win.isExcerptNote;
  const currentBgColor = getNoteColor(win);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateWindow(win.id, { stickyText: e.target.value });
    },
    [win.id, updateWindow],
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onActivate();
    setShowColorPicker((prev) => !prev);
  };

  if (isExcerpt) {
    return (
      <div
        className="relative w-full h-full flex flex-col justify-center px-5 py-3.5 text-[#c26100] font-semibold text-[15px] leading-relaxed select-text rounded-[22px] border border-[#e4d5c3] shadow-sm text-center overflow-visible scrollbar-hide group"
        style={{ backgroundColor: currentBgColor }}
        onContextMenu={handleContextMenu}
        onMouseMove={(e) => {
          if (isDraggingWindow || isResizingWindow) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const isBottomRight = e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36;
          e.currentTarget.style.cursor = isBottomRight ? "se-resize" : "move";
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onActivate();

          const rect = e.currentTarget.getBoundingClientRect();
          const isBottomRight = e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36;

          if (isBottomRight) {
            Resize(e, (pos) => onPositionChange(pos), onActivate);
          } else {
            startDrag(e, (pos) => onPositionChange(pos), onActivate);
          }
        }}
      >
        <div ref={textRef} className="w-full overflow-hidden select-text text-center break-words">
          {win.stickyText ?? ""}
        </div>

        {/* Floating Color Picker Centered Below Sticker */}
        <StickyColorPicker
          winId={win.id}
          currentColor={win.noteColor}
          isOpen={showColorPicker}
          onClose={() => setShowColorPicker(false)}
        />

        {/* Dedicated 36x36px Bottom-Right Corner Resize Handle */}
        <div
          className="absolute bottom-0 right-0 w-9 h-9 cursor-se-resize z-30 flex items-end justify-end p-1.5 group/handle"
          onMouseDown={(e) => {
            e.stopPropagation();
            onActivate();
            Resize(e, (pos) => onPositionChange(pos), onActivate);
          }}
          title="Drag to resize note"
        >
          <div className="opacity-40 group-hover/handle:opacity-100 transition-opacity pointer-events-none text-[#c26100]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="6" cy="10" r="1.5" />
              <circle cx="10" cy="6" r="1.5" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full flex flex-col rounded-sm overflow-visible select-none shadow-sm group"
      style={{ backgroundColor: currentBgColor }}
      onContextMenu={handleContextMenu}
      onMouseMove={(e) => {
        if (isDraggingWindow || isResizingWindow) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const isBottomRight = e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36;
        e.currentTarget.style.cursor = isBottomRight ? "se-resize" : "default";
      }}
      onMouseDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const isBottomRight = e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36;
        if (isBottomRight) {
          e.stopPropagation();
          onActivate();
          Resize(e, (pos) => onPositionChange(pos), onActivate);
        }
      }}
    >
      {/* Top Header Drag Bar */}
      <div
        className="w-full h-7 cursor-move relative shrink-0 flex items-center justify-between px-2"
        onMouseDown={(e) => {
          const rect = e.currentTarget.closest(".window-wrapper, .window")?.getBoundingClientRect();
          if (rect && e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36) {
            return;
          }
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
          className={`w-5 h-5 rounded flex items-center justify-center text-base leading-none font-semibold border-none bg-transparent cursor-pointer transition-colors z-10 ml-auto ${
            win.noteColor === "dark"
              ? "text-slate-300 hover:text-white hover:bg-white/20"
              : "text-[#787236] hover:text-[#222] hover:bg-black/10"
          }`}
          title="Close note"
        >
          <span className="flex items-center justify-center w-full h-full -mt-[2px]">
            ×
          </span>
        </button>
      </div>

      {/* Handwritten Note Content Area */}
      <textarea
        className={`flex-1 w-full px-3.5 pb-3 pt-1 bg-transparent text-xl border-none outline-none resize-none leading-relaxed font-semibold ${
          win.noteColor === "dark" ? "text-slate-100 placeholder:text-slate-400" : "text-[#2c2a16]"
        }`}
        style={{
          fontFamily: "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
          fontSize: "22px",
          lineHeight: "1.3",
        }}
        placeholder="Write a note…"
        value={win.stickyText ?? ""}
        onChange={handleTextChange}
        onMouseDown={(e) => {
          const rawTarget = e.currentTarget.closest(".window-wrapper, .window") as HTMLElement | null;
          if (rawTarget) {
            const rect = rawTarget.getBoundingClientRect();
            if (e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36) {
              e.stopPropagation();
              onActivate();
              Resize(e, (pos) => onPositionChange(pos), onActivate);
              return;
            }
          }
          e.stopPropagation();
          onActivate();
        }}
        autoFocus
      />

      {/* Floating Color Picker Centered Below Sticker */}
      <StickyColorPicker
        winId={win.id}
        currentColor={win.noteColor}
        isOpen={showColorPicker}
        onClose={() => setShowColorPicker(false)}
      />

      {/* Dedicated 36x36px Bottom-Right Corner Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-9 h-9 cursor-se-resize z-30 flex items-end justify-end p-1.5 group/handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          onActivate();
          Resize(e, (pos) => onPositionChange(pos), onActivate);
        }}
        title="Drag to resize note"
      >
        <div className="opacity-40 group-hover/handle:opacity-100 transition-opacity pointer-events-none text-[#787236]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="6" cy="10" r="1.5" />
            <circle cx="10" cy="6" r="1.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
