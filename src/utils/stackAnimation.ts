import { useWindows } from "../store/windows";
import { determineNoteSide } from "../App";

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
  const parentWin = state.windows.find((w) => w.id === windowId);
  if (!parentWin) return;

  const childNotes = state.windows.filter(
    (w) => w.parentId === windowId || w.parentIds?.includes(windowId)
  );

  if (childNotes.length === 0) return;

  const hasUnstacked = childNotes.some((w) => !w.stacked);
  const parentEl = document.getElementById(`win-${windowId}`);

  if (!parentEl || !hasUnstacked) {
    state.toggleStackWindow(windowId);
    return;
  }

  const parentRect = parentEl.getBoundingClientRect();
  const unstackedNotes = childNotes.filter((n) => !n.stacked);

  // Group child notes by side before updating state
  const bySide: Record<string, typeof unstackedNotes> = {
    RIGHT: [],
    LEFT: [],
    TOP: [],
    BOTTOM: [],
  };

  for (const note of unstackedNotes) {
    const side = determineNoteSide(note, parentWin);
    bySide[side].push(note);
  }

  markWindowStacking(windowId);
  unstackedNotes.forEach((n) => markNoteUnstacking(n.id));

  let finishedCount = 0;
  for (const side of ["RIGHT", "LEFT", "TOP", "BOTTOM"] as const) {
    const sideNotes = bySide[side];
    if (!sideNotes || sideNotes.length === 0) continue;

    for (let i = 0; i < sideNotes.length; i++) {
      const note = sideNotes[i];
      const el = document.getElementById(`win-${note.id}`);
      if (!el) {
        finishedCount++;
        if (finishedCount >= unstackedNotes.length) {
          unmarkWindowStacking(windowId);
          unstackedNotes.forEach((n) => unmarkNoteUnstacking(n.id));
          state.toggleStackWindow(windowId);
        }
        continue;
      }

      const noteRect = el.getBoundingClientRect();
      const { stubW, stubH } = getStubDimensions(note);

      const { toX, toY } = getStubTargetOffset(side, i, sideNotes.length, stubW, stubH, parentRect, noteRect);

      const parentZ = parentWin.zIndex ?? 1;
      el.style.zIndex = `${parentZ - 1}`;

      const scaleX = stubW / Math.max(noteRect.width, 1);
      const scaleY = stubH / Math.max(noteRect.height, 1);

      const anim = el.animate(
        [
          { transform: "translate3d(0, 0, 0) scale(1, 1)", transformOrigin: "top left", opacity: 1 },
          { transform: `translate3d(${toX}px, ${toY}px, 0) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left", opacity: 1 },
        ],
        {
          duration: 300,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        }
      );

      anim.onfinish = () => {
        finishedCount++;
        if (finishedCount >= unstackedNotes.length) {
          state.toggleStackWindow(windowId);
          unmarkWindowStacking(windowId);
          unstackedNotes.forEach((n) => unmarkNoteUnstacking(n.id));
        }
      };
    }
  }
}

export function stackSingleNoteWithAnimation(noteId: string) {
  const state = useWindows.getState();
  const note = state.windows.find((w) => w.id === noteId);
  if (!note) return;

  if (note.stacked) {
    state.toggleStackSingleNote(noteId);
    return;
  }

  const parentId = note.parentId ?? note.parentIds?.[0];
  const parentWin = parentId ? state.windows.find((w) => w.id === parentId) : null;
  if (!parentWin) {
    state.toggleStackSingleNote(noteId);
    return;
  }

  const parentEl = document.getElementById(`win-${parentWin.id}`);
  const noteEl = document.getElementById(`win-${noteId}`);
  if (!parentEl || !noteEl) {
    state.toggleStackSingleNote(noteId);
    return;
  }

  const parentRect = parentEl.getBoundingClientRect();
  const noteRect = noteEl.getBoundingClientRect();
  const side = determineNoteSide(note, parentWin);
  const { stubW, stubH } = getStubDimensions(note);

  const { toX, toY } = getStubTargetOffset(side, 0, 1, stubW, stubH, parentRect, noteRect);

  const parentZ = parentWin.zIndex ?? 1;
  noteEl.style.zIndex = `${parentZ - 1}`;

  markNoteUnstacking(noteId);

  const scaleX = stubW / Math.max(noteRect.width, 1);
  const scaleY = stubH / Math.max(noteRect.height, 1);

  const anim = noteEl.animate(
    [
      { transform: "translate3d(0, 0, 0) scale(1, 1)", transformOrigin: "top left", opacity: 1 },
      { transform: `translate3d(${toX}px, ${toY}px, 0) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left", opacity: 1 },
    ],
    {
      duration: 300,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    }
  );

  anim.onfinish = () => {
    state.toggleStackSingleNote(noteId);
    unmarkNoteUnstacking(noteId);
  };
}
