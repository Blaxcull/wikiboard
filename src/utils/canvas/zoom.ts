import { getCamera, setCamera } from "../camera";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 10;
const LERP = 0.25;
const SNAP_THRESHOLD = 0.001;

export const ZOOM_STEPS = [
  0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0,
];

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

/** Set zoom and pan immediately (no lerp animation). Updates both the camera state and the animation targets so subsequent wheel-zoom starts from the correct value. */
export function setZoomImmediate(zoom: number, panX?: number, panY?: number) {
  targetZoom = zoom;
  targetPanX = panX ?? getCamera().panX;
  targetPanY = panY ?? getCamera().panY;
  setCamera({ zoom, panX: targetPanX, panY: targetPanY });
}

/** Smoothly zoom to a target zoom level centered at screen point (cx, cy). */
export function smoothZoomTo(
  nextZoom: number,
  cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0,
  cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0,
) {
  const cam = getCamera();
  const oldZoom = cam.zoom;
  targetZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);

  targetPanX = cx - (cx - cam.panX) * (targetZoom / oldZoom);
  targetPanY = cy - (cy - cam.panY) * (targetZoom / oldZoom);

  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(animate);
  }
}

/** Instantly snap to a target zoom level without lerp animation, keeping screen point (cx, cy) fixed. */
export function snapZoomTo(
  nextZoom: number,
  cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0,
  cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0,
) {
  const cam = getCamera();
  const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const oldZoom = cam.zoom;
  if (Math.abs(oldZoom - clampedZoom) < SNAP_THRESHOLD) return;

  const nextPanX = cx - (cx - cam.panX) * (clampedZoom / oldZoom);
  const nextPanY = cy - (cy - cam.panY) * (clampedZoom / oldZoom);

  setZoomImmediate(clampedZoom, nextPanX, nextPanY);
}

/** Zoom in to the next discrete zoom step in a snap. */
export function zoomIn() {
  const current = getCamera().zoom;
  const next = ZOOM_STEPS.find((s) => s > current * 1.01) ?? MAX_ZOOM;
  snapZoomTo(next);
}

/** Zoom out to the previous discrete zoom step in a snap. */
export function zoomOut() {
  const current = getCamera().zoom;
  const prev = [...ZOOM_STEPS].reverse().find((s) => s < current * 0.99) ?? MIN_ZOOM;
  snapZoomTo(prev);
}

/** Snap zoom to 100% immediately without lerp animation. Centered at screen center. */
export function snapZoomTo100() {
  snapZoomTo(1);
}

/** Reset zoom target (to 100% in a snap). */
export function resetZoom() {
  snapZoomTo(1);
}

/** Smoothly pan camera to target panX, panY (and optional target zoom). */
export function smoothPanTo(panX: number, panY: number, zoom?: number) {
  targetPanX = panX;
  targetPanY = panY;
  if (zoom !== undefined) {
    targetZoom = zoom;
  } else {
    targetZoom = getCamera().zoom;
  }
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(animate);
  }
}

export type WindowRect = { x: number; y: number; width: number; height: number };

/** Automatically pan camera so that the newly created window (and its parent if specified) are visible in the viewport. */
export function focusWindowAndParent(child: WindowRect, parent?: WindowRect) {
  if (typeof window === "undefined") return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cam = getCamera();
  const zoom = cam.zoom;

  const topPadding = 70;
  const sidePadding = 60;
  const bottomPadding = 60;

  let panX: number;
  let panY: number;

  if (parent) {
    const minX = Math.min(parent.x, child.x);
    const maxX = Math.max(parent.x + parent.width, child.x + child.width);
    const minY = Math.min(parent.y, child.y);
    const maxY = Math.max(parent.y + parent.height, child.y + child.height);

    const bWidthScreen = (maxX - minX) * zoom;
    const bHeightScreen = (maxY - minY) * zoom;

    const availW = vw - 2 * sidePadding;
    const availH = vh - topPadding - bottomPadding;

    if (bWidthScreen <= availW && bHeightScreen <= availH) {
      // Both parent and child fit comfortably on screen at current zoom
      const wCenterX = (minX + maxX) / 2;
      const wCenterY = (minY + maxY) / 2;

      panX = vw / 2 - wCenterX * zoom;
      panY = (topPadding + (vh - bottomPadding)) / 2 - wCenterY * zoom;
    } else {
      // Screen is narrower than combined width; align parent to the left side of the screen
      panX = sidePadding - parent.x * zoom;

      const childCenterY = child.y + child.height / 2;
      panY = (topPadding + (vh - bottomPadding)) / 2 - childCenterY * zoom;
    }
  } else {
    // Single window focus (e.g. searching or opening a standalone window)
    const childCenterX = child.x + child.width / 2;
    const childCenterY = child.y + child.height / 2;

    panX = vw / 2 - childCenterX * zoom;
    panY = (topPadding + (vh - bottomPadding)) / 2 - childCenterY * zoom;
  }

  smoothPanTo(panX, panY);
}

