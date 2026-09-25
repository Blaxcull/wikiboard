import { useWindows } from "../../store/windows";
import { isDraggingWindow } from "./drag";
import { getCamera } from "../camera";

// shared flag so OnEdge etc. can skip work while a resize is active
export let isResizingWindow = false;
export let activeResizingWindowId: string | null = null;

const CORNER_MARGIN = 24;

function computeCursorDirection(
  mouseX: number, mouseY: number,
  left: number, top: number,
  width: number, height: number,
  target?: HTMLElement,
): string | null {
  const relX = mouseX - left;
  const relY = mouseY - top;

  let cornerX = width;
  let cornerY = height;

  if (target?.classList.contains("pdf-window")) {
    const bottomOffset = parseFloat(target.style.getPropertyValue("--canvas-bottom-offset")) || 0;
    const rightOffset = parseFloat(target.style.getPropertyValue("--canvas-right-offset")) || 0;
    if (bottomOffset > 0) cornerY = height - bottomOffset;
    if (rightOffset > 0) cornerX = width - rightOffset;
  }

  const nearRight = (relX >= cornerX - CORNER_MARGIN && relX <= cornerX + CORNER_MARGIN) || relX >= width - CORNER_MARGIN;
  const nearBottom = (relY >= cornerY - CORNER_MARGIN && relY <= cornerY + CORNER_MARGIN) || relY >= height - CORNER_MARGIN;

  if (nearBottom && nearRight) return 'se-resize';
  return null;
}

export function Resize(
  e: React.MouseEvent<HTMLDivElement>,
  onResizeEnd?: (rect: { x: number; y: number; width: number; height: number }) => void,
  onActivate?: () => void,
) {
  if (isDraggingWindow || isResizingWindow) return;

  const target = e.currentTarget;
  if (target.classList.contains("pdf-window") && target.classList.contains("maximized")) return;

  // Read geometry from style — these are world-space coordinates
  const baseLeft = parseFloat(target.style.left) || 0;
  const baseTop = parseFloat(target.style.top) || 0;
  const startWidth = parseFloat(target.style.width) || 750;
  const startHeight = parseFloat(target.style.height) || 550;

  // Convert screen mouse to world coords for edge detection
  const cam = getCamera();
  const worldMouseX = (e.clientX - cam.panX) / cam.zoom;
  const worldMouseY = (e.clientY - cam.panY) / cam.zoom;

  const cursor = computeCursorDirection(
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
  let frameRequested = false;

  const nextZ = (useWindows.getState().maxZIndex) + 1;

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
    if (isDraggingWindow || frameRequested) return;
    frameRequested = true;

    requestAnimationFrame(() => {
      frameRequested = false;
      applyGestureSetup();

      const curCam = getCamera();
      const screenDx = lastX - startX;
      const screenDy = lastY - startY;
      // Convert to world units — transform is inside the scaled world container
      const dx = screenDx / curCam.zoom;
      const dy = screenDy / curCam.zoom;

      if (aspectRatio && aspectRatio > 0) {
        let newW: number;
        let newH: number;
        if (Math.abs(dx) >= Math.abs(dy * aspectRatio)) {
          newW = Math.max(100, Math.round(startWidth + (resizeDir.includes("w") ? -dx : dx)));
          newH = Math.max(100, Math.round(newW / aspectRatio));
        } else {
          newH = Math.max(100, Math.round(startHeight + (resizeDir.includes("n") ? -dy : dy)));
          newW = Math.max(100, Math.round(newH * aspectRatio));
        }
        if (resizeDir.includes("w") || resizeDir.includes("n")) {
          const tx = resizeDir.includes("w") ? startWidth - newW : 0;
          const ty = resizeDir.includes("n") ? startHeight - newH : 0;
          target.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        }
        target.style.width = `${newW}px`;
        target.style.height = `${newH}px`;
      } else {
        const needsLeft = resizeDir.includes("w");
        const needsTop = resizeDir.includes("n");

        if (needsLeft || needsTop) {
          const tx = needsLeft && startWidth - dx > 100 ? Math.round(dx) : 0;
          const ty = needsTop && startHeight - dy > 100 ? Math.round(dy) : 0;
          target.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        }

        if (resizeDir.includes("e") && startWidth + dx > 100) {
          target.style.width = `${Math.round(startWidth + dx)}px`;
        }
        if (resizeDir.includes("w") && startWidth - dx > 100) {
          target.style.width = `${Math.round(startWidth - dx)}px`;
        }
        if (resizeDir.includes("s") && startHeight + dy > 100) {
          target.style.height = `${Math.round(startHeight + dy)}px`;
        }
        if (resizeDir.includes("n") && startHeight - dy > 100) {
          target.style.height = `${Math.round(startHeight - dy)}px`;
        }
      }
    });
  }

  function onMouseUp() {
    applyGestureSetup();

    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.getSelection()?.removeAllRanges();
    target.classList.remove("resizing");
    target.closest(".canvas-world")?.classList.remove("gesture-active");

    // Read transform — values are in world units
    const txMatch = target.style.transform?.match(/translate3d\(([-\d.]+)px/);
    const tyMatch = target.style.transform?.match(/translate3d\([-\d.]+px,\s*([-\d.]+)px/);
    const tx = txMatch ? Math.round(parseFloat(txMatch[1])) : 0;
    const ty = tyMatch ? Math.round(parseFloat(tyMatch[1])) : 0;

    const finalLeft = baseLeft + tx;
    const finalTop = baseTop + ty;

    target.style.transform = "";
    target.style.left = `${finalLeft}px`;
    target.style.top = `${finalTop}px`;

    const curCam = getCamera();
    const screenDx = lastX - startX;
    const screenDy = lastY - startY;
    const dx = screenDx / curCam.zoom;
    const dy = screenDy / curCam.zoom;

    if (aspectRatio && aspectRatio > 0) {
      let finalW: number;
      let finalH: number;
      if (Math.abs(dx) >= Math.abs(dy * aspectRatio)) {
        finalW = Math.max(100, Math.round(startWidth + (resizeDir.includes("w") ? -dx : dx)));
        finalH = Math.max(100, Math.round(finalW / aspectRatio));
      } else {
        finalH = Math.max(100, Math.round(startHeight + (resizeDir.includes("n") ? -dy : dy)));
        finalW = Math.max(100, Math.round(finalH * aspectRatio));
      }
      target.style.width = `${finalW}px`;
      target.style.height = `${finalH}px`;
    } else {
      if (resizeDir.includes("e") && startWidth + dx > 100) {
        target.style.width = `${Math.round(startWidth + dx)}px`;
      }
      if (resizeDir.includes("w") && startWidth - dx > 100) {
        target.style.width = `${Math.round(startWidth - dx)}px`;
      }
      if (resizeDir.includes("s") && startHeight + dy > 100) {
        target.style.height = `${Math.round(startHeight + dy)}px`;
      }
      if (resizeDir.includes("n") && startHeight - dy > 100) {
        target.style.height = `${Math.round(startHeight - dy)}px`;
      }
    }

    const width = parseFloat(target.style.width) || startWidth;
    const height = parseFloat(target.style.height) || startHeight;
    onResizeEnd?.({ x: finalLeft, y: finalTop, width, height });

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
