import { isDraggingWindow } from "./drag";

// shared flag so OnEdge etc. can skip work while a resize is active
export let isResizingWindow = false;

const EDGE_MARGIN = 5;

function isNearEdge(e: React.MouseEvent<HTMLDivElement>, rect: DOMRect): boolean {
  const nearLeft = Math.abs(e.clientX - rect.left) <= EDGE_MARGIN;
  const nearRight = Math.abs(e.clientX - rect.right) <= EDGE_MARGIN;
  const nearTop = Math.abs(e.clientY - rect.top) <= EDGE_MARGIN;
  const nearBottom = Math.abs(e.clientY - rect.bottom) <= EDGE_MARGIN;
  return nearLeft || nearRight || nearTop || nearBottom;
}

export function Resize(
  e: React.MouseEvent<HTMLDivElement>,
  onResizeEnd?: (rect: { x: number; y: number; width: number; height: number }) => void,
) {
  if (isDraggingWindow || isResizingWindow) return;

  const target = e.currentTarget;
  const rect = target.getBoundingClientRect();

  if (!isNearEdge(e, rect)) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const startWidth = rect.width;
  const startHeight = rect.height;
  const startLeft = rect.left;
  const startTop = rect.top;
  const cursor = getComputedStyle(target).cursor;

  if (cursor === "default") return;



  isResizingWindow = true;
  let frameRequested = false;

  // base layout values captured at resize start — transform offsets from these
  const baseLeft = startLeft;
  const baseTop = startTop;

  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  target.classList.add("resizing");
  document.body.classList.add("gesture-active");

  // always remember the latest pointer position so no movement
  // is dropped between animation frames (prevents stepping)
  let lastX = startX;
  let lastY = startY;

  function onMouseMove(ev: MouseEvent) {
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (isDraggingWindow || frameRequested) return;
    frameRequested = true;

    requestAnimationFrame(() => {
      frameRequested = false;
      const dx = lastX - startX;
      const dy = lastY - startY;

      // Position changes (west/north edges): use transform for GPU compositing
      const needsLeft = cursor.includes("w");
      const needsTop = cursor.includes("n");
      if (needsLeft || needsTop) {
        const tx = needsLeft && startWidth - dx > 100 ? dx : 0;
        const ty = needsTop && startHeight - dy > 100 ? dy : 0;
        target.style.transform = `translate(${tx}px, ${ty}px)`;
      }

      // Size changes: write width/height (unavoidable, but isolated by contain:layout)
      if (cursor.includes("e") && startWidth + dx > 100) {
        target.style.width = `${startWidth + dx}px`;
      }
      if (cursor.includes("w") && startWidth - dx > 100) {
        target.style.width = `${startWidth - dx}px`;
      }
      if (cursor.includes("s") && startHeight + dy > 100) {
        target.style.height = `${startHeight + dy}px`;
      }
      if (cursor.includes("n") && startHeight - dy > 100) {
        target.style.height = `${startHeight - dy}px`;
      }
    });
  }

  function onMouseUp() {
    document.body.style.cursor = "default";
    document.body.style.userSelect = "";
    target.classList.remove("resizing");
    document.body.classList.remove("gesture-active");


    // commit transform offset to layout properties
    const txMatch = target.style.transform?.match(/translate\(([-\d.]+)px/);
    const tyMatch = target.style.transform?.match(/translate\([-\d.]+px,\s*([-\d.]+)px/);
    const tx = txMatch ? parseFloat(txMatch[1]) : 0;
    const ty = tyMatch ? parseFloat(tyMatch[1]) : 0;

    const finalLeft = Math.max(0, baseLeft + tx);
    const finalTop = Math.max(0, baseTop + ty);

    target.style.transform = "";
    target.style.left = `${finalLeft}px`;
    target.style.top = `${finalTop}px`;

    const width = parseFloat(target.style.width) || target.getBoundingClientRect().width;
    const height = parseFloat(target.style.height) || target.getBoundingClientRect().height;
    onResizeEnd?.({ x: finalLeft, y: finalTop, width, height });
    isResizingWindow = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
