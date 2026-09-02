import { getCamera, setCamera } from "../camera";
import { isDraggingWindow } from "../window/drag";
import { isResizingWindow } from "../window/resize";

export function startCanvasPan(
  e: MouseEvent,
  viewport: HTMLElement,
  _grid: HTMLElement,
  _world: HTMLElement,
) {
  const target = e.target as HTMLElement;
  if (
    target.closest(".window") ||
    target.closest(".search-wrap") ||
    target.closest(".dialog-overlay") ||
    target.closest("button")
  )
    return;
  if (isDraggingWindow || isResizingWindow) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const basePanX = getCamera().panX;
  const basePanY = getCamera().panY;

  let framePending = false;
  let lastX = startX;
  let lastY = startY;

  viewport.classList.add("panning");
  document.body.style.cursor = "grabbing";
  document.body.style.userSelect = "none";

  function applyPan() {
    framePending = false;
    const dx = lastX - startX;
    const dy = lastY - startY;
    setCamera({ panX: basePanX + dx, panY: basePanY + dy });
  }

  function onMouseMove(ev: MouseEvent) {
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!framePending) {
      framePending = true;
      requestAnimationFrame(applyPan);
    }
  }

  function onMouseUp() {
    viewport.classList.remove("panning");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  e.preventDefault();
}
