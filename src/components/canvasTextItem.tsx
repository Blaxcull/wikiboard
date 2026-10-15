import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag from "../utils/window/drag";
import { getCamera } from "../utils/camera";
import { startWireDrag } from "../utils/window/wireDrag";

import { getHighlightBgColor } from "../App";

const HIGHLIGHT_COLORS: { id: string; name: string; bg: string; displayBg: string }[] = [
  { id: "none", name: "None (Transparent)", bg: "transparent", displayBg: "transparent" },
  { id: "yellow", name: "Yellow", bg: "rgba(254, 240, 138, 0.85)", displayBg: "#fef08a" },
  { id: "lime", name: "Lime", bg: "rgba(226, 248, 159, 0.85)", displayBg: "#e2f89f" },
  { id: "green", name: "Green", bg: "rgba(187, 247, 208, 0.85)", displayBg: "#bbf7d0" },
  { id: "tan", name: "Tan", bg: "rgba(254, 215, 170, 0.85)", displayBg: "#fed7aa" },
  { id: "blue", name: "Blue", bg: "rgba(186, 230, 253, 0.85)", displayBg: "#bae6fd" },
];

function MiniStickyIcon({ bg, isDark, size = 28 }: { bg: string; isDark?: boolean; size?: number }) {
  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M 3.5 2 H 20.5 C 21.328 2 22 2.672 22 3.5 V 20.5 C 22 21.328 21.328 22 20.5 22 H 7.5 L 2 16.5 V 3.5 C 2 2.672 2.672 2 3.5 2 Z"
          fill={bg}
        />
        <path
          d="M 2 16.5 L 7.5 22 L 7.5 16.5 Z"
          fill="rgba(0,0,0,0.2)"
        />
        <path
          d="M 2 16.5 L 7.5 22 C 5.5 19.5 4 18 2 16.5 Z"
          fill={bg}
          style={{ filter: isDark ? "brightness(1.5)" : "brightness(0.82)" }}
        />
        <path
          d="M 2 16.5 L 7.5 22"
          stroke={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}
          strokeWidth="0.75"
        />
      </svg>
    </div>
  );
}

function NoneColorIcon({ size = 28 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 flex items-center justify-center rounded-full border border-gray-300 bg-white"
      style={{ width: size, height: size }}
      title="No background"
    >
      <svg width={size - 12} height={size - 12} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
      </svg>
    </div>
  );
}

function TextHighlightColorPicker({
  winId,
  currentColor,
  isOpen,
  onClose,
  onSelectColor,
}: {
  winId: string;
  currentColor?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectColor?: (colorId?: string) => void;
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
      const pickerH = pickerEl.offsetHeight;
      const pickerW = isHovered ? 240 : 48;

      const top = Math.min(window.innerHeight - pickerH - 12, rect.bottom + 14);
      let left = rect.left + rect.width / 2;

      if (left + pickerW / 2 > window.innerWidth - 12) left = window.innerWidth - 12 - pickerW / 2;
      if (left - pickerW / 2 < 12) left = 12 + pickerW / 2;

      setStylePos({ left, top });
    }
  }, [isOpen, winId, isHovered]);

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

  const activeId = currentColor || "none";
  const currentOpt =
    HIGHLIGHT_COLORS.find((c) => c.id === activeId) || HIGHLIGHT_COLORS[0];

  return createPortal(
    <div
      ref={pickerRef}
      className="text-color-picker fixed z-[100000] flex items-center justify-center pointer-events-auto select-none p-1"
      style={{ left: stylePos.left, top: stylePos.top, transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="bg-white border-2 border-[#d0d0d0] shadow-[0_8px_24px_rgba(0,0,0,0.14)] flex items-center justify-center rounded-[18px] overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          width: isHovered ? "240px" : "48px",
          height: "48px",
          padding: isHovered ? "6px 10px" : "6px",
        }}
        onClick={() => {
          if (!isHovered) setIsHovered(true);
        }}
      >
        {!isHovered ? (
          <div className="w-8 h-8 flex items-center justify-center cursor-pointer transition-transform hover:scale-105 shrink-0">
            {currentOpt.id === "none" ? (
              <NoneColorIcon size={28} />
            ) : (
              <MiniStickyIcon bg={currentOpt.displayBg} size={28} />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full shrink-0 transition-opacity duration-200">
            {HIGHLIGHT_COLORS.map((opt) => {
              const isSelected = activeId === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    const newColor = opt.id === "none" ? undefined : opt.id;
                    updateWindow(winId, { noteColor: newColor });
                    onSelectColor?.(newColor);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`relative p-0.5 rounded-[8px] cursor-pointer transition-transform duration-150 shrink-0 bg-transparent border-none outline-none focus:outline-none focus-visible:outline-none ${
                    isSelected
                      ? "scale-115 opacity-100"
                      : "opacity-70 hover:opacity-100 hover:scale-105 active:scale-95"
                  }`}
                  style={{ outline: "none", border: "none", boxShadow: "none" }}
                  title={opt.name}
                >
                  {opt.id === "none" ? (
                    <NoneColorIcon size={26} />
                  ) : (
                    <MiniStickyIcon bg={opt.displayBg} size={26} />
                  )}
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

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
  onAddSticky?: (side: "TOP" | "RIGHT" | "BOTTOM" | "LEFT") => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export default function CanvasTextItem({
  win,
  onClose,
  onActivate,
  onPositionChange,
  onAddSticky,
  onContextMenu,
}: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const selectedIds = useWindows((s) => s.selectedIds);
  const groups = useWindows((s) => s.groups);
  const isSelected = selectedIds.includes(win.id);
  const isPartOfGroup = groups.some((g) => g.memberIds.includes(win.id));
  const isFocusedOrActive = (win.active && !isPartOfGroup) || isSelected;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number | null>(null);
  const [isEditing, setIsEditing] = useState(!win.stickyText);
  const [showColorPicker, setShowColorPicker] = useState(false);

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

  const hasBg = !!win.noteColor && win.noteColor !== "none";
  const currentBgColor = hasBg ? getHighlightBgColor(win.noteColor) : "transparent";

  useEffect(() => {
    mountTimeRef.current = Date.now();
  }, []);

  // Compute font size dynamically based on explicit fontSize or comfortable default
  const currentFontSize = win.fontSize ?? 36;

  // Auto-focus and place vertical cursor on initial creation or edit mode with multi-tier retry
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const focusTextarea = () => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const pos = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(pos, pos);
        }
      };

      focusTextarea();
      const rafId = requestAnimationFrame(focusTextarea);
      const timer1 = setTimeout(focusTextarea, 25);
      const timer2 = setTimeout(focusTextarea, 80);
      const timer3 = setTimeout(focusTextarea, 200);

      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }
  }, [isEditing]);

  // Measure text bounds using exact font and DOM metrics
  const getMeasuredTextBounds = useCallback((text: string, overrideFontSize?: number) => {
    const fontSizeToUse = overrideFontSize ?? currentFontSize;
    const lines = (text || "").split("\n");

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `600 ${fontSizeToUse}px 'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }

    let maxVisualW = 0;
    let totalVisualH = 0;
    let netShiftX = 0;
    let netShiftY = 0;

    if (lines.length === 1 && lines[0] && ctx) {
      const m = ctx.measureText(lines[0]);
      const left = m.actualBoundingBoxLeft ?? (m.width / 2);
      const right = m.actualBoundingBoxRight ?? (m.width / 2);
      const ascent = m.actualBoundingBoxAscent ?? (fontSizeToUse * 0.5);
      const descent = m.actualBoundingBoxDescent ?? (fontSizeToUse * 0.5);

      maxVisualW = Math.max(16, left + right);
      totalVisualH = Math.max(16, ascent + descent);

      // Exact pixel shift so the visual ink center aligns with the box center
      netShiftX = Math.round((left - right) / 2);
      netShiftY = Math.round((ascent - descent) / 2);
    } else {
      let maxLineW = 0;
      let maxAscent = fontSizeToUse * 0.5;
      let maxDescent = fontSizeToUse * 0.5;

      for (const line of lines) {
        if (!line) continue;
        if (ctx) {
          const m = ctx.measureText(line);
          const left = m.actualBoundingBoxLeft ?? (m.width / 2);
          const right = m.actualBoundingBoxRight ?? (m.width / 2);
          const w = left + right;
          if (w > maxLineW) maxLineW = w;
          if (m.actualBoundingBoxAscent != null && m.actualBoundingBoxAscent > maxAscent) {
            maxAscent = m.actualBoundingBoxAscent;
          }
          if (m.actualBoundingBoxDescent != null && m.actualBoundingBoxDescent > maxDescent) {
            maxDescent = m.actualBoundingBoxDescent;
          }
        }
      }
      maxVisualW = Math.max(20, maxLineW || fontSizeToUse * 0.6);
      const lineH = Math.max(fontSizeToUse * 0.85, maxAscent + maxDescent);
      totalVisualH = lineH * Math.max(1, lines.length);
      netShiftY = Math.round((maxAscent - maxDescent) / 2);
    }

    // Symmetrical padding on both axes that scales proportionally with font size
    // Constant across both transparent and color states so no shift occurs when toggling color
    const padX = Math.max(16, Math.round(fontSizeToUse * 0.14));
    const padY = Math.max(12, Math.round(fontSizeToUse * 0.10));

    const measuredW = Math.max(36, Math.ceil(maxVisualW + padX * 2));
    const measuredH = Math.max(32, Math.ceil(totalVisualH + padY * 2));

    return { measuredW, measuredH, padX, padY, shiftX: netShiftX, shiftY: netShiftY };
  }, [currentFontSize]);

  // Ensure width and height are measured and synced symmetrically
  useEffect(() => {
    if (!win.isUserResized || !win.width || !win.height) {
      const { measuredW, measuredH } = getMeasuredTextBounds(win.stickyText || "");
      if (win.width !== measuredW || win.height !== measuredH) {
        updateWindow(win.id, {
          width: measuredW,
          height: measuredH,
        });
      }
    }
  }, [win.id, win.isUserResized, win.width, win.height, win.stickyText, getMeasuredTextBounds, updateWindow]);

  // Auto-grow height & dynamically expand width as text is typed
  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      if (scrollH > 0) {
        textareaRef.current.style.height = `${scrollH}px`;
      }
    }
  }, [win.stickyText, isEditing, currentFontSize]);

  const commitMeasuredBounds = useCallback(() => {
    const { measuredW, measuredH } = getMeasuredTextBounds(win.stickyText || "");
    const targetW = win.isUserResized && win.width ? Math.max(win.width, measuredW) : measuredW;
    updateWindow(win.id, { width: targetW, height: measuredH });
  }, [win.id, win.stickyText, win.width, win.isUserResized, getMeasuredTextBounds, updateWindow]);

  // Dismiss editing / border when clicking outside this text item
  useEffect(() => {
    function handleGlobalPointerDown(e: MouseEvent | TouchEvent) {
      // Ignore clicks during initial grace period so creation gesture doesn't dismiss text item
      if (mountTimeRef.current != null && Date.now() - mountTimeRef.current < 500) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!win.stickyText || win.stickyText.trim() === "") {
          onClose();
        } else {
          setIsEditing(false);
          commitMeasuredBounds();
        }
      }
    }
    window.addEventListener("mousedown", handleGlobalPointerDown);
    return () => {
      window.removeEventListener("mousedown", handleGlobalPointerDown);
    };
  }, [win.stickyText, onClose, commitMeasuredBounds]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      const { measuredW, measuredH } = getMeasuredTextBounds(newText);
      const curW = win.width ?? 0;
      if (!win.isUserResized || measuredW > curW) {
        updateWindow(win.id, { stickyText: newText, width: measuredW, height: measuredH });
      } else {
        updateWindow(win.id, { stickyText: newText, height: measuredH });
      }
    },
    [win.id, win.width, win.isUserResized, getMeasuredTextBounds, updateWindow],
  );

  const handleBlur = () => {
    // If blur fired within initial grace period (e.g. mouseup from creating text box),
    // ignore blur and refocus the textarea immediately!
    if (mountTimeRef.current != null && Date.now() - mountTimeRef.current < 500) {
      textareaRef.current?.focus();
      return;
    }
    if (!win.stickyText || win.stickyText.trim() === "") {
      onClose();
    } else {
      setIsEditing(false);
      commitMeasuredBounds();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleCornerResizeMouseDown = (e: React.MouseEvent, corner: "bottom-right" | "bottom-left" | "top-right" | "top-left") => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startW = containerRef.current?.offsetWidth ?? (win.width ?? 120);
    const startH = containerRef.current?.offsetHeight ?? (win.height ?? 36);
    const startX = win.x ?? 0;
    const startY = win.y ?? 0;
    const startRight = startX + startW;
    const startBottom = startY + startH;
    const startSize = currentFontSize;
    const camZoom = getCamera().zoom || 1;

    function onMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / camZoom;
      const dy = (ev.clientY - startClientY) / camZoom;

      let factor = 1;
      if (corner === "bottom-right") {
        const factorX = 1 + dx / Math.max(startW, 30);
        const factorY = 1 + dy / Math.max(startH, 20);
        factor = Math.max(0.1, (factorX + factorY) / 2);
      } else if (corner === "bottom-left") {
        const factorX = 1 - dx / Math.max(startW, 30);
        const factorY = 1 + dy / Math.max(startH, 20);
        factor = Math.max(0.1, (factorX + factorY) / 2);
      } else if (corner === "top-right") {
        const factorX = 1 + dx / Math.max(startW, 30);
        const factorY = 1 - dy / Math.max(startH, 20);
        factor = Math.max(0.1, (factorX + factorY) / 2);
      } else if (corner === "top-left") {
        const factorX = 1 - dx / Math.max(startW, 30);
        const factorY = 1 - dy / Math.max(startH, 20);
        factor = Math.max(0.1, (factorX + factorY) / 2);
      }

      const newFontSize = Math.max(8, Math.round(startSize * factor));
      const { measuredW, measuredH } = getMeasuredTextBounds(win.stickyText || "", newFontSize);

      if (corner === "bottom-right") {
        updateWindow(win.id, { width: measuredW, height: measuredH, fontSize: newFontSize, isUserResized: false });
      } else if (corner === "bottom-left") {
        const newX = Math.round(startRight - measuredW);
        updateWindow(win.id, { width: measuredW, height: measuredH, x: newX, fontSize: newFontSize, isUserResized: false });
      } else if (corner === "top-right") {
        const newY = Math.round(startBottom - measuredH);
        updateWindow(win.id, { width: measuredW, height: measuredH, y: newY, fontSize: newFontSize, isUserResized: false });
      } else if (corner === "top-left") {
        const newX = Math.round(startRight - measuredW);
        const newY = Math.round(startBottom - measuredH);
        updateWindow(win.id, { width: measuredW, height: measuredH, x: newX, y: newY, fontSize: newFontSize, isUserResized: false });
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleSideResizeMouseDown = (e: React.MouseEvent, side: "left" | "right") => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();

    const startClientX = e.clientX;
    const startW = containerRef.current?.offsetWidth ?? (win.width ?? 120);
    const startX = win.x ?? 0;
    const camZoom = getCamera().zoom || 1;

    // Minimum width allowed: the actual text content width (with padding)
    // so resizing horizontally never shrinks smaller than the text itself
    let minAllowedWidth = 36;
    const lines = (win.stickyText || "").split("\n");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `${currentFontSize}px 'Caveat', 'Kalam', cursive, sans-serif`;
      let maxLineWidth = 0;
      for (const line of lines) {
        const w = ctx.measureText(line || "").width;
        if (w > maxLineWidth) maxLineWidth = w;
      }
      minAllowedWidth = Math.max(36, Math.ceil(maxLineWidth + 16));
    }

    function onMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / camZoom;
      if (side === "right") {
        const newW = Math.max(minAllowedWidth, Math.round(startW + dx));
        updateWindow(win.id, { width: newW, isUserResized: true });
      } else {
        const targetW = Math.round(startW - dx);
        const newW = Math.max(minAllowedWidth, targetW);
        const newX = Math.round(startX + (startW - newW));
        updateWindow(win.id, { width: newW, x: newX, isUserResized: true });
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isEditing) {
      textareaRef.current?.blur();
      setIsEditing(false);
      commitMeasuredBounds();
    }
    onActivate();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wikiboard:close-menus", { detail: { exceptWindowId: win.id } }));
    }
    setShowColorPicker(true);
    if (onContextMenu) {
      onContextMenu(e);
    }
  };

  const handleSelectColor = () => {
    // Note color is updated in TextHighlightColorPicker directly.
    // Dimensions remain identical so no layout shift occurs.
  };

  const showSelectionBorder = !isEditing && isFocusedOrActive && !showColorPicker;
  const { shiftX, shiftY } = getMeasuredTextBounds(win.stickyText || "");

  return (
    <div
      ref={containerRef}
      className="canvas-text-item group/canvas-text relative select-text transition-colors duration-150 flex items-center justify-center"
      style={{
        width: "100%",
        height: "100%",
        minWidth: "16px",
        minHeight: "16px",
        cursor: isEditing ? "text" : "move",
        backgroundColor: currentBgColor,
        borderRadius: "16px",
        boxShadow: hasBg ? "0 2px 10px rgba(0, 0, 0, 0.06)" : undefined,
      }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={(e) => {
        onActivate();
        useWindows.getState().setSelectedIds([win.id]);
        if (!isEditing) {
          const rect = e.currentTarget.getBoundingClientRect();
          const isBottomRight = e.clientX >= rect.right - 8 && e.clientY >= rect.bottom - 8;
          const isBottomLeft = e.clientX <= rect.left + 8 && e.clientY >= rect.bottom - 8;
          const isTopRight = e.clientX >= rect.right - 8 && e.clientY <= rect.top + 8;
          const isTopLeft = e.clientX <= rect.left + 8 && e.clientY <= rect.top + 8;
          const isRightEdge = e.clientX >= rect.right - 8;
          const isLeftEdge = e.clientX <= rect.left + 8;

          if (isBottomRight) {
            handleCornerResizeMouseDown(e, "bottom-right");
          } else if (isBottomLeft) {
            handleCornerResizeMouseDown(e, "bottom-left");
          } else if (isTopRight) {
            handleCornerResizeMouseDown(e, "top-right");
          } else if (isTopLeft) {
            handleCornerResizeMouseDown(e, "top-left");
          } else if (isRightEdge) {
            handleSideResizeMouseDown(e, "right");
          } else if (isLeftEdge) {
            handleSideResizeMouseDown(e, "left");
          } else {
            e.stopPropagation();
            startDrag(e, (pos) => onPositionChange(pos), onActivate);
          }
        } else {
          textareaRef.current?.focus();
        }
      }}
    >
      {/* Clean selection outline border with exact 4 edge connection dots matching user reference */}
      {showSelectionBorder && (
        <>
          <div
            className="absolute pointer-events-none z-10"
            style={{
              inset: "-2px",
              border: "1.5px solid #818cf8",
              borderRadius: "18px",
            }}
          />

          {/* Left edge resize handle */}
          <div
            className="absolute top-2 -left-1.5 w-3 h-[calc(100%-16px)] cursor-ew-resize z-20"
            onMouseDown={(e) => handleSideResizeMouseDown(e, "left")}
            title="Resize text box width from left"
          />

          {/* Right edge resize handle */}
          <div
            className="absolute top-2 -right-1.5 w-3 h-[calc(100%-16px)] cursor-ew-resize z-20"
            onMouseDown={(e) => handleSideResizeMouseDown(e, "right")}
            title="Resize text box width from right"
          />

          {/* 4 Corner handles for font/text size scaling */}
          <div
            className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 cursor-nwse-resize z-25"
            onMouseDown={(e) => handleCornerResizeMouseDown(e, "top-left")}
            title="Drag corner to scale text size"
          />
          <div
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 cursor-nesw-resize z-25"
            onMouseDown={(e) => handleCornerResizeMouseDown(e, "top-right")}
            title="Drag corner to scale text size"
          />
          <div
            className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 cursor-nesw-resize z-25"
            onMouseDown={(e) => handleCornerResizeMouseDown(e, "bottom-left")}
            title="Drag corner to scale text size"
          />
          <div
            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 cursor-nwse-resize z-25"
            onMouseDown={(e) => handleCornerResizeMouseDown(e, "bottom-right")}
            title="Drag corner to scale text size"
          />

          {onAddSticky && (
            <>
              {/* Top dot */}
              <button
                type="button"
                className="connection-point point-top !opacity-100"
                style={{
                  top: "-5px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#9ca3af",
                  border: "1px solid #374151",
                  padding: 0,
                  cursor: "pointer",
                  zIndex: 30,
                }}
                title="Connect from top"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startWireDrag(e, win.id, "TOP", onAddSticky);
                }}
              />
              {/* Right dot */}
              <button
                type="button"
                className="connection-point point-right !opacity-100"
                style={{
                  right: "-5px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#9ca3af",
                  border: "1px solid #374151",
                  padding: 0,
                  cursor: "pointer",
                  zIndex: 30,
                }}
                title="Connect from right"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startWireDrag(e, win.id, "RIGHT", onAddSticky);
                }}
              />
              {/* Bottom dot */}
              <button
                type="button"
                className="connection-point point-bottom !opacity-100"
                style={{
                  bottom: "-5px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#9ca3af",
                  border: "1px solid #374151",
                  padding: 0,
                  cursor: "pointer",
                  zIndex: 30,
                }}
                title="Connect from bottom"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startWireDrag(e, win.id, "BOTTOM", onAddSticky);
                }}
              />
              {/* Left dot */}
              <button
                type="button"
                className="connection-point point-left !opacity-100"
                style={{
                  left: "-5px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#9ca3af",
                  border: "1px solid #374151",
                  padding: 0,
                  cursor: "pointer",
                  zIndex: 30,
                }}
                title="Connect from left"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startWireDrag(e, win.id, "LEFT", onAddSticky);
                }}
              />
            </>
          )}
        </>
      )}

      <textarea
        ref={textareaRef}
        autoFocus
        value={win.stickyText ?? ""}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder=""
        rows={1}
        className="w-full bg-transparent border-none outline-none resize-none font-semibold select-text cursor-text block text-gray-900"
        style={{
          fontFamily: "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
          fontSize: `${currentFontSize}px`,
          lineHeight: "1.15",
          minWidth: "8px",
          caretColor: "#111827",
          padding: 0,
          margin: 0,
          textAlign: "center",
          whiteSpace: "pre",
          wordBreak: "normal",
          overflow: "visible",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeLegibility",
          display: isEditing ? "block" : "none",
          transform: `translate(${shiftX}px, ${shiftY}px)`,
        }}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (!win.stickyText || win.stickyText.trim() === "") {
              onClose();
            } else {
              textareaRef.current?.blur();
              setIsEditing(false);
              commitMeasuredBounds();
              // Keep focused/active and selected so the box outline appears and can be deleted
              useWindows.getState().setActive(win.id);
              useWindows.getState().setSelectedIds([win.id]);
            }
          }
        }}
      />

      {!isEditing && (
        <div
          className="w-full h-full flex items-center justify-center select-text font-semibold text-gray-900 pointer-events-none"
          style={{
            fontFamily: "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
            fontSize: `${currentFontSize}px`,
            lineHeight: "1.15",
            textAlign: "center",
            whiteSpace: "pre",
            wordBreak: "normal",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
            textRendering: "optimizeLegibility",
            transform: `translate(${shiftX}px, ${shiftY}px)`,
          }}
          onContextMenu={handleContextMenu}
        >
          {win.stickyText}
        </div>
      )}

      {/* Floating Highlight Color Picker Centered Below Text Box */}
      <TextHighlightColorPicker
        winId={win.id}
        currentColor={win.noteColor}
        isOpen={showColorPicker}
        onClose={() => setShowColorPicker(false)}
        onSelectColor={handleSelectColor}
      />
    </div>
  );
}
