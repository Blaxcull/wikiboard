import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag from "../utils/window/drag";
import { getCamera } from "../utils/camera";
import { startWireDrag } from "../utils/window/wireDrag";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
  onAddSticky?: (side: "TOP" | "RIGHT" | "BOTTOM" | "LEFT") => void;
};

export default function CanvasTextItem({
  win,
  onClose,
  onActivate,
  onPositionChange,
  onAddSticky,
}: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const selectedIds = useWindows((s) => s.selectedIds);
  const groups = useWindows((s) => s.groups);
  const isSelected = selectedIds.includes(win.id);
  const isPartOfGroup = groups.some((g) => g.memberIds.includes(win.id));
  const isFocusedOrActive = (win.active && !isPartOfGroup) || isSelected;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef(Date.now());
  const [isEditing, setIsEditing] = useState(!win.stickyText);

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
    // Create or reuse hidden measurement span with identical styling
    const span = document.createElement("span");
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    span.style.whiteSpace = "pre";
    span.style.fontSize = `${fontSizeToUse}px`;
    span.style.lineHeight = "1.05";
    span.style.padding = "0 2px";
    span.style.margin = "0";
    span.style.fontWeight = "600";
    span.style.fontFamily = "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif";
    span.style.letterSpacing = "normal";
    document.body.appendChild(span);

    let maxLineWidth = 0;
    let totalHeight = 0;
    for (const line of lines) {
      span.textContent = line || " ";
      const rect = span.getBoundingClientRect();
      if (rect.width > maxLineWidth) maxLineWidth = rect.width;
      totalHeight += rect.height || fontSizeToUse * 1.05;
    }
    document.body.removeChild(span);

    // Tight padding: 4px horizontal breathing room so characters don't clip
    const measuredW = Math.max(16, Math.ceil(maxLineWidth + 4));
    const measuredH = Math.max(16, Math.ceil(totalHeight));
    return { measuredW, measuredH };
  }, [currentFontSize]);

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
    if (textareaRef.current && containerRef.current) {
      const { measuredW, measuredH } = getMeasuredTextBounds(win.stickyText || "");
      // If the user manually resized the box handles, preserve that width;
      // otherwise, fit the box tightly to the text bounds!
      const targetW = win.isUserResized && win.width ? win.width : measuredW;
      const targetH = win.isUserResized && win.height ? win.height : measuredH;
      updateWindow(win.id, { width: targetW, height: targetH });
    }
  }, [win.id, win.stickyText, win.width, win.height, win.isUserResized, getMeasuredTextBounds, updateWindow]);

  // Dismiss editing / border when clicking outside this text item
  useEffect(() => {
    function handleGlobalPointerDown(e: MouseEvent | TouchEvent) {
      // Ignore clicks during initial grace period so creation gesture doesn't dismiss text item
      if (Date.now() - mountTimeRef.current < 500) {
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
      const { measuredW } = getMeasuredTextBounds(newText);
      const curW = win.width ?? 0;
      // If the user hasn't manually resized the box, automatically size it to the text;
      // or if text exceeds the current box, expand it so it doesn't wrap
      if (!win.isUserResized || measuredW > curW) {
        updateWindow(win.id, { stickyText: newText, width: measuredW });
      } else {
        updateWindow(win.id, { stickyText: newText });
      }
    },
    [win.id, win.width, win.isUserResized, getMeasuredTextBounds, updateWindow],
  );

  const handleBlur = () => {
    // If blur fired within initial grace period (e.g. mouseup from creating text box),
    // ignore blur and refocus the textarea immediately!
    if (Date.now() - mountTimeRef.current < 500) {
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

  // While actively editing/typing: NO box outline, only the blinking text cursor |
  // When done (e.g. Escape or click on it when not editing): show selection box
  const showSelectionBorder = !isEditing && isFocusedOrActive;

  return (
    <div
      ref={containerRef}
      className="canvas-text-item group/canvas-text relative select-text transition-shadow"
      style={{
        minWidth: "16px",
        minHeight: "16px",
        cursor: isEditing ? "text" : "move",
      }}
      onDoubleClick={handleDoubleClick}
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
              borderRadius: "3px",
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
        className="w-full bg-transparent border-none outline-none resize-none text-gray-900 font-semibold select-text cursor-text overflow-hidden block"
        style={{
          fontFamily: "'Caveat', 'Kalam', 'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
          fontSize: `${currentFontSize}px`,
          lineHeight: "1.05",
          minWidth: "8px",
          caretColor: "#111827",
          padding: "0 2px",
          margin: 0,
          whiteSpace: "pre",
          wordBreak: "normal",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeLegibility",
          pointerEvents: isEditing ? "auto" : "none",
        }}
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
    </div>
  );
}
