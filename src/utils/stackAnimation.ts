import { useWindows, getConnectedChildNotes } from "../store/windows";

export const lastUnstackedRects = new Map<string, DOMRect>();
export const lastStackedStubRects = new Map<string, DOMRect>();

const stackingWinIds = new Set<string>();
const unstackingNoteIds = new Set<string>();
const animationSubscribers = new Set<() => void>();

export function isWindowStacking(id: string): boolean {
  return stackingWinIds.has(id);
}

export function isNoteUnstacking(id: string): boolean {
  return unstackingNoteIds.has(id);
}

export function markWindowStacking(id: string) {
  stackingWinIds.add(id);
  notifyAnimation();
}

export function unmarkWindowStacking(id: string) {
  stackingWinIds.delete(id);
  notifyAnimation();
}

export function markNoteUnstacking(id: string) {
  unstackingNoteIds.add(id);
  notifyAnimation();
}

export function unmarkNoteUnstacking(id: string) {
  unstackingNoteIds.delete(id);
  notifyAnimation();
}

export function subscribeAnimation(cb: () => void) {
  animationSubscribers.add(cb);
  return () => {
    animationSubscribers.delete(cb);
  };
}

function notifyAnimation() {
  animationSubscribers.forEach((cb) => cb());
}

export function getStubDimensions(_note?: { isExcerptNote?: boolean }): { stubW: number; stubH: number } {
  return {
    stubW: 220,
    stubH: 160,
  };
}

export function getStubTargetOffset(
  side: "RIGHT" | "LEFT" | "TOP" | "BOTTOM",
  index: number,
  total: number,
  noteW: number,
  noteH: number,
  parentRect: DOMRect,
  noteRect: DOMRect
): { toX: number; toY: number } {
  const isCenter = total % 2 === 1 && index === Math.floor(total / 2);
  const peek = isCenter ? 26 : 18;
  const spreadX = (index - (total - 1) / 2) * 65;
  const spreadY = (index - (total - 1) / 2) * 55;

  let stubLeft = parentRect.left;
  let stubTop = parentRect.top;

  if (side === "RIGHT") {
    stubLeft = parentRect.left + parentRect.width - (noteW - 22);
    stubTop = parentRect.top + parentRect.height / 2 + spreadY - noteH / 2;
  } else if (side === "LEFT") {
    stubLeft = parentRect.left - 22;
    stubTop = parentRect.top + parentRect.height / 2 + spreadY - noteH / 2;
  } else if (side === "TOP") {
    stubLeft = parentRect.left + parentRect.width / 2 + spreadX - noteW / 2;
    stubTop = parentRect.top - peek;
  } else {
    // BOTTOM
    stubLeft = parentRect.left + parentRect.width / 2 + spreadX - noteW / 2;
    stubTop = parentRect.top + parentRect.height - (noteH - (isCenter ? 26 : 22));
  }

  return {
    toX: stubLeft - noteRect.left,
    toY: stubTop - noteRect.top,
  };
}

export function stackWindowWithAnimation(windowId: string) {
  const state = useWindows.getState();
  const childNotes = getConnectedChildNotes(windowId, state.windows, state.groups);
  if (childNotes.length === 0) return;

  const hasUnstacked = childNotes.some((w) => !w.stacked);
  if (hasUnstacked) {
    childNotes.forEach((note) => {
      if (!note.stacked) {
        const noteEl = document.getElementById(`win-${note.id}`);
        if (noteEl) {
          lastUnstackedRects.set(note.id, noteEl.getBoundingClientRect());
        }
      }
    });
    state.toggleStackWindow(windowId);
  } else {
    childNotes.forEach((note) => {
      if (note.stacked) {
        const stubEl = document.getElementById(`stub-${note.id}`);
        if (stubEl) {
          lastStackedStubRects.set(note.id, stubEl.getBoundingClientRect());
        }
      }
    });
    state.toggleStackWindow(windowId);
  }
}

export function stackSingleNoteWithAnimation(noteId: string) {
  const state = useWindows.getState();
  const note = state.windows.find((w) => w.id === noteId);
  if (!note) return;

  if (note.stacked) {
    const stubEl = document.getElementById(`stub-${noteId}`);
    if (stubEl) {
      lastStackedStubRects.set(noteId, stubEl.getBoundingClientRect());
    }
    state.toggleStackSingleNote(noteId);
  } else {
    const noteEl = document.getElementById(`win-${noteId}`);
    if (noteEl) {
      lastUnstackedRects.set(noteId, noteEl.getBoundingClientRect());
    }
    state.toggleStackSingleNote(noteId);
  }
}
