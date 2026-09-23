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

/** Set zoom and pan immediately (no lerp animation). Updates both the camera state and the animation targets so subsequent wheel-zoom starts from the correct value. */
export function setZoomImmediate(zoom: number, panX?: number, panY?: number) {
  targetZoom = zoom;
  targetPanX = panX ?? getCamera().panX;
  targetPanY = panY ?? getCamera().panY;
  setCamera({ zoom, panX: targetPanX, panY: targetPanY });
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
      // Screen is narrower than combined width; align child to the right side of the screen
      const childRightScreen = (child.x + child.width) * zoom;
      panX = vw - sidePadding - childRightScreen;

      // Ensure child left edge is not cut off if child width itself fits
      if (child.width * zoom <= availW) {
        const childLeftScreen = child.x * zoom + panX;
        if (childLeftScreen < sidePadding) {
          panX = sidePadding - child.x * zoom;
        }
      }

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

