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
};

let windowCount = 0;
const CASCADE_STEP = 30;
const CASCADE_WRAP = 240;

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
      return {
        maxZIndex: nextZIndex,
        windows: [
          ...state.windows.map((w) => ({ ...w, active: false })),
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
      const target = state.windows.find((w) => w.id === id);
      if (!target || target.active) return state;
      const nextZIndex = state.maxZIndex + 1;
      return {
        maxZIndex: nextZIndex,
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                active: true,
                lastFocusedAt: Date.now(),
                zIndex: nextZIndex,
              }
            : { ...w, active: false },
        ),
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
      const nextZIndex = state.maxZIndex + 1;
      return {
        maxZIndex: nextZIndex,
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                frozen: false,
                lastFocusedAt: Date.now(),
                zIndex: nextZIndex,
                active: true,
              }
            : { ...w, active: false },
        ),
      };
    }),
}));
