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
  if (isResizingWindow) return;

  const target = (e.currentTarget.closest(".window") as HTMLElement) || e.currentTarget.parentElement;
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

  const nextZ = useWindows.getState().maxZIndex + 1;

  let rafId = 0;
  let mouseX = startX;
  let mouseY = startY;
  let setupDone = false;

  function applyGestureSetup() {
    if (setupDone) return;
    setupDone = true;
    target.classList.add("dragging");
    target.closest(".canvas-world")?.classList.add("gesture-active");
    document.body.style.cursor = "move";
    target.style.zIndex = String(nextZ);
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

    target.style.transform = `translate3d(${rdx}px, ${rdy}px, 0)`;
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
    const finalLeft = Math.round(curWorldMouseX - worldShiftX);
    const finalTop = Math.round(curWorldMouseY - worldShiftY);

    target.style.transform = "";
    target.style.left = `${finalLeft}px`;
    target.style.top = `${finalTop}px`;

    useWindows.setState({ maxZIndex: nextZ });

    onDragEnd?.({ x: finalLeft, y: finalTop });
    onActivate?.();

    isDraggingWindow = false;
    activeDraggedWindowId = null;
    target.classList.remove("dragging");
    target.closest(".canvas-world")?.classList.remove("gesture-active");
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  e.preventDefault();
}
