import { memo, useRef } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag from "../utils/window/drag";
import { getCamera } from "../utils/camera";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

const CanvasShapeItem = memo(function CanvasShapeItem({
  win,
  onActivate,
  onPositionChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIds = useWindows((s) => s.selectedIds);
  const updateWindow = useWindows((s) => s.updateWindow);
  const isSelected = selectedIds.includes(win.id);
  const isFocusedOrActive = win.active || isSelected;

  const width = Math.max(20, win.width ?? 120);
  const height = Math.max(20, win.height ?? 120);
  const shapeType = win.shapeType ?? "rectangle";
  const strokeColor = win.strokeColor ?? "#3b82f6";
  const fillColor = win.fillColor ?? "transparent";
  const strokeWidth = win.strokeWidth ?? 2.5;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".shape-resize-handle")) return;

    e.stopPropagation();
    onActivate();
    useWindows.getState().setSelectedIds([win.id]);
    startDrag(e, (pos) => onPositionChange(pos), onActivate);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startW = width;
    const startH = height;
    const camZoom = getCamera().zoom || 1;

    function onMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / camZoom;
      const dy = (ev.clientY - startClientY) / camZoom;
      const newW = Math.max(20, Math.round(startW + dx));
      const newH = Math.max(20, Math.round(startH + dy));
      updateWindow(win.id, { width: newW, height: newH, isUserResized: true });
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      ref={containerRef}
      className={`group relative select-none transition-shadow ${
        isFocusedOrActive ? "ring-2 ring-blue-500/80 rounded-md" : ""
      }`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        cursor: "move",
      }}
      onMouseDown={handleMouseDown}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible block w-full h-full pointer-events-none"
      >
        {shapeType === "rectangle" && (
          <rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={Math.max(0, width - strokeWidth)}
            height={Math.max(0, height - strokeWidth)}
            rx={8}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        )}

        {shapeType === "circle" && (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={Math.max(0, (width - strokeWidth) / 2)}
            ry={Math.max(0, (height - strokeWidth) / 2)}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        )}

        {shapeType === "diamond" && (
          <polygon
            points={`${width / 2},${strokeWidth / 2} ${width - strokeWidth / 2},${height / 2} ${width / 2},${height - strokeWidth / 2} ${strokeWidth / 2},${height / 2}`}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        )}

        {shapeType === "line" && (
          <line
            x1={strokeWidth}
            y1={strokeWidth}
            x2={width - strokeWidth}
            y2={height - strokeWidth}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {shapeType === "arrow" && (
          <g>
            <defs>
              <marker
                id={`arrowhead-${win.id}`}
                markerWidth="8"
                markerHeight="6"
                refX="6"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill={strokeColor} />
              </marker>
            </defs>
            <line
              x1={strokeWidth}
              y1={strokeWidth}
              x2={width - strokeWidth}
              y2={height - strokeWidth}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              markerEnd={`url(#arrowhead-${win.id})`}
            />
          </g>
        )}
      </svg>

      {/* Resize Handle at bottom right when focused */}
      {isFocusedOrActive && (
        <div
          className="shape-resize-handle absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm cursor-se-resize z-20 shadow-sm"
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
});

export default CanvasShapeItem;
