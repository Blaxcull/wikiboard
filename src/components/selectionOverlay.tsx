import { memo, useCallback } from "react";
import { useWindows, type WindowData } from "../store/windows";
import { deleteScroll } from "../utils/scrollMemory";
import { evictClosedWindowArticles } from "../utils/articleCache";

export type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
} | null;

type SelectionOverlayProps = {
  marquee: MarqueeState;
};

export function getWindowWorldBounds(w: WindowData) {
  const wx = w.x ?? 80;
  const wy = w.y ?? 80;
  const ww = w.width ?? (w.contentType === "sticky" ? 320 : 380);
  const wh = w.height ?? (w.contentType === "sticky" ? (w.isExcerptNote ? 64 : 200) : 480);
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
  if (selectedWindows.length > 0) {
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

    const PAD = 14;
    const boxX = minX - PAD;
    const boxY = minY - PAD;
    const boxW = maxX - minX + PAD * 2;
    const boxH = maxY - minY + PAD * 2;

    groupBoundingBox = { boxX, boxY, boxW, boxH };
  }

  let marqueeBox = null;
  if (marquee) {
    const minX = Math.min(marquee.startX, marquee.currentX);
    const minY = Math.min(marquee.startY, marquee.currentY);
    const boxW = Math.abs(marquee.currentX - marquee.startX);
    const boxH = Math.abs(marquee.currentY - marquee.startY);
    marqueeBox = { minX, minY, boxW, boxH };
  }

  const allSelectedAlwaysOnTop = selectedWindows.length > 0 && selectedWindows.every((w) => w.alwaysOnTop);

  return (
    <>
      {/* Active Marquee Selection Box */}
      {marqueeBox && (
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
              borderRadius: "16px",
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
