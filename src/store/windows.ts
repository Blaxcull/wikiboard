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
  /** Content type discriminator: "article" (default), "pdf", "sticky", "text", or "shape" */
  contentType?: "article" | "pdf" | "sticky" | "text" | "shape";
  /** Shape type for contentType === "shape" */
  shapeType?: "rectangle" | "circle" | "diamond" | "line" | "arrow";
  /** Stroke color for shape */
  strokeColor?: string;
  /** Fill color for shape */
  fillColor?: string;
  /** Stroke width for shape */
  strokeWidth?: number;
  /** Start and end coordinates for line/arrow: [x1, y1, x2, y2] relative to shape origin (win.x, win.y) */
  shapePoints?: [number, number, number, number];
  /** Middle vertex coordinates for line/arrow: [midX, midY] relative to shape origin (win.x, win.y) */
  midPoint?: [number, number];
  /** Curve perpendicular offset for curved line/arrow (middle handle) */
  curveOffset?: number;
  /** Parametric position t (0 to 1) of middle handle along the line/curve */
  midT?: number;
  /** Rotation angle in degrees for shapes */
  rotation?: number;
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
  /** Page number where this note was created in a PDF */
  pdfPage?: number;
  /** Current page number (1-indexed) */
  pdfCurrentPage?: number;
  /** Total pages in PDF */
  pdfTotalPages?: number;
  /** Whether the PDF viewer is in maximized (full-viewport) mode */
  pdfMaximized?: boolean;
  /** True while the maximize/minimize animation is running */
  pdfAnimating?: boolean;
  /** Saved position and dimensions before maximizing */
  pdfPreMaximizedBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  alwaysOnTop?: boolean;
  /** Per-parent connection line style ('pointy' | 'curved') stored permanently when connected */
  connectionStyles?: Record<string, "pointy" | "curved">;
  stacked?: boolean;
  stackedParentId?: string;
  relX?: number;
  relY?: number;
  zIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  isUserResized?: boolean;
  uncompressedX?: number;
  uncompressedY?: number;
};

export type WindowGroup = {
  id: string;
  memberIds: string[];
  color?: string;
  alwaysOnTop?: boolean;
  parentId?: string;
  parentIds?: string[];
  /** Per-parent connection line style ('pointy' | 'curved') stored permanently when connected */
  connectionStyles?: Record<string, "pointy" | "curved">;
  side?: "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
  compressed?: boolean;
};

type WindowsStore = {
  windows: WindowData[];
  groups: WindowGroup[];
  maxZIndex: number;
  addWindow: (data?: Partial<WindowData>) => void;
  removeWindow: (id: string) => void;
  setActive: (id: string) => void;
  updateWindow: (id: string, patch: Partial<Omit<WindowData, "id">>) => void;
  spawnWindows: (count: number, startIdx: number, titles?: string[]) => void;
  breakConnections: (id: string) => void;
  breakGroupExternalConnections: (groupId: string) => void;
  connectEntitiesWithoutCycles: (sourceId: string, targetId: string) => void;
  toggleAlwaysOnTop: (id: string) => void;
  toggleStackWindow: (id: string) => void;
  toggleStackSingleNote: (id: string) => void;
  unstackNote: (id: string) => void;
  unstackNotes: (ids: string[]) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
  deactivateAll: () => void;
  addGroup: (memberIds: string[], color?: string) => void;
  removeGroup: (groupId: string) => void;
  updateGroup: (groupId: string, patch: Partial<Omit<WindowGroup, "id">>) => void;
  ungroup: (groupId: string) => void;
  toggleCompressGroup: (groupId: string) => void;
  isEraserToolActive: boolean;
  setEraserToolActive: (active: boolean) => void;
  toggleEraserTool: () => void;
  disconnectEntities: (parentId: string, childId: string) => void;
  isTextToolActive: boolean;
  setTextToolActive: (active: boolean) => void;
  toggleTextTool: () => void;
  isStickyToolActive: boolean;
  setStickyToolActive: (active: boolean) => void;
  toggleStickyTool: () => void;
  isSelectToolActive: boolean;
  setSelectToolActive: (active: boolean) => void;
  toggleSelectTool: () => void;
  connectionStyle: "pointy" | "curved";
  setConnectionStyle: (style: "pointy" | "curved") => void;
  drawingTool: "rectangle" | "circle" | "diamond" | "line" | "arrow" | null;
  setDrawingTool: (tool: "rectangle" | "circle" | "diamond" | "line" | "arrow" | null) => void;
  toggleDrawingTool: (tool: "rectangle" | "circle" | "diamond" | "line" | "arrow") => void;
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

  let currParentId = current.stackedParentId ?? current.parentId ?? current.parentIds?.[0];
  if (!currParentId && current.contentType === "sticky") {
    const revParent = windows.find(
      (w) => w.contentType !== "sticky" && (w.parentId === id || w.parentIds?.includes(id))
    );
    if (revParent) return revParent;
  }

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

export function getConnectedChildNotes(
  windowId: string,
  windows: WindowData[],
  _groups: WindowGroup[] = []
): WindowData[] {
  const parentWin = windows.find((w) => w.id === windowId);
  if (!parentWin) return [];

  return windows.filter((w) => {
    if (w.contentType !== "sticky") return false;

    const isConnected =
      w.parentId === windowId ||
      w.parentIds?.includes(windowId) ||
      (parentWin.contentType !== "sticky" &&
        (parentWin.parentId === w.id || parentWin.parentIds?.includes(w.id)));

    return isConnected;
  });
}

export function getParentEntityGeometry(
  parentId: string | undefined,
  windows: WindowData[],
  groups: WindowGroup[]
): { px: number; py: number; pw: number; ph: number } | null {
  if (!parentId) return null;

  const win = windows.find((w) => w.id === parentId);
  if (win) {
    return {
      px: win.x ?? 80,
      py: win.y ?? 80,
      pw: win.width ?? DEFAULT_WIDTH,
      ph: win.height ?? DEFAULT_HEIGHT,
    };
  }

  const grp = groups.find((g) => g.id === parentId);
  if (grp) {
    const memberWins = windows.filter((w) => grp.memberIds.includes(w.id) && !w.stacked);
    if (memberWins.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const w of memberWins) {
        const wx = w.x ?? 80;
        const wy = w.y ?? 80;
        const ww = w.width ?? (w.contentType === "sticky" ? 260 : DEFAULT_WIDTH);
        const wh = w.height ?? (w.contentType === "sticky" ? (w.isExcerptNote ? 64 : 200) : DEFAULT_HEIGHT);
        if (wx < minX) minX = wx;
        if (wy < minY) minY = wy;
        if (wx + ww > maxX) maxX = wx + ww;
        if (wy + wh > maxY) maxY = wy + wh;
      }
      const PAD = 44;
      return {
        px: minX - PAD,
        py: minY - PAD,
        pw: maxX - minX + PAD * 2,
        ph: maxY - minY + PAD * 2,
      };
    }
  }

  return null;
}

export const useWindows = create<WindowsStore>((set) => ({
  windows: [],
  groups: [],
  maxZIndex: 0,
  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),
  deactivateAll: () =>
    set((state) => ({
      windows: state.windows.map((w) => (w.active ? { ...w, active: false } : w)),
    })),
  isEraserToolActive: false,
  setEraserToolActive: (active) =>
    set({
      isEraserToolActive: active,
      ...(active ? { isTextToolActive: false, isStickyToolActive: false, isSelectToolActive: false, drawingTool: null } : {}),
    }),
  toggleEraserTool: () =>
    set((state) => ({
      isEraserToolActive: !state.isEraserToolActive,
      isTextToolActive: false,
      isStickyToolActive: false,
      isSelectToolActive: false,
      drawingTool: null,
    })),
  disconnectEntities: (parentId: string, childId: string) =>
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id === childId) {
          const newParentIds = w.parentIds?.filter((pid) => pid !== parentId) ?? [];
          const newStyles = { ...(w.connectionStyles ?? {}) };
          delete newStyles[parentId];
          return {
            ...w,
            parentIds: newParentIds,
            parentId: w.parentId === parentId ? (newParentIds[0] ?? undefined) : w.parentId,
            connectionStyles: newStyles,
          };
        }
        return w;
      }),
      groups: state.groups.map((g) => {
        if (g.id === childId) {
          const newParentIds = g.parentIds?.filter((pid) => pid !== parentId) ?? [];
          const newStyles = { ...(g.connectionStyles ?? {}) };
          delete newStyles[parentId];
          return {
            ...g,
            parentIds: newParentIds,
            parentId: g.parentId === parentId ? (newParentIds[0] ?? undefined) : g.parentId,
            connectionStyles: newStyles,
          };
        }
        return g;
      }),
    })),
  isTextToolActive: false,
  setTextToolActive: (active) => set({ isTextToolActive: active, ...(active ? { isEraserToolActive: false, isStickyToolActive: false, isSelectToolActive: false, drawingTool: null } : {}) }),
  toggleTextTool: () => set((state) => ({ isTextToolActive: !state.isTextToolActive, isEraserToolActive: false, isStickyToolActive: false, isSelectToolActive: false, drawingTool: null })),
  isStickyToolActive: false,
  setStickyToolActive: (active) => set({ isStickyToolActive: active, ...(active ? { isEraserToolActive: false, isTextToolActive: false, isSelectToolActive: false, drawingTool: null } : {}) }),
  toggleStickyTool: () => set((state) => ({ isStickyToolActive: !state.isStickyToolActive, isEraserToolActive: false, isTextToolActive: false, isSelectToolActive: false, drawingTool: null })),
  isSelectToolActive: false,
  setSelectToolActive: (active) => set({ isSelectToolActive: active, ...(active ? { isEraserToolActive: false, isTextToolActive: false, isStickyToolActive: false, drawingTool: null } : {}) }),
  toggleSelectTool: () => set((state) => ({ isSelectToolActive: !state.isSelectToolActive, isEraserToolActive: false, isTextToolActive: false, isStickyToolActive: false, drawingTool: null })),
  connectionStyle: "pointy",
  setConnectionStyle: (style) => set({ connectionStyle: style }),
  drawingTool: null,
  setDrawingTool: (tool) => set({ drawingTool: tool, ...(tool ? { isEraserToolActive: false, isTextToolActive: false, isStickyToolActive: false, isSelectToolActive: false } : {}) }),
  toggleDrawingTool: (tool) => set((state) => ({
    drawingTool: state.drawingTool === tool ? null : tool,
    ...(state.drawingTool !== tool ? { isEraserToolActive: false, isTextToolActive: false, isStickyToolActive: false, isSelectToolActive: false } : {}),
  })),
  addGroup: (memberIds, color) =>
    set((state) => {
      const cleanIds = Array.from(new Set(memberIds));
      if (cleanIds.length === 0) return state;
      const newGroup: WindowGroup = {
        id: crypto.randomUUID(),
        memberIds: cleanIds,
        color: color ?? "#525252",
      };
      const filteredExisting = state.groups
        .map((g) => ({
          ...g,
          memberIds: g.memberIds.filter((id) => !cleanIds.includes(id)),
        }))
        .filter((g) => g.memberIds.length > 0);
      return { groups: [...filteredExisting, newGroup] };
    }),
  removeGroup: (groupId) =>
    set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) })),
  ungroup: (groupId) =>
    set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) })),
  updateGroup: (groupId, patch) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    })),

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
      const isText = data?.contentType === "text";
      const childW = data?.width !== undefined ? data.width : (isText ? undefined : (isSticky ? 260 : DEFAULT_WIDTH));
      const childH = data?.height !== undefined ? data.height : (isText ? undefined : (isSticky ? (data?.isExcerptNote ? 64 : 200) : DEFAULT_HEIGHT));
      let posX: number;
      let posY: number;
      let parentWindow: WindowData | undefined;
      let parentGroup: WindowGroup | undefined;

      if (data?.parentId && data?.x == null && data?.y == null) {
        parentWindow = state.windows.find((w) => w.id === data.parentId);
        parentGroup = state.groups.find((g) => g.id === data.parentId);

        const parentEl = parentGroup
          ? (typeof document !== "undefined" ? document.getElementById(`group-box-${parentGroup.id}`) : null)
          : parentWindow
          ? (typeof document !== "undefined" ? document.getElementById(`win-${parentWindow.id}`) : null)
          : null;

        if (parentWindow || parentGroup) {
          let px = parentWindow ? (parentWindow.x ?? 0) : 0;
          let py = parentWindow ? (parentWindow.y ?? 0) : 0;
          let pw = parentWindow ? (parentWindow.width ?? (parentWindow.contentType === "pdf" ? 620 : DEFAULT_WIDTH)) : 400;
          let ph = parentWindow ? (parentWindow.height ?? (parentWindow.contentType === "pdf" ? Math.round(pw * 1.414 + 96) : DEFAULT_HEIGHT)) : 300;

          if (parentEl && !parentWindow?.pdfMaximized) {
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
          const effW = childW ?? 120;
          const effH = childH ?? 36;
          const GAP = 160;
          const side = data.side ?? "RIGHT";
          const existingChildrenOnSide = state.windows.filter(
            (w) => w.parentId === data.parentId && (w.side ?? "RIGHT") === side,
          );
          const childIdx = existingChildrenOnSide.length;

          if (side === "LEFT") {
            posX = px - effW - GAP;
            posY = py + (ph - effH) / 2 + childIdx * 30;
          } else if (side === "TOP") {
            posX = px + (pw - effW) / 2 + childIdx * 30;
            posY = py - effH - GAP;
          } else if (side === "BOTTOM") {
            posX = px + (pw - effW) / 2 + childIdx * 30;
            posY = py + ph + GAP;
          } else {
            // RIGHT
            posX = px + pw + GAP;
            posY = py + (ph - effH) / 2 + childIdx * 30;
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
          childW ?? 120,
          childH ?? 36,
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
        const childRect = { x: posX, y: posY, width: childW ?? 120, height: childH ?? 36 };
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
            ...data,
            parentId: data?.parentId,
            parentIds: (data?.parentIds && data.parentIds.length > 0)
              ? data.parentIds
              : (data?.parentId ? [data.parentId] : []),
            connectionStyles: data?.connectionStyles ?? (() => {
              const pList = (data?.parentIds && data.parentIds.length > 0)
                ? data.parentIds
                : (data?.parentId ? [data.parentId] : []);
              if (pList.length === 0) return undefined;
              const styles: Record<string, "pointy" | "curved"> = {};
              for (const pid of pList) {
                styles[pid] = state.connectionStyle ?? "pointy";
              }
              return styles;
            })(),
            relX: data?.relX ?? relX,
            relY: data?.relY ?? relY,
          },
        ],
      };
    }),

  removeWindow: (id) =>
    set((state) => {
      const closingWin = state.windows.find((w) => w.id === id);
      if (typeof window !== "undefined") {
        if (closingWin?.parentId && closingWin?.sourceHref) {
          window.dispatchEvent(
            new CustomEvent("wikiboard:link-closed", {
              detail: { parentId: closingWin.parentId, href: closingWin.sourceHref, closingId: id },
            })
          );
        }
        window.dispatchEvent(
          new CustomEvent("wikiboard:note-closed", {
            detail: { noteId: id, parentId: closingWin?.parentId },
          })
        );
      }
      return {
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
        groups: state.groups
          .map((g) => ({
            ...g,
            memberIds: g.memberIds.filter((mId) => mId !== id),
          }))
          .filter((g) => g.memberIds.length > 0),
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

  breakGroupExternalConnections: (groupId: string) =>
    set((state) => {
      const newWindows = state.windows.map((w) => {
        const existingParents =
          w.parentIds && w.parentIds.length > 0
            ? w.parentIds
            : w.parentId
            ? [w.parentId]
            : [];

        if (!existingParents.includes(groupId)) return w;

        const newParentIds = existingParents.filter((pid) => pid !== groupId);
        const newParentId = w.parentId === groupId ? (newParentIds[0] ?? undefined) : w.parentId;
        const newConnectionStyles = w.connectionStyles ? { ...w.connectionStyles } : undefined;
        if (newConnectionStyles && groupId in newConnectionStyles) {
          delete newConnectionStyles[groupId];
        }

        return {
          ...w,
          parentId: newParentId,
          parentIds: newParentIds.length > 0 ? newParentIds : undefined,
          connectionStyles: newConnectionStyles,
        };
      });

      const newGroups = state.groups.map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            parentId: undefined,
            parentIds: undefined,
          };
        }

        const existingParents =
          g.parentIds && g.parentIds.length > 0
            ? g.parentIds
            : g.parentId
            ? [g.parentId]
            : [];

        if (!existingParents.includes(groupId)) return g;

        const newParentIds = existingParents.filter((pid) => pid !== groupId);
        const newParentId = g.parentId === groupId ? (newParentIds[0] ?? undefined) : g.parentId;

        return {
          ...g,
          parentId: newParentId,
          parentIds: newParentIds.length > 0 ? newParentIds : undefined,
        };
      });

      return { windows: newWindows, groups: newGroups };
    }),

  connectEntitiesWithoutCycles: (sourceId: string, targetId: string) =>
    set((state) => {
      if (sourceId === targetId) return state;

      const sourceGroup = state.groups.find((g) => g.memberIds.includes(sourceId));
      const targetGroup = state.groups.find((g) => g.memberIds.includes(targetId));
      if (sourceGroup && targetId === sourceGroup.id) return state;
      if (targetGroup && sourceId === targetGroup.id) return state;

      const targetWin = state.windows.find((w) => w.id === targetId);
      const targetGroupEntity = state.groups.find((g) => g.id === targetId);
      if (!targetWin && !targetGroupEntity) return state;

      const getParents = (entity: { parentId?: string; parentIds?: string[] }): string[] => {
        const set = new Set<string>();
        if (entity.parentIds) for (const p of entity.parentIds) set.add(p);
        if (entity.parentId) set.add(entity.parentId);
        return Array.from(set);
      };

      const isAncestor = (curId: string, searchId: string, visited = new Set<string>()): boolean => {
        if (curId === searchId) return true;
        if (visited.has(curId)) return false;
        visited.add(curId);

        const win = state.windows.find((w) => w.id === curId);
        const grp = state.groups.find((g) => g.id === curId);
        const entity = win || grp;
        if (!entity) return false;

        for (const pId of getParents(entity)) {
          if (isAncestor(pId, searchId, visited)) return true;
        }
        return false;
      };

      let newWindows = [...state.windows];
      let newGroups = [...state.groups];

      const createsCycle = isAncestor(sourceId, targetId);

      if (createsCycle) {
        const removeParentRelationship = (childId: string, parentToRemove: string) => {
          newWindows = newWindows.map((w) => {
            if (w.id === childId) {
              const pSet = new Set(getParents(w));
              pSet.delete(parentToRemove);
              const newPList = Array.from(pSet);
              return { ...w, parentIds: newPList, parentId: newPList[0] };
            }
            return w;
          });
          newGroups = newGroups.map((g) => {
            if (g.id === childId) {
              const pSet = new Set(getParents(g));
              pSet.delete(parentToRemove);
              const newPList = Array.from(pSet);
              return { ...g, parentIds: newPList, parentId: newPList[0] };
            }
            return g;
          });
        };

        const findAndBreakLink = (currId: string, visited = new Set<string>()): boolean => {
          if (visited.has(currId)) return false;
          visited.add(currId);

          const win = newWindows.find((w) => w.id === currId);
          const grp = newGroups.find((g) => g.id === currId);
          const entity = win || grp;
          if (!entity) return false;

          const parents = getParents(entity);
          if (parents.includes(targetId)) {
            removeParentRelationship(currId, targetId);
            return true;
          }

          for (const pId of parents) {
            if (findAndBreakLink(pId, visited)) return true;
          }
          return false;
        };

        findAndBreakLink(sourceId);
      }

      const appliedStyle = state.connectionStyle ?? "pointy";

      if (targetWin) {
        newWindows = newWindows.map((w) => {
          if (w.id === targetId) {
            const pSet = new Set(getParents(w));
            pSet.add(sourceId);
            const newPList = Array.from(pSet);
            const updatedStyles = { ...(w.connectionStyles ?? {}), [sourceId]: appliedStyle };
            return { ...w, parentIds: newPList, parentId: newPList[0], connectionStyles: updatedStyles };
          }
          return w;
        });
      } else if (targetGroupEntity) {
        newGroups = newGroups.map((g) => {
          if (g.id === targetId) {
            const pSet = new Set(getParents(g));
            pSet.add(sourceId);
            const newPList = Array.from(pSet);
            const updatedStyles = { ...(g.connectionStyles ?? {}), [sourceId]: appliedStyle };
            return { ...g, parentIds: newPList, parentId: newPList[0], connectionStyles: updatedStyles };
          }
          return g;
        });
      }

      return { windows: newWindows, groups: newGroups };
    }),

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

      const childNotes = getConnectedChildNotes(id, state.windows, state.groups);
      if (childNotes.length === 0) return state;

      const childIds = new Set(childNotes.map((c) => c.id));
      const hasUnstacked = childNotes.some((w) => !w.stacked || w.stackedParentId !== id);
      const shouldStack = hasUnstacked;

      const parentX = parentWin.x ?? 80;
      const parentY = parentWin.y ?? 80;
      const parentW = parentWin.width ?? DEFAULT_WIDTH;
      const parentH = parentWin.height ?? DEFAULT_HEIGHT;

      let unstackCount = 0;

      return {
        windows: state.windows.map((w) => {
          if (!childIds.has(w.id)) return w;

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

            return { ...w, stacked: true, stackedParentId: id, side, relX, relY };
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

            const finalX = w.relX != null ? parentX + w.relX : nx;
            const finalY = w.relY != null ? parentY + w.relY : ny;

            return {
              ...w,
              stacked: false,
              stackedParentId: undefined,
              x: finalX,
              y: finalY,
            };
          }
        }),
      };
    }),

  unstackNote: (id: string) =>
    set((state) => {
      const target = state.windows.find((w) => w.id === id);
      if (!target || !target.stacked) return state;

      const parentId = target.stackedParentId ?? target.parentId ?? target.parentIds?.[0];
      const parentGeo = getParentEntityGeometry(parentId, state.windows, state.groups);

      const px = parentGeo?.px ?? target.x ?? 80;
      const py = parentGeo?.py ?? target.y ?? 80;
      const pw = parentGeo?.pw ?? DEFAULT_WIDTH;
      const ph = parentGeo?.ph ?? DEFAULT_HEIGHT;

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

      const finalX = target.relX != null ? px + target.relX : nx;
      const finalY = target.relY != null ? py + target.relY : ny;

      return {
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, stacked: false, stackedParentId: undefined, x: finalX, y: finalY } : w
        ),
      };
    }),

  unstackNotes: (ids: string[]) =>
    set((state) => {
      const idSet = new Set(ids);
      let unstackCount = 0;
      return {
        windows: state.windows.map((w) => {
          if (!idSet.has(w.id) || !w.stacked) return w;

          const parentId = w.stackedParentId ?? w.parentId ?? w.parentIds?.[0];
          const parentGeo = getParentEntityGeometry(parentId, state.windows, state.groups);

          const px = parentGeo?.px ?? w.x ?? 80;
          const py = parentGeo?.py ?? w.y ?? 80;
          const pw = parentGeo?.pw ?? DEFAULT_WIDTH;
          const ph = parentGeo?.ph ?? DEFAULT_HEIGHT;

          const side = w.side ?? "RIGHT";
          const idx = unstackCount++;
          const GAP = 160;
          const childW = w.width ?? 260;
          const childH = w.height ?? (w.isExcerptNote ? 64 : 200);

          let nx = px + pw + GAP;
          let ny = py + idx * 40;

          if (side === "LEFT") {
            nx = px - childW - GAP;
            ny = py + idx * 40;
          } else if (side === "TOP") {
            nx = px + idx * 40;
            ny = py - childH - GAP;
          } else if (side === "BOTTOM") {
            nx = px + idx * 40;
            ny = py + ph + GAP;
          }

          const finalX = w.relX != null ? px + w.relX : nx;
          const finalY = w.relY != null ? py + w.relY : ny;

          return {
            ...w,
            stacked: false,
            stackedParentId: undefined,
            x: finalX,
            y: finalY,
          };
        }),
      };
    }),

  toggleStackSingleNote: (id: string) =>
    set((state) => {
      const target = state.windows.find((w) => w.id === id);
      if (!target || target.contentType !== "sticky") return state;

      if (target.stacked) {
        const parentId = target.stackedParentId ?? target.parentId ?? target.parentIds?.[0];
        const parentGeo = getParentEntityGeometry(parentId, state.windows, state.groups);

        const px = parentGeo?.px ?? target.x ?? 80;
        const py = parentGeo?.py ?? target.y ?? 80;
        const pw = parentGeo?.pw ?? DEFAULT_WIDTH;
        const ph = parentGeo?.ph ?? DEFAULT_HEIGHT;

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

        const finalX = target.relX != null ? px + target.relX : nx;
        const finalY = target.relY != null ? py + target.relY : ny;

        return {
          windows: state.windows.map((w) =>
            w.id === id ? { ...w, stacked: false, stackedParentId: undefined, x: finalX, y: finalY } : w
          ),
        };
      } else {
        const parentId = target.stackedParentId ?? target.parentId ?? target.parentIds?.[0];
        const pGeom = getParentEntityGeometry(parentId, state.windows, state.groups);

        let parentX = 80;
        let parentY = 80;
        let parentW = DEFAULT_WIDTH;
        let parentH = DEFAULT_HEIGHT;

        if (pGeom) {
          parentX = pGeom.px;
          parentY = pGeom.py;
          parentW = pGeom.pw;
          parentH = pGeom.ph;
        } else {
          const parentWin = state.windows.find(
            (w) => w.contentType !== "sticky" && (w.parentId === id || w.parentIds?.includes(id))
          );
          if (parentWin) {
            parentX = parentWin.x ?? 80;
            parentY = parentWin.y ?? 80;
            parentW = parentWin.width ?? DEFAULT_WIDTH;
            parentH = parentWin.height ?? DEFAULT_HEIGHT;
          }
        }

        const relX = (target.x ?? 80) - parentX;
        const relY = (target.y ?? 80) - parentY;
        const noteCenterX = (target.x ?? 80) + (target.width ?? 260) / 2;
        const noteCenterY = (target.y ?? 80) + (target.height ?? (target.isExcerptNote ? 64 : 200)) / 2;
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

        return {
          windows: state.windows.map((w) =>
            w.id === id ? { ...w, stacked: true, stackedParentId: parentId, side, relX, relY } : w
          ),
        };
      }
    }),

  toggleCompressGroup: (groupId: string) =>
    set((state) => {
      const grp = state.groups.find((g) => g.id === groupId);
      if (!grp) return state;

      const isCompressing = !grp.compressed;
      const memberWins = state.windows.filter((w) => grp.memberIds.includes(w.id));

      if (memberWins.length === 0) {
        return {
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, compressed: isCompressing } : g
          ),
        };
      }

      if (isCompressing) {
        let startX = Infinity;
        let startY = Infinity;
        for (const w of memberWins) {
          const wx = w.x ?? 80;
          const wy = w.y ?? 80;
          if (wx < startX) startX = wx;
          if (wy < startY) startY = wy;
        }
        if (startX === Infinity) startX = 80;
        if (startY === Infinity) startY = 80;

        const windowMembers = memberWins.filter((w) => w.contentType !== "sticky" && w.contentType !== "text");
        const visibleMembers = windowMembers.length > 0
          ? windowMembers
          : memberWins.filter((w) => w.contentType === "sticky");

        let curMaxZ = state.maxZIndex;
        const sortedVisible = [...visibleMembers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

        // When compressed, only show up to 3 tabs in the staggered deck so large groups don't clutter
        const MAX_DECK_TABS = 3;
        const topDeckMembers = sortedVisible.slice(-MAX_DECK_TABS);
        const hiddenDeckMembers = sortedVisible.slice(0, -MAX_DECK_TABS);

        const DECK_OFFSET_X = 14;
        const DECK_OFFSET_Y = 34;

        const posMap = new Map<string, { x: number; y: number; uncompressedX: number; uncompressedY: number; zIndex: number }>();

        // Park overflow members at the base stack position so they remain hidden underneath the deck
        hiddenDeckMembers.forEach((w) => {
          curMaxZ += 1;
          posMap.set(w.id, {
            x: startX,
            y: startY,
            uncompressedX: w.uncompressedX ?? (w.x ?? 80),
            uncompressedY: w.uncompressedY ?? (w.y ?? 80),
            zIndex: curMaxZ,
          });
        });

        // The top 3 tabs stagger cleanly as a neat deck of cards
        topDeckMembers.forEach((w, i) => {
          curMaxZ += 1;
          posMap.set(w.id, {
            x: startX + i * DECK_OFFSET_X,
            y: startY + i * DECK_OFFSET_Y,
            uncompressedX: w.uncompressedX ?? (w.x ?? 80),
            uncompressedY: w.uncompressedY ?? (w.y ?? 80),
            zIndex: curMaxZ,
          });
        });

        // For members not displayed in the visible deck (e.g. text boxes or attached stickies hidden behind windows),
        // park their coordinate reference at startX, startY cleanly
        memberWins
          .filter((w) => !posMap.has(w.id))
          .forEach((w) => {
            posMap.set(w.id, {
              x: startX,
              y: startY,
              uncompressedX: w.uncompressedX ?? (w.x ?? 80),
              uncompressedY: w.uncompressedY ?? (w.y ?? 80),
              zIndex: w.zIndex ?? 0,
            });
          });

        return {
          maxZIndex: curMaxZ,
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, compressed: true } : g
          ),
          windows: state.windows.map((w) => {
            const patch = posMap.get(w.id);
            return patch ? { ...w, ...patch } : w;
          }),
        };
      } else {
        return {
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, compressed: false } : g
          ),
          windows: state.windows.map((w) => {
            if (grp.memberIds.includes(w.id)) {
              return {
                ...w,
                x: w.uncompressedX ?? w.x,
                y: w.uncompressedY ?? w.y,
                uncompressedX: undefined,
                uncompressedY: undefined,
              };
            }
            return w;
          }),
        };
      }
    }),
}));