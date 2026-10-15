import { memo, useRef, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import startDrag from "../utils/window/drag";
import { getCamera } from "../utils/camera";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

// Generates a smooth Catmull-Rom spline converted to cubic Bezier segments passing cleanly
// through P0 (x1, y1) -> P_mid (midX, midY) -> P2 (x2, y2) without unnatural bulging or sharp corners.
function getArrowCurvePointsAndPath(
  x1: number,
  y1: number,
  midX: number,
  midY: number,
  x2: number,
  y2: number
) {
  const d01 = Math.hypot(midX - x1, midY - y1);
  const d12 = Math.hypot(x2 - midX, y2 - midY);
  const d02 = Math.hypot(x2 - x1, y2 - y1);

  if (d02 < 1e-4) {
    return {
      pathData: `M ${x1} ${y1} L ${x2} ${y2}`,
      bounds: {
        minX: Math.min(x1, x2, midX),
        maxX: Math.max(x1, x2, midX),
        minY: Math.min(y1, y2, midY),
        maxY: Math.max(y1, y2, midY),
      },
    };
  }

  const ux = (x2 - x1) / d02;
  const uy = (y2 - y1) / d02;

  // Tangent magnitude clamped to avoid extreme overshoot on asymmetrical midpoints
  const s1 = Math.min(d02 / 6, d01 / 2);
  const s2 = Math.min(d02 / 6, d12 / 2);

  const c0aX = x1 + (midX - x1) / 3;
  const c0aY = y1 + (midY - y1) / 3;

  const c0bX = midX - ux * s1;
  const c0bY = midY - uy * s1;

  const c1aX = midX + ux * s2;
  const c1aY = midY + uy * s2;

  const c1bX = x2 - (x2 - midX) / 3;
  const c1bY = y2 - (y2 - midY) / 3;

  const pathData = `M ${x1} ${y1} C ${c0aX} ${c0aY}, ${c0bX} ${c0bY}, ${midX} ${midY} C ${c1aX} ${c1aY}, ${c1bX} ${c1bY}, ${x2} ${y2}`;

  let minX = Math.min(x1, midX, x2);
  let maxX = Math.max(x1, midX, x2);
  let minY = Math.min(y1, midY, y2);
  let maxY = Math.max(y1, midY, y2);

  // Sample along cubic segment 1 (P0 -> Mid)
  for (let step = 1; step < 10; step++) {
    const t = step / 10;
    const inv = 1 - t;
    const px =
      inv * inv * inv * x1 +
      3 * inv * inv * t * c0aX +
      3 * inv * t * t * c0bX +
      t * t * t * midX;
    const py =
      inv * inv * inv * y1 +
      3 * inv * inv * t * c0aY +
      3 * inv * t * t * c0bY +
      t * t * t * midY;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  // Sample along cubic segment 2 (Mid -> P2)
  for (let step = 1; step < 10; step++) {
    const t = step / 10;
    const inv = 1 - t;
    const px =
      inv * inv * inv * midX +
      3 * inv * inv * t * c1aX +
      3 * inv * t * t * c1bX +
      t * t * t * x2;
    const py =
      inv * inv * inv * midY +
      3 * inv * inv * t * c1aY +
      3 * inv * t * t * c1bY +
      t * t * t * y2;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  return {
    pathData,
    bounds: { minX, maxX, minY, maxY },
  };
}

const CanvasShapeItem = memo(function CanvasShapeItem({
  win,
  onActivate,
  onPositionChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingPoint, setIsDraggingPoint] = useState(false);
  const selectedIds = useWindows((s) => s.selectedIds);
  const updateWindow = useWindows((s) => s.updateWindow);
  const isSelected = selectedIds.includes(win.id);
  const isFocusedOrActive = win.active || isSelected;

  const width = Math.max(20, win.width ?? 120);
  const height = Math.max(20, win.height ?? 120);
  const shapeType = win.shapeType ?? "rectangle";
  const strokeColor = win.strokeColor ?? "#64748b";
  const fillColor =
    !win.fillColor || win.fillColor === "rgba(100, 116, 139, 0.08)"
      ? "transparent"
      : win.fillColor;
  const strokeWidth = win.strokeWidth ?? 2.5;

  const isLineOrArrow = shapeType === "line" || shapeType === "arrow";

  // Coordinates for line/arrow:
  const [x1, y1, x2, y2] = win.shapePoints ?? [
    strokeWidth,
    height / 2,
    width - strokeWidth,
    height / 2,
  ];

  let midX: number;
  let midY: number;

  if (win.midPoint) {
    midX = win.midPoint[0];
    midY = win.midPoint[1];
  } else if (win.curveOffset && win.curveOffset !== 0) {
    const midT = win.midT ?? 0.5;
    const baseMidX = (1 - midT) * x1 + midT * x2;
    const baseMidY = (1 - midT) * y1 + midT * y2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    midX = Math.round(baseMidX + nx * win.curveOffset);
    midY = Math.round(baseMidY + ny * win.curveOffset);
  } else {
    midX = Math.round((x1 + x2) / 2);
    midY = Math.round((y1 + y2) / 2);
  }

  // For arrow, render a smooth continuous Catmull-Rom curve passing cleanly through (midX, midY) without bulging or a pointy corner.
  // For standard line, keep two straight segments joined at the middle vertex (P1 -> Mid -> P2).
  let pathData: string;
  let containerX = 0;
  let containerY = 0;
  let containerW = width;
  let containerH = height;

  if (shapeType === "arrow") {
    const curve = getArrowCurvePointsAndPath(x1, y1, midX, midY, x2, y2);
    pathData = curve.pathData;
    containerX = curve.bounds.minX;
    containerY = curve.bounds.minY;
    containerW = Math.max(2, curve.bounds.maxX - curve.bounds.minX);
    containerH = Math.max(2, curve.bounds.maxY - curve.bounds.minY);
  } else if (shapeType === "line") {
    pathData = `M ${x1} ${y1} L ${midX} ${midY} L ${x2} ${y2}`;
    const minBx = Math.min(x1, x2, midX);
    const maxBx = Math.max(x1, x2, midX);
    const minBy = Math.min(y1, y2, midY);
    const maxBy = Math.max(y1, y2, midY);

    containerX = minBx;
    containerY = minBy;
    containerW = Math.max(2, maxBx - minBx);
    containerH = Math.max(2, maxBy - minBy);
  } else {
    pathData = "";
  }
  const svgViewBox = isLineOrArrow
    ? `${containerX} ${containerY} ${containerW} ${containerH}`
    : `0 0 ${width} ${height}`;

  const handleMouseDown = (e: React.MouseEvent<HTMLElement | SVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".shape-resize-handle, .line-control-dot, .line-corner-handle")) return;

    e.stopPropagation();
    onActivate();
    useWindows.getState().setSelectedIds([win.id]);
    startDrag(e, (pos) => onPositionChange(pos), onActivate);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startW = width;
    const startH = height;
    const startWinX = win.x ?? 80;
    const startWinY = win.y ?? 80;
    const rot = win.rotation ?? 0;
    const posRad = (rot * Math.PI) / 180;
    const pCos = Math.cos(posRad);
    const pSin = Math.sin(posRad);
    const negRad = -(rot * Math.PI) / 180;
    const nCos = Math.cos(negRad);
    const nSin = Math.sin(negRad);

    const camZoom = getCamera().zoom || 1;

    let rafId = 0;
    let latestClientX = startClientX;
    let latestClientY = startClientY;

    function onMouseMove(ev: MouseEvent) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const ddx = (latestClientX - startClientX) / camZoom;
        const ddy = (latestClientY - startClientY) / camZoom;
        const localDdx = ddx * nCos - ddy * nSin;
        const localDdy = ddx * nSin + ddy * nCos;

        const newW = Math.max(20, Math.round(startW + localDdx));
        const newH = Math.max(20, Math.round(startH + localDdy));

        if (rot === 0) {
          updateWindow(win.id, { width: newW, height: newH, isUserResized: true });
        } else {
          // Keep top-left corner fixed in world space:
          const centerWx = startWinX + startW / 2;
          const centerWy = startWinY + startH / 2;
          const tlWx = centerWx + (-startW / 2) * pCos - (-startH / 2) * pSin;
          const tlWy = centerWy + (-startW / 2) * pSin + (-startH / 2) * pCos;

          const newCenterWx = tlWx + (newW / 2) * pCos - (newH / 2) * pSin;
          const newCenterWy = tlWy + (newW / 2) * pSin + (newH / 2) * pCos;

          updateWindow(win.id, {
            x: Math.round(newCenterWx - newW / 2),
            y: Math.round(newCenterWy - newH / 2),
            width: newW,
            height: newH,
            isUserResized: true,
          });
        }
      });
    }

    function onMouseUp() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Helper: map local box coordinate (lx, ly) to world coordinate considering win.x, win.y, dimensions, and rotation
  const getPointInWorld = (lx: number, ly: number, winX: number, winY: number, w: number, h: number, rotDeg: number) => {
    const theta = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const centerWx = winX + w / 2;
    const centerWy = winY + h / 2;
    const dlx = lx - w / 2;
    const dly = ly - h / 2;
    return {
      x: centerWx + dlx * cos - dly * sin,
      y: centerWy + dlx * sin + dly * cos,
    };
  };

  // Helper: compute new window bounds and local points when world points change, preserving world positions of static points
  const computeRotatedPointsUpdate = (
    w1: { x: number; y: number },
    wmid: { x: number; y: number },
    w2: { x: number; y: number },
    rotDeg: number,
  ) => {
    const theta = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Unrotate world points by -theta:
    const u1x = w1.x * cos + w1.y * sin;
    const u1y = -w1.x * sin + w1.y * cos;

    const umidx = wmid.x * cos + wmid.y * sin;
    const umidy = -wmid.x * sin + wmid.y * cos;

    const u2x = w2.x * cos + w2.y * sin;
    const u2y = -w2.x * sin + w2.y * cos;

    let minUx: number;
    let maxUx: number;
    let minUy: number;
    let maxUy: number;

    if (shapeType === "arrow") {
      const { bounds } = getArrowCurvePointsAndPath(u1x, u1y, umidx, umidy, u2x, u2y);
      minUx = bounds.minX;
      maxUx = bounds.maxX;
      minUy = bounds.minY;
      maxUy = bounds.maxY;
    } else {
      minUx = Math.min(u1x, umidx, u2x);
      maxUx = Math.max(u1x, umidx, u2x);
      minUy = Math.min(u1y, umidy, u2y);
      maxUy = Math.max(u1y, umidy, u2y);
    }

    const newW = Math.max(2, maxUx - minUx);
    const newH = Math.max(2, maxUy - minUy);

    // Center of box in unrotated frame:
    const centerUx = (minUx + maxUx) / 2;
    const centerUy = (minUy + maxUy) / 2;

    // Center of box in world frame: R(theta) * centerU
    const centerWx = centerUx * cos - centerUy * sin;
    const centerWy = centerUx * sin + centerUy * cos;

    const newWinX = Math.round(centerWx - newW / 2);
    const newWinY = Math.round(centerWy - newH / 2);

    const localX1 = Math.round(u1x - minUx);
    const localY1 = Math.round(u1y - minUy);
    const localMidX = Math.round(umidx - minUx);
    const localMidY = Math.round(umidy - minUy);
    const localX2 = Math.round(u2x - minUx);
    const localY2 = Math.round(u2y - minUy);

    return {
      x: newWinX,
      y: newWinY,
      width: Math.round(newW),
      height: Math.round(newH),
      shapePoints: [localX1, localY1, localX2, localY2] as [number, number, number, number],
      midPoint: [localMidX, localMidY] as [number, number],
    };
  };

  // Endpoint 1 (Start) drag:
  // Moves endpoint 1 freely anywhere in world space with NO restrictions.
  // The other 2 points (middle vertex, endpoint 2) stay 100% frozen in world space!
  const handleStartPointDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();
    setIsDraggingPoint(true);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWinX = win.x ?? 80;
    const startWinY = win.y ?? 80;
    const rot = win.rotation ?? 0;

    const startW1 = getPointInWorld(x1, y1, startWinX, startWinY, containerW, containerH, rot);
    const fixedWmid = getPointInWorld(midX, midY, startWinX, startWinY, containerW, containerH, rot);
    const fixedW2 = getPointInWorld(x2, y2, startWinX, startWinY, containerW, containerH, rot);

    const camZoom = getCamera().zoom || 1;
    let rafId = 0;
    let latestClientX = startClientX;
    let latestClientY = startClientY;

    function onMouseMove(ev: MouseEvent) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const ddx = (latestClientX - startClientX) / camZoom;
        const ddy = (latestClientY - startClientY) / camZoom;

        // Point 1 moves freely with mouse, other 2 points are strictly fixed in world space:
        const curW1 = { x: startW1.x + ddx, y: startW1.y + ddy };

        const update = computeRotatedPointsUpdate(curW1, fixedWmid, fixedW2, rot);
        updateWindow(win.id, update);
      });
    }

    function onMouseUp() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setIsDraggingPoint(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Endpoint 2 (End) drag:
  // Moves endpoint 2 freely anywhere in world space with NO restrictions.
  // The other 2 points (endpoint 1, middle vertex) stay 100% frozen in world space!
  const handleEndPointDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();
    setIsDraggingPoint(true);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWinX = win.x ?? 80;
    const startWinY = win.y ?? 80;
    const rot = win.rotation ?? 0;

    const fixedW1 = getPointInWorld(x1, y1, startWinX, startWinY, containerW, containerH, rot);
    const fixedWmid = getPointInWorld(midX, midY, startWinX, startWinY, containerW, containerH, rot);
    const startW2 = getPointInWorld(x2, y2, startWinX, startWinY, containerW, containerH, rot);

    const camZoom = getCamera().zoom || 1;
    let rafId = 0;
    let latestClientX = startClientX;
    let latestClientY = startClientY;

    function onMouseMove(ev: MouseEvent) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const ddx = (latestClientX - startClientX) / camZoom;
        const ddy = (latestClientY - startClientY) / camZoom;

        // Point 2 moves freely with mouse, other 2 points are strictly fixed in world space:
        const curW2 = { x: startW2.x + ddx, y: startW2.y + ddy };

        const update = computeRotatedPointsUpdate(fixedW1, fixedWmid, curW2, rot);
        updateWindow(win.id, update);
      });
    }

    function onMouseUp() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setIsDraggingPoint(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Middle vertex drag:
  // Moves middle vertex freely anywhere in world space with NO restrictions.
  // The other 2 points (endpoint 1, endpoint 2) stay 100% frozen in world space!
  const handleMiddleCurveDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();
    setIsDraggingPoint(true);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWinX = win.x ?? 80;
    const startWinY = win.y ?? 80;
    const rot = win.rotation ?? 0;

    const fixedW1 = getPointInWorld(x1, y1, startWinX, startWinY, containerW, containerH, rot);
    const startWmid = getPointInWorld(midX, midY, startWinX, startWinY, containerW, containerH, rot);
    const fixedW2 = getPointInWorld(x2, y2, startWinX, startWinY, containerW, containerH, rot);

    const camZoom = getCamera().zoom || 1;
    let rafId = 0;
    let latestClientX = startClientX;
    let latestClientY = startClientY;

    function onMouseMove(ev: MouseEvent) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const ddx = (latestClientX - startClientX) / camZoom;
        const ddy = (latestClientY - startClientY) / camZoom;

        // Middle point moves freely with mouse, other 2 points are strictly fixed in world space:
        const curWmid = { x: startWmid.x + ddx, y: startWmid.y + ddy };

        const update = computeRotatedPointsUpdate(fixedW1, curWmid, fixedW2, rot);
        updateWindow(win.id, update);
      });
    }

    function onMouseUp() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setIsDraggingPoint(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Full line/arrow scaling via 4 corner handles of outer box
  const handleLineScaleStart = (
    e: React.MouseEvent,
    corner: "nw" | "ne" | "sw" | "se"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWinX = win.x ?? 80;
    const startWinY = win.y ?? 80;
    const startX1 = x1;
    const startY1 = y1;
    const startMidX = midX;
    const startMidY = midY;
    const startX2 = x2;
    const startY2 = y2;
    const startW = containerW;
    const startH = containerH;
    const baseW = Math.max(10, startW);
    const baseH = Math.max(10, startH);

    const rot = win.rotation ?? 0;
    const rad = -(rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const posRad = (rot * Math.PI) / 180;
    const pCos = Math.cos(posRad);
    const pSin = Math.sin(posRad);

    const camZoom = getCamera().zoom || 1;

    let anchorX: number;
    let anchorY: number;
    let startAnchorRelX: number;
    let startAnchorRelY: number;

    if (corner === "se") {
      anchorX = containerX;
      anchorY = containerY;
      startAnchorRelX = -startW / 2;
      startAnchorRelY = -startH / 2;
      document.body.style.cursor = "se-resize";
    } else if (corner === "sw") {
      anchorX = containerX + startW;
      anchorY = containerY;
      startAnchorRelX = startW / 2;
      startAnchorRelY = -startH / 2;
      document.body.style.cursor = "sw-resize";
    } else if (corner === "ne") {
      anchorX = containerX;
      anchorY = containerY + startH;
      startAnchorRelX = -startW / 2;
      startAnchorRelY = startH / 2;
      document.body.style.cursor = "ne-resize";
    } else {
      // "nw"
      anchorX = containerX + startW;
      anchorY = containerY + startH;
      startAnchorRelX = startW / 2;
      startAnchorRelY = startH / 2;
      document.body.style.cursor = "nw-resize";
    }

    const startCenterWx = startWinX + startW / 2;
    const startCenterWy = startWinY + startH / 2;
    const anchorWx = startCenterWx + startAnchorRelX * pCos - startAnchorRelY * pSin;
    const anchorWy = startCenterWy + startAnchorRelX * pSin + startAnchorRelY * pCos;

    let rafId = 0;
    let latestClientX = startClientX;
    let latestClientY = startClientY;

    function onMouseMove(ev: MouseEvent) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const ddx = (latestClientX - startClientX) / camZoom;
        const ddy = (latestClientY - startClientY) / camZoom;
        const localDdx = ddx * cos - ddy * sin;
        const localDdy = ddx * sin + ddy * cos;

        let deltaW: number;
        let deltaH: number;

        if (corner === "se") {
          deltaW = localDdx;
          deltaH = localDdy;
        } else if (corner === "sw") {
          deltaW = -localDdx;
          deltaH = localDdy;
        } else if (corner === "ne") {
          deltaW = localDdx;
          deltaH = -localDdy;
        } else {
          // "nw"
          deltaW = -localDdx;
          deltaH = -localDdy;
        }

        const scaleX = Math.max(0.1, (baseW + deltaW) / baseW);
        const scaleY = Math.max(0.1, (baseH + deltaH) / baseH);

        const newX1 = Math.round(anchorX + (startX1 - anchorX) * scaleX);
        const newY1 = Math.round(anchorY + (startY1 - anchorY) * scaleY);
        const newMidX = Math.round(anchorX + (startMidX - anchorX) * scaleX);
        const newMidY = Math.round(anchorY + (startMidY - anchorY) * scaleY);
        const newX2 = Math.round(anchorX + (startX2 - anchorX) * scaleX);
        const newY2 = Math.round(anchorY + (startY2 - anchorY) * scaleY);

        let minX: number;
        let minY: number;
        let maxX: number;
        let maxY: number;

        if (shapeType === "arrow") {
          const { bounds } = getArrowCurvePointsAndPath(newX1, newY1, newMidX, newMidY, newX2, newY2);
          minX = bounds.minX;
          maxX = bounds.maxX;
          minY = bounds.minY;
          maxY = bounds.maxY;
        } else {
          minX = Math.min(newX1, newMidX, newX2);
          minY = Math.min(newY1, newMidY, newY2);
          maxX = Math.max(newX1, newMidX, newX2);
          maxY = Math.max(newY1, newMidY, newY2);
        }

        const newW = Math.max(2, Math.round(maxX - minX));
        const newH = Math.max(2, Math.round(maxY - minY));

        const newAnchorLx = anchorX - minX;
        const newAnchorLy = anchorY - minY;
        const newAnchorRelX = newAnchorLx - newW / 2;
        const newAnchorRelY = newAnchorLy - newH / 2;

        const newCenterWx = anchorWx - (newAnchorRelX * pCos - newAnchorRelY * pSin);
        const newCenterWy = anchorWy - (newAnchorRelX * pSin + newAnchorRelY * pCos);

        updateWindow(win.id, {
          x: Math.round(newCenterWx - newW / 2),
          y: Math.round(newCenterWy - newH / 2),
          width: newW,
          height: newH,
          shapePoints: [
            Math.round(newX1 - minX),
            Math.round(newY1 - minY),
            Math.round(newX2 - minX),
            Math.round(newY2 - minY),
          ],
          midPoint: [
            Math.round(newMidX - minX),
            Math.round(newMidY - minY),
          ],
        });
      });
    }

    function onMouseUp() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Full shape/line rotation via top rotation handle
  const handleRotateStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWinX = win.x ?? 80;
    const startWinY = win.y ?? 80;

    // Center of rotation in world coordinates:
    const centerX = startWinX + containerW / 2;
    const centerY = startWinY + containerH / 2;

    const cam = getCamera();
    const camZoom = cam.zoom || 1;
    const startWorldMouseX = (startClientX - cam.panX) / camZoom;
    const startWorldMouseY = (startClientY - cam.panY) / camZoom;
    const startAngle = Math.atan2(startWorldMouseY - centerY, startWorldMouseX - centerX);
    const startRotation = win.rotation ?? 0;

    document.body.style.cursor = "grabbing";

    let rafId = 0;
    let latestClientX = startClientX;
    let latestClientY = startClientY;

    function onMouseMove(ev: MouseEvent) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const curCam = getCamera();
        const curZoom = curCam.zoom || 1;
        const curWorldMouseX = (latestClientX - curCam.panX) / curZoom;
        const curWorldMouseY = (latestClientY - curCam.panY) / curZoom;
        const curAngle = Math.atan2(curWorldMouseY - centerY, curWorldMouseX - centerX);
        const deltaAngle = curAngle - startAngle;
        const deltaDeg = (deltaAngle * 180) / Math.PI;

        const newRotation = Math.round((startRotation + deltaDeg) % 360);

        updateWindow(win.id, {
          rotation: newRotation,
        });
      });
    }

    function onMouseUp() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const rotation = win.rotation ?? 0;

  return (
    <div
      ref={containerRef}
      className={`group relative select-none transition-shadow ${
        isLineOrArrow ? "pointer-events-none" : ""
      }`}
      style={{
        width: `${containerW}px`,
        height: `${containerH}px`,
        cursor: isLineOrArrow ? undefined : "move",
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center center",
      }}
      onMouseDown={isLineOrArrow ? undefined : handleMouseDown}
    >
      <svg
        width={containerW}
        height={containerH}
        viewBox={svgViewBox}
        className="overflow-visible block w-full h-full pointer-events-none"
      >
        <defs>
          <marker
            id={`arrowhead-${win.id}`}
            markerUnits="userSpaceOnUse"
            markerWidth={42}
            markerHeight={36}
            refX={38}
            refY={18}
            orient="auto"
          >
            <path
              d="M 4 4 L 38 18 L 4 32"
              fill="none"
              stroke={strokeColor}
              strokeWidth={Math.max(1.5, Math.min(2.2, strokeWidth * 0.8))}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>

        {shapeType === "rectangle" && (
          <>
            {isFocusedOrActive && (
              <rect
                x={strokeWidth / 2 - 2.5}
                y={strokeWidth / 2 - 2.5}
                width={Math.max(0, width - strokeWidth + 5)}
                height={Math.max(0, height - strokeWidth + 5)}
                rx={8 + 2.5}
                fill="none"
                stroke="rgb(148 163 184 / 0.8)"
                strokeWidth={1.8}
              />
            )}
            <rect
              x={strokeWidth / 2}
              y={strokeWidth / 2}
              width={Math.max(0, width - strokeWidth)}
              height={Math.max(0, height - strokeWidth)}
              rx={8}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          </>
        )}

        {shapeType === "circle" && (
          <>
            {isFocusedOrActive && (
              <ellipse
                cx={width / 2}
                cy={height / 2}
                rx={Math.max(0, (width - strokeWidth) / 2 + 2.5)}
                ry={Math.max(0, (height - strokeWidth) / 2 + 2.5)}
                fill="none"
                stroke="rgb(148 163 184 / 0.8)"
                strokeWidth={1.8}
              />
            )}
            <ellipse
              cx={width / 2}
              cy={height / 2}
              rx={Math.max(0, (width - strokeWidth) / 2)}
              ry={Math.max(0, (height - strokeWidth) / 2)}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          </>
        )}

        {shapeType === "diamond" && (
          <>
            {isFocusedOrActive && (
              <polygon
                points={`${width / 2},${strokeWidth / 2 - 2.5} ${width - strokeWidth / 2 + 2.5},${height / 2} ${width / 2},${height - strokeWidth / 2 + 2.5} ${strokeWidth / 2 - 2.5},${height / 2}`}
                fill="none"
                stroke="rgb(148 163 184 / 0.8)"
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
            )}
            <polygon
              points={`${width / 2},${strokeWidth / 2} ${width - strokeWidth / 2},${height / 2} ${width / 2},${height - strokeWidth / 2} ${strokeWidth / 2},${height / 2}`}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
          </>
        )}

        {isLineOrArrow && (
          <>
            {/* Transparent thick stroke for easy grabbing and moving of the line */}
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(24, strokeWidth + 18)}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "stroke", cursor: "move" }}
              onMouseDown={handleMouseDown}
            />
            {/* Visible line or arrow */}
            <path
              d={pathData}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "stroke", cursor: "move" }}
              onMouseDown={handleMouseDown}
              markerEnd={shapeType === "arrow" ? `url(#arrowhead-${win.id})` : undefined}
            />
          </>
        )}
      </svg>

      {/* Rotation & Resize Handles for 2D shapes (rectangle, circle, diamond) */}
      {isFocusedOrActive && !isLineOrArrow && (
        <>
          {/* Top rotation circle */}
          <div
            className="absolute -top-5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-slate-500 bg-white hover:bg-slate-500/20 pointer-events-auto cursor-grab active:cursor-grabbing shadow-sm transition-transform hover:scale-125 z-20"
            onMouseDown={handleRotateStart}
            title="Drag to rotate shape"
          />

          {/* Resize Handle at bottom right */}
          <div
            className="shape-resize-handle absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-white border-2 border-slate-500 rounded-sm cursor-se-resize z-20 shadow-sm"
            onMouseDown={handleResizeStart}
            title="Drag to resize shape"
          />
        </>
      )}

      {/* 3 Interactive Control Dots and Bounding Box for Line and Arrow */}
      {isFocusedOrActive && isLineOrArrow && (
        <>
          {/* Outer Bounding Box covering line/arrow (hidden when moving any point) */}
          {!isDraggingPoint && (
            <div
              className="absolute inset-0 pointer-events-none z-10 border border-[#6366f1]"
            >
              {/* Top rotation circle */}
              <div
                className="absolute -top-5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[#6366f1] bg-white hover:bg-[#6366f1]/20 pointer-events-auto cursor-grab active:cursor-grabbing shadow-sm transition-transform hover:scale-125"
                onMouseDown={handleRotateStart}
                title="Drag to rotate line"
              />
              {/* 4 Corner handles */}
              <div
                className="line-corner-handle absolute -top-1 -left-1 w-2.5 h-2.5 rounded-[2px] border border-[#6366f1] bg-white pointer-events-auto cursor-nw-resize shadow-sm hover:scale-125 transition-transform"
                onMouseDown={(e) => handleLineScaleStart(e, "nw")}
                title="Drag to resize line"
              />
              <div
                className="line-corner-handle absolute -top-1 -right-1 w-2.5 h-2.5 rounded-[2px] border border-[#6366f1] bg-white pointer-events-auto cursor-ne-resize shadow-sm hover:scale-125 transition-transform"
                onMouseDown={(e) => handleLineScaleStart(e, "ne")}
                title="Drag to resize line"
              />
              <div
                className="line-corner-handle absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-[2px] border border-[#6366f1] bg-white pointer-events-auto cursor-sw-resize shadow-sm hover:scale-125 transition-transform"
                onMouseDown={(e) => handleLineScaleStart(e, "sw")}
                title="Drag to resize line"
              />
              <div
                className="line-corner-handle absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-[2px] border border-[#6366f1] bg-white pointer-events-auto cursor-se-resize shadow-sm hover:scale-125 transition-transform"
                onMouseDown={(e) => handleLineScaleStart(e, "se")}
                title="Drag to resize line"
              />
            </div>
          )}

          {/* 1. Start Endpoint Dot */}
          <div
            className="line-control-dot pointer-events-auto absolute w-3 h-3 -ml-[6px] -mt-[6px] rounded-full bg-white/95 border-2 border-[#6366f1] shadow-sm cursor-grab active:cursor-grabbing z-30 transition-transform hover:scale-125"
            style={{ left: `${x1 - containerX}px`, top: `${y1 - containerY}px` }}
            onMouseDown={handleStartPointDrag}
            title="Drag start point"
          />

          {/* 2. Middle Vertex Dot */}
          <div
            className="line-control-dot pointer-events-auto absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full bg-[#6366f1]/80 hover:bg-[#6366f1] border-2 border-[#4338ca] shadow-sm cursor-grab active:cursor-grabbing z-30 transition-transform hover:scale-125"
            style={{ left: `${midX - containerX}px`, top: `${midY - containerY}px` }}
            onMouseDown={handleMiddleCurveDrag}
            title="Drag middle point"
          />

          {/* 3. End Endpoint Dot */}
          <div
            className="line-control-dot pointer-events-auto absolute w-3 h-3 -ml-[6px] -mt-[6px] rounded-full bg-white/95 border-2 border-[#6366f1] shadow-sm cursor-grab active:cursor-grabbing z-30 transition-transform hover:scale-125"
            style={{ left: `${x2 - containerX}px`, top: `${y2 - containerY}px` }}
            onMouseDown={handleEndPointDrag}
            title="Drag end point"
          />
        </>
      )}
    </div>
  );
});

export default CanvasShapeItem;
