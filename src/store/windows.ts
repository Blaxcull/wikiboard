import { create } from "zustand";
import { screenToWorld } from "../utils/camera";
import { focusWindowAndParent } from "../utils/canvas/zoom";

export type WindowLink = {
  label: string;
  href: string;
};

export type WindowData = {
  id: string;
  url: string;
  title: string;
  links: WindowLink[];
  active: boolean;
  /** Recency timestamp driving the "keep last N loaded" LRU policy */
  lastFocusedAt: number;
  /** ID of the parent window that spawned this one via link click */
  parentId?: string;
  /** IDs of all parent windows connected to this window */
  parentIds?: string[];
  /** href of the link in the parent window that spawned this child window */
  sourceHref?: string;
  /** Pre-extracted image src for File: pages — skips the fetchFileUrl API call */
  directImageUrl?: string;
  /** Content type discriminator: "article" (default), "pdf", or "sticky" */
  contentType?: "article" | "pdf" | "sticky";
  /** Text stored in a sticky note window */
  stickyText?: string;
  /** Custom background color for sticky note */
  noteColor?: string;
  /** True for non-editable, extra-rounded highlight excerpt note boxes */
  isExcerptNote?: boolean;
  /** Preferred attachment side when spawned from a parent window connection point */
  side?: "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
  /** URL or blob URL for PDF file */
  pdfUrl?: string;
  /** Current page number (1-indexed) */
  pdfCurrentPage?: number;
  /** Total pages in PDF */
  pdfTotalPages?: number;
  /** Whether the PDF viewer is in maximized (full-viewport) mode */
  pdfMaximized?: boolean;
  /** True while the maximize/minimize animation is running */
  pdfAnimating?: boolean;
  alwaysOnTop?: boolean;
  stacked?: boolean;
  relX?: number;
  relY?: number;
  zIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type WindowsStore = {
  windows: WindowData[];
  maxZIndex: number;
  addWindow: (data?: Partial<WindowData>) => void;
  removeWindow: (id: string) => void;
  setActive: (id: string) => void;
  updateWindow: (id: string, patch: Partial<Omit<WindowData, "id">>) => void;
  spawnWindows: (count: number, startIdx: number, titles?: string[]) => void;
  breakConnections: (id: string) => void;
  toggleAlwaysOnTop: (id: string) => void;
  toggleStackWindow: (id: string) => void;
  unstackNote: (id: string) => void;
};

export const DEFAULT_WIDTH = 750;
export const DEFAULT_HEIGHT = 550;

let windowCount = 0;
const CASCADE_STEP = 5;
const CASCADE_WRAP = 500;

/** Increasing offset so overlapping windows cascade diagonally */
export function nextCascadeOffset(): number {
  return (windowCount++ * CASCADE_STEP) % CASCADE_WRAP;
}

export function findNonOverlappingPosition(
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  existingWindows: WindowData[],
  ignoreId?: string,
): { x: number; y: number } {
  const visibleWindows = existingWindows.filter(
    (w) => w.id !== ignoreId && !w.stacked && !w.pdfMaximized
  );

  const MARGIN = 24;

  const isOverlapping = (x: number, y: number): boolean => {
    for (const w of visibleWindows) {
      const wx = w.x ?? 0;
      const wy = w.y ?? 0;
      const ww = w.width ?? DEFAULT_WIDTH;
      const wh = w.height ?? DEFAULT_HEIGHT;

      if (
        x < wx + ww + MARGIN &&
        x + width + MARGIN > wx &&
        y < wy + wh + MARGIN &&
        y + height + MARGIN > wy
      ) {
        return true;
      }
    }
    return false;
  };

  if (!isOverlapping(targetX, targetY)) {
    return { x: targetX, y: targetY };
  }

  const STEP = 50;
  for (let radius = 1; radius <= 40; radius++) {
    const dist = radius * STEP;
    const candidates = [
      { x: targetX + dist, y: targetY },
      { x: targetX, y: targetY + dist },
      { x: targetX - dist, y: targetY },
      { x: targetX, y: targetY - dist },
      { x: targetX + dist, y: targetY + dist },
      { x: targetX - dist, y: targetY + dist },
      { x: targetX + dist, y: targetY - dist },
      { x: targetX - dist, y: targetY - dist },
    ];

    for (const cand of candidates) {
      if (!isOverlapping(cand.x, cand.y)) {
        return cand;
      }
    }
  }

  return { x: targetX, y: targetY };
}

export function getDescendantNotes(
  rootId: string,
  windows: WindowData[]
): WindowData[] {
  const result: WindowData[] = [];
  const parentSet = new Set<string>([rootId]);

  let added = true;
  while (added) {
    added = false;
    for (const w of windows) {
      if (w.contentType !== "sticky") continue;
      if (result.some((r) => r.id === w.id)) continue;

      const pId = w.parentId;
      const pIds = w.parentIds;
      const belongs =
        (pId && parentSet.has(pId)) ||
        pIds?.some((id) => parentSet.has(id));

      if (belongs) {
        result.push(w);
        parentSet.add(w.id);
        added = true;
      }
    }
  }

  return result;
}

export function findRootWindow(
  id: string,
  windows: WindowData[]
): WindowData | undefined {
  const current = windows.find((w) => w.id === id);
  if (!current) return undefined;

  let currParentId = current.parentId ?? current.parentIds?.[0];
  const visited = new Set<string>([id]);
  let root: WindowData | undefined = undefined;

  while (currParentId && !visited.has(currParentId)) {
    visited.add(currParentId);
    const parentWin = windows.find((w) => w.id === currParentId);
    if (!parentWin) break;
    root = parentWin;
    if (parentWin.contentType !== "sticky") {
      return parentWin;
    }
    currParentId = parentWin.parentId ?? parentWin.parentIds?.[0];
  }

  return root;
}

export const useWindows = create<WindowsStore>((set) => ({
  windows: [],
  maxZIndex: 0,

  addWindow: (data) =>
    set((state) => {
      const nextZIndex = state.maxZIndex + 1;
      const center = screenToWorld(
        (typeof window !== "undefined" ? window.innerWidth : 800) / 2,
        (typeof window !== "undefined" ? window.innerHeight : 600) / 2,
      );
      const offset = nextCascadeOffset();
      const activeIdx = state.windows.findIndex((w) => w.active);

      const isSticky = data?.contentType === "sticky";
      const childW = data?.width ?? (isSticky ? 260 : DEFAULT_WIDTH);
      const childH = data?.height ?? (isSticky ? (data?.isExcerptNote ? 64 : 200) : DEFAULT_HEIGHT);
      let posX: number;
      let posY: number;
      let parentWindow: WindowData | undefined;

      if (data?.parentId && data?.x == null && data?.y == null) {
        parentWindow = state.windows.find((w) => w.id === data.parentId);
        if (parentWindow) {
          const parentEl = typeof document !== "undefined" ? document.getElementById(`win-${parentWindow.id}`) : null;
          let px = parentWindow.x ?? 0;
          let py = parentWindow.y ?? 0;
          let pw = parentWindow.width ?? DEFAULT_WIDTH;
          let ph = parentWindow.height ?? DEFAULT_HEIGHT;
          if (parentEl) {
            const styleLeft = parseFloat(parentEl.style.left) || parentEl.offsetLeft || px;
            const styleTop = parseFloat(parentEl.style.top) || parentEl.offsetTop || py;
            const t = parentEl.style.transform;
            let tx = 0, ty = 0;
            if (t) {
              const mx = t.match(/translate3d\(([-\d.]+)px/);
              const my = t.match(/translate3d\([-\d.]+px,\s*([-\d.]+)px/);
              if (mx) tx = parseFloat(mx[1]) || 0;
              if (my) ty = parseFloat(my[1]) || 0;
            }
            px = styleLeft + tx;
            py = styleTop + ty;
            pw = parentEl.offsetWidth || pw;
            ph = parentEl.offsetHeight || ph;
          }
          const GAP = 160;
          const side = data.side ?? "RIGHT";
          const existingChildrenOnSide = state.windows.filter(
            (w) => w.parentId === data.parentId && (w.side ?? "RIGHT") === side,
          );
          const childIdx = existingChildrenOnSide.length;

          if (side === "LEFT") {
            posX = px - childW - GAP;
            posY = py + (ph - childH) / 2 + childIdx * 30;
          } else if (side === "TOP") {
            posX = px + (pw - childW) / 2 + childIdx * 30;
            posY = py - childH - GAP;
          } else if (side === "BOTTOM") {
            posX = px + (pw - childW) / 2 + childIdx * 30;
            posY = py + ph + GAP;
          } else {
            // RIGHT
            posX = px + pw + GAP;
            posY = py + (ph - childH) / 2 + childIdx * 30;
          }
        } else {
          posX = center.x - DEFAULT_WIDTH / 2 + offset;
          posY = center.y - DEFAULT_HEIGHT / 2 + offset;
        }
      } else {
        posX = data?.x ?? (center.x - DEFAULT_WIDTH / 2 + offset);
        posY = data?.y ?? (center.y - DEFAULT_HEIGHT / 2 + offset);
      }

      if (data?.x == null || data?.y == null) {
        const cleanPos = findNonOverlappingPosition(
          posX,
          posY,
          childW,
          childH,
          state.windows
        );
        posX = cleanPos.x;
        posY = cleanPos.y;
      }

      let relX = data?.relX;
      let relY = data?.relY;
      if (parentWindow && relX == null && relY == null) {
        relX = posX - (parentWindow.x ?? 0);
        relY = posY - (parentWindow.y ?? 0);
      }

      if (!state.windows.some((w) => w.pdfMaximized)) {
        const childRect = { x: posX, y: posY, width: childW, height: childH };
        const parentRect = parentWindow
          ? {
              x: parentWindow.x ?? 0,
              y: parentWindow.y ?? 0,
              width: parentWindow.width ?? DEFAULT_WIDTH,
              height: parentWindow.height ?? DEFAULT_HEIGHT,
            }
          : undefined;

        requestAnimationFrame(() => {
          focusWindowAndParent(childRect, parentRect);
        });
      }

      return {
        maxZIndex: nextZIndex,
        windows: [
          ...state.windows.map((w, i) =>
            i === activeIdx ? { ...w, active: false } : w,
          ),
          {
            id: data?.id ?? crypto.randomUUID(),
            url: "",
            title: `Window ${windowCount}`,
            links: [],
            active: true,
            lastFocusedAt: Date.now(),
            zIndex: nextZIndex,
            x: posX,
            y: posY,
            width: childW,
            height: childH,
            parentIds: data?.parentIds ?? (data?.parentId ? [data.parentId] : []),
            ...data,
            relX: data?.relX ?? relX,
            relY: data?.relY ?? relY,
          },
        ],
      };
    }),

  removeWindow: (id) =>
    set((state) => {
      const closingWin = state.windows.find((w) => w.id === id);
      if (closingWin?.parentId && closingWin?.sourceHref) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("wikiboard:link-closed", {
              detail: { parentId: closingWin.parentId, href: closingWin.sourceHref, closingId: id },
            })
          );
        }
      }
      return {
        windows: state.windows
          .filter((w) => w.id !== id)
          .map((w) => ({
            ...w,
            parentIds: w.parentIds?.filter((pid) => pid !== id),
            parentId: w.parentId === id ? undefined : w.parentId,
          })),
      };
    }),

  setActive: (id) =>
    set((state) => {
      const targetIdx = state.windows.findIndex((w) => w.id === id);
      if (targetIdx === -1) return state;
      const target = state.windows[targetIdx];
      if (target.active && target.zIndex === state.maxZIndex) return state;
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
        document.getSelection()?.removeAllRanges();
      }
      const nextZIndex = state.maxZIndex + 1;
      const now = Date.now();
      return {
        maxZIndex: nextZIndex,
        windows: state.windows.map((w, i) => {
          if (i === targetIdx)
            return { ...w, active: true, lastFocusedAt: now, zIndex: nextZIndex };
          if (w.active) return { ...w, active: false };
          return w;
        }),
      };
    }),

  updateWindow: (id, patch) =>
    set((state) => {
      const idx = state.windows.findIndex((w) => w.id === id);
      if (idx === -1) return state;
      const cur = state.windows[idx];

      const updatedPatch: Partial<Omit<WindowData, "id">> = { ...patch };
      if (patch.x !== undefined || patch.y !== undefined) {
        const parentId = cur.parentId ?? cur.parentIds?.[0];
        if (parentId) {
          const parentWin = state.windows.find((w) => w.id === parentId);
          if (parentWin) {
            const newX = patch.x ?? cur.x ?? 0;
            const newY = patch.y ?? cur.y ?? 0;
            const px = parentWin.x ?? 0;
            const py = parentWin.y ?? 0;
            updatedPatch.relX = newX - px;
            updatedPatch.relY = newY - py;
          }
        }
      }

      let changed = false;
      for (const k in updatedPatch) {
        const key = k as keyof Omit<WindowData, "id">;
        if (cur[key] !== updatedPatch[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return state;
      return {
        windows: state.windows.map((w, i) => (i === idx ? { ...w, ...updatedPatch } : w)),
      };
    }),

  spawnWindows: (count: number, startIdx: number, titles?: string[]) =>
    set((state) => {
      const center = screenToWorld(
        (typeof window !== "undefined" ? window.innerWidth : 800) / 2,
        (typeof window !== "undefined" ? window.innerHeight : 600) / 2,
      );

      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const spacing = 400;
      const gridW = cols * spacing;
      const gridH = rows * spacing;
      const originX = center.x - gridW / 2;
      const originY = center.y - gridH / 2;

      const windows = [...state.windows];
      for (let i = 0; i < count; i++) {
        const idx = startIdx + i;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const title = titles?.[i] ?? `Article_${idx}`;
        const wikiPath = title.replace(/ /g, "_");
        windows.push({
          id: crypto.randomUUID(),
          url: `https://en.wikipedia.org/wiki/${wikiPath}`,
          title,
          links: [],
          active: false,
          lastFocusedAt: Date.now(),
          zIndex: state.maxZIndex + i + 1,
          x: originX + col * spacing,
          y: originY + row * spacing,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        });
      }
      return {
        maxZIndex: state.maxZIndex + count,
        windows,
      };
    }),

  breakConnections: (id: string) =>
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            parentId: undefined,
            parentIds: [],
          };
        }
        const hasParent = w.parentId === id || w.parentIds?.includes(id);
        if (hasParent) {
          const newParentIds = w.parentIds?.filter((pid) => pid !== id) ?? [];
          return {
            ...w,
            parentIds: newParentIds,
            parentId: w.parentId === id ? (newParentIds[0] ?? undefined) : w.parentId,
          };
        }
        return w;
      }),
    })),

  toggleAlwaysOnTop: (id: string) =>
    set((state) => {
      const target = state.windows.find((w) => w.id === id);
      if (!target) return state;
      const nextAlwaysOnTop = !target.alwaysOnTop;
      const nextZIndex = state.maxZIndex + 1;
      return {
        maxZIndex: nextZIndex,
        windows: state.windows.map((w) =>
          w.id === id
            ? { ...w, alwaysOnTop: nextAlwaysOnTop, zIndex: nextZIndex, active: true }
            : w
        ),
      };
    }),

  toggleStackWindow: (id: string) =>
    set((state) => {
      const parentWin = state.windows.find((w) => w.id === id);
      if (!parentWin) return state;

      const childNotes = state.windows.filter(
        (w) => (w.parentId === id || w.parentIds?.includes(id)) && w.contentType === "sticky"
      );
      if (childNotes.length === 0) return state;

      const hasUnstacked = childNotes.some((w) => !w.stacked);
      const shouldStack = hasUnstacked;

      const parentX = parentWin.x ?? 80;
      const parentY = parentWin.y ?? 80;
      const parentW = parentWin.width ?? DEFAULT_WIDTH;
      const parentH = parentWin.height ?? DEFAULT_HEIGHT;

      let unstackCount = 0;

      return {
        windows: state.windows.map((w) => {
          const isChildNote = (w.parentId === id || w.parentIds?.includes(id)) && w.contentType === "sticky";
          if (!isChildNote) return w;

          if (shouldStack) {
            const relX = (w.x ?? 80) - parentX;
            const relY = (w.y ?? 80) - parentY;
            const noteCenterX = (w.x ?? 80) + (w.width ?? 260) / 2;
            const noteCenterY = (w.y ?? 80) + (w.height ?? (w.isExcerptNote ? 64 : 200)) / 2;
            const parentCenterX = parentX + parentW / 2;
            const parentCenterY = parentY + parentH / 2;

            const hw = Math.max(parentW / 2, 1);
            const hh = Math.max(parentH / 2, 1);

            const normX = (noteCenterX - parentCenterX) / hw;
            const normY = (noteCenterY - parentCenterY) / hh;

            let side: "TOP" | "RIGHT" | "BOTTOM" | "LEFT" = "RIGHT";
            if (Math.abs(normX) >= Math.abs(normY)) {
              side = normX >= 0 ? "RIGHT" : "LEFT";
            } else {
              side = normY >= 0 ? "BOTTOM" : "TOP";
            }

            return { ...w, stacked: true, side, relX, relY };
          } else {
            const side = w.side ?? "RIGHT";
            const idx = unstackCount++;
            const GAP = 160;
            const childW = w.width ?? 260;
            const childH = w.height ?? (w.isExcerptNote ? 64 : 200);
            let nx = parentX + parentW + GAP;
            let ny = parentY + idx * 40;

            if (side === "LEFT") {
              nx = parentX - childW - GAP;
              ny = parentY + idx * 40;
            } else if (side === "TOP") {
              nx = parentX + idx * 40;
              ny = parentY - childH - GAP;
            } else if (side === "BOTTOM") {
              nx = parentX + idx * 40;
              ny = parentY + parentH + GAP;
            }

            const targetX = w.relX != null ? parentX + w.relX : nx;
            const targetY = w.relY != null ? parentY + w.relY : ny;

            const cleanPos = findNonOverlappingPosition(
              targetX,
              targetY,
              childW,
              childH,
              state.windows,
              w.id
            );

            return {
              ...w,
              stacked: false,
              x: cleanPos.x,
              y: cleanPos.y,
            };
          }
        }),
      };
    }),

  unstackNote: (id: string) =>
    set((state) => {
      const target = state.windows.find((w) => w.id === id);
      if (!target || !target.stacked) return state;

      const rootWin = findRootWindow(id, state.windows);
      const parentId = target.parentId ?? target.parentIds?.[0];
      const parentWin = parentId ? state.windows.find((w) => w.id === parentId) : undefined;
      const refWin = rootWin ?? parentWin;

      const px = refWin?.x ?? target.x ?? 80;
      const py = refWin?.y ?? target.y ?? 80;
      const pw = refWin?.width ?? DEFAULT_WIDTH;
      const ph = refWin?.height ?? DEFAULT_HEIGHT;

      const side = target.side ?? "RIGHT";
      const GAP = 160;
      const childW = target.width ?? 260;
      const childH = target.height ?? (target.isExcerptNote ? 64 : 200);

      let nx = px + pw + GAP;
      let ny = py;

      if (side === "LEFT") {
        nx = px - childW - GAP;
      } else if (side === "TOP") {
        ny = py - childH - GAP;
      } else if (side === "BOTTOM") {
        ny = py + ph + GAP;
      }

      const targetX = target.relX != null ? px + target.relX : nx;
      const targetY = target.relY != null ? py + target.relY : ny;

      const cleanPos = findNonOverlappingPosition(
        targetX,
        targetY,
        childW,
        childH,
        state.windows,
        target.id
      );

      return {
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, stacked: false, x: cleanPos.x, y: cleanPos.y } : w
        ),
      };
    }),
}));