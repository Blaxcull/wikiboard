import { useWindows } from "../../store/windows";

// shared flag so other handlers can skip work while a drag is active
export let isDraggingWindow = false;

export default function startDrag(
  e: React.MouseEvent<HTMLDivElement>,
  onDragEnd?: (pos: { x: number; y: number }) => void,
  onActivate?: () => void,
) {
  const raw = e.currentTarget.parentElement;
  if (!raw) return;
  const target: HTMLElement = raw;

  const startX = e.clientX;
  const startY = e.clientY;
  const rect = target.getBoundingClientRect();

  const EDGE_MARGIN = 5;
  if (
    Math.abs(e.clientX - rect.left) <= EDGE_MARGIN ||
    Math.abs(e.clientX - rect.right) <= EDGE_MARGIN ||
    Math.abs(e.clientY - rect.top) <= EDGE_MARGIN ||
    Math.abs(e.clientY - rect.bottom) <= EDGE_MARGIN
  ) return;

  isDraggingWindow = true;

  const baseLeft = parseFloat(target.style.left) || rect.left;
  const baseTop = parseFloat(target.style.top) || rect.top;
  const shiftX = startX - baseLeft;
  const shiftY = startY - baseTop;

  // All heavy work done on mousedown — before any mousemove
  target.classList.add("dragging");
  document.body.classList.add("gesture-active");
  document.body.style.cursor = "move";

  const nextZ = useWindows.getState().maxZIndex + 1;
  target.style.zIndex = String(nextZ);

  let framePending = false;
  let mouseX = startX;
  let mouseY = startY;
  let lastDx = 0;
  let lastDy = 0;

  function updatePosition() {
    framePending = false;
    let dx = mouseX - shiftX - baseLeft;
    let dy = mouseY - shiftY - baseTop;

    if (baseLeft + dx < 0) dx = -baseLeft;
    if (baseTop + dy < 0) dy = -baseTop;

    lastDx = dx;
    lastDy = dy;

    target.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  function onMouseMove(ev: MouseEvent) {
    mouseX = ev.clientX;
    mouseY = ev.clientY;

    if (!framePending) {
      framePending = true;
      requestAnimationFrame(updatePosition);
    }
  }

  function onMouseUp() {
    const finalLeft = Math.max(0, baseLeft + lastDx);
    const finalTop = Math.max(0, baseTop + lastDy);

    target.style.transform = "";
    target.style.left = `${finalLeft}px`;
    target.style.top = `${finalTop}px`;

    // Commit z-index to Zustand on mouseup — skips re-renders during gesture
    useWindows.setState({ maxZIndex: nextZ });

    onDragEnd?.({ x: finalLeft, y: finalTop });
    onActivate?.();

    isDraggingWindow = false;
    target.classList.remove("dragging");
    document.body.classList.remove("gesture-active");
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  e.preventDefault();
}
