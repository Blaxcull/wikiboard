/* eslint-disable react-hooks/immutability */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import Window from './components/window'
import LinkEditor from './components/linkEditor'
import SearchBox from './components/searchBox'
import ArticleView from './components/articleView'
import PdfViewer from './components/pdfViewer'
import { useWindows, type WindowData, nextCascadeOffset } from './store/windows'
import { deleteScroll } from './utils/scrollMemory'
import { evictClosedWindowArticles } from './utils/articleCache'
import { getCamera, subscribeCamera } from './utils/camera'
import { startCanvasPan } from './utils/canvas/pan'
import { handleZoom } from './utils/canvas/zoom'
import { isDraggingWindow, activeDraggedWindowId } from './utils/window/drag'
import { isResizingWindow, activeResizingWindowId } from './utils/window/resize'

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

const PAIRS: [Side, Side][] = [
  ['RIGHT', 'LEFT'], ['LEFT', 'RIGHT'],
  ['BOTTOM', 'TOP'], ['TOP', 'BOTTOM'],
  ['TOP', 'LEFT'], ['TOP', 'RIGHT'],
  ['BOTTOM', 'LEFT'], ['BOTTOM', 'RIGHT'],
];

function computeArrow(
  px: number, py: number, pw: number, ph: number,
  cx: number, cy: number, cw: number, ch: number,
): ArrowResult {
  const ncx = cx + cw / 2;
  const ncy = cy + ch / 2;
  const dx = ncx - (px + pw / 2);
  const dy = ncy - (py + ph / 2);

  let bestCost = Infinity;
  let bestExit = { x: 0, y: 0 };
  let bestEntry = { x: 0, y: 0 };
  let bestParentSide: Side = 'RIGHT';
  let bestChildSide: Side = 'LEFT';

  for (const [ps, cs] of PAIRS) {
    const exit = sidePoint(ps, px, py, pw, ph);
    const entry = sidePoint(cs, cx, cy, cw, ch);
    const dist = Math.hypot(entry.x - exit.x, entry.y - exit.y);
    const dot = (entry.x - exit.x) * dx + (entry.y - exit.y) * dy;
    const cost = dist + (dot < 0 ? 2000 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      bestExit = exit;
      bestEntry = entry;
      bestParentSide = ps;
      bestChildSide = cs;
    }
  }

  const sx = bestExit.x;
  const sy = bestExit.y;
  const ex = bestEntry.x;
  const ey = bestEntry.y;

  const ctrlDist = Math.hypot(ex - sx, ey - sy) * ARROW_CTRL;
  const c1 = controlOffset(bestParentSide, bestExit, ctrlDist);
  const c2 = controlOffset(bestChildSide, bestEntry, ctrlDist);

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

  return { sx, sy, c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, ex, ey, tipX, tipY, bcx, bcy, b1x, b1y, b2x, b2y, childSide: bestChildSide };
}

function pointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function readWindowPos(el: HTMLElement): { x: number; y: number; w: number; h: number; zIndex: number } {
  const x = parseFloat(el.style.left) || 0;
  const y = parseFloat(el.style.top) || 0;
  const w = parseFloat(el.style.width) || 540;
  const h = parseFloat(el.style.height) || 550;
  const zIndex = parseInt(el.style.zIndex, 10) || 0;
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

    const parentIds = new Set(windows.map((w) => w.id));
    const children = windows.filter((w) => w.parentId && parentIds.has(w.parentId));
    const existing = new Set(elRefs.current.keys());
    const needed = new Set(children.map((w) => w.id));

    for (const id of existing) {
      if (!needed.has(id)) {
        const els = elRefs.current.get(id);
        els?.[0].remove();
        els?.[1].remove();
        elRefs.current.delete(id);
      }
    }

    for (const w of children) {
      if (!elRefs.current.has(w.id)) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#a0a0a0');
        path.setAttribute('stroke-width', '3');

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('fill', '#a0a0a0');

        lineSvg.appendChild(path);
        arrowSvg.appendChild(poly);
        elRefs.current.set(w.id, [path, poly]);
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
            w: w.width ?? 540,
            h: w.height ?? 550,
            zIndex: w.zIndex ?? 0,
          });
        }
      }
    }

    for (const [id, [path, poly]] of elRefs.current) {
      const child = byId.get(id);
      if (!child || !child.parentId) continue;
      const parent = byId.get(child.parentId);
      if (!parent) continue;

      // During active gesture, skip lines not connected to the moving window
      if (onlyActiveId && child.id !== onlyActiveId && parent.id !== onlyActiveId) {
        continue;
      }

      const parentPos = posMap.get(parent.id);
      const childPos = posMap.get(child.id);
      if (!parentPos || !childPos) continue;

      const px = parentPos.x, py = parentPos.y, pw = parentPos.w, ph = parentPos.h;
      const cx = childPos.x, cy = childPos.y, cw = childPos.w, ch = childPos.h;

      const a = computeArrow(px, py, pw, ph, cx, cy, cw, ch);

      path.setAttribute('d', `M${a.sx},${a.sy} C${a.c1x},${a.c1y} ${a.c2x},${a.c2y} ${a.bcx},${a.bcy}`);
      poly.setAttribute('points', `${a.tipX},${a.tipY} ${a.b1x},${a.b1y} ${a.b2x},${a.b2y}`);

      const entryCoveredByParent = (
        a.ex >= px && a.ex <= px + pw &&
        a.ey >= py && a.ey <= py + ph
      );
      const exitCoveredByChild = (
        a.sx >= cx && a.sx <= cx + cw &&
        a.sy >= cy && a.sy <= cy + ch
      );
      if (entryCoveredByParent || exitCoveredByChild) {
        path.style.display = 'none';
        poly.style.display = 'none';
        continue;
      }

      let arrowheadHidden = false;
      for (const w of windows) {
        if (w.id === child.id || w.id === parent.id) continue;
        const wPos = posMap.get(w.id);
        if (!wPos) continue;

        if (wPos.zIndex > childPos.zIndex) {
          if (
            pointInRect(a.tipX, a.tipY, wPos) ||
            pointInRect(a.bcx, a.bcy, wPos) ||
            pointInRect(a.b1x, a.b1y, wPos) ||
            pointInRect(a.b2x, a.b2y, wPos)
          ) {
            arrowheadHidden = true;
            break;
          }
        }
      }
      path.style.display = '';
      poly.style.display = arrowheadHidden ? 'none' : '';
    }
  }, [windows]);

  // Initial render + store updates
  useEffect(() => {
    updatePaths();
  }, [updatePaths]);

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
        style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 9999 }}
      />
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
  duration = 300,
  onDone?: () => void
) => {
  const first = el.getBoundingClientRect()
  const firstLeft = parseFloat(el.style.left) || first.left
  const firstTop = parseFloat(el.style.top) || first.top
  const firstW = parseFloat(el.style.width) || first.width
  const firstH = parseFloat(el.style.height) || first.height

  const animation = el.animate(
    [
      {
        left: `${firstLeft}px`,
        top: `${firstTop}px`,
        width: `${firstW}px`,
        height: `${firstH}px`,
      },
      {
        left: `${target.left}px`,
        top: `${target.top}px`,
        width: `${target.width}px`,
        height: `${target.height}px`,
      },
    ],
    {
      duration,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    }
  )

  animation.onfinish = () => {
    el.style.left = `${target.left}px`
    el.style.top = `${target.top}px`
    el.style.width = `${target.width}px`
    el.style.height = `${target.height}px`
    onDone?.()
  }
}




const WindowItem = memo(function WindowItem({ w }: { w: WindowData }) {
  const setActive = useWindows((s) => s.setActive)
  const updateWindow = useWindows((s) => s.updateWindow)
  const removeWindow = useWindows((s) => s.removeWindow)

  const zIndexStyle = useMemo(
    () => ({ zIndex: w.pdfMaximized ? 10000 : w.zIndex }),
    [w.zIndex, w.pdfMaximized],
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
      el.style.height = `${w.height ?? 908}px`
    }
  }}
  id={`win-${w.id}`}
  className={`window pdf-window ${
    w.pdfMaximized ? "maximized" : ""
  } ${
    w.pdfMaximized && !w.pdfAnimating ? "maximized-done" : ""
  } ${w.active ? "active" : "inactive"} ${w.pdfAnimating ? "no-transition" : ""}`}
  style={zIndexStyle}
  onMouseDown={() => {
    handleActivate()
  }}
  >
  <div className="pdf-window-animation-layer">
    <PdfViewer win={w} />
  </div>
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

  const handleOpenPdf = useCallback(() => {
    const name = window.prompt("PDF path (e.g. /myfile.pdf):", "/viewer.pdf")
    if (!name) return
    addWindow({
      contentType: "pdf",
      pdfUrl: name,
      title: name.replace(/^\/|\.pdf$/gi, ""),
      pdfCurrentPage: 1,
      width: 620,
      height: 908,
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
          {windows.map((w) => (
            <WindowItem key={w.id} w={w} />
          ))}
        </div>
      </div>
    </>
  )
}

export default App
