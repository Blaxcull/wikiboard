import { create } from "zustand";

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
  /** When true, window shows a lightweight stub instead of full Shadow DOM */
  frozen: boolean;
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
  freezeWindow: (id: string) => void;
  unfreezeWindow: (id: string) => void;
  spawnWindows: (count: number, startIdx: number, titles?: string[]) => void;
};

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
      const offset = nextCascadeOffset();
      const defaultPos = 80 + offset;
      const activeIdx = state.windows.findIndex((w) => w.active);
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
            frozen: false,
            zIndex: nextZIndex,
            x: data?.x ?? defaultPos,
            y: data?.y ?? defaultPos,
            width: data?.width ?? 384,
            height: data?.height ?? 384,
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
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, ...patch } : w,
      ),
    })),

  freezeWindow: (id) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, frozen: true } : w,
      ),
    })),

  unfreezeWindow: (id) =>
    set((state) => {
      const targetIdx = state.windows.findIndex((w) => w.id === id);
      if (targetIdx === -1) return state;
      const nextZIndex = state.maxZIndex + 1;
      const now = Date.now();
      return {
        maxZIndex: nextZIndex,
        windows: state.windows.map((w, i) => {
          if (i === targetIdx)
            return { ...w, frozen: false, lastFocusedAt: now, zIndex: nextZIndex, active: true };
          if (w.active) return { ...w, active: false };
          return w;
        }),
      };
    }),

  spawnWindows: (count: number, startIdx: number, titles?: string[]) =>
    set((state) => {
      const windows = [...state.windows];
      for (let i = 0; i < count; i++) {
        const idx = startIdx + i;
        const offset = nextCascadeOffset();
        const title = titles?.[i] ?? `Article_${idx}`;
        const wikiPath = title.replace(/ /g, "_");
        windows.push({
          id: crypto.randomUUID(),
          url: `https://en.wikipedia.org/wiki/${wikiPath}`,
          title,
          links: [],
          active: false,
          lastFocusedAt: Date.now(),
          frozen: false,
          zIndex: state.maxZIndex + i + 1,
          x: 80 + offset,
          y: 80 + offset,
          width: 384,
          height: 384,
        });
      }
      return {
        maxZIndex: state.maxZIndex + count,
        windows,
      };
    }),
}));