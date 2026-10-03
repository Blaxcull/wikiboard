import { useWindows } from "../../store/windows";
import { isDraggingWindow } from "./drag";
import { getCamera } from "../camera";

// shared flag so OnEdge etc. can skip work while a resize is active
export let isResizingWindow = false;
export let activeResizingWindowId: string | null = null;

export function computeCursorDirection(
  mouseX: number, mouseY: number,
  left: number, top: number,
  width: number, height: number,
  target?: HTMLElement,
): string | null {
  const relX = mouseX - left;
  const relY = mouseY - top;

  const CORNER = 36;

  let cornerY = height;
  if (target?.classList.contains("pdf-window")) {
    cornerY = height - 64;
  }

  const nearRight = relX >= width - CORNER && relX <= width + 12;
  const nearBottom = (relY >= cornerY - CORNER && relY <= cornerY + 12) || (relY >= height - CORNER && relY <= height + 12);

  if (nearRight && nearBottom) {
    return 'se-resize';
  }

  return null;
}

export function Resize(
  e: React.MouseEvent<HTMLElement>,
  onResizeEnd?: (rect: { x: number; y: number; width: number; height: number }) => void,
  onActivate?: () => void,
) {
  if (e.button !== 0 || isDraggingWindow || isResizingWindow) return;

  const rawTarget = (e.currentTarget.closest(".window-wrapper, .window") as HTMLElement) || e.currentTarget;
  const target = (rawTarget.closest(".window-wrapper") as HTMLElement) || rawTarget;
  if (target.classList.contains("pdf-window") && target.classList.contains("maximized")) return;

  // Read geometry from style — these are world-space coordinates
  const baseLeft = parseFloat(target.style.left) || target.offsetLeft || 0;
  const baseTop = parseFloat(target.style.top) || target.offsetTop || 0;
  const startWidth = parseFloat(target.style.width) || target.offsetWidth || 750;
  const startHeight = parseFloat(target.style.height) || target.offsetHeight || 550;

  const rect = target.getBoundingClientRect();
  const isCorner = e.clientX >= rect.right - 40 && e.clientY >= rect.bottom - 40;

  // Convert screen mouse to world coords for edge detection
  const cam = getCamera();
  const worldMouseX = (e.clientX - cam.panX) / cam.zoom;
  const worldMouseY = (e.clientY - cam.panY) / cam.zoom;

  const cursor = isCorner ? "se-resize" : computeCursorDirection(
    worldMouseX, worldMouseY,
    baseLeft, baseTop,
    startWidth, startHeight,
    target,
  );
  if (!cursor) return;
  const resizeDir: string = cursor;

  e.preventDefault();
  e.stopPropagation();
  window.getSelection()?.removeAllRanges();

  const isImageWindow = target.classList.contains("image-window");
  const isPdfWindow = target.classList.contains("pdf-window") && !target.classList.contains("maximized");
  const imgEl = isImageWindow ? (target.querySelector("img") as HTMLImageElement | null) : null;
  let aspectRatio: number | null = null;
  if (isImageWindow) {
    if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
      aspectRatio = imgEl.naturalWidth / imgEl.naturalHeight;
    } else if (startWidth > 0 && startHeight > 0) {
      aspectRatio = startWidth / startHeight;
    }
  } else if (isPdfWindow) {
    if (startWidth > 0 && startHeight > 0) {
      aspectRatio = startWidth / startHeight;
    }
  }

  const startX = e.clientX;
  const startY = e.clientY;

  isResizingWindow = true;
  activeResizingWindowId = target.id.replace(/^win-/, "");
  let rafId = 0;

  const allWindows = useWindows.getState().windows;
  const resizedWin = allWindows.find((w) => w.id === activeResizingWindowId);
  const isPinned = resizedWin?.alwaysOnTop;
  const nextZ = (isPinned ? 50000 : 0) + useWindows.getState().maxZIndex + 1;

  let lastX = startX;
  let lastY = startY;
  let setupDone = false;

  function applyGestureSetup() {
    if (setupDone) return;
    setupDone = true;
    document.body.style.cursor = resizeDir;
    document.body.style.userSelect = "none";
    target.classList.add("resizing");
    target.closest(".canvas-world")?.classList.add("gesture-active");
    target.style.zIndex = String(nextZ);
  }

  applyGestureSetup();

  function onMouseMove(ev: MouseEvent) {
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (isDraggingWindow || rafId) return;

    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!isResizingWindow) return;
      applyGestureSetup();

      const curCam = getCamera();
      const screenDx = lastX - startX;
      const screenDy = lastY - startY;
      // Convert to world units — transform is inside the scaled world container
      const dx = screenDx / curCam.zoom;
      const dy = screenDy / curCam.zoom;

      if (aspectRatio && aspectRatio > 0) {
        const newW = Math.max(100, Math.round(startWidth + dx));
        const newH = Math.max(100, Math.round(newW / aspectRatio));
        target.style.width = `${newW}px`;
        target.style.height = `${newH}px`;
      } else {
        const newW = Math.max(100, Math.round(startWidth + dx));
        const newH = Math.max(100, Math.round(startHeight + dy));
        target.style.width = `${newW}px`;
        target.style.height = `${newH}px`;
      }
    });
  }

  function onMouseUp(ev?: MouseEvent) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (ev) {
      lastX = ev.clientX;
      lastY = ev.clientY;
    }
    applyGestureSetup();

    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.getSelection()?.removeAllRanges();
    target.classList.remove("resizing");
    target.closest(".canvas-world")?.classList.remove("gesture-active");

    target.style.transform = "";
    target.style.left = `${baseLeft}px`;
    target.style.top = `${baseTop}px`;

    const curCam = getCamera();
    const screenDx = lastX - startX;
    const screenDy = lastY - startY;
    const dx = screenDx / curCam.zoom;
    const dy = screenDy / curCam.zoom;

    let finalW: number;
    let finalH: number;
    if (aspectRatio && aspectRatio > 0) {
      finalW = Math.max(100, Math.round(startWidth + dx));
      finalH = Math.max(100, Math.round(finalW / aspectRatio));
    } else {
      finalW = Math.max(100, Math.round(startWidth + dx));
      finalH = Math.max(100, Math.round(startHeight + dy));
    }

    target.style.width = `${finalW}px`;
    target.style.height = `${finalH}px`;

    onResizeEnd?.({ x: baseLeft, y: baseTop, width: finalW, height: finalH });

    useWindows.setState({ maxZIndex: nextZ });
    onActivate?.();

    isResizingWindow = false;
    activeResizingWindowId = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
