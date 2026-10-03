import { useWindows } from "../../store/windows";
import { getCamera } from "../camera";
import { setZoomImmediate } from "../canvas/zoom";
import { isResizingWindow } from "./resize";

// shared flag so other handlers can skip work while a drag is active
export let isDraggingWindow = false;
export let activeDraggedWindowId: string | null = null;

export function setDraggingWindow(val: boolean) {
  isDraggingWindow = val;
}

export default function startDrag(
  e: React.MouseEvent<HTMLDivElement>,
  onDragEnd?: (pos: { x: number; y: number }) => void,
  onActivate?: () => void,
) {
  if (e.button !== 0 || isResizingWindow) return;

  const rawTarget = (e.currentTarget.closest(".window-wrapper, .window") as HTMLElement) || e.currentTarget;
  const target = (rawTarget.closest(".window-wrapper") as HTMLElement) || rawTarget;
  if (!target) return;

  const startX = e.clientX;
  const startY = e.clientY;

  // Freeze any active smooth camera pan/zoom animations immediately so camera stays static during drag
  const cam = getCamera();
  setZoomImmediate(cam.zoom, cam.panX, cam.panY);

  // Read geometry from style/layout — these are world-space coordinates
  const baseLeft = parseFloat(target.style.left) || target.offsetLeft || 0;
  const baseTop = parseFloat(target.style.top) || target.offsetTop || 0;

  isDraggingWindow = true;
  activeDraggedWindowId = target.id.replace(/^win-/, "");

  const startWorldMouseX = (startX - cam.panX) / cam.zoom;
  const startWorldMouseY = (startY - cam.panY) / cam.zoom;
  const worldShiftX = startWorldMouseX - baseLeft;
  const worldShiftY = startWorldMouseY - baseTop;

  const allWindows = useWindows.getState().windows;
  const selectedIds = useWindows.getState().selectedIds;
  if (!selectedIds.includes(activeDraggedWindowId!) && !e.shiftKey) {
    useWindows.getState().clearSelection();
  }

  const groupIds = selectedIds.includes(activeDraggedWindowId!)
    ? selectedIds
    : [activeDraggedWindowId!];
  const groupTargets = groupIds
    .map((id) => {
      const el = document.getElementById(`win-${id}`);
      if (!el) return null;
      const bLeft = parseFloat(el.style.left) || el.offsetLeft || 0;
      const bTop = parseFloat(el.style.top) || el.offsetTop || 0;
      return { id, el, baseLeft: bLeft, baseTop: bTop };
    })
    .filter((gt): gt is { id: string; el: HTMLElement; baseLeft: number; baseTop: number } => gt !== null);

  const draggedWin = allWindows.find((w) => w.id === activeDraggedWindowId);
  const isPinned = draggedWin?.alwaysOnTop;
  const nextZ = (isPinned ? 50000 : 0) + useWindows.getState().maxZIndex + 1;

  let rafId = 0;
  let mouseX = startX;
  let mouseY = startY;
  let setupDone = false;

  function applyGestureSetup() {
    if (setupDone) return;
    setupDone = true;
    for (const gt of groupTargets) {
      gt.el.classList.add("dragging");
      gt.el.style.zIndex = String(nextZ);
    }
    target.closest(".canvas-world")?.classList.add("gesture-active");
    document.body.style.cursor = "move";
  }

  applyGestureSetup();

  function updatePosition() {
    rafId = 0;
    if (!isDraggingWindow) return;
    applyGestureSetup();

    const curCam = getCamera();
    const curWorldMouseX = (mouseX - curCam.panX) / curCam.zoom;
    const curWorldMouseY = (mouseY - curCam.panY) / curCam.zoom;
    const newWorldLeft = curWorldMouseX - worldShiftX;
    const newWorldTop = curWorldMouseY - worldShiftY;

    const rdx = Math.round(newWorldLeft - baseLeft);
    const rdy = Math.round(newWorldTop - baseTop);

    for (const gt of groupTargets) {
      gt.el.style.transform = `translate3d(${rdx}px, ${rdy}px, 0)`;
    }
  }

  function onMouseMove(ev: MouseEvent) {
    mouseX = ev.clientX;
    mouseY = ev.clientY;

    if (!rafId) {
      rafId = requestAnimationFrame(updatePosition);
    }
  }

  function onMouseUp(ev?: MouseEvent) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    if (ev) {
      mouseX = ev.clientX;
      mouseY = ev.clientY;
    }
    applyGestureSetup();

    const curCam = getCamera();
    const curWorldMouseX = (mouseX - curCam.panX) / curCam.zoom;
    const curWorldMouseY = (mouseY - curCam.panY) / curCam.zoom;
    const rdx = Math.round(curWorldMouseX - worldShiftX - baseLeft);
    const rdy = Math.round(curWorldMouseY - worldShiftY - baseTop);

    for (const gt of groupTargets) {
      const finalLeft = gt.baseLeft + rdx;
      const finalTop = gt.baseTop + rdy;
      gt.el.style.transform = "";
      gt.el.style.left = `${finalLeft}px`;
      gt.el.style.top = `${finalTop}px`;
      gt.el.classList.remove("dragging");
      useWindows.getState().updateWindow(gt.id, { x: finalLeft, y: finalTop });
    }

    useWindows.setState({ maxZIndex: nextZ });

    onDragEnd?.({ x: baseLeft + rdx, y: baseTop + rdy });
    onActivate?.();

    isDraggingWindow = false;
    activeDraggedWindowId = null;
    target.closest(".canvas-world")?.classList.remove("gesture-active");
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  e.preventDefault();
}
