import { getCamera } from "../camera";
import { useWindows } from "../../store/windows";

export type Side = "RIGHT" | "LEFT" | "TOP" | "BOTTOM";

export let isDraggingWire = false;
export let activeWireSourceId: string | null = null;
export let activeWireTargetId: string | null = null;

export type LiveWireData = {
  sx: number;
  sy: number;
  mx: number;
  my: number;
  sourceSide: Side;
  sourceId: string;
  targetId: string | null;
};

type Listener = (data: LiveWireData | null) => void;
let wireListeners: Listener[] = [];

export function subscribeWire(fn: Listener) {
  wireListeners.push(fn);
  return () => {
    wireListeners = wireListeners.filter((l) => l !== fn);
  };
}

function notifyWire(data: LiveWireData | null) {
  for (const fn of wireListeners) fn(data);
}

function sidePoint(side: Side, x: number, y: number, w: number, h: number): { x: number; y: number } {
  switch (side) {
    case "RIGHT":  return { x: x + w, y: y + h / 2 };
    case "LEFT":   return { x, y: y + h / 2 };
    case "TOP":    return { x: x + w / 2, y };
    case "BOTTOM": return { x: x + w / 2, y: y + h };
  }
}

export function connectWithoutCycles(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;

  const windows = useWindows.getState().windows;
  const targetWin = windows.find((w) => w.id === targetId);
  if (!targetWin) return;

  const getParents = (w: { parentId?: string; parentIds?: string[] }): string[] => {
    const set = new Set<string>();
    if (w.parentIds) for (const p of w.parentIds) set.add(p);
    if (w.parentId) set.add(w.parentId);
    return Array.from(set);
  };

  const targetParents = getParents(targetWin);
  if (targetParents.includes(sourceId)) {
    return;
  }

  function isAncestor(currentId: string, searchId: string, visited = new Set<string>()): boolean {
    if (currentId === searchId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const win = windows.find((w) => w.id === currentId);
    if (!win) return false;

    const parents = getParents(win);
    for (const pId of parents) {
      if (isAncestor(pId, searchId, visited)) return true;
    }
    return false;
  }

  const createsCycle = isAncestor(sourceId, targetId);

  let updatedWindows = [...windows];

  if (createsCycle) {
    updatedWindows = updatedWindows.map((w) => {
      const pSet = new Set(getParents(w));
      let modified = false;

      if (w.id === sourceId && pSet.has(targetId)) {
        pSet.delete(targetId);
        modified = true;
      }
      if (w.id === targetId && pSet.has(sourceId)) {
        pSet.delete(sourceId);
        modified = true;
      }

      if (!modified) return w;
      const newPList = Array.from(pSet);
      return {
        ...w,
        parentIds: newPList,
        parentId: newPList[0],
      };
    });
  }

  updatedWindows = updatedWindows.map((w) => {
    if (w.id === targetId) {
      const pSet = new Set(getParents(w));
      pSet.add(sourceId);
      pSet.delete(targetId);
      const newPList = Array.from(pSet);
      return {
        ...w,
        parentIds: newPList,
        parentId: newPList[0],
      };
    }
    return w;
  });

  useWindows.setState({ windows: updatedWindows });
}

export function isAlreadyConnected(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return true;
  const windows = useWindows.getState().windows;
  const targetWin = windows.find((w) => w.id === targetId);
  const sourceWin = windows.find((w) => w.id === sourceId);
  if (!targetWin || !sourceWin) return false;

  const targetParents = new Set<string>();
  if (targetWin.parentIds) for (const p of targetWin.parentIds) targetParents.add(p);
  if (targetWin.parentId) targetParents.add(targetWin.parentId);

  const sourceParents = new Set<string>();
  if (sourceWin.parentIds) for (const p of sourceWin.parentIds) sourceParents.add(p);
  if (sourceWin.parentId) sourceParents.add(sourceWin.parentId);

  return targetParents.has(sourceId) || sourceParents.has(targetId);
}

export function startWireDrag(
  e: React.MouseEvent<HTMLButtonElement>,
  sourceId: string,
  side: Side,
  onAddStickyClick?: (side: Side) => void,
) {
  e.stopPropagation();
  e.preventDefault();

  const startScreenX = e.clientX;
  const startScreenY = e.clientY;

  const parentEl = document.getElementById(`win-${sourceId}`);
  if (!parentEl) return;

  const x = parseFloat(parentEl.style.left) || parentEl.offsetLeft || 0;
  const y = parseFloat(parentEl.style.top) || parentEl.offsetTop || 0;
  const w = parentEl.offsetWidth || 750;
  const h = parentEl.offsetHeight || 550;
  const t = parentEl.style.transform;
  let tx = 0, ty = 0;
  if (t) {
    const mx = t.match(/translate3d\(([-\d.]+)px/);
    const my = t.match(/translate3d\([-\d.]+px,\s*([-\d.]+)px/);
    if (mx) tx = parseFloat(mx[1]) || 0;
    if (my) ty = parseFloat(my[1]) || 0;
  }

  isDraggingWire = true;
  activeWireSourceId = sourceId;
  document.body.style.cursor = "crosshair";

  let hasMovedFar = false;
  let currentHoverEl: HTMLElement | null = null;
  let rafId = 0;
  let mouseX = startScreenX;
  let mouseY = startScreenY;

  function updateWire() {
    rafId = 0;
    const cam = getCamera();
    const curWorldX = (mouseX - cam.panX) / cam.zoom;
    const curWorldY = (mouseY - cam.panY) / cam.zoom;

    const el = document.getElementById(`win-${sourceId}`);
    let px = x, py = y, pw = w, ph = h, ptx = tx, pty = ty;
    if (el) {
      px = parseFloat(el.style.left) || el.offsetLeft || 0;
      py = parseFloat(el.style.top) || el.offsetTop || 0;
      pw = el.offsetWidth || 750;
      ph = el.offsetHeight || 550;
      const transform = el.style.transform;
      if (transform) {
        const mx = transform.match(/translate3d\(([-\d.]+)px/);
        const my = transform.match(/translate3d\([-\d.]+px,\s*([-\d.]+)px/);
        if (mx) ptx = parseFloat(mx[1]) || 0;
        if (my) pty = parseFloat(my[1]) || 0;
      }
    }

    const sides: Side[] = ["RIGHT", "LEFT", "TOP", "BOTTOM"];
    let bestSide = side;
    let minDist = Infinity;

    for (const s of sides) {
      const pt = sidePoint(s, px + ptx, py + pty, pw, ph);
      const d = Math.hypot(curWorldX - pt.x, curWorldY - pt.y);
      if (d < minDist) {
        minDist = d;
        bestSide = s;
      }
    }

    const currentDot = sidePoint(bestSide, px + ptx, py + pty, pw, ph);

    notifyWire({
      sx: currentDot.x,
      sy: currentDot.y,
      mx: curWorldX,
      my: curWorldY,
      sourceSide: bestSide,
      sourceId,
      targetId: activeWireTargetId,
    });
  }

  // Notify immediately on mousedown so wire is visible on click-and-hold
  updateWire();

  function onMouseMove(ev: MouseEvent) {
    mouseX = ev.clientX;
    mouseY = ev.clientY;

    const dx = ev.clientX - startScreenX;
    const dy = ev.clientY - startScreenY;
    if (Math.hypot(dx, dy) > 5) {
      hasMovedFar = true;
    }

    const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[id^='win-']") as HTMLElement | null;
    const targetId = targetEl ? targetEl.id.replace(/^win-/, "") : null;

    if (targetEl && targetId && targetId !== sourceId && !isAlreadyConnected(sourceId, targetId)) {
      if (currentHoverEl !== targetEl) {
        if (currentHoverEl) {
          currentHoverEl.classList.remove("wire-target-hover");
          const innerWin = currentHoverEl.querySelector(".window");
          if (innerWin) innerWin.classList.remove("wire-target-hover");
        }
        currentHoverEl = targetEl;
        currentHoverEl.classList.add("wire-target-hover");
        const innerWin = currentHoverEl.querySelector(".window");
        if (innerWin) innerWin.classList.add("wire-target-hover");
        activeWireTargetId = targetId;
      }
    } else {
      if (currentHoverEl) {
        currentHoverEl.classList.remove("wire-target-hover");
        const innerWin = currentHoverEl.querySelector(".window");
        if (innerWin) innerWin.classList.remove("wire-target-hover");
        currentHoverEl = null;
        activeWireTargetId = null;
      }
    }

    if (!rafId) {
      rafId = requestAnimationFrame(updateWire);
    }
  }

  function onMouseUp(ev: MouseEvent) {
    if (rafId) cancelAnimationFrame(rafId);

    if (currentHoverEl) {
      currentHoverEl.classList.remove("wire-target-hover");
      const innerWin = currentHoverEl.querySelector(".window");
      if (innerWin) innerWin.classList.remove("wire-target-hover");
      currentHoverEl = null;
    }

    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    notifyWire(null);

    const isWireMoved = hasMovedFar || Math.hypot(ev.clientX - startScreenX, ev.clientY - startScreenY) > 5;

    isDraggingWire = false;
    activeWireSourceId = null;
    activeWireTargetId = null;

    if (!isWireMoved) {
      onAddStickyClick?.(side);
      return;
    }

    const targetWinEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[id^='win-']") as HTMLElement | null;

    if (targetWinEl && targetWinEl.id !== `win-${sourceId}`) {
      const targetId = targetWinEl.id.replace(/^win-/, "");
      connectWithoutCycles(sourceId, targetId);
    }
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
