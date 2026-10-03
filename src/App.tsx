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

function readWindowPos(el: HTMLElement): { x: number; y: number; w: number; h: number; zIndex: number } {
  const x = parseFloat(el.style.left) || 0;
  const y = parseFloat(el.style.top) || 0;
  const w = el.offsetWidth || parseFloat(el.style.width) || 750;
  let h = el.offsetHeight || parseFloat(el.style.height) || 550;
  const zIndex = parseInt(el.style.zIndex, 10) || 0;

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
        const t = el.style.transform;
        let tx = 0, ty = 0;
        if (t) {
          const mx = t.match(/translate3d\(([-\d.]+)px/);
          const my = t.match(/translate3d\([-\d.]+px,\s*([-\d.]+)px/);
          if (mx) tx = parseFloat(mx[1]) || 0;
          if (my) ty = parseFloat(my[1]) || 0;
        }
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

  const t = el.style.transform;
  let tx = 0, ty = 0;
  if (t) {
    const mx = t.match(/translate3d\(([-\d.]+)px/);
    const my = t.match(/translate3d\([-\d.]+px,\s*([-\d.]+)px/);
    if (mx) tx = parseFloat(mx[1]) || 0;
    if (my) ty = parseFloat(my[1]) || 0;
  }
  return { x: x + tx, y: y + ty, w, h, zIndex };
}

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

    // Incremental update: during live drag, only update the active moving window in posMap
    if (onlyActiveId) {
      const el = document.getElementById(`win-${onlyActiveId}`);
      if (el) {
        posMap.set(onlyActiveId, readWindowPos(el));
      }
    } else {
      // Full refresh
      posMap.clear();
      for (const w of windows) {
        const el = document.getElementById(`win-${w.id}`);
        if (el) {
          posMap.set(w.id, readWindowPos(el));
        } else {
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

      const parentPos = posMap.get(parent.id);
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
      path.style.display = '';
    }
  }, [windows]);

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
      const win = (e.target as HTMLElement)?.closest?.('.window');
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


  if (w.contentType === "sticky") {
    const isExcerpt = w.isExcerptNote;
    return (
      <div
        id={`win-${w.id}`}
        className={`window sticky-window ${isExcerpt ? "excerpt-note-window" : ""} ${w.active ? "active" : "inactive"}`}
        style={{
          ...zIndexStyle,
          left: `${w.x ?? 80}px`,
          top: `${w.y ?? 80}px`,
          width: `${w.width ?? 260}px`,
          height: `${w.height ?? (isExcerpt ? 64 : 200)}px`,
          ...(isExcerpt
            ? {
                borderRadius: "22px",
                background: "#f0e5d8",
                border: "1px solid #e4d5c3",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
              }
            : {}),
        }}
        onMouseDown={(e) => {
          handleActivate();
          Resize(e, (rect) => handlePositionChange(rect));
        }}
      >
        <StickyNote
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
  onMouseDown={(e) => {
    handleActivate()
    if (w.pdfMaximized) return

    Resize(e, (rect) => handlePositionChange(rect))
  }}
>
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
        onMouseDown={(e) => {
          handleActivate();
          Resize(e, (rect) => handlePositionChange(rect));
        }}
      >
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
      titleBarContent={w.title}
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
    </Window>
  )
})

function App() {
  const windows = useWindows((s) => s.windows)
  const spawnWindows = useWindows((s) => s.spawnWindows)
  const addWindow = useWindows((s) => s.addWindow)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, windowId: string) => {
    e.preventDefault();
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
