import { useWindows } from "../store/windows";

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
    (w) =>
      (w.parentId === windowId || w.parentIds?.includes(windowId)) &&
      w.contentType === "sticky" &&
      !w.stacked
  );

  if (childNotes.length === 0) {
    state.toggleStackWindow(windowId);
    return;
  }

  const parentEl = document.getElementById(`win-${windowId}`);
  if (!parentEl) {
    state.toggleStackWindow(windowId);
    return;
  }

  const parentRect = parentEl.getBoundingClientRect();

  // Group child notes by side
  const bySide: Record<string, typeof childNotes> = {
    RIGHT: [],
    LEFT: [],
    TOP: [],
    BOTTOM: [],
  };

  for (const note of childNotes) {
    const px = parentWin.x ?? 80;
    const py = parentWin.y ?? 80;
    const pw = parentWin.width ?? 750;
    const ph = parentWin.height ?? 550;
    const nx = (note.x ?? 80) + (note.width ?? 260) / 2;
    const ny = (note.y ?? 80) + (note.height ?? (note.isExcerptNote ? 64 : 200)) / 2;
    const dx = nx - (px + pw / 2);
    const dy = ny - (py + ph / 2);
    const side = note.side ?? (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "RIGHT" : "LEFT") : (dy >= 0 ? "BOTTOM" : "TOP"));
    bySide[side].push(note);
  }

  markWindowStacking(windowId);
  childNotes.forEach((n) => markNoteUnstacking(n.id));

  let finishedCount = 0;
  for (const side of ["RIGHT", "LEFT", "TOP", "BOTTOM"] as const) {
    const sideNotes = bySide[side];
    if (!sideNotes || sideNotes.length === 0) continue;

    for (let i = 0; i < sideNotes.length; i++) {
      const note = sideNotes[i];
      const el = document.getElementById(`win-${note.id}`);
      if (!el) {
        finishedCount++;
        if (finishedCount >= childNotes.length) {
          unmarkWindowStacking(windowId);
          childNotes.forEach((n) => unmarkNoteUnstacking(n.id));
          state.toggleStackWindow(windowId);
        }
        continue;
      }

      const noteRect = el.getBoundingClientRect();
      const noteW = note.width ?? 260;
      const noteH = note.height ?? (note.isExcerptNote ? 64 : 200);

      const { toX, toY } = getStubTargetOffset(side, i, sideNotes.length, noteW, noteH, parentRect, noteRect);

      const parentZ = parentWin.zIndex ?? 1;
      el.style.zIndex = `${parentZ - 1}`;

      const anim = el.animate(
        [
          { transform: "translate3d(0, 0, 0)", opacity: 1 },
          { transform: `translate3d(${toX}px, ${toY}px, 0)`, opacity: 1 },
        ],
        {
          duration: 300,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        }
      );

      anim.onfinish = () => {
        finishedCount++;
        if (finishedCount >= childNotes.length) {
          unmarkWindowStacking(windowId);
          childNotes.forEach((n) => unmarkNoteUnstacking(n.id));
          state.toggleStackWindow(windowId);
        }
      };
    }
  }
}
