import { memo, useCallback } from "react";
import { useWindows, type WindowData } from "../store/windows";
import { deleteScroll } from "../utils/scrollMemory";
import { evictClosedWindowArticles } from "../utils/articleCache";

export type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  shapeType?: "rectangle" | "circle" | "diamond" | "line" | "arrow";
} | null;

type SelectionOverlayProps = {
  marquee: MarqueeState;
};

export function getWindowWorldBounds(w: WindowData) {
  const wx = w.x ?? 80;
  const wy = w.y ?? 80;
  const ww = w.width ?? (w.contentType === "text" ? 220 : w.contentType === "sticky" ? 320 : (w.contentType === "shape" ? 120 : 380));
  const wh = w.height ?? (w.contentType === "text" ? 38 : w.contentType === "sticky" ? (w.isExcerptNote ? 64 : 200) : (w.contentType === "shape" ? 120 : 480));
  return { left: wx, top: wy, right: wx + ww, bottom: wy + wh, width: ww, height: wh };
}

const SelectionOverlay = memo(function SelectionOverlay({ marquee }: SelectionOverlayProps) {
  const windows = useWindows((s) => s.windows);
  const selectedIds = useWindows((s) => s.selectedIds);

  const selectedWindows = windows.filter((w) => selectedIds.includes(w.id) && !w.stacked);

  const handleGroupObjects = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const selected = [...useWindows.getState().selectedIds];
    if (selected.length > 0) {
      useWindows.getState().addGroup(selected);
    }
    useWindows.getState().clearSelection();
  }, []);

  const handleAlwaysOnTop = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const selected = [...useWindows.getState().selectedIds];
    if (selected.length === 0) return;

    const state = useWindows.getState();
    const selWins = state.windows.filter((w) => selected.includes(w.id));
    const allPinned = selWins.length > 0 && selWins.every((w) => w.alwaysOnTop);

    const nextZIndex = state.maxZIndex + 1;
    useWindows.setState({
      maxZIndex: nextZIndex,
      windows: state.windows.map((w) =>
        selected.includes(w.id)
          ? { ...w, alwaysOnTop: !allPinned, zIndex: nextZIndex, active: true }
          : w
      ),
    });
    useWindows.getState().clearSelection();
  }, []);

  const handleBreakConnections = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const selected = [...useWindows.getState().selectedIds];
    for (const id of selected) {
      useWindows.getState().breakConnections(id);
    }
    useWindows.getState().clearSelection();
  }, []);

  const handleDelete = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const selected = [...useWindows.getState().selectedIds];
    for (const id of selected) {
      deleteScroll(id);
      useWindows.getState().removeWindow(id);
    }
    evictClosedWindowArticles();
    useWindows.getState().clearSelection();
  }, []);

  let groupBoundingBox = null;
  if (selectedWindows.length > 1) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const w of selectedWindows) {
      const b = getWindowWorldBounds(w);
      if (b.left < minX) minX = b.left;
      if (b.top < minY) minY = b.top;
      if (b.right > maxX) maxX = b.right;
      if (b.bottom > maxY) maxY = b.bottom;
    }

    const PAD_X = 32;
    const PAD_Y = 32;
    const boxX = minX - PAD_X;
    const boxY = minY - PAD_Y;
    const boxW = maxX - minX + PAD_X * 2;
    const boxH = maxY - minY + PAD_Y * 2;

    groupBoundingBox = { boxX, boxY, boxW, boxH };
  }

  let marqueeBox = null;
  if (marquee) {
    if (marquee.shapeType === "line" || marquee.shapeType === "arrow") {
      const p1x = marquee.startX;
      const p1y = marquee.startY;
      const p2x = marquee.currentX;
      const p2y = marquee.currentY;
      const minX = Math.min(p1x, p2x);
      const minY = Math.min(p1y, p2y);
      const boxW = Math.max(1, Math.abs(p2x - p1x));
      const boxH = Math.max(1, Math.abs(p2y - p1y));
      marqueeBox = { minX, minY, boxW, boxH, p1x, p1y, p2x, p2y };
    } else {
      const minX = Math.min(marquee.startX, marquee.currentX);
      const minY = Math.min(marquee.startY, marquee.currentY);
      const boxW = Math.abs(marquee.currentX - marquee.startX);
      const boxH = Math.abs(marquee.currentY - marquee.startY);
      marqueeBox = { minX, minY, boxW, boxH };
    }
  }

  const allSelectedAlwaysOnTop = selectedWindows.length > 0 && selectedWindows.every((w) => w.alwaysOnTop);

  return (
    <>
      {/* Active Marquee Selection Box / Shape Drawing Preview */}
      {marqueeBox && (
        marquee?.shapeType ? (
          <div
            style={{
              position: "absolute",
              left: `${marqueeBox.minX}px`,
              top: `${marqueeBox.minY}px`,
              width: `${marqueeBox.boxW}px`,
              height: `${marqueeBox.boxH}px`,
              pointerEvents: "none",
              zIndex: 99999,
            }}
          >
            <svg
              width={marqueeBox.boxW}
              height={marqueeBox.boxH}
              viewBox={`0 0 ${marqueeBox.boxW} ${marqueeBox.boxH}`}
              className="overflow-visible block w-full h-full"
            >
              {marquee.shapeType === "rectangle" && (
                <rect
                  x={1.25}
                  y={1.25}
                  width={Math.max(0, marqueeBox.boxW - 2.5)}
                  height={Math.max(0, marqueeBox.boxH - 2.5)}
                  rx={8}
                  fill="transparent"
                  stroke="#64748b"
                  strokeWidth={2.5}
                  strokeDasharray="4 3"
                />
              )}
              {marquee.shapeType === "circle" && (
                <ellipse
                  cx={marqueeBox.boxW / 2}
                  cy={marqueeBox.boxH / 2}
                  rx={Math.max(0, (marqueeBox.boxW - 2.5) / 2)}
                  ry={Math.max(0, (marqueeBox.boxH - 2.5) / 2)}
                  fill="transparent"
                  stroke="#64748b"
                  strokeWidth={2.5}
                  strokeDasharray="4 3"
                />
              )}
              {marquee.shapeType === "diamond" && (
                <polygon
                  points={`${marqueeBox.boxW / 2},1.25 ${marqueeBox.boxW - 1.25},${marqueeBox.boxH / 2} ${marqueeBox.boxW / 2},${marqueeBox.boxH - 1.25} 1.25,${marqueeBox.boxH / 2}`}
                  fill="transparent"
                  stroke="#64748b"
                  strokeWidth={2.5}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                />
              )}
              {marquee.shapeType === "line" && (
                <line
                  x1={(marqueeBox.p1x ?? marquee.startX) - marqueeBox.minX}
                  y1={(marqueeBox.p1y ?? marquee.startY) - marqueeBox.minY}
                  x2={(marqueeBox.p2x ?? marquee.currentX) - marqueeBox.minX}
                  y2={(marqueeBox.p2y ?? marquee.currentY) - marqueeBox.minY}
                  stroke="#64748b"
                  strokeWidth={2.5}
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                />
              )}
              {marquee.shapeType === "arrow" && (
                <g>
                  <defs>
                    <marker
                      id="arrowhead-preview"
                      markerUnits="userSpaceOnUse"
                      markerWidth={42}
                      markerHeight={36}
                      refX={38}
                      refY={18}
                      orient="auto"
                    >
                      <path
                        d="M 4 4 L 38 18 L 4 32"
                        fill="none"
                        stroke="#64748b"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </marker>
                  </defs>
                  <line
                    x1={(marqueeBox.p1x ?? marquee.startX) - marqueeBox.minX}
                    y1={(marqueeBox.p1y ?? marquee.startY) - marqueeBox.minY}
                    x2={(marqueeBox.p2x ?? marquee.currentX) - marqueeBox.minX}
                    y2={(marqueeBox.p2y ?? marquee.currentY) - marqueeBox.minY}
                    stroke="#64748b"
                    strokeWidth={2.5}
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    markerEnd="url(#arrowhead-preview)"
                  />
                </g>
              )}
            </svg>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              left: `${marqueeBox.minX}px`,
              top: `${marqueeBox.minY}px`,
              width: `${marqueeBox.boxW}px`,
              height: `${marqueeBox.boxH}px`,
              border: "1.5px dashed #ea580c",
              backgroundColor: "rgba(249, 115, 22, 0.15)",
              borderRadius: "12px",
              pointerEvents: "none",
              zIndex: 99999,
            }}
          />
        )
      )}

      {/* Enclosing Group Selection Bounding Box & Group Menu */}
      {!marqueeBox && groupBoundingBox && (
        <>
          <div
            style={{
              position: "absolute",
              left: `${groupBoundingBox.boxX}px`,
              top: `${groupBoundingBox.boxY}px`,
              width: `${groupBoundingBox.boxW}px`,
              height: `${groupBoundingBox.boxH}px`,
              border: "1.5px dashed #ea580c",
              backgroundColor: "rgba(249, 115, 22, 0.10)",
              borderRadius: "28px",
              pointerEvents: "none",
              zIndex: 99998,
            }}
          />

          {/* Group Context Menu */}
          <div
            className="group-context-menu w-[185px] p-1.5 bg-white border-2 border-[#d0d0d0] rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] select-none flex flex-col gap-0.5"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              position: "absolute",
              left: `${groupBoundingBox.boxX + groupBoundingBox.boxW / 2}px`,
              top: `${groupBoundingBox.boxY - 14}px`,
              transform: "translate(-50%, -100%)",
              pointerEvents: "auto",
              zIndex: 99999,
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={handleGroupObjects}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
            >
              <span className="shrink-0 text-[#171717]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="6" height="6" rx="1.5" />
                  <circle cx="16" cy="7" r="1.5" />
                  <circle cx="16" cy="16" r="1.5" />
                  <circle cx="7" cy="16" r="1.5" />
                </svg>
              </span>
              Group objects
            </button>

            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={handleAlwaysOnTop}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
            >
              <span className="shrink-0 text-[#171717]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </span>
              {allSelectedAlwaysOnTop ? "Unpin from top" : "Always on top"}
            </button>

            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={handleBreakConnections}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
            >
              <span className="shrink-0 text-[#171717]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <line x1="20" y1="4" x2="8.12" y2="15.88" />
                  <line x1="14.47" y1="14.47" x2="20" y2="20" />
                  <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
              </span>
              Break connection
            </button>

            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={handleDelete}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
            >
              <span className="shrink-0 text-[#171717]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
});

export default SelectionOverlay;
