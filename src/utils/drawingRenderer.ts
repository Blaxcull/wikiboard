/**
 * Deterministic pseudo-random number generator for stable sketchy strokes per element.
 */
function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 42;
}

/**
 * Generate a hand-drawn sketchy path for a line segment from (x1, y1) to (x2, y2)
 */
export function generateSketchyLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  roughness = 1,
  seed = 42,
): string {
  if (roughness === 0) {
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  const rand = pseudoRandom(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const maxOffset = (roughness * 1.8);
  const overshoot = roughness * 2.5;

  // Pass 1: slight curve with overshoot
  const sx1 = x1 - (dx / len) * (rand() * overshoot);
  const sy1 = y1 - (dy / len) * (rand() * overshoot);
  const ex1 = x2 + (dx / len) * (rand() * overshoot);
  const ey1 = y2 + (dy / len) * (rand() * overshoot);

  const mid1X = (x1 + x2) / 2 + nx * ((rand() - 0.5) * 2 * maxOffset);
  const mid1Y = (y1 + y2) / 2 + ny * ((rand() - 0.5) * 2 * maxOffset);

  let path = `M ${sx1.toFixed(1)} ${sy1.toFixed(1)} Q ${mid1X.toFixed(1)} ${mid1Y.toFixed(1)} ${ex1.toFixed(1)} ${ey1.toFixed(1)}`;

  // Pass 2 for rougher sketch
  if (roughness >= 1) {
    const sx2 = x1 + (dx / len) * ((rand() - 0.5) * overshoot);
    const sy2 = y1 + (dy / len) * ((rand() - 0.5) * overshoot);
    const ex2 = x2 - (dx / len) * ((rand() - 0.5) * overshoot);
    const ey2 = y2 - (dy / len) * ((rand() - 0.5) * overshoot);

    const mid2X = (x1 + x2) / 2 - nx * ((rand() - 0.5) * 2 * maxOffset * 0.8);
    const mid2Y = (y1 + y2) / 2 - ny * ((rand() - 0.5) * 2 * maxOffset * 0.8);

    path += ` M ${sx2.toFixed(1)} ${sy2.toFixed(1)} Q ${mid2X.toFixed(1)} ${mid2Y.toFixed(1)} ${ex2.toFixed(1)} ${ey2.toFixed(1)}`;
  }

  return path;
}

/**
 * Generate a hand-drawn sketchy path for a rectangle
 */
export function generateSketchyRect(
  x: number,
  y: number,
  w: number,
  h: number,
  roughness = 1,
  roundness = false,
  seed = 42,
): string {
  if (roughness === 0) {
    if (roundness) {
      const r = Math.min(16, w / 4, h / 4);
      return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
    }
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  }

  const s = seed;
  const top = generateSketchyLine(x, y, x + w, y, roughness, s + 1);
  const right = generateSketchyLine(x + w, y, x + w, y + h, roughness, s + 2);
  const bottom = generateSketchyLine(x + w, y + h, x, y + h, roughness, s + 3);
  const left = generateSketchyLine(x, y + h, x, y, roughness, s + 4);

  return `${top} ${right} ${bottom} ${left}`;
}

/**
 * Generate clean clip path for fills
 */
export function getRectPath(x: number, y: number, w: number, h: number, roundness = false): string {
  if (roundness) {
    const r = Math.min(14, w / 4, h / 4);
    return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

/**
 * Generate a hand-drawn sketchy path for an ellipse
 */
export function generateSketchyEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  roughness = 1,
  seed = 42,
): string {
  if (rx <= 0 || ry <= 0) return "";
  if (roughness === 0) {
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  }

  const rand = pseudoRandom(seed);
  const segments = 16;
  let path = "";

  // Draw 2 passes for hand-drawn sketch feel
  const passes = roughness >= 1 ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    const angleOffset = (rand() - 0.5) * 0.3 + p * 0.15;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2 + angleOffset;
      const wobbleR = roughness * (1 + (rand() - 0.5) * 1.5);
      const currRx = rx + wobbleR;
      const currRy = ry + wobbleR;
      pts.push({
        x: cx + Math.cos(angle) * currRx,
        y: cy + Math.sin(angle) * currRy,
      });
    }

    path += ` M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const midX = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2;
      path += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    }
    // slight overlap closure
    path += ` L ${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`;
  }

  return path;
}

export function getEllipsePath(cx: number, cy: number, rx: number, ry: number): string {
  if (rx <= 0 || ry <= 0) return "";
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

/**
 * Generate a hand-drawn diamond path
 */
export function generateSketchyDiamond(
  x: number,
  y: number,
  w: number,
  h: number,
  roughness = 1,
  seed = 42,
): string {
  const topX = x + w / 2;
  const topY = y;
  const rightX = x + w;
  const rightY = y + h / 2;
  const bottomX = x + w / 2;
  const bottomY = y + h;
  const leftX = x;
  const leftY = y + h / 2;

  if (roughness === 0) {
    return `M ${topX} ${topY} L ${rightX} ${rightY} L ${bottomX} ${bottomY} L ${leftX} ${leftY} Z`;
  }

  const s = seed;
  const side1 = generateSketchyLine(topX, topY, rightX, rightY, roughness, s + 1);
  const side2 = generateSketchyLine(rightX, rightY, bottomX, bottomY, roughness, s + 2);
  const side3 = generateSketchyLine(bottomX, bottomY, leftX, leftY, roughness, s + 3);
  const side4 = generateSketchyLine(leftX, leftY, topX, topY, roughness, s + 4);

  return `${side1} ${side2} ${side3} ${side4}`;
}

export function getDiamondPath(x: number, y: number, w: number, h: number): string {
  return `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`;
}

/**
 * Generate sketchy arrow path
 */
export function generateSketchyArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  roughness = 1,
  seed = 42,
): string {
  const shaft = generateSketchyLine(x1, y1, x2, y2, roughness, seed);

  // Arrowhead points
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const arrowLen = Math.min(22, Math.max(12, Math.hypot(dx, dy) * 0.2));
  const barbAngle = Math.PI / 6; // 30 deg

  const leftBarbX = x2 - arrowLen * Math.cos(angle - barbAngle);
  const leftBarbY = y2 - arrowLen * Math.sin(angle - barbAngle);

  const rightBarbX = x2 - arrowLen * Math.cos(angle + barbAngle);
  const rightBarbY = y2 - arrowLen * Math.sin(angle + barbAngle);

  const barb1 = generateSketchyLine(x2, y2, leftBarbX, leftBarbY, roughness, seed + 10);
  const barb2 = generateSketchyLine(x2, y2, rightBarbX, rightBarbY, roughness, seed + 20);

  return `${shaft} ${barb1} ${barb2}`;
}

/**
 * Generate Catmull-Rom or smooth curve for freehand points
 */
export function generateSmoothFreehand(
  points: { x: number; y: number }[],
): string {
  if (!points || points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${xc.toFixed(1)} ${yc.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/**
 * Generate hachure (hand-drawn parallel hatching) lines within a bounding box
 */
export function generateHachureLines(
  minX: number,
  minY: number,
  width: number,
  height: number,
  gap = 10,
  angleDeg = 45,
  roughness = 1,
  seed = 42,
): string {
  const diag = Math.hypot(width, height);
  const cx = minX + width / 2;
  const cy = minY + height / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  let paths = "";
  const count = Math.ceil(diag / gap);
  let curSeed = seed;

  for (let i = -count; i <= count; i++) {
    const offset = i * gap;
    // Line endpoints in rotated space
    const x1 = -diag;
    const y1 = offset;
    const x2 = diag;
    const y2 = offset;

    // Rotate back to world space
    const wx1 = cx + x1 * cos - y1 * sin;
    const wy1 = cy + x1 * sin + y1 * cos;
    const wx2 = cx + x2 * cos - y2 * sin;
    const wy2 = cy + x2 * sin + y2 * cos;

    paths += " " + generateSketchyLine(wx1, wy1, wx2, wy2, roughness, curSeed++);
  }

  return paths;
}

export { stringToSeed };
