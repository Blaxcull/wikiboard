import { useWindows, type WindowData, type WindowGroup } from "../store/windows";

export type CanvasSnapshot = {
  windows: WindowData[];
  groups: WindowGroup[];
  connectionStyle: "pointy" | "curved";
  maxZIndex: number;
};

const MAX_HISTORY = 50;

const past: CanvasSnapshot[] = [];
const future: CanvasSnapshot[] = [];
let isPerformingHistoryAction = false;

const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}

export function subscribeHistory(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function canUndo(): boolean {
  return past.length > 0;
}

export function canRedo(): boolean {
  return future.length > 0;
}

export function captureSnapshot(): CanvasSnapshot {
  const state = useWindows.getState();
  return {
    windows: structuredClone(state.windows),
    groups: structuredClone(state.groups),
    connectionStyle: state.connectionStyle,
    maxZIndex: state.maxZIndex,
  };
}

/** Push a snapshot to past (clears future). */
export function recordSnapshot(snapshotBeforeAction?: CanvasSnapshot) {
  if (isPerformingHistoryAction) return;
  const snap = snapshotBeforeAction ?? captureSnapshot();
  past.push(snap);
  if (past.length > MAX_HISTORY) {
    past.shift();
  }
  future.length = 0; // Clear redo stack on new action
  notify();
}

/** Undo the last action */
export function undo() {
  if (past.length === 0 || isPerformingHistoryAction) return;

  const currentSnapshot = captureSnapshot();
  const previousSnapshot = past.pop()!;
  future.push(currentSnapshot);

  isPerformingHistoryAction = true;
  useWindows.getState().restoreSnapshot(previousSnapshot);
  isPerformingHistoryAction = false;

  notify();
}

/** Redo the previously undone action */
export function redo() {
  if (future.length === 0 || isPerformingHistoryAction) return;

  const currentSnapshot = captureSnapshot();
  const nextSnapshot = future.pop()!;
  past.push(currentSnapshot);

  isPerformingHistoryAction = true;
  useWindows.getState().restoreSnapshot(nextSnapshot);
  isPerformingHistoryAction = false;

  notify();
}
