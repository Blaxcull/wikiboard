/** Module-level scroll position store. NOT in Zustand — scroll events
 *  fire too frequently for reactive state. This Map is written to on
 *  every scroll tick and read once when a window unfreezes. */

type ScrollPos = { x: number; y: number };

const scrolls = new Map<string, ScrollPos>();

export function getScroll(id: string): ScrollPos | undefined {
  return scrolls.get(id);
}

export function setScroll(id: string, x: number, y: number): void {
  scrolls.set(id, { x, y });
}

export function deleteScroll(id: string): void {
  scrolls.delete(id);
}
