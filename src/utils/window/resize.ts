import { useWindows } from "../../store/windows";
import { isDraggingWindow } from "./drag";
import { getCamera } from "../camera";

// shared flag so OnEdge etc. can skip work while a resize is active
export let isResizingWindow = false;

const EDGE_MARGIN = 5;

function computeCursorDirection(
  mouseX: number, mouseY: number,
  left: number, top: number,
  width: number, height: number,
): string | null {
  const relX = mouseX - left;
  const relY = mouseY - top;
  const nearLeft = relX <= EDGE_MARGIN;
  const nearRight = relX >= width - EDGE_MARGIN;
  const nearTop = relY <= EDGE_MARGIN;
  const nearBottom = relY >= height - EDGE_MARGIN;

  if (nearTop && nearLeft) return 'nw-resize';
  if (nearTop && nearRight) return 'ne-resize';
  if (nearBottom && nearLeft) return 'sw-resize';
  if (nearBottom && nearRight) return 'se-resize';
  if (nearLeft) return 'w-resize';
  if (nearRight) return 'e-resize';
  if (nearTop) return 'n-resize';
  if (nearBottom) return 's-resize';
  return null;
}

export function Resize(
  e: React.MouseEvent<HTMLDivElement>,
  onResizeEnd?: (rect: { x: number; y: number; width: number; height: number }) => void,
  onActivate?: () => void,
) {
  if (isDraggingWindow || isResizingWindow) return;

  const target = e.currentTarget;

  // Read geometry from style — these are world-space coordinates
  const baseLeft = parseFloat(target.style.left) || 0;
  const baseTop = parseFloat(target.style.top) || 0;
  const startWidth = parseFloat(target.style.width) || 384;
  const startHeight = parseFloat(target.style.height) || 384;

  // Convert screen mouse to world coords for edge detection
  const cam = getCamera();
  const worldMouseX = (e.clientX - cam.panX) / cam.zoom;
  const worldMouseY = (e.clientY - cam.panY) / cam.zoom;

  const cursor = computeCursorDirection(
    worldMouseX, worldMouseY,
    baseLeft, baseTop,
    startWidth, startHeight,
  );
  if (!cursor) return;
  const resizeDir: string = cursor;

  const startX = e.clientX;
  const startY = e.clientY;

  isResizingWindow = true;
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
    });
  }

  function onMouseUp() {
    applyGestureSetup();

    document.body.style.cursor = "";
    document.body.style.userSelect = "";
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

    const width = parseFloat(target.style.width) || startWidth;
    const height = parseFloat(target.style.height) || startHeight;
    onResizeEnd?.({ x: finalLeft, y: finalTop, width, height });

    useWindows.setState({ maxZIndex: nextZ });
    onActivate?.();

    isResizingWindow = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
