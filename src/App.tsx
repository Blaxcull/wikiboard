/* eslint-disable react-hooks/immutability */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Window from './components/window'
import LinkEditor from './components/linkEditor'
import SearchBox from './components/searchBox'
import LeftMenu from './components/leftMenu'
import RightMenu from './components/rightMenu'
import ZoomControl from './components/zoomControl'
import UndoRedoControl from './components/undoRedoControl'
import { undo, redo } from './utils/history'
import { saveCanvasToFile } from './utils/canvasPersistence'
import ArticleView from './components/articleView'
import PdfViewer from './components/pdfViewer'
import ImageViewer from './components/imageViewer'
import YouTubeViewer from './components/youtubeViewer'
import MediaInsertButton from './components/mediaInsertButton'
import StickyNote from './components/stickyNote'
import CanvasTextItem from './components/canvasTextItem'
import CanvasShapeItem from './components/canvasShapeItem'
import WindowContextMenu, { type ContextMenuPosition } from './components/windowContextMenu'
import { useWindows, getConnectedChildNotes, findRootWindow, type WindowData, nextCascadeOffset } from './store/windows'
import { deleteScroll } from './utils/scrollMemory'
import { evictClosedWindowArticles } from './utils/articleCache'
import { getCamera, subscribeCamera, screenToWorld } from './utils/camera'
import SelectionOverlay, { getWindowWorldBounds, type MarqueeState } from './components/selectionOverlay'
import GroupOverlay from './components/groupOverlay'
import { startCanvasPan } from './utils/canvas/pan'
import { handleZoom, zoomIn, zoomOut, resetZoom } from './utils/canvas/zoom'
import { isDraggingWindow, activeDraggedWindowId } from './utils/window/drag'
import { isResizingWindow, activeResizingWindowId, Resize } from './utils/window/resize'
import { startWireDrag, subscribeWire } from './utils/window/wireDrag'
import {
  isNoteUnstacking,
  isWindowStacking,
  markNoteUnstacking,
  unmarkNoteUnstacking,
  unmarkWindowStacking,
  subscribeAnimation,
  getStubTargetOffset,
  getStubDimensions,
  lastUnstackedRects,
  lastStackedStubRects,
} from './utils/stackAnimation'

const ARROW_CTRL = 0.4;
const ARROW_LEN = 16;
const ARROW_HALF = ARROW_LEN / Math.SQRT2; // 90° tip angle

type ArrowResult = {
  sx: number; sy: number;
  c1x: number; c1y: number;
  c2x: number; c2y: number;
  ex: number; ey: number;
  tipX: number; tipY: number;
  bcx: number; bcy: number;
  b1x: number; b1y: number;
  b2x: number; b2y: number;
  childSide: Side;
};

type Side = 'RIGHT' | 'LEFT' | 'TOP' | 'BOTTOM';

function sidePoint(side: Side, x: number, y: number, w: number, h: number): { x: number; y: number } {
  switch (side) {
    case 'RIGHT':  return { x: x + w, y: y + h / 2 };
    case 'LEFT':   return { x, y: y + h / 2 };
    case 'TOP':    return { x: x + w / 2, y };
    case 'BOTTOM': return { x: x + w / 2, y: y + h };
  }
}

function controlOffset(side: Side, pt: { x: number; y: number }, dist: number): { x: number; y: number } {
  switch (side) {
    case 'RIGHT':  return { x: pt.x + dist, y: pt.y };
    case 'LEFT':   return { x: pt.x - dist, y: pt.y };
    case 'TOP':    return { x: pt.x, y: pt.y - dist };
    case 'BOTTOM': return { x: pt.x, y: pt.y + dist };
  }
}

const ALL_SIDES: Side[] = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM'];
const PAIRS: [Side, Side][] = ALL_SIDES.flatMap((ps) => ALL_SIDES.map((cs) => [ps, cs] as [Side, Side]));

function computeArrow(
  px: number, py: number, pw: number, ph: number,
  cx: number, cy: number, cw: number, ch: number,
  preferredSide?: Side,
  allowedParentSides?: Side[],
): ArrowResult {
  const ncx = cx + cw / 2;
  const ncy = cy + ch / 2;
  const dx = ncx - (px + pw / 2);
  const dy = ncy - (py + ph / 2);

  let bestParentSide: Side = 'RIGHT';
  let bestChildSide: Side = 'LEFT';

  if (preferredSide) {
    bestParentSide = preferredSide;
    switch (preferredSide) {
      case 'RIGHT':  bestChildSide = 'LEFT'; break;
      case 'LEFT':   bestChildSide = 'RIGHT'; break;
      case 'TOP':    bestChildSide = 'BOTTOM'; break;
      case 'BOTTOM': bestChildSide = 'TOP'; break;
    }
  } else {
    let bestCost = Infinity;
    for (const [ps, cs] of PAIRS) {
      if (allowedParentSides && !allowedParentSides.includes(ps)) continue;
      const exit = sidePoint(ps, px, py, pw, ph);
      const entry = sidePoint(cs, cx, cy, cw, ch);
      const dist = Math.hypot(entry.x - exit.x, entry.y - exit.y);
      const dot = (entry.x - exit.x) * dx + (entry.y - exit.y) * dy;
      const cost = dist + (dot < 0 ? 2000 : 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestParentSide = ps;
        bestChildSide = cs;
      }
    }
  }

  const exit = sidePoint(bestParentSide, px, py, pw, ph);
  const entry = sidePoint(bestChildSide, cx, cy, cw, ch);

  const sx = exit.x;
  const sy = exit.y;
  const ex = entry.x;
  const ey = entry.y;

  // Arrowhead pointing inward from the child's entry side
  const tipX = ex;
  const tipY = ey;
  let bcx: number, bcy: number, b1x: number, b1y: number, b2x: number, b2y: number;

  switch (bestChildSide) {
    case 'LEFT':
      bcx = ex - ARROW_LEN; bcy = ey;
      b1x = bcx; b1y = ey - ARROW_HALF;
      b2x = bcx; b2y = ey + ARROW_HALF;
      break;
    case 'RIGHT':
      bcx = ex + ARROW_LEN; bcy = ey;
      b1x = bcx; b1y = ey - ARROW_HALF;
      b2x = bcx; b2y = ey + ARROW_HALF;
      break;
    case 'TOP':
      bcx = ex; bcy = ey - ARROW_LEN;
      b1x = ex - ARROW_HALF; b1y = bcy;
      b2x = ex + ARROW_HALF; b2y = bcy;
      break;
    case 'BOTTOM':
      bcx = ex; bcy = ey + ARROW_LEN;
      b1x = ex - ARROW_HALF; b1y = bcy;
      b2x = ex + ARROW_HALF; b2y = bcy;
      break;
  }

  const isStraight = Math.abs(sx - ex) < 3 || Math.abs(sy - ey) < 3;
  let c1x: number, c1y: number, c2x: number, c2y: number;

  if (isStraight) {
    c1x = sx;
    c1y = sy;
    c2x = bcx;
    c2y = bcy;
  } else {
    const ctrlDist = Math.hypot(ex - sx, ey - sy) * ARROW_CTRL;
    const c1 = controlOffset(bestParentSide, exit, ctrlDist);
    const c2 = controlOffset(bestChildSide, { x: bcx, y: bcy }, ctrlDist);
    c1x = c1.x;
    c1y = c1.y;
    c2x = c2.x;
    c2y = c2.y;
  }

  return { sx, sy, c1x, c1y, c2x, c2y, ex, ey, tipX, tipY, bcx, bcy, b1x, b1y, b2x, b2y, childSide: bestChildSide };
}

function parseTransformTranslate(el: HTMLElement): { tx: number; ty: number } {
  const transform = el.style.transform;
  if (!transform || transform === "none") return { tx: 0, ty: 0 };

  const match = transform.match(/translate(?:3d)?\(([-\d.]+)(?:px)?,\s*([-\d.]+)(?:px)?/);
  if (match) {
    return {
      tx: parseFloat(match[1]) || 0,
      ty: parseFloat(match[2]) || 0,
    };
  }

  try {
    const matrix = new DOMMatrix(window.getComputedStyle(el).transform);
    return { tx: matrix.m41, ty: matrix.m42 };
  } catch {
    return { tx: 0, ty: 0 };
  }
}

function readWindowPos(el: HTMLElement): { x: number; y: number; w: number; h: number; zIndex: number } {
  let x = parseFloat(el.style.left) || el.offsetLeft || 0;
  let y = parseFloat(el.style.top) || el.offsetTop || 0;
  const zIndex = parseInt(el.style.zIndex, 10) || 0;

  const { tx, ty } = parseTransformTranslate(el);

  if (el.classList.contains("compress-transition") || el.classList.contains("unstacking")) {
    const rect = el.getBoundingClientRect();
    const cam = getCamera();
    if (cam.zoom > 0) {
      const pt = screenToWorld(rect.left, rect.top);
      x = pt.x - tx;
      y = pt.y - ty;
    }
  }

  const winEl = el.matches(".window") ? el : (el.querySelector<HTMLElement>(".window") || el);
  const w = winEl.offsetWidth || parseFloat(el.style.width) || el.offsetWidth || 750;
  let h = winEl.offsetHeight || parseFloat(el.style.height) || el.offsetHeight || 550;
  const offsetX = winEl !== el ? winEl.offsetLeft : 0;
  const offsetY = winEl !== el ? winEl.offsetTop : 0;

  if (winEl.classList.contains("pdf-window") && !winEl.classList.contains("maximized") && !winEl.classList.contains("is-compressed")) {
    const canvases = winEl.querySelectorAll<HTMLCanvasElement>("canvas");
    const canvas =
      Array.from(canvases).find((c) => {
        const parent = c.closest<HTMLElement>("[data-page]");
        return !parent || parent.style.display !== "none";
      }) || canvases[0];

    if (canvas) {
      const windowRect = winEl.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const cam = getCamera();
      if (cam.zoom > 0) {
        const topOffset = (canvasRect.top - windowRect.top) / cam.zoom;
        const leftOffset = (canvasRect.left - windowRect.left) / cam.zoom;
        const canvasWidth = (canvasRect.right - canvasRect.left) / cam.zoom;
        const canvasHeight = (canvasRect.bottom - canvasRect.top) / cam.zoom;
        return {
          x: x + tx + offsetX + leftOffset,
          y: y + ty + offsetY + topOffset,
          w: Math.max(50, canvasWidth),
          h: Math.max(50, canvasHeight),
          zIndex,
        };
      }
    } else if (winEl.querySelector(".pdf-toolbar")) {
      h = Math.max(100, h - 68);
    }
  }

  return { x: x + tx + offsetX, y: y + ty + offsetY, w, h, zIndex };
}



export function getNoteColor(win: Partial<WindowData>): string {
  if (win.noteColor) {
    const colorMap: Record<string, string> = {
      yellow: "#fef08a",
      lime: "#e2f89f",
      green: "#bbf7d0",
      tan: "#fed7aa",
      blue: "#bae6fd",
      dark: "#bae6fd", // fallback for legacy notes
      white: "#ffffff",
    };
    return colorMap[win.noteColor] || win.noteColor;
  }
  return "#fef08a";
}

export function getHighlightBgColor(colorName?: string): string {
  const map: Record<string, string> = {
    yellow: "rgba(254, 240, 138, 0.85)",
    lime: "rgba(226, 248, 159, 0.85)",
    green: "rgba(187, 247, 208, 0.85)",
    tan: "rgba(254, 215, 170, 0.85)",
    blue: "rgba(186, 230, 253, 0.85)",
    dark: "rgba(186, 230, 253, 0.85)", // fallback for legacy notes
  };
  return map[colorName || "yellow"] || "rgba(254, 240, 138, 0.85)";
}

function getCardOffsetStyle(
  side: "RIGHT" | "LEFT" | "TOP" | "BOTTOM",
  index: number,
  total: number,
  w: number,
  h: number
): React.CSSProperties {
  const isCenter = total % 2 === 1 && index === Math.floor(total / 2);
  const peek = isCenter ? 26 : 18;

  const spreadX = (index - (total - 1) / 2) * 65;
  const spreadY = (index - (total - 1) / 2) * 55;
  const zIndex = -index - 1;

  if (side === "RIGHT") {
    return {
      left: `calc(100% - ${w - 22}px)`,
      top: `calc(50% + ${spreadY - h / 2}px)`,
      zIndex,
      clipPath: "inset(0 0 0 calc(100% - 70px))",
    };
  }

  if (side === "LEFT") {
    return {
      left: `calc(-22px)`,
      top: `calc(50% + ${spreadY - h / 2}px)`,
      zIndex,
      clipPath: "inset(0 calc(100% - 70px) 0 0)",
    };
  }

  if (side === "TOP") {
    return {
      top: `calc(-${peek}px)`,
      left: `calc(50% + ${spreadX - w / 2}px)`,
      zIndex,
      clipPath: `inset(0 0 calc(100% - ${peek + 50}px) 0)`,
    };
  }

  // BOTTOM
  const botPeek = isCenter ? 26 : 22;
  return {
    top: `calc(100% - ${h - botPeek}px)`,
    left: `calc(50% + ${spreadX - w / 2}px)`,
    zIndex,
    clipPath: `inset(calc(100% - ${botPeek + 50}px) 0 0 0)`,
  };
}

export function determineNoteSide(note: WindowData, parent: WindowData): "TOP" | "RIGHT" | "BOTTOM" | "LEFT" {
  if (note.stacked && note.side) {
    return note.side;
  }

  const px = parent.x ?? 80;
  const py = parent.y ?? 80;
  const pw = parent.width ?? 750;
  const ph = parent.height ?? 550;

  const nx = note.x ?? (px + pw + 20);
  const ny = note.y ?? py;
  const nw = note.width ?? 260;
  const nh = note.height ?? (note.isExcerptNote ? 64 : 200);

  const parentCenterX = px + pw / 2;
  const parentCenterY = py + ph / 2;
  const noteCenterX = nx + nw / 2;
  const noteCenterY = ny + nh / 2;

  const hw = Math.max(pw / 2, 1);
  const hh = Math.max(ph / 2, 1);

  const normX = (noteCenterX - parentCenterX) / hw;
  const normY = (noteCenterY - parentCenterY) / hh;

  if (Math.abs(normX) >= Math.abs(normY)) {
    return normX >= 0 ? "RIGHT" : "LEFT";
  } else {
    return normY >= 0 ? "BOTTOM" : "TOP";
  }
}

const StackedNoteStubItem = memo(function StackedNoteStubItem({
  note,
  stubW,
  stubH,
  posStyle,
  colorBg,
  isImage,
  imgUrl,
  side,
  onUnstack,
  notesToUnstack,
}: {
  note: WindowData;
  stubW: number;
  stubH: number;
  posStyle: React.CSSProperties;
  colorBg: string;
  isImage: boolean;
  imgUrl?: string;
  side: "RIGHT" | "LEFT" | "TOP" | "BOTTOM";
  onUnstack: () => void;
  notesToUnstack?: WindowData[];
}) {
  const elRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const prevRect = lastUnstackedRects.get(note.id);
    if (prevRect) {
      lastUnstackedRects.delete(note.id);
      const stubRect = el.getBoundingClientRect();
      const fromX = prevRect.left - stubRect.left;
      const fromY = prevRect.top - stubRect.top;
      const scaleX = prevRect.width / Math.max(stubRect.width, 1);
      const scaleY = prevRect.height / Math.max(stubRect.height, 1);

      const anim = el.animate(
        [
          { transform: `translate3d(${fromX}px, ${fromY}px, 0) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left", opacity: 1 },
          { transform: "translate3d(0, 0, 0) scale(1, 1)", transformOrigin: "top left", opacity: 1 },
        ],
        {
          duration: 300,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        }
      );

      anim.onfinish = () => {
        unmarkWindowStacking(note.id);
      };
    }
  }, [note.id]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const targetNotes = notesToUnstack && notesToUnstack.length > 0 ? notesToUnstack : [note];
      targetNotes.forEach((n) => {
        lastStackedStubRects.set(n.id, rect);
      });
    }
    onUnstack();
  };

  const hoverClass =
    side === "RIGHT"
      ? "hover:translate-x-[4px]"
      : side === "LEFT"
      ? "hover:-translate-x-[4px]"
      : side === "TOP"
      ? "hover:-translate-y-[4px]"
      : "hover:translate-y-[4px]";

  const stubTitle =
    notesToUnstack && notesToUnstack.length > 1
      ? `Click to open ${notesToUnstack.length} notes`
      : `Click to unstack ${isImage ? "image" : "note"}`;

  return (
    <div
      ref={elRef}
      id={`stub-${note.id}`}
      data-side={side}
      className={`absolute pointer-events-auto cursor-pointer transition-transform duration-150 ${hoverClass} rounded-[6px] border border-black/20 shadow-md overflow-hidden`}
      style={{
        width: `${stubW}px`,
        height: `${stubH}px`,
        background: colorBg,
        ...posStyle,
      }}
      onClick={handleClick}
      title={stubTitle}
    >
      {isImage && imgUrl && (
        <img
          src={imgUrl}
          alt={note.title}
          className="w-full h-full object-cover opacity-90"
        />
      )}
    </div>
  );
});

const StackedNoteStubs = memo(function StackedNoteStubs({
  parentWin,
}: {
  parentWin: WindowData;
}) {
  const windows = useWindows((s) => s.windows);

  const childNotes = useMemo(() => {
    if (parentWin.pdfMaximized) return [];
    return getConnectedChildNotes(parentWin.id, windows).filter((w) => {
      if (!w.stacked) return false;
      if (w.stackedParentId && w.stackedParentId !== parentWin.id) return false;
      if (
        parentWin.contentType === "pdf" &&
        w.pdfPage != null &&
        parentWin.pdfCurrentPage != null &&
        w.pdfPage !== parentWin.pdfCurrentPage
      ) {
        return false;
      }
      return true;
    });
  }, [
    windows,
    parentWin.id,
    parentWin.pdfMaximized,
    parentWin.contentType,
    parentWin.pdfCurrentPage,
  ]);

  if (childNotes.length === 0) return null;

  const bySide: Record<string, WindowData[]> = {
    RIGHT: [],
    LEFT: [],
    TOP: [],
    BOTTOM: [],
  };

  for (const note of childNotes) {
    const side = determineNoteSide(note, parentWin);
    bySide[side].push(note);
  }

  const parentW = parentWin.width ?? 750;
  const parentH = parentWin.height ?? 550;

  const maxHoriz = parentW < 180 ? 0 : Math.max(0, Math.floor((parentW - 40) / 65));
  const maxVert = parentH < 150 ? 0 : Math.max(0, Math.floor((parentH - 40) / 55));

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none z-[-1]"
      style={{ overflow: "visible" }}
    >
      {(["RIGHT", "LEFT", "TOP", "BOTTOM"] as const).map((side) => {
        const notes = bySide[side];
        if (!notes || notes.length === 0) return null;
        const isStickyParent = parentWin.contentType === "sticky";
        const limit = isStickyParent
          ? 1
          : Math.min(3, (side === "TOP" || side === "BOTTOM") ? maxHoriz : maxVert);
        const visibleNotes = notes.slice(0, limit);
        const targetNotesToUnstack = isStickyParent ? childNotes : undefined;

        return (
          <div key={side}>
            {visibleNotes.map((note, i) => {
              const { stubW, stubH } = getStubDimensions(note);
              const posStyle = getCardOffsetStyle(side, i, visibleNotes.length, stubW, stubH);
              const isImage = !!(note.directImageUrl || note.title?.startsWith("File:"));
              const colorBg = isImage ? "#e2e8f0" : getNoteColor(note);

              return (
                <StackedNoteStubItem
                  key={note.id}
                  note={note}
                  stubW={stubW}
                  stubH={stubH}
                  posStyle={posStyle}
                  colorBg={colorBg}
                  isImage={isImage}
                  imgUrl={note.directImageUrl}
                  side={side}
                  notesToUnstack={targetNotesToUnstack}
                  onUnstack={() => {
                    if (isStickyParent) {
                      useWindows.getState().unstackNotes(childNotes.map((c) => c.id));
                    } else {
                      useWindows.getState().unstackNote(note.id);
                    }
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

const ConnectionArrows = memo(function ConnectionArrows({
  windows,
}: {
  windows: WindowData[];
}) {
  const groups = useWindows((s) => s.groups);
  const connectionStyle = useWindows((s) => s.connectionStyle);
  const cachedPosMapRef = useRef<Map<string, { x: number; y: number; w: number; h: number; zIndex: number }>>(new Map());

  const links = useMemo(() => {
    const winIds = new Set(windows.map((w) => w.id));
    const groupIds = new Set(groups.map((g) => g.id));
    const allValidIds = new Set([...winIds, ...groupIds]);

    const result: { key: string; parentId: string; childId: string }[] = [];

    // Window children
    for (const child of windows) {
      const pSet = new Set<string>();
      if (child.parentIds) {
        for (const pid of child.parentIds) pSet.add(pid);
      }
      if (child.parentId) pSet.add(child.parentId);

      for (const pid of pSet) {
        if (pid !== child.id && allValidIds.has(pid)) {
          result.push({ key: `${pid}--${child.id}`, parentId: pid, childId: child.id });
        }
      }
    }

    // Group children
    for (const childGroup of groups) {
      const pSet = new Set<string>();
      if (childGroup.parentIds) {
        for (const pid of childGroup.parentIds) pSet.add(pid);
      }
      if (childGroup.parentId) pSet.add(childGroup.parentId);

      for (const pid of pSet) {
        if (pid !== childGroup.id && allValidIds.has(pid)) {
          result.push({ key: `${pid}--${childGroup.id}`, parentId: pid, childId: childGroup.id });
        }
      }
    }

    return result;
  }, [windows, groups]);

  // Imperative update — reads DOM positions directly, no React re-render
  const updatePaths = useCallback((onlyActiveId?: string | null) => {
    if (links.length === 0) return;
    const byId = new Map(windows.map((w) => [w.id, w]));
    const currentGroups = useWindows.getState().groups;
    const groupsById = new Map(currentGroups.map((g) => [g.id, g]));

    const posMap = cachedPosMapRef.current;

    // Ensure posMap contains current DOM geometry for all active windows
    for (const w of windows) {
      if (!posMap.has(w.id) || !onlyActiveId || w.id === onlyActiveId) {
        const el = document.getElementById(`win-${w.id}`);
        if (el) {
          posMap.set(w.id, readWindowPos(el));
        } else if (!posMap.has(w.id)) {
          posMap.set(w.id, {
            x: w.x ?? 0,
            y: w.y ?? 0,
            w: w.width ?? 750,
            h: w.height ?? 550,
            zIndex: w.zIndex ?? 0,
          });
        }
      }
    }

    const getEntityPos = (
      id: string,
      visited = new Set<string>()
    ): { x: number; y: number; w: number; h: number; zIndex?: number; allowedSides?: Side[] } | null => {
      if (visited.has(id)) return null;
      visited.add(id);

      const win = byId.get(id);
      if (win) {
        if (win.stacked) {
          if (isWindowStacking(win.id)) {
            return posMap.get(win.id) ?? null;
          }
          const rootWin = findRootWindow(win.id, windows);
          if (rootWin && rootWin.id !== win.id && !visited.has(rootWin.id)) {
            return getEntityPos(rootWin.id, visited);
          }
          const pId = win.stackedParentId ?? win.parentId ?? win.parentIds?.[0];
          if (pId && pId !== win.id && !visited.has(pId)) {
            return getEntityPos(pId, visited);
          }
          return null;
        }
        return posMap.get(win.id) ?? null;
      }
      const grp = groupsById.get(id);
      if (grp) {
        const groupEl = document.getElementById(`group-box-${grp.id}`);
        if (groupEl) {
          const left = parseFloat(groupEl.style.left) || groupEl.offsetLeft || 0;
          const top = parseFloat(groupEl.style.top) || groupEl.offsetTop || 0;
          const w = parseFloat(groupEl.style.width) || groupEl.offsetWidth || 400;
          const h = parseFloat(groupEl.style.height) || groupEl.offsetHeight || 300;
          const t = groupEl.style.transform;
          let tx = 0, ty = 0;
          if (t && t !== "none") {
            const match = t.match(/translate(?:3d)?\(([-\d.]+)(?:px)?,\s*([-\d.]+)(?:px)?/);
            if (match) {
              tx = parseFloat(match[1]) || 0;
              ty = parseFloat(match[2]) || 0;
            }
          }
          return { x: left + tx, y: top + ty, w, h };
        }
      }
      return null;
    };

    for (const link of links) {
      const svg = document.getElementById(`arrow-svg-${link.key}`) as SVGSVGElement | null;
      const path = document.getElementById(`arrow-path-${link.key}`) as SVGPathElement | null;
      const poly = document.getElementById(`arrow-poly-${link.key}`) as SVGPolygonElement | null;
      if (!svg || !path || !poly) continue;

      const parentId = link.parentId;
      const childId = link.childId;

      const pWin = byId.get(parentId);
      const cWin = byId.get(childId);
      const pGrpEntity = groupsById.get(parentId);
      const cGrpEntity = groupsById.get(childId);
      const pGrpHasMax = pGrpEntity && windows.some((w) => pGrpEntity.memberIds.includes(w.id) && w.pdfMaximized);
      const cGrpHasMax = cGrpEntity && windows.some((w) => cGrpEntity.memberIds.includes(w.id) && w.pdfMaximized);

      const isPdfParentAndWrongPage =
        pWin?.contentType === "pdf" &&
        cWin?.pdfPage != null &&
        pWin.pdfCurrentPage != null &&
        cWin.pdfPage !== pWin.pdfCurrentPage;
      const isPdfChildAndWrongPage =
        cWin?.contentType === "pdf" &&
        pWin?.pdfPage != null &&
        cWin.pdfCurrentPage != null &&
        pWin.pdfPage !== cWin.pdfCurrentPage;

      const pEl = document.getElementById(`win-${parentId}`);
      const cEl = document.getElementById(`win-${childId}`);
      const rootPWin = pWin?.stacked ? findRootWindow(parentId, windows) : pWin;
      const rootPEl = rootPWin ? document.getElementById(`win-${rootPWin.id}`) : null;
      const effPWin = rootPWin ?? pWin;
      const effPEl = pWin?.stacked ? rootPEl : pEl;
      const isParentHidden = effPEl && effPEl.style.display === "none";
      const isChildHidden = cEl && cEl.style.display === "none";

      const isChildStacked = !!cWin?.stacked;
      const isChildStacking = isWindowStacking(childId);
      const isParentStacking = isWindowStacking(parentId);
      const isStacking = isChildStacking || (isParentStacking && !isChildStacked);

      if (
        (isChildStacked && !isChildStacking) ||
        effPWin?.pdfMaximized ||
        cWin?.pdfMaximized ||
        effPWin?.pdfAnimating ||
        cWin?.pdfAnimating ||
        pGrpHasMax ||
        cGrpHasMax ||
        isPdfParentAndWrongPage ||
        isPdfChildAndWrongPage ||
        isParentHidden ||
        isChildHidden
      ) {
        svg.style.display = 'none';
        continue;
      }

      const parentPos = getEntityPos(parentId);
      const childPos = getEntityPos(childId);
      if (!parentPos || !childPos) {
        svg.style.display = 'none';
        continue;
      }

      const pGrp = currentGroups.find((g) => g.memberIds.includes(parentId));
      const cGrp = currentGroups.find((g) => g.memberIds.includes(childId));
      if (pGrp && cGrp && pGrp.id === cGrp.id && pGrp.compressed) {
        svg.style.display = 'none';
        continue;
      }

      const px = parentPos.x, py = parentPos.y, pw = parentPos.w, ph = parentPos.h;
      const cx = childPos.x, cy = childPos.y, cw = childPos.w, ch = childPos.h;

      const a = computeArrow(px, py, pw, ph, cx, cy, cw, ch, undefined, parentPos.allowedSides);

      const dist = Math.hypot(a.ex - a.sx, a.ey - a.sy);

      if (dist < 5) {
        svg.style.display = 'none';
        continue;
      }

      const childWin = byId.get(childId);
      let endX = a.bcx;
      let endY = a.bcy;
      let c2x = a.c2x;
      let c2y = a.c2y;

      const childEntity = byId.get(childId) || groupsById.get(childId);
      const linkStyle = childEntity?.connectionStyles?.[parentId] ?? connectionStyle ?? 'pointy';

      const hitPath = document.getElementById(`arrow-hit-${link.key}`) as SVGPathElement | null;
      let dAttr = '';
      if (childWin?.isExcerptNote) {
        let ex = a.ex;
        let ey = a.ey;
        if (cEl) {
          const dotEl = cEl.querySelector<HTMLElement>(`.connection-point.point-${a.childSide.toLowerCase()}`);
          if (dotEl) {
            const r = dotEl.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              const pt = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
              ex = pt.x;
              ey = pt.y;
            }
          }
        }
        const ctrlDist = Math.hypot(ex - a.sx, ey - a.sy) * ARROW_CTRL;
        const c2 = controlOffset(a.childSide, { x: ex, y: ey }, ctrlDist);
        c2x = c2.x;
        c2y = c2.y;
        endX = ex;
        endY = ey;
        dAttr = `M${a.sx},${a.sy} C${a.c1x},${a.c1y} ${c2x},${c2y} ${endX},${endY}`;
        path.setAttribute('d', dAttr);
        path.setAttribute('stroke-dasharray', '2 7');
        path.setAttribute('stroke-linecap', 'round');
        poly.style.display = 'none';
      } else if (linkStyle === 'curved') {
        const ctrlDist = Math.hypot(a.ex - a.sx, a.ey - a.sy) * ARROW_CTRL;
        const c2 = controlOffset(a.childSide, { x: a.ex, y: a.ey }, ctrlDist);
        c2x = c2.x;
        c2y = c2.y;
        endX = a.ex;
        endY = a.ey;
        dAttr = `M${a.sx},${a.sy} C${a.c1x},${a.c1y} ${c2x},${c2y} ${endX},${endY}`;
        path.setAttribute('d', dAttr);
        path.removeAttribute('stroke-dasharray');
        path.setAttribute('stroke-linecap', 'round');
        poly.style.display = 'none';
      } else {
        dAttr = `M${a.sx},${a.sy} C${a.c1x},${a.c1y} ${a.c2x},${a.c2y} ${a.bcx},${a.bcy}`;
        path.setAttribute('d', dAttr);
        path.removeAttribute('stroke-dasharray');
        path.setAttribute('stroke-linecap', 'butt');
        poly.setAttribute('points', `${a.tipX},${a.tipY} ${a.b1x},${a.b1y} ${a.b2x},${a.b2y}`);
        poly.style.display = '';
      }
      if (hitPath && dAttr) {
        hitPath.setAttribute('d', dAttr);
      }

      const minX = Math.floor(Math.min(a.sx, a.ex, a.c1x, c2x, a.tipX, a.b1x, a.b2x) - 15);
      const minY = Math.floor(Math.min(a.sy, a.ey, a.c1y, c2y, a.tipY, a.b1y, a.b2y) - 15);
      const maxX = Math.ceil(Math.max(a.sx, a.ex, a.c1x, c2x, a.tipX, a.b1x, a.b2x) + 15);
      const maxY = Math.ceil(Math.max(a.sy, a.ey, a.c1y, c2y, a.tipY, a.b1y, a.b2y) + 15);
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);

      svg.style.left = `${minX}px`;
      svg.style.top = `${minY}px`;
      svg.style.width = `${w}px`;
      svg.style.height = `${h}px`;
      svg.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
      svg.style.display = '';

      const isEraser = useWindows.getState().isEraserToolActive;
      const isMovingAny = isDraggingWindow || isResizingWindow;
      const activeId = activeDraggedWindowId || activeResizingWindowId;
      const selectedIds = useWindows.getState().selectedIds;

      const isConnectedToMoving =
        isMovingAny &&
        Boolean(
          (activeId && (parentId === activeId || childId === activeId || rootPWin?.id === activeId)) ||
          selectedIds.some((sId) => parentId === sId || childId === sId || rootPWin?.id === sId) ||
          pWin?.active ||
          cWin?.active ||
          rootPWin?.active
        );

      let targetZ: number;
      if (isEraser) {
        targetZ = 999999;
      } else if (isConnectedToMoving) {
        targetZ = 99989;
      } else {
        const parentZ = ("zIndex" in parentPos ? parentPos.zIndex : 0) ?? 0;
        const childZ = ("zIndex" in childPos ? childPos.zIndex : 0) ?? 0;
        targetZ = Math.max(1, Math.max(parentZ, childZ) - 1);
      }
      svg.style.zIndex = String(targetZ);

      const isUnstacking = isNoteUnstacking(childId) || isNoteUnstacking(parentId);

      if (isStacking) {
        svg.style.transition = "opacity 240ms ease-out";
        svg.style.opacity = "0";
      } else if (isUnstacking) {
        svg.style.opacity = "0";
        svg.style.transition = "none";
      } else {
        svg.style.transition = "opacity 400ms ease-out";
        svg.style.opacity = "1";
      }
    }
  }, [windows, links, connectionStyle]);

  useLayoutEffect(() => {
    updatePaths();
  }, [links, updatePaths]);

  useEffect(() => {
    return subscribeAnimation(() => updatePaths());
  }, [updatePaths]);

  // Initial render + store updates (run rAF loop for 420ms to cover 300ms-350ms CSS compress/unstack transitions)
  useEffect(() => {
    let rafId = 0;
    const start = performance.now();

    function loop() {
      updatePaths();
      if (performance.now() - start < 420) {
        rafId = requestAnimationFrame(loop);
      }
    }

    loop();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [links, updatePaths]);

  // rAF loop for live drag/resize tracking — imperative, no React state
  useEffect(() => {
    let raf = 0;
    let active = false;
    function loop() {
      if (!isDraggingWindow && !isResizingWindow) {
        active = false;
        updatePaths(); // full refresh once gesture finishes
        return;
      }
      const activeId = activeDraggedWindowId || activeResizingWindowId;
      updatePaths(activeId);
      raf = requestAnimationFrame(loop);
    }
    function onDown(e: MouseEvent) {
      const rawWin = (e.target as HTMLElement)?.closest?.('.window-wrapper, .window');
      const win = rawWin?.closest?.('.window-wrapper') || rawWin;
      if (win && !active) {
        active = true;
        const activeId = activeDraggedWindowId || activeResizingWindowId;
        updatePaths(activeId);
        raf = requestAnimationFrame(loop);
      }
    }
    function onMove() {
      if ((isDraggingWindow || isResizingWindow) && !active) {
        active = true;
        raf = requestAnimationFrame(loop);
      }
    }
    function onUp() {
      active = false;
      cancelAnimationFrame(raf);
      updatePaths(); // full refresh on mouseup
    }
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp);
    };
  }, [updatePaths]);

  const isEraserToolActive = useWindows((s) => s.isEraserToolActive);
  const disconnectEntities = useWindows((s) => s.disconnectEntities);

  return (
    <>
      {links.map((link) => (
        <svg
          key={link.key}
          id={`arrow-svg-${link.key}`}
          className="connection-arrow-item"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            overflow: 'visible',
            pointerEvents: isEraserToolActive ? 'auto' : 'none',
            zIndex: isEraserToolActive ? 999999 : 1,
            display: 'none',
            cursor: isEraserToolActive ? 'pointer' : undefined,
          }}
          onClick={(e) => {
            if (isEraserToolActive) {
              e.preventDefault();
              e.stopPropagation();
              disconnectEntities(link.parentId, link.childId);
            }
          }}
        >
          {/* Invisible thick stroke for easier clicking with eraser */}
          {isEraserToolActive && (
            <path
              id={`arrow-hit-${link.key}`}
              fill="none"
              stroke="transparent"
              strokeWidth="20"
              strokeLinecap="round"
              style={{ pointerEvents: 'stroke' }}
            />
          )}
          <path
            id={`arrow-path-${link.key}`}
            fill="none"
            stroke="#a0a0a0"
            strokeWidth="3"
            strokeLinecap="round"
            style={{ pointerEvents: isEraserToolActive ? 'stroke' : 'none' }}
          />
          <polygon
            id={`arrow-poly-${link.key}`}
            fill="#a0a0a0"
            style={{ pointerEvents: isEraserToolActive ? 'auto' : 'none' }}
          />
        </svg>
      ))}
    </>
  );
});

const LiveWireOverlay = memo(function LiveWireOverlay() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const polyRef = useRef<SVGPolygonElement>(null);

  useEffect(() => {
    return subscribeWire((wire) => {
      const svg = svgRef.current;
      const path = pathRef.current;
      const poly = polyRef.current;
      if (!svg || !path || !poly) return;

      if (!wire) {
        svg.style.display = "none";
        return;
      }

      const { sx, sy, mx, my, sourceSide } = wire;
      const dist = Math.hypot(mx - sx, my - sy);

      const ARROW_LEN = 15;
      const ARROW_HALF = 8;

      let tipX = mx;
      let tipY = my;
      let angle = 0;

      if (dist < 12) {
        let dirX = 1, dirY = 0;
        switch (sourceSide) {
          case 'RIGHT':  dirX = 1; dirY = 0; angle = 0; break;
          case 'LEFT':   dirX = -1; dirY = 0; angle = Math.PI; break;
          case 'TOP':    dirX = 0; dirY = -1; angle = -Math.PI / 2; break;
          case 'BOTTOM': dirX = 0; dirY = 1; angle = Math.PI / 2; break;
        }
        tipX = sx + 20 * dirX;
        tipY = sy + 20 * dirY;
      } else {
        const ctrlDistInitial = Math.min(dist * 0.45, 140);
        const c1Initial = controlOffset(sourceSide, { x: sx, y: sy }, ctrlDistInitial);
        angle = Math.atan2(my - c1Initial.y, mx - c1Initial.x);
      }

      const bcx = tipX - ARROW_LEN * Math.cos(angle);
      const bcy = tipY - ARROW_LEN * Math.sin(angle);
      const b1x = bcx + ARROW_HALF * Math.sin(angle);
      const b1y = bcy - ARROW_HALF * Math.cos(angle);
      const b2x = bcx - ARROW_HALF * Math.sin(angle);
      const b2y = bcy + ARROW_HALF * Math.cos(angle);

      const isStraightHoriz = (sourceSide === 'RIGHT' || sourceSide === 'LEFT') && Math.abs(sy - my) < 6;
      const isStraightVert = (sourceSide === 'TOP' || sourceSide === 'BOTTOM') && Math.abs(sx - mx) < 6;

      let c1x = sx, c1y = sy, c2x = bcx, c2y = bcy;

      const isCurved = useWindows.getState().connectionStyle === 'curved';

      if (isCurved) {
        if (dist < 12 || isStraightHoriz || isStraightVert) {
          path.setAttribute("d", `M${sx},${sy} L${mx},${my}`);
        } else {
          const ctrlDist = Math.min(dist * 0.45, 150);
          const c1 = controlOffset(sourceSide, { x: sx, y: sy }, ctrlDist);
          c1x = c1.x;
          c1y = c1.y;
          c2x = mx - ctrlDist * 0.5 * Math.cos(angle);
          c2y = my - ctrlDist * 0.5 * Math.sin(angle);
          path.setAttribute("d", `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${mx},${my}`);
        }
        poly.style.display = "none";
      } else {
        if (dist < 12 || isStraightHoriz || isStraightVert) {
          path.setAttribute("d", `M${sx},${sy} L${bcx},${bcy}`);
        } else {
          const ctrlDist = Math.min(dist * 0.45, 150);
          const c1 = controlOffset(sourceSide, { x: sx, y: sy }, ctrlDist);
          c1x = c1.x;
          c1y = c1.y;
          c2x = bcx - ctrlDist * 0.5 * Math.cos(angle);
          c2y = bcy - ctrlDist * 0.5 * Math.sin(angle);
          path.setAttribute("d", `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${bcx},${bcy}`);
        }
        poly.setAttribute("points", `${tipX},${tipY} ${b1x},${b1y} ${b2x},${b2y}`);
        poly.style.display = "";
      }

      const minX = Math.floor(Math.min(sx, mx, c1x, c2x, tipX, b1x, b2x) - 20);
      const minY = Math.floor(Math.min(sy, my, c1y, c2y, tipY, b1y, b2y) - 20);
      const maxX = Math.ceil(Math.max(sx, mx, c1x, c2x, tipX, b1x, b2x) + 20);
      const maxY = Math.ceil(Math.max(sy, my, c1y, c2y, tipY, b1y, b2y) + 20);
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);

      svg.style.left = `${minX}px`;
      svg.style.top = `${minY}px`;
      svg.style.width = `${w}px`;
      svg.style.height = `${h}px`;
      svg.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
      svg.style.display = "";
    });
  }, []);

  return (
    <svg
      ref={svgRef}
      className="connection-arrows live-wire-arrows"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        pointerEvents: 'none',
        zIndex: 999999,
        display: "none",
      }}
    >
      <path
        ref={pathRef}
        fill="none"
        stroke="#a0a0a0"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <polygon
        ref={polyRef}
        fill="#a0a0a0"
      />
    </svg>
  );
});


//for pdf maximize
//
//
//






const StackedNotesDrawer = memo(function StackedNotesDrawer({
  parentWin,
}: {
  parentWin: WindowData;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const windows = useWindows((s) => s.windows);
  const unstackNote = useWindows((s) => s.unstackNote);

  const childNotes = useMemo(
    () =>
      getConnectedChildNotes(parentWin.id, windows).filter(
        (w) => w.contentType === "sticky" && w.stacked
      ),
    [windows, parentWin.id]
  );

  if (childNotes.length === 0) return null;

  return (
    <div
      className="absolute -bottom-11 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="flex items-center gap-2 px-3.5 py-1.5 bg-[#f6efe5] hover:bg-[#ebd9c5] text-[#7a4805] border-2 border-[#d9c4af] rounded-full shadow-md text-[12px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>{childNotes.length} Note{childNotes.length > 1 ? "s" : ""} Stacked</span>
        <span className="text-[10px] opacity-70 transition-transform duration-200" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▲
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 max-w-[85vw] max-h-[420px] overflow-auto p-3 bg-[#fdfbf7]/95 backdrop-blur-md border-2 border-[#d6c4b0] rounded-[22px] shadow-2xl flex flex-col items-center gap-3 select-text cursor-default animate-in fade-in slide-in-from-top-2 duration-200">
          {childNotes.map((note) => {
            const w = note.width ?? 260;
            const h = note.height ?? (note.isExcerptNote ? 64 : 200);
            return (
              <div
                key={note.id}
                className="relative p-3.5 bg-[#f0e5d8] border-2 border-[#e4d5c3] rounded-[18px] flex flex-col gap-2 text-left shadow-md shrink-0 transition-all"
                style={{ width: `${w}px`, height: `${h}px` }}
              >
                <div className="flex items-center justify-between text-[12px] font-bold text-[#c26100] shrink-0">
                  <span>{note.isExcerptNote ? "Excerpt Highlight" : (note.title || "Sticky Note")}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => unstackNote(note.id)}
                      className="px-2.5 py-1 bg-white/90 hover:bg-white text-[#c26100] border border-[#e4d5c3] rounded-md font-semibold cursor-pointer transition-colors text-[11px] shadow-sm"
                      title="Unstack onto canvas"
                    >
                      Unstack ↗
                    </button>
                  </div>
                </div>
                <div className="flex-1 text-[13px] font-medium text-[#4a3219] leading-snug break-words overflow-y-auto pr-1 select-text">
                  {note.stickyText || "(Empty note)"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

const WindowItem = memo(function WindowItem({
  w,
  onContextMenu,
}: {
  w: WindowData;
  onContextMenu?: (e: React.MouseEvent, winId: string) => void;
}) {
  const setActive = useWindows((s) => s.setActive)
  const updateWindow = useWindows((s) => s.updateWindow)
  const removeWindow = useWindows((s) => s.removeWindow)
  const addWindow = useWindows((s) => s.addWindow)

  const groups = useWindows((s) => s.groups)
  const windows = useWindows((s) => s.windows)
  const selectedIds = useWindows((s) => s.selectedIds)
  const isSelected = selectedIds.includes(w.id)
  const parentGroup = groups.find((g) => g.memberIds.includes(w.id))
  const isCompressedGroupMember = !!parentGroup?.compressed

  // In a compressed group, only show up to 3 tabs in the deck; all others stay hidden
  const isHiddenOverflowDeckMember = useMemo(() => {
    if (!parentGroup?.compressed) return false;
    const memberWins = windows.filter((win) => parentGroup.memberIds.includes(win.id));
    const windowMembers = memberWins.filter((win) => win.contentType !== "sticky" && win.contentType !== "text");
    const visibleMembers = windowMembers.length > 0
      ? windowMembers
      : memberWins.filter((win) => win.contentType === "sticky");
    if (!visibleMembers.some((win) => win.id === w.id)) return false;
    const sorted = [...visibleMembers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const top3 = sorted.slice(-3);
    return !top3.some((win) => win.id === w.id);
  }, [parentGroup?.compressed, parentGroup?.memberIds, windows, w.id]);

  const connectedCompressedGroup = useMemo(() => {
    if (isCompressedGroupMember) return null;
    const pIds = w.parentIds ?? (w.parentId ? [w.parentId] : []);
    if (pIds.length === 0) return null;
    return groups.find((g) => g.compressed && (pIds.includes(g.id) || g.memberIds.some((mId) => pIds.includes(mId))));
  }, [groups, isCompressedGroupMember, w.parentId, w.parentIds]);

  const zIndexStyle = useMemo(
    () => {
      let effZ = (w.pdfMaximized || w.pdfAnimating) ? 100000 : (w.alwaysOnTop ? 50000 + (w.zIndex ?? 0) : (w.zIndex ?? 0));
      if (connectedCompressedGroup) {
        const groupMembers = windows.filter((win) => connectedCompressedGroup.memberIds.includes(win.id));
        const minZ = groupMembers.reduce((min, win) => Math.min(min, win.zIndex ?? 0), Infinity);
        if (minZ !== Infinity) {
          effZ = Math.min(effZ, minZ - 1);
        }
      }
      return {
        zIndex: effZ,
        ...(isCompressedGroupMember ? { pointerEvents: "none" as const } : {}),
      };
    },
    [w.zIndex, w.pdfMaximized, w.pdfAnimating, w.alwaysOnTop, isCompressedGroupMember, connectedCompressedGroup, windows],
  )

  const handleActivate = useCallback(() => setActive(w.id), [w.id, setActive])
  const handleClose = useCallback(() => {
    deleteScroll(w.id)
    removeWindow(w.id)
    evictClosedWindowArticles()
  }, [w.id, removeWindow])
  const handlePositionChange = useCallback(
    (pos: { x?: number; y?: number; width?: number; height?: number }) =>
      updateWindow(w.id, pos),
    [w.id, updateWindow],
  )

  const handleAddSticky = useCallback(
    (side: "TOP" | "RIGHT" | "BOTTOM" | "LEFT") => {
      addWindow({
        contentType: "sticky",
        title: `Note (${w.title.replace(/^File:/i, "").replace(/_/g, " ")})`,
        parentId: w.id,
        pdfPage: w.contentType === "pdf" ? w.pdfCurrentPage ?? 1 : undefined,
        width: 260,
        height: 200,
        side,
      });
    },
    [w.id, w.title, w.contentType, w.pdfCurrentPage, addWindow],
  );

  const pdfRef = useRef<HTMLDivElement | null>(null);
  const prevPdfMaximizedRef = useRef(w.pdfMaximized);
  const activeAnimRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = pdfRef.current;

    if (!el || w.contentType !== "pdf") return;

    if (isDraggingWindow && activeDraggedWindowId === w.id) return;

    const wasMaximized = !!prevPdfMaximizedRef.current;
    const isMaximized = !!w.pdfMaximized;
    prevPdfMaximizedRef.current = isMaximized;

    const cam = getCamera();
    const maximizedBounds = {
      left: -cam.panX / cam.zoom,
      top: -cam.panY / cam.zoom,
      width: window.innerWidth / cam.zoom,
      height: window.innerHeight / cam.zoom,
    };

    const normalW = isCompressedGroupMember ? 220 : (w.width ?? 620);
    const expectedH = Math.round(normalW * 1.414 + 96);
    const normalH = isCompressedGroupMember ? 140 : (w.height ?? expectedH);
    const normalBounds = {
      left: w.x ?? 80,
      top: w.y ?? 80,
      width: normalW,
      height: normalH,
    };

    if (wasMaximized !== isMaximized) {
      let curLeft = parseFloat(el.style.left);
      let curTop = parseFloat(el.style.top);
      let curWidth = parseFloat(el.style.width);
      let curHeight = parseFloat(el.style.height);

      if (activeAnimRef.current) {
        const animToCancel = activeAnimRef.current;
        activeAnimRef.current = null;
        animToCancel.onfinish = null;
        animToCancel.oncancel = null;
        const cs = window.getComputedStyle(el);
        curLeft = parseFloat(cs.left) || curLeft;
        curTop = parseFloat(cs.top) || curTop;
        curWidth = parseFloat(cs.width) || curWidth;
        curHeight = parseFloat(cs.height) || curHeight;
        try {
          animToCancel.cancel();
        } catch {
          /* ignore */
        }
      }

      let startBounds: { left: number; top: number; width: number; height: number };
      let endBounds: { left: number; top: number; width: number; height: number };

      if (isMaximized) {
        startBounds = {
          left: !isNaN(curLeft) ? curLeft : normalBounds.left,
          top: !isNaN(curTop) ? curTop : normalBounds.top,
          width: !isNaN(curWidth) ? curWidth : normalBounds.width,
          height: !isNaN(curHeight) ? curHeight : normalBounds.height,
        };
        endBounds = maximizedBounds;
      } else {
        startBounds = {
          left: !isNaN(curLeft) ? curLeft : maximizedBounds.left,
          top: !isNaN(curTop) ? curTop : maximizedBounds.top,
          width: !isNaN(curWidth) ? curWidth : maximizedBounds.width,
          height: !isNaN(curHeight) ? curHeight : maximizedBounds.height,
        };
        endBounds = normalBounds;
      }

      el.style.left = `${endBounds.left}px`;
      el.style.top = `${endBounds.top}px`;
      el.style.width = `${endBounds.width}px`;
      el.style.height = `${endBounds.height}px`;

      useWindows.getState().updateWindow(w.id, { pdfAnimating: true });

      const anim = el.animate(
        [
          {
            left: `${startBounds.left}px`,
            top: `${startBounds.top}px`,
            width: `${startBounds.width}px`,
            height: `${startBounds.height}px`,
          },
          {
            left: `${endBounds.left}px`,
            top: `${endBounds.top}px`,
            width: `${endBounds.width}px`,
            height: `${endBounds.height}px`,
          },
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        }
      );
      activeAnimRef.current = anim;

      const handleDone = () => {
        if (activeAnimRef.current === anim) {
          activeAnimRef.current = null;
        }
        anim.onfinish = null;
        anim.oncancel = null;
        try {
          anim.commitStyles();
        } catch {
          /* ignore */
        }
        try {
          anim.cancel();
        } catch {
          /* ignore */
        }
        useWindows.getState().updateWindow(w.id, { pdfAnimating: false });
      };
      anim.onfinish = handleDone;
      anim.oncancel = handleDone;
    } else if (!activeAnimRef.current) {
      if (isMaximized) {
        el.style.left = `${maximizedBounds.left}px`;
        el.style.top = `${maximizedBounds.top}px`;
        el.style.width = `${maximizedBounds.width}px`;
        el.style.height = `${maximizedBounds.height}px`;
      } else {
        el.style.left = `${w.x ?? 80}px`;
        el.style.top = `${w.y ?? 80}px`;
        el.style.width = `${normalBounds.width}px`;
        el.style.height = `${normalBounds.height}px`;
      }
    }

    const handleResize = () => {
      const c = getCamera();
      el.style.left = `${-c.panX / c.zoom}px`;
      el.style.top = `${-c.panY / c.zoom}px`;
      el.style.width = `${window.innerWidth / c.zoom}px`;
      el.style.height = `${window.innerHeight / c.zoom}px`;
    };

    if (isMaximized) {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      if (activeAnimRef.current) {
        const animToCancel = activeAnimRef.current;
        activeAnimRef.current = null;
        animToCancel.onfinish = null;
        animToCancel.oncancel = null;
        try {
          animToCancel.cancel();
        } catch {
          /* ignore */
        }
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [
    w.id,
    w.pdfMaximized,
    w.contentType,
    w.x,
    w.y,
    w.width,
    w.height,
    isCompressedGroupMember,
  ]);

  const prevStackedRef = useRef(w.stacked);

  useEffect(() => {
    const wasStacked = prevStackedRef.current;
    prevStackedRef.current = !!w.stacked;

    const isImage = !!(w.contentType === "image" || w.directImageUrl || w.title?.startsWith("File:"));
    if (wasStacked && !w.stacked && (w.contentType === "sticky" || isImage)) {
      const el = document.getElementById(`win-${w.id}`);
      const prevStubRect = lastStackedStubRects.get(w.id);

      if (el && prevStubRect) {
        lastStackedStubRects.delete(w.id);
        const noteRect = el.getBoundingClientRect();
        const fromX = prevStubRect.left - noteRect.left;
        const fromY = prevStubRect.top - noteRect.top;
        const scaleX = prevStubRect.width / Math.max(noteRect.width, 1);
        const scaleY = prevStubRect.height / Math.max(noteRect.height, 1);

        markNoteUnstacking(w.id);

        const anim = el.animate(
          [
            { transform: `translate3d(${fromX}px, ${fromY}px, 0) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left", opacity: 1 },
            { transform: "translate3d(0, 0, 0) scale(1, 1)", transformOrigin: "top left", opacity: 1 },
          ],
          {
            duration: 300,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "forwards",
          }
        );

        anim.onfinish = () => {
          anim.cancel();
          el.style.transform = "";
          el.style.opacity = "";
          el.style.zIndex = "";
          unmarkNoteUnstacking(w.id);
          useWindows.getState().setActive(w.id);
        };
      } else if (el) {
        let parentId = w.parentId || w.parentIds?.[0];
        let parentWin = parentId
          ? useWindows.getState().windows.find((win) => win.id === parentId)
          : undefined;

        if (!parentWin) {
          parentWin = useWindows.getState().windows.find(
            (win) => win.contentType !== "sticky" && (win.parentId === w.id || win.parentIds?.includes(w.id))
          );
        }

        const parentEl = parentWin
          ? document.getElementById(`win-${parentWin.id}`)
          : (parentId ? document.getElementById(`group-box-${parentId}`) : null);

        if (parentEl) {
          const parentRect = parentEl.getBoundingClientRect();
          const noteRect = el.getBoundingClientRect();
          const parentEntity: WindowData = parentWin ?? {
            id: parentId ?? "parent",
            url: "",
            title: "",
            links: [],
            active: false,
            lastFocusedAt: 0,
            x: parentRect.left,
            y: parentRect.top,
            width: parentRect.width,
            height: parentRect.height,
            zIndex: 1,
          };

          const allChildNotes = getConnectedChildNotes(
            parentId || w.id,
            useWindows.getState().windows,
            useWindows.getState().groups
          ).filter((win) => win.contentType === "sticky");

          const side = determineNoteSide(w, parentEntity);
          const sideNotes = allChildNotes.filter((win) => determineNoteSide(win, parentEntity) === side);
          const isStickyParent = parentEntity.contentType === "sticky";
          const parentW = parentEntity.width ?? 750;
          const parentH = parentEntity.height ?? 550;
          const maxHoriz = parentW < 180 ? 0 : Math.max(0, Math.floor((parentW - 40) / 65));
          const maxVert = parentH < 150 ? 0 : Math.max(0, Math.floor((parentH - 40) / 55));
          const limit = isStickyParent
            ? 1
            : Math.min(3, (side === "TOP" || side === "BOTTOM") ? maxHoriz : maxVert);

          const visibleCount = Math.min(limit, sideNotes.length) || 1;
          const rawIdx = sideNotes.findIndex((win) => win.id === w.id);
          const index = Math.max(0, Math.min(rawIdx >= 0 ? rawIdx : 0, visibleCount - 1));
          const total = visibleCount;
          const { stubW, stubH } = getStubDimensions(w);

          const offset = getStubTargetOffset(side, index, total, stubW, stubH, parentRect, noteRect);
          const fromX = offset.toX;
          const fromY = offset.toY;
          const scaleX = stubW / Math.max(noteRect.width, 1);
          const scaleY = stubH / Math.max(noteRect.height, 1);

          markNoteUnstacking(w.id);

          const anim = el.animate(
            [
              { transform: `translate3d(${fromX}px, ${fromY}px, 0) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left", opacity: 1 },
              { transform: "translate3d(0, 0, 0) scale(1, 1)", transformOrigin: "top left", opacity: 1 },
            ],
            {
              duration: 300,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "forwards",
            }
          );

          anim.onfinish = () => {
            anim.cancel();
            el.style.transform = "";
            el.style.opacity = "";
            el.style.zIndex = "";
            unmarkNoteUnstacking(w.id);
            useWindows.getState().setActive(w.id);
          };
        }
      }
    }
  }, [w.stacked, w.id, w.contentType, w.parentId, w.parentIds]);

  if (w.stacked) {
    return null;
  }

  if (isHiddenOverflowDeckMember) {
    return null;
  }

  if (w.contentType === "text") {
    if (isCompressedGroupMember) {
      return null;
    }

    return (
      <div
        id={`win-${w.id}`}
        className="window-wrapper absolute"
        style={{
          ...zIndexStyle,
          left: `${w.x ?? 80}px`,
          top: `${w.y ?? 80}px`,
          width: w.width ? `${w.width}px` : "auto",
          height: w.height ? `${w.height}px` : "auto",
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e, w.id);
        }}
      >
        <CanvasTextItem
          win={w}
          onClose={handleClose}
          onActivate={handleActivate}
          onPositionChange={handlePositionChange}
          onAddSticky={handleAddSticky}
          onContextMenu={(e) => onContextMenu?.(e, w.id)}
        />
      </div>
    );
  }

  if (w.contentType === "shape") {
    if (isCompressedGroupMember) {
      return null;
    }

    const wrapperLeft = w.x ?? 80;
    const wrapperTop = w.y ?? 80;
    const wrapperW = w.width ?? 120;
    const wrapperH = w.height ?? 120;

    return (
      <div
        id={`win-${w.id}`}
        className="window-wrapper absolute pointer-events-none"
        style={{
          ...zIndexStyle,
          left: `${wrapperLeft}px`,
          top: `${wrapperTop}px`,
          width: `${wrapperW}px`,
          height: `${wrapperH}px`,
        }}
      >
        <CanvasShapeItem
          win={w}
          onClose={handleClose}
          onActivate={handleActivate}
          onPositionChange={handlePositionChange}
          onAddSticky={handleAddSticky}
          onContextMenu={(e) => onContextMenu?.(e, w.id)}
        />
      </div>
    );
  }

  if (w.contentType === "sticky") {
    const isExcerpt = w.isExcerptNote;
    const itemW = isCompressedGroupMember ? (isExcerpt ? 110 : 150) : (w.width ?? 260);
    const itemH = isCompressedGroupMember ? (isExcerpt ? 48 : 95) : (w.height ?? (isExcerpt ? 64 : 200));

    const attachedPdf = windows.find(
      (p) =>
        p.contentType === "pdf" &&
        (p.id === w.parentId ||
          w.parentIds?.includes(p.id) ||
          p.id === w.stackedParentId ||
          p.parentId === w.id ||
          p.parentIds?.includes(w.id)),
    );

    const isAttachedPdfMaximized = !!attachedPdf?.pdfMaximized;
    const isWrongPdfPage =
      !!attachedPdf &&
      w.pdfPage != null &&
      attachedPdf.pdfCurrentPage != null &&
      w.pdfPage !== attachedPdf.pdfCurrentPage;

    const groupMembers = parentGroup ? windows.filter((win) => parentGroup.memberIds.includes(win.id)) : [];
    // Regular windows in the group (articles, pdfs, images, or default windows)
    const hasWindowMember = groupMembers.some((win) => win.contentType !== "sticky" && win.contentType !== "text");
    // If the group has windows, hide attached stickies so the primary windows are shown;
    // But if there are no windows in the group, show the sticky notes in the compressed card deck!
    const isHiddenInCompressedGroup = isCompressedGroupMember && hasWindowMember;

    const shouldHideSticky = isAttachedPdfMaximized || isWrongPdfPage || isHiddenInCompressedGroup;

    return (
      <div
        id={`win-${w.id}`}
        className="window-wrapper absolute"
        style={{
          ...zIndexStyle,
          left: `${w.x ?? 80}px`,
          top: `${w.y ?? 80}px`,
          width: `${itemW}px`,
          height: `${itemH}px`,
          display: shouldHideSticky ? "none" : undefined,
        }}
        onMouseDown={(e) => {
          if (isCompressedGroupMember) return;
          handleActivate();
          const rect = e.currentTarget.getBoundingClientRect();
          if (e.clientX >= rect.right - 32 && e.clientY >= rect.bottom - 32) {
            Resize(e, (pos) => handlePositionChange(pos), handleActivate);
          }
        }}
      >
        {!isCompressedGroupMember && <StackedNoteStubs parentWin={w} />}
        <div
          className={`window sticky-window ${isExcerpt ? "excerpt-note-window" : ""} ${w.active ? "active" : "inactive"} ${isCompressedGroupMember ? "is-compressed" : ""} ${isSelected ? "ring-2 ring-blue-500/80 shadow-md" : ""} w-full h-full relative`}
          style={{
            ...(isCompressedGroupMember
              ? {
                  borderRadius: "16px",
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                }
              : isExcerpt
              ? {
                  borderRadius: "22px",
                  background: "#f0e5d8",
                  border: "1px solid #e4d5c3",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
                }
              : {}),
          }}
        >
          <StickyNote
            win={w}
            onClose={handleClose}
            onActivate={handleActivate}
            onPositionChange={handlePositionChange}
            onContextMenu={(e) => onContextMenu?.(e, w.id)}
          />
          {!isCompressedGroupMember && (
            <>
              <button
                type="button"
                className="connection-point point-top"
                title="Add sticky note"
                onMouseDown={(e) => startWireDrag(e, w.id, "TOP", handleAddSticky)}
              />
              <button
                type="button"
                className="connection-point point-right"
                title="Add sticky note"
                onMouseDown={(e) => startWireDrag(e, w.id, "RIGHT", handleAddSticky)}
              />
              <button
                type="button"
                className="connection-point point-bottom"
                title="Add sticky note"
                onMouseDown={(e) => startWireDrag(e, w.id, "BOTTOM", handleAddSticky)}
              />
              <button
                type="button"
                className="connection-point point-left"
                title="Add sticky note"
                onMouseDown={(e) => startWireDrag(e, w.id, "LEFT", handleAddSticky)}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  if (w.contentType === "pdf") {
    const itemW = isCompressedGroupMember ? 220 : (w.width ?? 620);
    const itemH = isCompressedGroupMember ? 140 : (w.height ?? 945);

    return (
      <div
        ref={(el) => {
          pdfRef.current = el;

          if (el && !el.dataset.pos) {
            el.dataset.pos = "1";

            const offset =
              w.x === undefined || w.y === undefined
                ? nextCascadeOffset()
                : 0;

            const left = w.x !== undefined ? w.x : 80 + offset;
            const top = w.y !== undefined ? w.y : 80 + offset;

            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
            el.style.width = `${itemW}px`;
            el.style.height = `${itemH}px`;

            if (w.x === undefined || w.y === undefined) {
              updateWindow(w.id, { x: left, y: top });
            }
          }
        }}
        id={`win-${w.id}`}
        className={`window pdf-window ${
          w.pdfMaximized ? "maximized" : ""
        } ${
          w.pdfMaximized && !w.pdfAnimating ? "maximized-done" : ""
        } ${w.active ? "active" : "inactive"} ${isCompressedGroupMember ? "is-compressed" : ""} ${w.pdfAnimating ? "animating no-transition" : ""}`}
        style={{
          ...zIndexStyle,
          ...(!w.pdfMaximized && !w.pdfAnimating
            ? {
                left: `${w.x ?? 80}px`,
                top: `${w.y ?? 80}px`,
                width: `${itemW}px`,
                height: `${itemH}px`,
              }
            : {}),
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e, w.id);
        }}
        onMouseDown={(e) => {
          if (isCompressedGroupMember) return;
          handleActivate();
          if (w.pdfMaximized) return;

          Resize(e, (rect) => handlePositionChange(rect));
        }}
      >
        {!isCompressedGroupMember && !w.pdfMaximized && !w.pdfAnimating && <StackedNoteStubs parentWin={w} />}
        <div className="pdf-window-animation-layer">
          <PdfViewer
            win={w}
            onAddSticky={handleAddSticky}
            onPositionChange={handlePositionChange}
            onActivate={handleActivate}
          />
        </div>
      </div>
    );
  }

  if (w.contentType === "image" || w.directImageUrl || w.title?.startsWith("File:")) {
    const itemW = isCompressedGroupMember ? 220 : (w.width ?? 250);
    const itemH = isCompressedGroupMember ? 140 : (w.height ?? 190);

    return (
      <div
        id={`win-${w.id}`}
        className={`window image-window ${w.active ? "active" : "inactive"} ${isCompressedGroupMember ? "is-compressed" : ""}`}
        style={{
          ...zIndexStyle,
          left: `${w.x ?? 80}px`,
          top: `${w.y ?? 80}px`,
          width: `${itemW}px`,
          height: `${itemH}px`,
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e, w.id);
        }}
        onMouseDown={(e) => {
          if (isCompressedGroupMember) return;
          handleActivate();
          Resize(e, (rect) => handlePositionChange(rect));
        }}
      >
        {!isCompressedGroupMember && <StackedNoteStubs parentWin={w} />}
        <ImageViewer
          win={w}
          onClose={handleClose}
          onActivate={handleActivate}
          onPositionChange={handlePositionChange}
        />
        {!isCompressedGroupMember && (
          <>
            <button
              type="button"
              className="connection-point point-top"
              title="Add sticky note"
              onMouseDown={(e) => startWireDrag(e, w.id, "TOP", handleAddSticky)}
            />
            <button
              type="button"
              className="connection-point point-right"
              title="Add sticky note"
              onMouseDown={(e) => startWireDrag(e, w.id, "RIGHT", handleAddSticky)}
            />
            <button
              type="button"
              className="connection-point point-bottom"
              title="Add sticky note"
              onMouseDown={(e) => startWireDrag(e, w.id, "BOTTOM", handleAddSticky)}
            />
            <button
              type="button"
              className="connection-point point-left"
              title="Add sticky note"
              onMouseDown={(e) => startWireDrag(e, w.id, "LEFT", handleAddSticky)}
            />
          </>
        )}
      </div>
    );
  }

  if (w.contentType === "youtube") {
    const itemW = isCompressedGroupMember ? 220 : (w.width ?? 480);
    const itemH = isCompressedGroupMember ? 140 : (w.height ?? 320);

    return (
      <Window
        id={`win-${w.id}`}
        className={`youtube-window ${w.active ? "active" : "inactive"} ${isCompressedGroupMember ? "is-compressed" : ""}`}
        style={zIndexStyle}
        stubs={isCompressedGroupMember ? null : <StackedNoteStubs parentWin={w} />}
        titleBarContent={
          <div className="flex items-center gap-2 overflow-hidden text-sm font-medium">
            <svg className="w-4 h-4 text-red-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span className="truncate">{w.title || "YouTube Video"}</span>
          </div>
        }
        x={w.x}
        y={w.y}
        width={itemW}
        height={itemH}
        onActivate={handleActivate}
        onClose={isCompressedGroupMember ? undefined : handleClose}
        onPositionChange={handlePositionChange}
        onAddSticky={isCompressedGroupMember ? undefined : handleAddSticky}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e, w.id);
        }}
      >
        <YouTubeViewer win={w} onActivate={handleActivate} />
        {!isCompressedGroupMember && <StackedNotesDrawer parentWin={w} />}
      </Window>
    );
  }

  const itemW = isCompressedGroupMember ? 220 : w.width;
  const itemH = isCompressedGroupMember ? 140 : w.height;

  return (
    <Window
      id={`win-${w.id}`}
      className={`${w.active ? "active" : "inactive"} ${isCompressedGroupMember ? "is-compressed" : ""}`}
      style={zIndexStyle}
      stubs={isCompressedGroupMember ? null : <StackedNoteStubs parentWin={w} />}
      titleBarContent={<span>{w.title}</span>}
      x={w.x}
      y={w.y}
      width={itemW}
      height={itemH}
      onActivate={handleActivate}
      onClose={isCompressedGroupMember ? undefined : handleClose}
      onPositionChange={handlePositionChange}
      onAddSticky={isCompressedGroupMember ? undefined : handleAddSticky}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, w.id);
      }}
    >
      {w.url ? <ArticleView win={w} /> : <LinkEditor win={w} />}
      {!isCompressedGroupMember && <StackedNotesDrawer parentWin={w} />}
    </Window>
  );
})

function App() {
  const windows = useWindows((s) => s.windows)
  const addWindow = useWindows((s) => s.addWindow)

  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);

  useEffect(() => {
    function handleCloseMenus(e: Event) {
      const customEv = e as CustomEvent;
      if (customEv.detail?.exceptWindowId !== contextMenuPos?.windowId) {
        if (customEv.detail?.exceptWindowId === undefined || customEv.detail?.exceptWindowId !== contextMenuPos?.windowId) {
          setContextMenuPos(null);
        }
      }
    }
    window.addEventListener("wikiboard:close-menus", handleCloseMenus as EventListener);
    return () => window.removeEventListener("wikiboard:close-menus", handleCloseMenus as EventListener);
  }, [contextMenuPos?.windowId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, windowId: string) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wikiboard:close-menus", { detail: { exceptWindowId: windowId } }));
    }
    setContextMenuPos({ x: e.clientX, y: e.clientY, windowId });
  }, []);

  const isEraserToolActive = useWindows((s) => s.isEraserToolActive);
  const isTextToolActive = useWindows((s) => s.isTextToolActive);
  const isStickyToolActive = useWindows((s) => s.isStickyToolActive);
  const isSelectToolActive = useWindows((s) => s.isSelectToolActive);
  const drawingTool = useWindows((s) => s.drawingTool);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") {
        setIsShiftPressed(true);
      } else if (e.key === "Escape") {
        if (useWindows.getState().isEraserToolActive) {
          useWindows.getState().setEraserToolActive(false);
        } else if (useWindows.getState().isTextToolActive) {
          useWindows.getState().setTextToolActive(false);
        } else if (useWindows.getState().isStickyToolActive) {
          useWindows.getState().setStickyToolActive(false);
        } else if (useWindows.getState().isSelectToolActive) {
          useWindows.getState().setSelectToolActive(false);
        } else if (useWindows.getState().drawingTool) {
          useWindows.getState().setDrawingTool(null);
        } else {
          useWindows.getState().clearSelection();
          useWindows.getState().deactivateAll();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement | null;
        const isSearchInput = !!target?.closest(".search-box, input[type='search'], input[placeholder*='Search' i]");
        if (isSearchInput) return;

        const isInput = target?.tagName === "INPUT";
        if (isInput) return;

        const isTextarea = target?.tagName === "TEXTAREA";
        const state = useWindows.getState();

        // If user is inside a textarea (e.g. sticky note) and presses Delete
        if (isTextarea && (e.key === "Delete" || (e.key === "Backspace" && (e.ctrlKey || e.metaKey)))) {
          const textarea = target as HTMLTextAreaElement;
          const hasSelectedText = textarea.selectionStart !== textarea.selectionEnd;
          const activeWin = state.windows.find((w) => w.active);
          // Only delete if the user has explicitly selected this item (so it is in selectedIds)
          const isExplicitlySelected = activeWin && state.selectedIds && state.selectedIds.includes(activeWin.id);

          if (isExplicitlySelected && (!hasSelectedText || e.ctrlKey || e.metaKey)) {
            const idsToDelete = new Set<string>();
            state.selectedIds.forEach((id) => idsToDelete.add(id));
            if (activeWin) {
              idsToDelete.add(activeWin.id);
            }
            if (idsToDelete.size > 0) {
              e.preventDefault();
              idsToDelete.forEach((id) => {
                deleteScroll(id);
                state.removeWindow(id);
              });
              evictClosedWindowArticles();
              state.clearSelection();
              return;
            }
          }
        }

        const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        if (!isEditing) {
          const idsToDelete = new Set<string>();

          // Only delete items that are explicitly selected in selectedIds
          if (state.selectedIds && state.selectedIds.length > 0) {
            state.selectedIds.forEach((id) => idsToDelete.add(id));
          } else {
            // If nothing is in selectedIds, only delete the active window if it is an article/pdf window (traditional window manager behavior)
            // but NEVER delete an unselected sticky note, shape, or text item!
            const activeWin = state.windows.find((w) => w.active);
            if (activeWin && activeWin.contentType !== "sticky" && activeWin.contentType !== "shape" && activeWin.contentType !== "text") {
              idsToDelete.add(activeWin.id);
            }
          }

          if (idsToDelete.size > 0) {
            e.preventDefault();
            idsToDelete.forEach((id) => {
              deleteScroll(id);
              state.removeWindow(id);
            });
            evictClosedWindowArticles();
            state.clearSelection();
          }
        }
      } else if ((e.key === "e" || e.key === "E") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        if (!isEditing) {
          e.preventDefault();
          useWindows.getState().toggleEraserTool();
        }
      } else if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        if (!isEditing) {
          e.preventDefault();
          useWindows.getState().toggleTextTool();
        }
      } else if ((e.key === "v" || e.key === "V") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        if (!isEditing) {
          e.preventDefault();
          useWindows.getState().toggleSelectTool();
        }
      } else if ((e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        if (!isEditing) {
          e.preventDefault();
          useWindows.getState().addWindow({
            contentType: "sticky",
            title: "Note",
            stickyText: "",
            noteColor: "yellow",
            width: 260,
            height: 200,
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        const target = e.target as HTMLElement | null;
        const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        if (!isEditing) {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        const target = e.target as HTMLElement | null;
        const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
        if (!isEditing) {
          e.preventDefault();
          redo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveCanvasToFile();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        zoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") {
        setIsShiftPressed(false);
      }
    }

    function handleBlur() {
      setIsShiftPressed(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current!;
    const world = worldRef.current!;
    const grid = gridRef.current!;

    const unsub = subscribeCamera((cam) => {
      world.style.transform = `translate(${cam.panX}px, ${cam.panY}px) scale(${cam.zoom})`;
      grid.style.backgroundPosition = `${cam.panX % (24 * cam.zoom)}px ${cam.panY % (24 * cam.zoom)}px`;
      grid.style.backgroundSize = `${24 * cam.zoom}px ${24 * cam.zoom}px`;
    });

    function onPanMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const isWinClick = Boolean(target?.closest(".window, .window-wrapper, .canvas-text-item"));
      const isSearchClick = Boolean(target?.closest(".search-box"));
      const isMenuClick = Boolean(target?.closest(".group-context-menu"));
      const isGroupClick = Boolean(target?.closest("[id^='group-box-']"));
      const isLeftMenuClick = Boolean(target?.closest(".left-menu"));
      const isRightMenuClick = Boolean(target?.closest(".right-menu"));
      const isBottomControlsClick = Boolean(target?.closest(".bottom-controls, .zoom-control, .undo-redo-control"));

      if (isMenuClick || isGroupClick || isLeftMenuClick || isRightMenuClick || isBottomControlsClick) return;

      if (useWindows.getState().isTextToolActive) {
        if (isWinClick || isSearchClick) return;
        e.preventDefault();
        e.stopPropagation();
        const startWorld = screenToWorld(e.clientX, e.clientY);
        addWindow({
          contentType: "text",
          title: "Text",
          stickyText: "",
          fontSize: 36,
          x: Math.round(startWorld.x),
          y: Math.round(startWorld.y),
        });
        useWindows.getState().setTextToolActive(false);
        return;
      }

      if (useWindows.getState().isStickyToolActive) {
        if (isWinClick || isSearchClick) return;
        e.preventDefault();
        e.stopPropagation();
        const startWorld = screenToWorld(e.clientX, e.clientY);
        addWindow({
          contentType: "sticky",
          title: "Note",
          stickyText: "",
          width: 260,
          height: 200,
          x: Math.round(startWorld.x - 130),
          y: Math.round(startWorld.y - 100),
        });
        useWindows.getState().setStickyToolActive(false);
        return;
      }

      const activeDrawingTool = useWindows.getState().drawingTool;
      if (activeDrawingTool) {
        if (isWinClick || isSearchClick) return;
        e.preventDefault();
        e.stopPropagation();

        const startWorld = screenToWorld(e.clientX, e.clientY);
        setMarquee({
          startX: startWorld.x,
          startY: startWorld.y,
          currentX: startWorld.x,
          currentY: startWorld.y,
          shapeType: activeDrawingTool ?? undefined,
        });

        function onDrawMove(ev: MouseEvent) {
          const curWorld = screenToWorld(ev.clientX, ev.clientY);
          setMarquee({
            startX: startWorld.x,
            startY: startWorld.y,
            currentX: curWorld.x,
            currentY: curWorld.y,
            shapeType: activeDrawingTool ?? undefined,
          });
        }

        function onDrawUp(ev: MouseEvent) {
          window.removeEventListener("mousemove", onDrawMove);
          window.removeEventListener("mouseup", onDrawUp);
          setMarquee(null);

          const curWorld = screenToWorld(ev.clientX, ev.clientY);
          const minX = Math.min(startWorld.x, curWorld.x);
          const minY = Math.min(startWorld.y, curWorld.y);
          const rawW = Math.abs(curWorld.x - startWorld.x);
          const rawH = Math.abs(curWorld.y - startWorld.y);

          if (!activeDrawingTool) return;

          let shapeW: number;
          let shapeH: number;
          let posX: number;
          let posY: number;
          let shapePoints: [number, number, number, number] | undefined = undefined;
          let midPoint: [number, number] | undefined = undefined;

          if (activeDrawingTool === "line" || activeDrawingTool === "arrow") {
            const dragDist = Math.hypot(curWorld.x - startWorld.x, curWorld.y - startWorld.y);
            if (dragDist >= 15) {
              const p1x = startWorld.x;
              const p1y = startWorld.y;
              const p2x = curWorld.x;
              const p2y = curWorld.y;

              const minX = Math.min(p1x, p2x);
              const minY = Math.min(p1y, p2y);
              const maxX = Math.max(p1x, p2x);
              const maxY = Math.max(p1y, p2y);

              posX = Math.round(minX);
              posY = Math.round(minY);
              shapeW = Math.max(2, Math.round(maxX - minX));
              shapeH = Math.max(2, Math.round(maxY - minY));

              const x1 = Math.round(p1x - minX);
              const y1 = Math.round(p1y - minY);
              const x2 = Math.round(p2x - minX);
              const y2 = Math.round(p2y - minY);
              const mx = Math.round((x1 + x2) / 2);
              const my = Math.round((y1 + y2) / 2);

              shapePoints = [x1, y1, x2, y2];
              midPoint = [mx, my];
            } else {
              // Clicked without drag: create a horizontal line/arrow of length 200px
              posX = Math.round(startWorld.x);
              posY = Math.round(startWorld.y);
              shapeW = 200;
              shapeH = 2;
              shapePoints = [0, 1, 200, 1];
              midPoint = [100, 1];
            }
          } else {
            // Rectangle, Circle, Diamond
            shapeW = rawW >= 15 ? Math.round(rawW) : 120;
            shapeH = rawH >= 15 ? Math.round(rawH) : 120;
            posX = rawW >= 15 ? Math.round(minX) : Math.round(startWorld.x - shapeW / 2);
            posY = rawH >= 15 ? Math.round(minY) : Math.round(startWorld.y - shapeH / 2);
          }

          addWindow({
            contentType: "shape",
            shapeType: activeDrawingTool,
            title: activeDrawingTool.charAt(0).toUpperCase() + activeDrawingTool.slice(1),
            width: shapeW,
            height: shapeH,
            x: posX,
            y: posY,
            strokeColor: "#64748b",
            fillColor: "transparent",
            strokeWidth: 2.5,
            shapePoints,
            midPoint,
            active: activeDrawingTool === "line" || activeDrawingTool === "arrow" ? false : true,
          });

          useWindows.getState().setDrawingTool(null);
        }

        window.addEventListener("mousemove", onDrawMove);
        window.addEventListener("mouseup", onDrawUp);
        return;
      }

      if (!isWinClick && !isSearchClick) {
        window.getSelection()?.removeAllRanges();
        document.getSelection()?.removeAllRanges();
      }

      if (useWindows.getState().windows.some((win) => win.pdfMaximized)) return;

      const currentShift = e.shiftKey || isShiftPressed || useWindows.getState().isSelectToolActive;

      if (currentShift) {
        if (isWinClick || isSearchClick || isLeftMenuClick || isRightMenuClick || isBottomControlsClick) return;

        e.preventDefault();
        e.stopPropagation();

        const startWorld = screenToWorld(e.clientX, e.clientY);
        setMarquee({ startX: startWorld.x, startY: startWorld.y, currentX: startWorld.x, currentY: startWorld.y });

        function onMouseMove(ev: MouseEvent) {
          const curWorld = screenToWorld(ev.clientX, ev.clientY);
          setMarquee({ startX: startWorld.x, startY: startWorld.y, currentX: curWorld.x, currentY: curWorld.y });
        }

        function onMouseUp(ev: MouseEvent) {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);

          const curWorld = screenToWorld(ev.clientX, ev.clientY);
          const minX = Math.min(startWorld.x, curWorld.x);
          const minY = Math.min(startWorld.y, curWorld.y);
          const maxX = Math.max(startWorld.x, curWorld.x);
          const maxY = Math.max(startWorld.y, curWorld.y);

          const dragDist = Math.hypot(curWorld.x - startWorld.x, curWorld.y - startWorld.y);

          if (dragDist >= 5) {
            const intersected = useWindows
              .getState()
              .windows.filter((w) => !w.stacked)
              .filter((w) => {
                const b = getWindowWorldBounds(w);
                return !(b.right < minX || b.left > maxX || b.bottom < minY || b.top > maxY);
              })
              .map((w) => w.id);

            useWindows.getState().setSelectedIds(intersected);
          } else {
            useWindows.getState().clearSelection();
          }

          setMarquee(null);
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return;
      }

      if (!isWinClick && !isSearchClick) {
        useWindows.getState().clearSelection();
        useWindows.getState().deactivateAll();
        startCanvasPan(e, viewport);
      }
    }

    function onEraserCapture(e: MouseEvent) {
      if (e.button !== 0) return;
      if (!useWindows.getState().isEraserToolActive) return;

      const target = e.target as HTMLElement | null;
      if (
        target?.closest(".left-menu") ||
        target?.closest(".zoom-control") ||
        target?.closest(".search-box") ||
        target?.closest("button")
      ) {
        return;
      }

      // Check if clicked on a window wrapper or canvas item
      const itemEl = target?.closest(".window-wrapper, .window, .canvas-text-item, .canvas-shape-item") as HTMLElement | null;
      if (itemEl) {
        let winId: string | undefined;
        if (itemEl.id?.startsWith("win-")) {
          winId = itemEl.id.replace("win-", "");
        } else {
          const wrapper = itemEl.closest("[id^='win-']") as HTMLElement | null;
          if (wrapper?.id) {
            winId = wrapper.id.replace("win-", "");
          }
        }

        if (winId) {
          e.preventDefault();
          e.stopPropagation();
          deleteScroll(winId);
          useWindows.getState().removeWindow(winId);
          evictClosedWindowArticles();
          return;
        }
      }

      // Check if clicked on a connection arrow
      const arrowSvg = target?.closest(".connection-arrow-item") as SVGSVGElement | null;
      if (arrowSvg && arrowSvg.id?.startsWith("arrow-svg-")) {
        const key = arrowSvg.id.replace("arrow-svg-", "");
        const [pId, cId] = key.split("--");
        if (pId && cId) {
          e.preventDefault();
          e.stopPropagation();
          useWindows.getState().disconnectEntities(pId, cId);
          return;
        }
      }
    }

    function onWheel(e: WheelEvent) {
      if (useWindows.getState().windows.some((win) => win.pdfMaximized)) return;
      if (e.ctrlKey) {
        handleZoom(e);
      }
    }

    viewport.addEventListener("mousedown", onEraserCapture, true);
    viewport.addEventListener("mousedown", onPanMouseDown);
    viewport.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      unsub();
      viewport.removeEventListener("mousedown", onEraserCapture, true);
      viewport.removeEventListener("mousedown", onPanMouseDown);
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [isShiftPressed, isEraserToolActive, isTextToolActive, isStickyToolActive, isSelectToolActive, drawingTool, addWindow]);

  return (
    <>
      <LeftMenu />
      <RightMenu />
      <div className="bottom-controls fixed bottom-5 left-5 z-[9990] flex items-center gap-2 select-none">
        <ZoomControl />
        <UndoRedoControl />
      </div>
      <SearchBox />
      <MediaInsertButton />

      <div
        ref={viewportRef}
        className={`canvas-viewport ${isEraserToolActive ? "eraser-tool-active" : ""} ${isTextToolActive ? "text-tool-active" : ""} ${isSelectToolActive || drawingTool ? "select-tool-active" : ""}`}
        style={{
          cursor: isEraserToolActive
            ? undefined
            : isTextToolActive
            ? "text"
            : (isShiftPressed || isSelectToolActive || drawingTool ? "crosshair" : undefined),
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            const mousePos = screenToWorld(e.clientX, e.clientY);
            let offset = 0;
            for (const file of Array.from(e.dataTransfer.files)) {
              const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
              const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif)$/i.test(file.name);
              if (isPdf) {
                const url = URL.createObjectURL(file);
                addWindow({
                  contentType: "pdf",
                  pdfUrl: url,
                  url,
                  title: file.name.replace(/\.pdf$/i, ""),
                  pdfCurrentPage: 1,
                  x: mousePos.x + offset - 310,
                  y: mousePos.y + offset - 100,
                  width: 620,
                  height: 945,
                });
                offset += 24;
              } else if (isImage) {
                const url = URL.createObjectURL(file);
                addWindow({
                  contentType: "image",
                  directImageUrl: url,
                  url,
                  title: file.name,
                  x: mousePos.x + offset - 160,
                  y: mousePos.y + offset - 120,
                  width: 320,
                  height: 240,
                });
                offset += 24;
              }
            }
          }
        }}
      >
        <div ref={gridRef} className="canvas-grid" />
        <div ref={worldRef} className="canvas-world">
          <GroupOverlay />
          <ConnectionArrows windows={windows} />
          {windows.map((w) => (
            <WindowItem key={w.id} w={w} onContextMenu={handleContextMenu} />
          ))}
          <LiveWireOverlay />
          <SelectionOverlay marquee={marquee} />
        </div>
      </div>

      <WindowContextMenu pos={contextMenuPos} onClose={() => setContextMenuPos(null)} />
    </>
  )
}

export default App
