import { useWindows } from "../../store/windows";
import { getCamera } from "../camera";

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

  // Read geometry from style — these are world-space coordinates
  const baseLeft = parseFloat(target.style.left) || 0;
  const baseTop = parseFloat(target.style.top) || 0;
  const width = parseFloat(target.style.width) || 540;
  const height = parseFloat(target.style.height) || 550;

  // Edge margin check in screen space
  const cam = getCamera();
  const EDGE_MARGIN = 5;
  const screenLeft = baseLeft * cam.zoom + cam.panX;
  const screenTop = baseTop * cam.zoom + cam.panY;
  const screenW = width * cam.zoom;
  const screenH = height * cam.zoom;
  const relX = startX - screenLeft;
  const relY = startY - screenTop;
  if (
    relX <= EDGE_MARGIN || relX >= screenW - EDGE_MARGIN ||
    relY <= EDGE_MARGIN || relY >= screenH - EDGE_MARGIN
  ) return;

  isDraggingWindow = true;

  const shiftX = startX - screenLeft;
  const shiftY = startY - screenTop;

  const nextZ = useWindows.getState().maxZIndex + 1;

  let framePending = false;
  let mouseX = startX;
  let mouseY = startY;
  let lastWorldDx = 0;
  let lastWorldDy = 0;
  let setupDone = false;

  function applyGestureSetup() {
    if (setupDone) return;
    setupDone = true;
    target.classList.add("dragging");
    target.closest(".canvas-world")?.classList.add("gesture-active");
    document.body.style.cursor = "move";
    target.style.zIndex = String(nextZ);
  }

  function updatePosition() {
    framePending = false;
    applyGestureSetup();

    const curCam = getCamera();
    const screenDx = mouseX - shiftX - screenLeft;
    const screenDy = mouseY - shiftY - screenTop;
    // Transform is inside the scaled world container, so use world-space units
    const worldDx = screenDx / curCam.zoom;
    const worldDy = screenDy / curCam.zoom;

    // Round to nearest pixel to avoid sub-pixel shift when switching from
    // transform to left/top on mouseup
    const rdx = Math.round(worldDx);
    const rdy = Math.round(worldDy);

    lastWorldDx = rdx;
    lastWorldDy = rdy;

    target.style.transform = `translate3d(${rdx}px, ${rdy}px, 0)`;
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
    applyGestureSetup();

    const finalLeft = baseLeft + lastWorldDx;
    const finalTop = baseTop + lastWorldDy;

    target.style.transform = "";
    target.style.left = `${finalLeft}px`;
    target.style.top = `${finalTop}px`;

    useWindows.setState({ maxZIndex: nextZ });

    onDragEnd?.({ x: finalLeft, y: finalTop });
    onActivate?.();

    isDraggingWindow = false;
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
