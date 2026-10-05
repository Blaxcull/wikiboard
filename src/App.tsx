/* eslint-disable react-hooks/immutability */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Window from './components/window'
import LinkEditor from './components/linkEditor'
import SearchBox from './components/searchBox'
import ArticleView from './components/articleView'
import PdfViewer from './components/pdfViewer'
import ImageViewer from './components/imageViewer'
import StickyNote from './components/stickyNote'
import WindowContextMenu, { type ContextMenuPosition } from './components/windowContextMenu'
import { useWindows, getConnectedChildNotes, findRootWindow, type WindowData, nextCascadeOffset } from './store/windows'
import { deleteScroll } from './utils/scrollMemory'
import { evictClosedWindowArticles } from './utils/articleCache'
import { getCamera, subscribeCamera, screenToWorld } from './utils/camera'
import SelectionOverlay, { getWindowWorldBounds, type MarqueeState } from './components/selectionOverlay'
import GroupOverlay from './components/groupOverlay'
import { startCanvasPan } from './utils/canvas/pan'
import { handleZoom } from './utils/canvas/zoom'
import { isDraggingWindow, activeDraggedWindowId } from './utils/window/drag'
import { isResizingWindow, activeResizingWindowId, Resize } from './utils/window/resize'
import { startWireDrag, subscribeWire } from './utils/window/wireDrag'
import {
  isNoteUnstacking,
  isWindowStacking,
  markNoteUnstacking,
  unmarkNoteUnstacking,
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
  const x = parseFloat(el.style.left) || 0;
  const y = parseFloat(el.style.top) || 0;
  const w = parseFloat(el.style.width) || el.offsetWidth || 750;
  let h = parseFloat(el.style.height) || el.offsetHeight || 550;
  const zIndex = parseInt(el.style.zIndex, 10) || 0;

  const { tx, ty } = parseTransformTranslate(el);

  if (el.classList.contains("pdf-window") && !el.classList.contains("maximized")) {
    const canvas = el.querySelector("canvas");
    if (canvas) {
      const windowRect = el.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const cam = getCamera();
      if (cam.zoom > 0) {
        const topOffset = (canvasRect.top - windowRect.top) / cam.zoom;
        const leftOffset = (canvasRect.left - windowRect.left) / cam.zoom;
        const canvasWidth = (canvasRect.right - canvasRect.left) / cam.zoom;
        const canvasHeight = (canvasRect.bottom - canvasRect.top) / cam.zoom;
        return {
          x: x + tx + leftOffset,
          y: y + ty + topOffset,
          w: Math.max(50, canvasWidth),
          h: Math.max(50, canvasHeight),
          zIndex,
        };
      }
    } else if (el.querySelector(".pdf-toolbar")) {
      h = Math.max(100, h - 68);
    }
  }

  return { x: x + tx, y: y + ty, w, h, zIndex };
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

      el.animate(
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
    }
  }, [note.id]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elRef.current;
    if (el) {
      lastStackedStubRects.set(note.id, el.getBoundingClientRect());
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

  return (
    <div
      ref={elRef}
      id={`stub-${note.id}`}
      className={`absolute pointer-events-auto cursor-pointer transition-transform duration-150 ${hoverClass} rounded-[6px] border border-black/20 shadow-md overflow-hidden`}
      style={{
        width: `${stubW}px`,
        height: `${stubH}px`,
        background: colorBg,
        ...posStyle,
      }}
      onClick={handleClick}
      title={`Click to unstack ${isImage ? "image" : "note"}`}
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

  const childNotes = useMemo(
    () =>
      getConnectedChildNotes(parentWin.id, windows).filter(
        (w) => w.stacked && (!w.stackedParentId || w.stackedParentId === parentWin.id)
      ),
    [windows, parentWin.id]
  );

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
        const limit = (side === "TOP" || side === "BOTTOM") ? maxHoriz : maxVert;
        const visibleNotes = notes.slice(0, limit);

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
                  onUnstack={() => useWindows.getState().unstackNote(note.id)}
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
  const lineSvgRef = useRef<SVGSVGElement>(null);
  const arrowSvgRef = useRef<SVGSVGElement>(null);
  const elRefs = useRef<Map<string, [SVGPathElement, SVGPolygonElement]>>(new Map());

  const groups = useWindows((s) => s.groups);

  // Rebuild SVG elements when windows or groups change (add/remove)
  useEffect(() => {
    const lineSvg = lineSvgRef.current;
    const arrowSvg = arrowSvgRef.current;
    if (!lineSvg || !arrowSvg) return;

    const winIds = new Set(windows.map((w) => w.id));
    const groupIds = new Set(groups.map((g) => g.id));
    const allValidIds = new Set([...winIds, ...groupIds]);

    const links: { key: string; parentId: string; childId: string }[] = [];

    // Window children
    for (const child of windows) {
      const pSet = new Set<string>();
      if (child.parentIds) {
        for (const pid of child.parentIds) pSet.add(pid);
      }
      if (child.parentId) pSet.add(child.parentId);

      for (const pid of pSet) {
        if (allValidIds.has(pid)) {
          links.push({ key: `${pid}->${child.id}`, parentId: pid, childId: child.id });
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
        if (allValidIds.has(pid)) {
          links.push({ key: `${pid}->${childGroup.id}`, parentId: pid, childId: childGroup.id });
        }
      }
    }

    const neededKeys = new Set(links.map((l) => l.key));
    const existingKeys = new Set(elRefs.current.keys());

    for (const key of existingKeys) {
      if (!neededKeys.has(key)) {
        const els = elRefs.current.get(key);
        els?.[0].remove();
        els?.[1].remove();
        elRefs.current.delete(key);
      }
    }

    for (const link of links) {
      if (!elRefs.current.has(link.key)) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#a0a0a0');
        path.setAttribute('stroke-width', '3');

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('fill', '#a0a0a0');

        lineSvg.appendChild(path);
        arrowSvg.appendChild(poly);
        elRefs.current.set(link.key, [path, poly]);
      }
    }
  }, [windows, groups]);

  const cachedPosMapRef = useRef<Map<string, { x: number; y: number; w: number; h: number; zIndex: number }>>(new Map());

  // Imperative update — reads DOM positions directly, no React re-render
  const updatePaths = useCallback((onlyActiveId?: string | null) => {
    if (!lineSvgRef.current || elRefs.current.size === 0) return;
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

    const getEntityPos = (id: string) => {
      const win = byId.get(id);
      if (win) {
        if (win.stacked) {
          const rootWin = findRootWindow(win.id, windows);
          if (rootWin && rootWin.id !== win.id && !rootWin.stacked) {
            return posMap.get(rootWin.id);
          }
          return null;
        }
        return posMap.get(win.id);
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

    for (const [key, [path, poly]] of elRefs.current) {
      const parts = key.split("->");
      const parentId = parts[0];
      const childId = parts[1];

      const parentPos = getEntityPos(parentId);
      const childPos = getEntityPos(childId);
      if (!parentPos || !childPos) {
        path.style.display = 'none';
        poly.style.display = 'none';
        continue;
      }

      const pGrp = currentGroups.find((g) => g.memberIds.includes(parentId));
      const cGrp = currentGroups.find((g) => g.memberIds.includes(childId));
      if (pGrp && cGrp && pGrp.id === cGrp.id && pGrp.compressed) {
        path.style.display = 'none';
        poly.style.display = 'none';
        continue;
      }

      const px = parentPos.x, py = parentPos.y, pw = parentPos.w, ph = parentPos.h;
      const cx = childPos.x, cy = childPos.y, cw = childPos.w, ch = childPos.h;

      const a = computeArrow(px, py, pw, ph, cx, cy, cw, ch);

      const dist = Math.hypot(a.ex - a.sx, a.ey - a.sy);

      if (dist < 5) {
        path.style.display = 'none';
        poly.style.display = 'none';
        continue;
      }

      path.style.display = '';
      const childWin = byId.get(childId);
      if (childWin?.isExcerptNote) {
        path.setAttribute('d', `M${a.sx},${a.sy} C${a.c1x},${a.c1y} ${a.c2x},${a.c2y} ${a.ex},${a.ey}`);
        path.setAttribute('stroke-dasharray', '6 4');
        poly.style.display = 'none';
      } else {
        path.setAttribute('d', `M${a.sx},${a.sy} C${a.c1x},${a.c1y} ${a.c2x},${a.c2y} ${a.bcx},${a.bcy}`);
        path.removeAttribute('stroke-dasharray');
        poly.setAttribute('points', `${a.tipX},${a.tipY} ${a.b1x},${a.b1y} ${a.b2x},${a.b2y}`);
        poly.style.display = '';
      }

      const isAnimating =
        isNoteUnstacking(childId) ||
        isNoteUnstacking(parentId) ||
        isWindowStacking(parentId) ||
        isWindowStacking(childId);

      if (isAnimating) {
        path.style.opacity = "0";
        poly.style.opacity = "0";
        path.style.transition = "none";
        poly.style.transition = "none";
      } else {
        path.style.transition = "opacity 400ms ease-out";
        poly.style.transition = "opacity 400ms ease-out";
        path.style.opacity = "1";
        poly.style.opacity = "1";
      }
    }
  }, [windows]);

  useEffect(() => {
    return subscribeAnimation(() => updatePaths());
  }, [updatePaths]);

  // Initial render + store updates (deferred to ensure newly spawned window elements exist in DOM)
  useEffect(() => {
    updatePaths();
    const raf = requestAnimationFrame(() => updatePaths());
    const timer = setTimeout(() => updatePaths(), 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [windows, updatePaths]);

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

  return (
    <>
      <svg
        ref={lineSvgRef}
        className="connection-arrows"
        style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
      />
      <svg
        ref={arrowSvgRef}
        className="connection-arrows"
        style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
      />
    </>
  );
});

const LiveWireOverlay = memo(function LiveWireOverlay() {
  const pathRef = useRef<SVGPathElement>(null);
  const polyRef = useRef<SVGPolygonElement>(null);

  useEffect(() => {
    return subscribeWire((wire) => {
      const path = pathRef.current;
      const poly = polyRef.current;
      if (!path || !poly) return;

      if (!wire) {
        path.style.display = "none";
        poly.style.display = "none";
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

      if (dist < 12 || isStraightHoriz || isStraightVert) {
        path.setAttribute("d", `M${sx},${sy} L${bcx},${bcy}`);
      } else {
        const ctrlDist = Math.min(dist * 0.45, 150);
        const c1 = controlOffset(sourceSide, { x: sx, y: sy }, ctrlDist);
        const c2x = bcx - ctrlDist * 0.5 * Math.cos(angle);
        const c2y = bcy - ctrlDist * 0.5 * Math.sin(angle);

        path.setAttribute("d", `M${sx},${sy} C${c1.x},${c1.y} ${c2x},${c2y} ${bcx},${bcy}`);
      }

      path.style.display = "";
      poly.setAttribute("points", `${tipX},${tipY} ${b1x},${b1y} ${b2x},${b2y}`);
      poly.style.display = "";
    });
  }, []);

  return (
    <>
      <svg
        className="connection-arrows"
        style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 999999 }}
      >
        <path
          ref={pathRef}
          fill="none"
          stroke="#a0a0a0"
          strokeWidth="3"
          style={{ display: "none" }}
        />
      </svg>
      <svg
        className="connection-arrows"
        style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 999999 }}
      >
        <polygon
          ref={polyRef}
          fill="#a0a0a0"
          style={{ display: "none" }}
        />
      </svg>
    </>
  );
});

function Fps() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf: number;

    function loop(now: number) {
      frames++;
      if (now - last >= 1000) {
        if (ref.current) ref.current.textContent = `${frames} fps`;
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 10,
        left: 10,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 14,
        padding: "4px 8px",
        borderRadius: 4,
        pointerEvents: "none",
      }}
    />
  );
}


//for pdf maximize
//
//
//

const animatePdfMaximize = (
  el: HTMLElement,
  target: {
    left: number
    top: number
    width: number
    height: number
  },
  duration = 360,
  onDone?: () => void
) => {
  const firstLeft = parseFloat(el.style.left) || 0
  const firstTop = parseFloat(el.style.top) || 0
  const firstW = parseFloat(el.style.width) || target.width
  const firstH = parseFloat(el.style.height) || target.height

  // Proportional center-to-center uniform zoom (no aspect stretching)
  const firstCenterX = firstLeft + firstW / 2
  const firstCenterY = firstTop + firstH / 2
  const targetCenterX = target.left + target.width / 2
  const targetCenterY = target.top + target.height / 2

  const translateX = firstCenterX - targetCenterX
  const translateY = firstCenterY - targetCenterY
  const scale = target.width > 0 ? firstW / target.width : 1

  // Apply target layout position to DOM once
  el.style.left = `${target.left}px`
  el.style.top = `${target.top}px`
  el.style.width = `${target.width}px`
  el.style.height = `${target.height}px`

  // Animate smooth uniform GPU scale + translate from center
  const animation = el.animate(
    [
      {
        transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
        transformOrigin: "center center",
      },
      {
        transform: "translate3d(0px, 0px, 0) scale(1)",
        transformOrigin: "center center",
      },
    ],
    {
      duration,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    }
  )

  animation.onfinish = () => {
    el.style.transform = ""
    onDone?.()
  }
}




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
  const parentGroup = groups.find((g) => g.memberIds.includes(w.id))
  const isCompressedGroupMember = !!parentGroup?.compressed

  const connectedCompressedGroup = useMemo(() => {
    if (isCompressedGroupMember) return null;
    const pIds = w.parentIds ?? (w.parentId ? [w.parentId] : []);
    if (pIds.length === 0) return null;
    return groups.find((g) => g.compressed && (pIds.includes(g.id) || g.memberIds.some((mId) => pIds.includes(mId))));
  }, [groups, isCompressedGroupMember, w.parentId, w.parentIds]);

  const zIndexStyle = useMemo(
    () => {
      let effZ = w.pdfMaximized ? 100000 : (w.alwaysOnTop ? 50000 + (w.zIndex ?? 0) : (w.zIndex ?? 0));
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
    [w.zIndex, w.pdfMaximized, w.alwaysOnTop, isCompressedGroupMember, connectedCompressedGroup, windows],
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
        width: 260,
        height: 200,
        side,
      });
    },
    [w.id, w.title, addWindow],
  );

  const pdfRef = useRef<HTMLDivElement | null>(null)

  const prevPdfMaximizedRef = useRef(!!w.pdfMaximized)

useEffect(() => {
  const el = pdfRef.current

  if (!el || w.contentType !== "pdf") return

  const wasMaximized = prevPdfMaximizedRef.current
  const isMaximized = !!w.pdfMaximized

  prevPdfMaximizedRef.current = isMaximized

  const cam = getCamera()

  const normalBounds = {
    left: w.x ?? 80,
    top: w.y ?? 80,
    width: w.width ?? 620,
    height: w.height ?? 908,
  }

  const maximizedBounds = {
    left: -cam.panX / cam.zoom,
    top: -cam.panY / cam.zoom,
    width: window.innerWidth / cam.zoom,
    height: window.innerHeight / cam.zoom,
  }

  // MAXIMIZE / RESTORE
  if (wasMaximized !== isMaximized) {
    useWindows.getState().updateWindow(w.id, { pdfAnimating: true })
    animatePdfMaximize(
      el,
      isMaximized ? maximizedBounds : normalBounds,
      300,
      () => useWindows.getState().updateWindow(w.id, { pdfAnimating: false })
    )
  } else if (!isMaximized) {
    // Normal window movement/resizing should NOT animate.
    el.style.left = `${normalBounds.left}px`
    el.style.top = `${normalBounds.top}px`
    el.style.width = `${normalBounds.width}px`
    el.style.height = `${normalBounds.height}px`
  }

  // While maximized, keep it covering the viewport.
  if (isMaximized) {
    const handleResize = () => {
      const cam = getCamera()

      el.style.left = `${-cam.panX / cam.zoom}px`
      el.style.top = `${-cam.panY / cam.zoom}px`
      el.style.width = `${window.innerWidth / cam.zoom}px`
      el.style.height = `${window.innerHeight / cam.zoom}px`
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }
}, [
  w.id,
  w.pdfMaximized,
  w.contentType,
  w.x,
  w.y,
  w.width,
  w.height,
])

  const prevStackedRef = useRef(w.stacked);

  useEffect(() => {
    const wasStacked = prevStackedRef.current;
    prevStackedRef.current = !!w.stacked;

    if (wasStacked && !w.stacked && w.contentType === "sticky") {
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
          const index = Math.max(0, sideNotes.findIndex((win) => win.id === w.id));
          const total = sideNotes.length || 1;
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

  if (w.stacked) return null;

  if (w.contentType === "sticky") {
    const isExcerpt = w.isExcerptNote;
    const itemW = isCompressedGroupMember ? (isExcerpt ? 110 : 150) : (w.width ?? 260);
    const itemH = isCompressedGroupMember ? (isExcerpt ? 48 : 95) : (w.height ?? (isExcerpt ? 64 : 200));

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
          className={`window sticky-window ${isExcerpt ? "excerpt-note-window" : ""} ${w.active ? "active" : "inactive"} ${isCompressedGroupMember ? "is-compressed" : ""} w-full h-full relative`}
          style={{
            ...(isExcerpt
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
          }
        }}
        id={`win-${w.id}`}
        className={`window pdf-window ${
          w.pdfMaximized ? "maximized" : ""
        } ${
          w.pdfMaximized && !w.pdfAnimating ? "maximized-done" : ""
        } ${w.active ? "active" : "inactive"} ${isCompressedGroupMember ? "is-compressed" : ""} ${w.pdfAnimating ? "no-transition" : ""}`}
        style={zIndexStyle}
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
        {!isCompressedGroupMember && <StackedNoteStubs parentWin={w} />}
        <div className="pdf-window-animation-layer">
          <PdfViewer win={w} onAddSticky={handleAddSticky} />
        </div>
        {!w.pdfMaximized && !isCompressedGroupMember && (
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

  if (w.directImageUrl || w.title.startsWith("File:")) {
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
  const spawnWindows = useWindows((s) => s.spawnWindows)
  const addWindow = useWindows((s) => s.addWindow)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleOpenPdf = useCallback(() => {
    const name = window.prompt("PDF path (e.g. /myfile.pdf):", "/viewer.pdf")
    if (!name) return
    addWindow({
      contentType: "pdf",
      pdfUrl: name,
      title: name.replace(/^\/|\.pdf$/gi, ""),
      pdfCurrentPage: 1,
      width: 620,
      height: 945,
    })
  }, [addWindow])

  const handlePdfFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const url = URL.createObjectURL(file)
      addWindow({
        contentType: "pdf",
        pdfUrl: url,
        title: file.name.replace(/\.pdf$/i, ""),
        pdfCurrentPage: 1,
      })

      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [addWindow],
  )

  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeState>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") {
        setIsShiftPressed(true);
      } else if (e.key === "Escape") {
        useWindows.getState().clearSelection();
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
      const isWinClick = Boolean(target?.closest(".window"));
      const isSearchClick = Boolean(target?.closest(".search-box"));
      const isMenuClick = Boolean(target?.closest(".group-context-menu"));
      const isGroupClick = Boolean(target?.closest("[id^='group-box-']"));

      if (isMenuClick || isGroupClick) return;

      if (!isWinClick && !isSearchClick) {
        window.getSelection()?.removeAllRanges();
        document.getSelection()?.removeAllRanges();
      }

      if (useWindows.getState().windows.some((win) => win.pdfMaximized)) return;

      const currentShift = e.shiftKey || isShiftPressed;

      if (currentShift) {
        if (isWinClick || isSearchClick) return;

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
        startCanvasPan(e, viewport);
      }
    }
    function onWheel(e: WheelEvent) {
      if (useWindows.getState().windows.some((win) => win.pdfMaximized)) return;
      if (e.ctrlKey) {
        handleZoom(e);
      }
    }

    viewport.addEventListener("mousedown", onPanMouseDown);
    viewport.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      unsub();
      viewport.removeEventListener("mousedown", onPanMouseDown);
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [isShiftPressed]);

  async function spawnWithRealTitles() {
    try {
      const res = await fetch(
        'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=100&format=json&origin=*',
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const titles = data.query.random.map((r: { title: string }) => r.title)
      spawnWindows(100, 0, titles)
    } catch (e) {
      console.error('Failed to fetch random articles, spawning with fallback titles:', e)
      spawnWindows(100, 0)
    }
  }

  return (
    <>
      <Fps />
      <SearchBox />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handlePdfFileChange}
        style={{ display: "none" }}
      />
      <button
        onClick={handleOpenPdf}
        style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999 }}
      >
        Open PDF
      </button>
      <button
        onClick={spawnWithRealTitles}
        style={{ position: 'fixed', top: 40, right: 10, zIndex: 9999 }}
      >
        Spawn 100 Windows
      </button>
      <button
        onClick={async () => {
          try {
            const res = await fetch(
              'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=50&format=json&origin=*',
            )
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            const titles = data.query.random.map((r: { title: string }) => r.title)
            spawnWindows(50, 0, titles)
          } catch (e) {
            console.error('Failed to fetch random articles, spawning with fallback titles:', e)
            spawnWindows(50, 0)
          }
        }}
        style={{ position: 'fixed', top: 70, right: 10, zIndex: 9999 }}
      >
        Spawn 50 Windows
      </button>
      <button
        onClick={async () => {
          try {
            const res = await fetch(
              'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=75&format=json&origin=*',
            )
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            const titles = data.query.random.map((r: { title: string }) => r.title)
            spawnWindows(75, 0, titles)
          } catch (e) {
            console.error('Failed to fetch random articles, spawning with fallback titles:', e)
            spawnWindows(75, 0)
          }
        }}
        style={{ position: 'fixed', top: 100, right: 10, zIndex: 9999 }}
      >
        Spawn 75 Windows
      </button>

      <div ref={viewportRef} className="canvas-viewport" style={{ cursor: isShiftPressed ? "crosshair" : undefined }}>
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
