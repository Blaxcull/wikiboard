import { getCamera, setCamera } from "../camera";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 10;
const LERP = 0.25;
const SNAP_THRESHOLD = 0.001;

let targetZoom = 1;
let targetPanX = 0;
let targetPanY = 0;
let rafPending = false;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function animate() {
  rafPending = false;
  const cam = getCamera();

  const newZoom = lerp(cam.zoom, targetZoom, LERP);
  const newPanX = lerp(cam.panX, targetPanX, LERP);
  const newPanY = lerp(cam.panY, targetPanY, LERP);

  const zoomDone = Math.abs(newZoom - targetZoom) < SNAP_THRESHOLD;
  const panXDone = Math.abs(newPanX - targetPanX) < SNAP_THRESHOLD;
  const panYDone = Math.abs(newPanY - targetPanY) < SNAP_THRESHOLD;

  if (zoomDone && panXDone && panYDone) {
    setCamera({ zoom: targetZoom, panX: targetPanX, panY: targetPanY });
  } else {
    setCamera({ zoom: newZoom, panX: newPanX, panY: newPanY });
    rafPending = true;
    requestAnimationFrame(animate);
  }
}

export function handleZoom(e: WheelEvent) {
  e.preventDefault();

  const cam = getCamera();
  const oldZoom = cam.zoom;
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  targetZoom = clamp(targetZoom * factor, MIN_ZOOM, MAX_ZOOM);

  const mouseX = e.clientX;
  const mouseY = e.clientY;

  targetPanX = mouseX - (mouseX - cam.panX) * (targetZoom / oldZoom);
  targetPanY = mouseY - (mouseY - cam.panY) * (targetZoom / oldZoom);

  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(animate);
  }
}

/** Reset zoom target (e.g. on double-click to reset view). */
export function resetZoom() {
  targetZoom = 1;
  targetPanX = getCamera().panX;
  targetPanY = getCamera().panY;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(animate);
  }
}
