/* eslint-disable react-hooks/immutability */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Window from './components/window'
import LinkEditor from './components/linkEditor'
import SearchBox from './components/searchBox'
import ArticleView from './components/articleView'
import PdfViewer from './components/pdfViewer'
import ImageViewer from './components/imageViewer'
import StickyNote from './components/stickyNote'
import WindowContextMenu, { type ContextMenuPosition } from './components/windowContextMenu'
import { useWindows, type WindowData, nextCascadeOffset } from './store/windows'
import { deleteScroll } from './utils/scrollMemory'
import { evictClosedWindowArticles } from './utils/articleCache'
import { getCamera, subscribeCamera } from './utils/camera'
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
    };
  }

  if (side === "LEFT") {
    return {
      left: `calc(-22px)`,
      top: `calc(50% + ${spreadY - h / 2}px)`,
      zIndex,
    };
  }

  if (side === "TOP") {
    return {
      top: `calc(-${peek}px)`,
      left: `calc(50% + ${spreadX - w / 2}px)`,
      zIndex,
    };
  }

  // BOTTOM
  return {
    top: `calc(100% - ${h - (isCenter ? 26 : 22)}px)`,
    left: `calc(50% + ${spreadX - w / 2}px)`,
    zIndex,
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

const StackedNoteStubs = memo(function StackedNoteStubs({
  parentWin,
}: {
  parentWin: WindowData;
}) {
  const windows = useWindows((s) => s.windows);

  const childNotes = useMemo(
    () =>
      windows.filter(
        (w) =>
          (w.parentId === parentWin.id || w.parentIds?.includes(parentWin.id)) &&
          w.contentType === "sticky" &&
          w.stacked
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
              const colorBg = getNoteColor(note);

              return (
                <div
                  key={note.id}
                  className="absolute pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-[1.02] rounded-[4px] border border-black/20 shadow-md"
                  style={{
                    width: `${stubW}px`,
                    height: `${stubH}px`,
                    background: colorBg,
                    ...posStyle,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    useWindows.getState().unstackNote(note.id);
                  }}
                  title={`Click to unstack note`}
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

  // Rebuild SVG elements when windows change (add/remove)
  useEffect(() => {
    const lineSvg = lineSvgRef.current;
    const arrowSvg = arrowSvgRef.current;
    if (!lineSvg || !arrowSvg) return;

    const winIds = new Set(windows.map((w) => w.id));
    const links: { key: string; parentId: string; childId: string }[] = [];

    for (const child of windows) {
      const pSet = new Set<string>();
      if (child.parentIds) {
        for (const pid of child.parentIds) pSet.add(pid);
      }
      if (child.parentId) pSet.add(child.parentId);

      for (const pid of pSet) {
        if (winIds.has(pid)) {
          links.push({ key: `${pid}->${child.id}`, parentId: pid, childId: child.id });
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
  }, [windows]);

  const cachedPosMapRef = useRef<Map<string, { x: number; y: number; w: number; h: number; zIndex: number }>>(new Map());

  // Imperative update — reads DOM positions directly, no React re-render
  const updatePaths = useCallback((onlyActiveId?: string | null) => {
    if (!lineSvgRef.current || elRefs.current.size === 0) return;
    const byId = new Map(windows.map((w) => [w.id, w]));

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

    for (const [key, [path, poly]] of elRefs.current) {
      const parts = key.split("->");
      const parent = byId.get(parts[0]);
      const child = byId.get(parts[1]);
      if (!parent || !child) continue;

      if (child.stacked) {
        path.style.display = 'none';
        poly.style.display = 'none';
        continue;
      }

      let activeParent = parent;
      while (activeParent && activeParent.stacked) {
        const nextPid = activeParent.parentId ?? activeParent.parentIds?.[0];
        if (!nextPid) break;
        const nextParent = byId.get(nextPid);
        if (!nextParent) break;
        activeParent = nextParent;
      }

      if (activeParent.stacked) {
        path.style.display = 'none';
        poly.style.display = 'none';
        continue;
      }

      const parentPos = posMap.get(activeParent.id);
      const childPos = posMap.get(child.id);
      if (!parentPos || !childPos) continue;

      const px = parentPos.x, py = parentPos.y, pw = parentPos.w, ph = parentPos.h;
      const cx = childPos.x, cy = childPos.y, cw = childPos.w, ch = childPos.h;

      const a = computeArrow(px, py, pw, ph, cx, cy, cw, ch);

      const tailHidden = a.sx >= cx - 2 && a.sx <= cx + cw + 2 && a.sy >= cy - 2 && a.sy <= cy + ch + 2;
      const headHidden = a.ex >= px - 2 && a.ex <= px + pw + 2 && a.ey >= py - 2 && a.ey <= py + ph + 2;
      const dist = Math.hypot(a.ex - a.sx, a.ey - a.sy);
      const windowsOverlap = px < cx + cw && px + pw > cx && py < cy + ch && py + ph > cy;

      if (tailHidden || headHidden || (windowsOverlap && dist < 30)) {
        path.style.display = 'none';
        poly.style.display = 'none';
        continue;
      }

      if (child.isExcerptNote) {
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
        isNoteUnstacking(child.id) ||
        isNoteUnstacking(parent.id) ||
        isNoteUnstacking(activeParent.id) ||
        isWindowStacking(parent.id) ||
        isWindowStacking(activeParent.id) ||
        isWindowStacking(child.id);

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

      path.style.display = '';
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
        style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1000 }}
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
        style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1000 }}
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
      windows.filter(
        (w) =>
          (w.parentId === parentWin.id || w.parentIds?.includes(parentWin.id)) &&
          w.contentType === "sticky" &&
          w.stacked
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

  const zIndexStyle = useMemo(
    () => ({ zIndex: w.pdfMaximized ? 100000 : (w.alwaysOnTop ? 50000 + (w.zIndex ?? 0) : w.zIndex) }),
    [w.zIndex, w.pdfMaximized, w.alwaysOnTop],
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
      const parentId = w.parentId ?? w.parentIds?.[0];
      const parentEl = parentId ? document.getElementById(`win-${parentId}`) : null;

      if (el && parentEl) {
        const parentWin = useWindows.getState().windows.find((win) => win.id === parentId);
        const noteRect = el.getBoundingClientRect();
        const parentRect = parentEl.getBoundingClientRect();

        let fromX = (parentRect.left + parentRect.width / 2) - (noteRect.left + noteRect.width / 2);
        let fromY = (parentRect.top + parentRect.height / 2) - (noteRect.top + noteRect.height / 2);

        if (parentWin && parentId) {
          const allChildNotes = useWindows.getState().windows.filter(
            (win) =>
              (win.parentId === parentId || win.parentIds?.includes(parentId)) &&
              win.contentType === "sticky"
          );
          const side = determineNoteSide(w, parentWin);
          const sideNotes = allChildNotes.filter((win) => determineNoteSide(win, parentWin) === side);
          const index = Math.max(0, sideNotes.findIndex((win) => win.id === w.id));
          const total = sideNotes.length || 1;
          const { stubW, stubH } = getStubDimensions(w);

          const offset = getStubTargetOffset(side, index, total, stubW, stubH, parentRect, noteRect);
          fromX = offset.toX;
          fromY = offset.toY;

          const parentZ = parentWin.zIndex ?? 1;
          el.style.zIndex = `${parentZ - 1}`;
        }

        markNoteUnstacking(w.id);

        const { stubW, stubH } = getStubDimensions(w);
        const scaleX = stubW / Math.max(noteRect.width, 1);
        const scaleY = stubH / Math.max(noteRect.height, 1);

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
  }, [w.stacked, w.id, w.contentType, w.parentId, w.parentIds]);

  if (w.stacked) return null;

  if (w.contentType === "sticky") {
    const isExcerpt = w.isExcerptNote;
    return (
      <div
        id={`win-${w.id}`}
        className="window-wrapper absolute"
        style={{
          ...zIndexStyle,
          left: `${w.x ?? 80}px`,
          top: `${w.y ?? 80}px`,
          width: `${w.width ?? 260}px`,
          height: `${w.height ?? (isExcerpt ? 64 : 200)}px`,
        }}
        onMouseDown={(e) => {
          handleActivate();
          const rect = e.currentTarget.getBoundingClientRect();
          if (e.clientX >= rect.right - 32 && e.clientY >= rect.bottom - 32) {
            Resize(e, (pos) => handlePositionChange(pos), handleActivate);
          }
        }}
      >
        <StackedNoteStubs parentWin={w} />
        <div
          className={`window sticky-window ${isExcerpt ? "excerpt-note-window" : ""} ${w.active ? "active" : "inactive"} w-full h-full relative`}
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
        </div>
      </div>
    );
  }

  if (w.contentType === "pdf") {
    return (
        <div
  ref={(el) => {
    pdfRef.current = el

    if (el && !el.dataset.pos) {
      el.dataset.pos = "1"

      const offset =
        w.x === undefined || w.y === undefined
          ? nextCascadeOffset()
          : 0

      const left = w.x !== undefined ? w.x : 80 + offset
      const top = w.y !== undefined ? w.y : 80 + offset

      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.width = `${w.width ?? 620}px`
      el.style.height = `${w.height ?? 945}px`
    }
  }}
  id={`win-${w.id}`}
  className={`window pdf-window ${
    w.pdfMaximized ? "maximized" : ""
  } ${
    w.pdfMaximized && !w.pdfAnimating ? "maximized-done" : ""
  } ${w.active ? "active" : "inactive"} ${w.pdfAnimating ? "no-transition" : ""}`}
  style={zIndexStyle}
  onContextMenu={(e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, w.id);
  }}
  onMouseDown={(e) => {
    handleActivate()
    if (w.pdfMaximized) return

    Resize(e, (rect) => handlePositionChange(rect))
  }}
>
  <StackedNoteStubs parentWin={w} />
  <div className="pdf-window-animation-layer">
    <PdfViewer win={w} onAddSticky={handleAddSticky} />
  </div>
      {!w.pdfMaximized && (
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
    )
  }

  if (w.directImageUrl || w.title.startsWith("File:")) {
    return (
      <div
        id={`win-${w.id}`}
        className={`window image-window ${w.active ? "active" : "inactive"}`}
        style={{
          ...zIndexStyle,
          left: `${w.x ?? 80}px`,
          top: `${w.y ?? 80}px`,
          width: `${w.width ?? 250}px`,
          height: `${w.height ?? 190}px`,
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e, w.id);
        }}
        onMouseDown={(e) => {
          handleActivate();
          Resize(e, (rect) => handlePositionChange(rect));
        }}
      >
        <StackedNoteStubs parentWin={w} />
        <ImageViewer
          win={w}
          onClose={handleClose}
          onActivate={handleActivate}
          onPositionChange={handlePositionChange}
        />
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
      </div>
    )
  }

  return (
    <Window
      id={`win-${w.id}`}
      className={w.active ? 'active' : 'inactive'}
      style={zIndexStyle}
      stubs={<StackedNoteStubs parentWin={w} />}
      titleBarContent={<span>{w.title}</span>}
      x={w.x}
      y={w.y}
      width={w.width}
      height={w.height}
      onActivate={handleActivate}
      onClose={handleClose}
      onPositionChange={handlePositionChange}
      onAddSticky={handleAddSticky}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, w.id);
      }}
    >
      {w.url ? <ArticleView win={w} /> : <LinkEditor win={w} />}
      <StackedNotesDrawer parentWin={w} />
    </Window>
  )
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
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".window") && !target?.closest(".search-box")) {
        window.getSelection()?.removeAllRanges();
        document.getSelection()?.removeAllRanges();
      }
      if (useWindows.getState().windows.some((win) => win.pdfMaximized)) return;
      startCanvasPan(e, viewport);
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
  }, []);

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

      <div ref={viewportRef} className="canvas-viewport">
        <div ref={gridRef} className="canvas-grid" />
        <div ref={worldRef} className="canvas-world">
          <ConnectionArrows windows={windows} />
          <LiveWireOverlay />
          {windows.map((w) => (
            <WindowItem key={w.id} w={w} onContextMenu={handleContextMenu} />
          ))}
        </div>
      </div>

      <WindowContextMenu pos={contextMenuPos} onClose={() => setContextMenuPos(null)} />
    </>
  )
}

export default App
