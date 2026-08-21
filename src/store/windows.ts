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
};

type WindowsStore = {
  windows: WindowData[];
  addWindow: (data?: Partial<Omit<WindowData, "id">>) => void;
  removeWindow: (id: string) => void;
  setActive: (id: string) => void;
  updateWindow: (id: string, patch: Partial<Omit<WindowData, "id">>) => void;
};

let windowCount = 0;

export const useWindows = create<WindowsStore>((set) => ({
  windows: [],

  addWindow: (data) =>
    set((state) => ({
      windows: [
        ...state.windows.map((w) => ({ ...w, active: false })),
        {
          id: crypto.randomUUID(),
          url: "",
          title: `Window ${++windowCount}`,
          links: [],
          active: true,
          ...data,
        },
      ],
    })),

  removeWindow: (id) =>
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
    })),

  setActive: (id) =>
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, active: w.id === id })),
    })),

  updateWindow: (id, patch) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, ...patch } : w,
      ),
    })),
}));
