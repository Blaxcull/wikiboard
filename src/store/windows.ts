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
  /** Pre-extracted image src for File: pages — skips the fetchFileUrl API call */
  directImageUrl?: string;
  /** Content type discriminator: "article" (default) or "pdf" */
  contentType?: "article" | "pdf";
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
};

export const DEFAULT_WIDTH = 540;
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
          const pw = parentWindow.width ?? DEFAULT_WIDTH;
          const GAP = 140; // Open a little far away for clear separation
          const existingChildren = state.windows.filter((w) => w.parentId === data.parentId);
          const childIdx = existingChildren.length;
          posX = (parentWindow.x ?? 0) + pw + GAP + childIdx * 40;
          posY = (parentWindow.y ?? 0) + childIdx * 40;
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
            ...data,
          },
        ],
      };
    }),

  removeWindow: (id) =>
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
    })),

  setActive: (id) =>
    set((state) => {
      const targetIdx = state.windows.findIndex((w) => w.id === id);
      if (targetIdx === -1) return state;
      const target = state.windows[targetIdx];
      if (target.active) return state;
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
}));