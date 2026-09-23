import { isDraggingWindow } from "./drag";
import { isResizingWindow } from "./resize";
import { getCamera } from "../camera";

let lastCursor = "";

const CORNER_MARGIN = 12;

function computeCursor(
  mouseX: number, mouseY: number,
  left: number, top: number,
  width: number, height: number,
): string {
  const relX = mouseX - left;
  const relY = mouseY - top;
  const nearRight = relX >= width - CORNER_MARGIN;
  const nearBottom = relY >= height - CORNER_MARGIN;

  if (nearBottom && nearRight) return 'se-resize';
  return 'default';
}

export function OnEdge(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingWindow || isResizingWindow) return

    const element = e.currentTarget
    if (element.classList.contains("pdf-window") && element.classList.contains("maximized")) return;

    // Read from style — these are world-space coordinates
    const left = parseFloat(element.style.left) || 0;
    const top = parseFloat(element.style.top) || 0;
    const width = parseFloat(element.style.width) || 540;
    const height = parseFloat(element.style.height) || 550;

    // Convert screen mouse to world coords
    const cam = getCamera();
    const worldMouseX = (e.clientX - cam.panX) / cam.zoom;
    const worldMouseY = (e.clientY - cam.panY) / cam.zoom;

    const cursor = computeCursor(worldMouseX, worldMouseY, left, top, width, height)

    if (cursor !== lastCursor) {
        element.style.cursor = cursor
        lastCursor = cursor
    }
}

let delegateAttached = false;

export function attachEdgeDelegate() {
    if (delegateAttached) return;
    delegateAttached = true;

    document.addEventListener("mousemove", (e: MouseEvent) => {
        if (isDraggingWindow || isResizingWindow) return;

        const target = (e.target as HTMLElement).closest?.(".window") as HTMLElement | null;
        if (!target) return;
        if (target.classList.contains("pdf-window") && target.classList.contains("maximized")) return;

        // Read from style — these are world-space coordinates
        const left = parseFloat(target.style.left) || 0;
        const top = parseFloat(target.style.top) || 0;
        const width = parseFloat(target.style.width) || 540;
        const height = parseFloat(target.style.height) || 550;

        // Convert screen mouse to world coords
        const cam = getCamera();
        const worldMouseX = (e.clientX - cam.panX) / cam.zoom;
        const worldMouseY = (e.clientY - cam.panY) / cam.zoom;

        const cursor = computeCursor(worldMouseX, worldMouseY, left, top, width, height);

        if (cursor !== lastCursor) {
            target.style.cursor = cursor;
            lastCursor = cursor;
        }
    });
}
