import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag, { isDraggingWindow } from "../utils/window/drag";
import { Resize, isResizingWindow } from "../utils/window/resize";
import { getNoteColor, getHighlightBgColor } from "../App";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

const STICKY_COLORS: { id: string; name: string; bg: string; isDark?: boolean }[] = [
  { id: "yellow", name: "Yellow", bg: "#fef08a" },
  { id: "lime", name: "Lime", bg: "#e2f89f" },
  { id: "green", name: "Green", bg: "#bbf7d0" },
  { id: "tan", name: "Tan", bg: "#fed7aa" },
  { id: "blue", name: "Blue", bg: "#bae6fd" },
];

function CircleColorIcon({ bg, isDark, size = 28 }: { bg: string; isDark?: boolean; size?: number }) {
  return (
    <div
      className={`relative shrink-0 rounded-full shadow-sm transition-transform flex items-center justify-center overflow-hidden ${
        isDark ? "border border-white/20" : "border border-black/15"
      }`}
      style={{ width: size, height: size, backgroundColor: bg }}
    />
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
  const [stylePos, setStylePos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !pickerRef.current) return;
    const pickerEl = pickerRef.current;
    const winEl = document.getElementById(`win-${winId}`);
    if (winEl && pickerEl) {
      const rect = winEl.getBoundingClientRect();
      const pickerW = isHovered ? 230 : 48;
      const top = rect.bottom + 14;
      let left = rect.left + rect.width / 2;

      if (left + pickerW / 2 > window.innerWidth - 12) left = window.innerWidth - 12 - pickerW / 2;
      if (left - pickerW / 2 < 12) left = 12 + pickerW / 2;

      setStylePos({ left, top });
    }
  }, [isOpen, winId, isHovered]);

  useEffect(() => {
    if (!isOpen) return;
    const handleCloseMenus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.exceptWindowId !== winId) {
        onClose();
      }
    };
    window.addEventListener("wikiboard:close-menus", handleCloseMenus as EventListener);
    return () => {
      window.removeEventListener("wikiboard:close-menus", handleCloseMenus as EventListener);
    };
  }, [isOpen, winId, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleDismiss = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        pickerRef.current &&
        !pickerRef.current.contains(target as Node) &&
        !target?.closest(".window-context-menu")
      ) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleDismiss, true);
      window.addEventListener("pointerdown", handleDismiss, true);
      window.addEventListener("click", handleDismiss, true);
      window.addEventListener("wheel", handleDismiss, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleDismiss, true);
      window.removeEventListener("pointerdown", handleDismiss, true);
      window.removeEventListener("click", handleDismiss, true);
      window.removeEventListener("wheel", handleDismiss, true);
    };
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

  return createPortal(
    <div
      ref={pickerRef}
      className="sticky-color-picker fixed z-[100000] flex items-center justify-center pointer-events-auto select-none p-1"
      style={{ left: stylePos.left, top: stylePos.top, transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="bg-white border-2 border-[#d0d0d0] shadow-[0_8px_24px_rgba(0,0,0,0.14)] flex items-center justify-center rounded-full overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          width: isHovered ? "224px" : "48px",
          height: "48px",
          padding: isHovered ? "6px 10px" : "6px",
        }}
        onClick={() => {
          if (!isHovered) setIsHovered(true);
        }}
      >
        {!isHovered ? (
          <div className="w-8 h-8 flex items-center justify-center cursor-pointer transition-transform hover:scale-105 shrink-0">
            <CircleColorIcon bg={currentOpt.bg} isDark={currentOpt.isDark} size={28} />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2.5 w-full shrink-0 transition-opacity duration-200">
            {STICKY_COLORS.map((opt) => {
              const isSelected = (currentColor || "yellow") === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateWindow(winId, { noteColor: opt.id });
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`relative p-0.5 rounded-full cursor-pointer transition-transform duration-150 shrink-0 bg-transparent border-none ${
                    isSelected
                      ? "scale-115 opacity-100 ring-2 ring-blue-500 ring-offset-1"
                      : "opacity-70 hover:opacity-100 hover:scale-105 active:scale-95"
                  }`}
                  title={opt.name}
                >
                  <CircleColorIcon bg={opt.bg} isDark={opt.isDark} size={28} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function StickyNote({ win, onClose, onActivate, onPositionChange, onContextMenu }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const textRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const isExcerpt = win.isExcerptNote;
  const currentBgColor = getNoteColor(win);

  useEffect(() => {
    // Automatically focus and place the vertical line cursor (|) ready to write
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 20);
    return () => clearTimeout(timer);
  }, []);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateWindow(win.id, { stickyText: e.target.value });
    },
    [win.id, updateWindow],
  );

  useEffect(() => {
    function handleCloseMenus(e: Event) {
      const customEv = e as CustomEvent;
      if (customEv.detail?.exceptWindowId !== win.id) {
        setShowColorPicker(false);
      }
    }
    window.addEventListener("wikiboard:close-menus", handleCloseMenus as EventListener);
    return () => window.removeEventListener("wikiboard:close-menus", handleCloseMenus as EventListener);
  }, [win.id]);

  useEffect(() => {
    if (!win.isExcerptNote) return;
    const color = getHighlightBgColor(win.noteColor);
    const isDark = win.noteColor === "dark";

    const updateMark = (mark: HTMLElement) => {
      mark.style.setProperty("background-color", color, "important");
      mark.style.setProperty("color", isDark ? "#ffffff" : "inherit", "important");
    };

    const hosts = document.querySelectorAll(".static-preview");
    hosts.forEach((host) => {
      const shadow = host.shadowRoot;
      if (shadow) {
        const shadowMarks = shadow.querySelectorAll(`mark[data-note-id="${win.id}"], .wiki-highlight[data-note-id="${win.id}"]`);
        shadowMarks.forEach((mark) => updateMark(mark as HTMLElement));
      }
    });

    const marks = document.querySelectorAll(`mark[data-note-id="${win.id}"], .wiki-highlight[data-note-id="${win.id}"], .pdf-highlight[data-note-id="${win.id}"]`);
    marks.forEach((mark) => updateMark(mark as HTMLElement));
  }, [win.id, win.noteColor, win.isExcerptNote]);

  useLayoutEffect(() => {
    if (!win.isExcerptNote || !textRef.current) return;
    const scrollH = textRef.current.scrollHeight;
    if (scrollH > 0) {
      const neededH = Math.max(64, Math.min(500, scrollH + 42));
      if (neededH > (win.height ?? 64)) {
        updateWindow(win.id, { height: neededH });
      }
    }
  }, [win.id, win.isExcerptNote, win.stickyText, win.height, updateWindow]);

  const handleActivate = () => {
    onActivate();
    useWindows.getState().setSelectedIds([win.id]);
    if (win.isExcerptNote && win.pdfPage && win.parentId) {
      const parent = useWindows.getState().windows.find((w) => w.id === win.parentId);
      if (parent?.contentType === "pdf") {
        updateWindow(win.parentId, { pdfCurrentPage: win.pdfPage });
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleActivate();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wikiboard:close-menus", { detail: { exceptWindowId: win.id } }));
    }
    setShowColorPicker(true);
    if (onContextMenu) {
      onContextMenu(e);
    }
  };

  if (isExcerpt) {
    return (
      <div
        className="relative w-full h-full flex flex-col items-center justify-center p-4 text-[#c26100] font-semibold text-[15px] leading-relaxed select-text rounded-[22px] border border-[#e4d5c3] shadow-sm text-center overflow-visible group"
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
          handleActivate();

          const rect = e.currentTarget.getBoundingClientRect();
          const isBottomRight = e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36;

          if (isBottomRight) {
            Resize(e, (pos) => onPositionChange(pos), handleActivate);
          } else {
            startDrag(e, (pos) => onPositionChange(pos), handleActivate);
          }
        }}
      >
        <div
          ref={textRef}
          className="w-full max-h-full overflow-y-auto scrollbar-hide select-text text-center break-words my-auto py-1"
        >
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
            handleActivate();
            Resize(e, (pos) => onPositionChange(pos), handleActivate);
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
          handleActivate();
          Resize(e, (pos) => onPositionChange(pos), handleActivate);
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
          handleActivate();
          startDrag(e, (pos) => onPositionChange(pos), handleActivate);
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
              : win.noteColor === "white"
              ? "text-gray-400 hover:text-gray-700 hover:bg-black/5"
              : "text-[#787236] hover:text-[#222] hover:bg-black/10"
          }`}
          title="Close note"
        >
          <span className="flex items-center justify-center w-full h-full -mt-[2px]">
            ×
          </span>
        </button>
      </div>

      {/* Note Content Area */}
      <textarea
        ref={textareaRef}
        className={`flex-1 w-full px-3.5 pb-3 pt-1 bg-transparent border-none outline-none resize-none leading-relaxed select-text cursor-text ${
          win.noteColor === "dark"
            ? "text-slate-100 placeholder:text-slate-400 font-semibold text-xl"
            : win.noteColor === "white"
            ? "text-gray-900 placeholder:text-gray-400 font-normal text-base"
            : "text-[#2c2a16] font-semibold text-xl"
        }`}
        style={{
          fontFamily:
            win.noteColor === "white"
              ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              : "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
          fontSize: win.noteColor === "white" ? "15px" : "22px",
          lineHeight: win.noteColor === "white" ? "1.45" : "1.3",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeLegibility",
        }}
        placeholder={win.noteColor === "white" ? "Type text here…" : "Write a note…"}
        value={win.stickyText ?? ""}
        onChange={handleTextChange}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            textareaRef.current?.blur();
            useWindows.getState().setSelectedIds([win.id]);
          }
        }}
        onMouseDown={(e) => {
          const rawTarget = e.currentTarget.closest(".window-wrapper, .window") as HTMLElement | null;
          if (rawTarget) {
            const rect = rawTarget.getBoundingClientRect();
            if (e.clientX >= rect.right - 36 && e.clientY >= rect.bottom - 36) {
              e.stopPropagation();
              handleActivate();
              Resize(e, (pos) => onPositionChange(pos), handleActivate);
              return;
            }
          }
          e.stopPropagation();
          handleActivate();
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
          handleActivate();
          Resize(e, (pos) => onPositionChange(pos), handleActivate);
        }}
        title="Drag to resize note"
      >
        <div
          className={`opacity-40 group-hover/handle:opacity-100 transition-opacity pointer-events-none ${
            win.noteColor === "white" ? "text-gray-400" : "text-[#787236]"
          }`}
        >
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
