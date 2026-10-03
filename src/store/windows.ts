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
  zIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type WindowsStore = {
  windows: WindowData[];
  maxZIndex: number;
  addWindow: (data?: Partial<Omit<WindowData, "id">>) => void;
  removeWindow: (id: string) => void;
  setActive: (id: string) => void;
  updateWindow: (id: string, patch: Partial<Omit<WindowData, "id">>) => void;
  spawnWindows: (count: number, startIdx: number, titles?: string[]) => void;
  breakConnections: (id: string) => void;
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

      const childW = data?.width ?? DEFAULT_WIDTH;
      const childH = data?.height ?? DEFAULT_HEIGHT;
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
            id: crypto.randomUUID(),
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
      let changed = false;
      for (const k in patch) {
        const key = k as keyof Omit<WindowData, "id">;
        if (cur[key] !== patch[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return state;
      return {
        windows: state.windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)),
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
}));