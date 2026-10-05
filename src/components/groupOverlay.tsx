import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindows, getDescendantNotes, type WindowData, type WindowGroup } from "../store/windows";
import { getWindowWorldBounds } from "./selectionOverlay";
import { deleteScroll } from "../utils/scrollMemory";
import { evictClosedWindowArticles } from "../utils/articleCache";
import { lastUnstackedRects, lastStackedStubRects } from "../utils/stackAnimation";
import { getCamera } from "../utils/camera";
import { isDraggingWindow, setDraggingWindow } from "../utils/window/drag";
import { isResizingWindow } from "../utils/window/resize";
import { startWireDrag } from "../utils/window/wireDrag";

const GROUP_COLORS: { id: string; name: string; border: string; bg: string }[] = [
  { id: "neutral", name: "Neutral", border: "#333333", bg: "rgba(82, 82, 82, 0.12)" },
  { id: "orange", name: "Orange", border: "#ea580c", bg: "rgba(254, 215, 170, 0.35)" },
  { id: "yellow", name: "Yellow", border: "#ca8a04", bg: "rgba(254, 240, 138, 0.35)" },
  { id: "green", name: "Green", border: "#65a30d", bg: "rgba(187, 247, 208, 0.35)" },
  { id: "blue", name: "Blue", border: "#0284c7", bg: "rgba(186, 230, 253, 0.35)" },
  { id: "purple", name: "Purple", border: "#9333ea", bg: "rgba(233, 213, 255, 0.35)" },
];

function MiniGroupBoxIcon({ border, bg, size = 26 }: { border: string; bg: string; size?: number }) {
  return (
    <div
      className="shrink-0 rounded-[7px] border-[2.2px] transition-transform flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderColor: border,
        backgroundColor: bg,
      }}
    />
  );
}

export function readLiveWindowWorldBounds(el: HTMLElement | null, w: WindowData) {
  const baseLeft = parseFloat(el?.style.left || "") || (w.x ?? 80);
  const baseTop = parseFloat(el?.style.top || "") || (w.y ?? 80);
  const baseW = parseFloat(el?.style.width || "") || el?.offsetWidth || (w.width ?? (w.contentType === "sticky" ? 320 : 380));
  const baseH = parseFloat(el?.style.height || "") || el?.offsetHeight || (w.height ?? (w.contentType === "sticky" ? (w.isExcerptNote ? 64 : 200) : 480));

  let tx = 0;
  let ty = 0;
  if (el) {
    const t = el.style.transform;
    if (t && t !== "none") {
      const match = t.match(/translate(?:3d)?\(([-\d.]+)(?:px)?,\s*([-\d.]+)(?:px)?/);
      if (match) {
        tx = parseFloat(match[1]) || 0;
        ty = parseFloat(match[2]) || 0;
      }
    }
  }

  const left = baseLeft + tx;
  const top = baseTop + ty;
  return { left, top, right: left + baseW, bottom: top + baseH };
}

const GroupStackedStubItem = memo(function GroupStackedStubItem({
  note,
  stubW,
  stubH,
  posStyle,
  colorBg,
  isImage,
  imgUrl,
  side,
  onUnstack,
}: {
  note: WindowData;
  stubW: number;
  stubH: number;
  posStyle: React.CSSProperties;
  colorBg: string;
  isImage: boolean;
  imgUrl?: string;
  side: "RIGHT" | "LEFT" | "TOP" | "BOTTOM";
  onUnstack: () => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const prevRect = lastUnstackedRects.get(note.id);
    if (prevRect) {
      lastUnstackedRects.delete(note.id);
      const stubRect = el.getBoundingClientRect();
      const fromX = prevRect.left - stubRect.left;
      const fromY = prevRect.top - stubRect.top;
      const scaleX = prevRect.width / Math.max(stubRect.width, 1);
      const scaleY = prevRect.height / Math.max(stubRect.height, 1);

      el.animate(
        [
          { transform: `translate3d(${fromX}px, ${fromY}px, 0) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left", opacity: 1 },
          { transform: "translate3d(0, 0, 0) scale(1, 1)", transformOrigin: "top left", opacity: 1 },
        ],
        {
          duration: 300,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        }
      );
    }
  }, [note.id]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elRef.current;
    if (el) {
      lastStackedStubRects.set(note.id, el.getBoundingClientRect());
    }
    onUnstack();
  };

  const hoverClass =
    side === "RIGHT"
      ? "hover:translate-x-[4px]"
      : side === "LEFT"
      ? "hover:-translate-x-[4px]"
      : side === "TOP"
      ? "hover:-translate-y-[4px]"
      : "hover:translate-y-[4px]";

  return (
    <div
      ref={elRef}
      id={`stub-${note.id}`}
      className={`absolute pointer-events-auto cursor-pointer transition-transform duration-150 ${hoverClass} rounded-[10px] border border-black/20 shadow-md overflow-hidden`}
      style={{
        width: `${stubW}px`,
        height: `${stubH}px`,
        background: colorBg,
        ...posStyle,
      }}
      onClick={handleClick}
      title="Click to unstack note"
    >
      {isImage && imgUrl && (
        <img
          src={imgUrl}
          alt={note.title}
          className="w-full h-full object-cover opacity-90"
        />
      )}
      {!isImage && (
        <div className="p-3 text-[12px] font-sans text-neutral-800 line-clamp-5">
          {note.stickyText || note.title || "Note"}
        </div>
      )}
    </div>
  );
});

function GroupColorPickerPortal({
  groupId,
  currentColor,
  isOpen,
  onClose,
}: {
  groupId: string;
  currentColor?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const updateGroup = useWindows((s) => s.updateGroup);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stylePos, setStylePos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !pickerRef.current) return;
    const pickerEl = pickerRef.current;
    const groupEl = document.getElementById(`group-box-${groupId}`);
    if (groupEl && pickerEl) {
      const rect = groupEl.getBoundingClientRect();
      const pickerH = pickerEl.offsetHeight;
      const pickerW = pickerEl.offsetWidth;

      const top = Math.min(window.innerHeight - pickerH - 12, rect.bottom + 14);
      let left = rect.left + rect.width / 2;

      if (left + pickerW / 2 > window.innerWidth - 12) left = window.innerWidth - 12 - pickerW / 2;
      if (left - pickerW / 2 < 12) left = 12 + pickerW / 2;

      setStylePos({ left, top });
    }
  }, [isOpen, groupId, isHovered]);

  useEffect(() => {
    if (!isOpen) return;
    const handleDismiss = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        pickerRef.current &&
        !pickerRef.current.contains(target as Node) &&
        !target?.closest(".group-context-menu")
      ) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleDismiss, true);
      window.addEventListener("pointerdown", handleDismiss, true);
      window.addEventListener("click", handleDismiss, true);
      window.addEventListener("wheel", handleDismiss, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleDismiss, true);
      window.removeEventListener("pointerdown", handleDismiss, true);
      window.removeEventListener("click", handleDismiss, true);
      window.removeEventListener("wheel", handleDismiss, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 300);
  };

  const currentOpt =
    GROUP_COLORS.find((c) => c.border === currentColor) || GROUP_COLORS[0];

  return createPortal(
    <div
      ref={pickerRef}
      className="group-context-menu group-color-picker fixed z-[100000] flex items-center justify-center pointer-events-auto select-none p-1"
      style={{ left: stylePos.left, top: stylePos.top, transform: "translateX(-50%)" }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`bg-white/95 backdrop-blur-md border-2 border-[#d0d0d0] shadow-[0_8px_24px_rgba(0,0,0,0.14)] flex items-center justify-center transition-all duration-200 ease-out ${
          isHovered
            ? "w-[270px] h-[48px] px-3.5 py-1.5 gap-3 rounded-[18px] overflow-hidden"
            : "w-[48px] h-[48px] p-2 rounded-[14px] cursor-pointer"
        }`}
        onClick={() => {
          if (!isHovered) setIsHovered(true);
        }}
      >
        {!isHovered ? (
          <div className="w-8 h-8 flex items-center justify-center cursor-pointer transition-transform hover:scale-105">
            <MiniGroupBoxIcon border={currentOpt.border} bg={currentOpt.bg} size={26} />
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0 animate-in fade-in duration-200">
            {GROUP_COLORS.map((opt) => {
              const isSelected = (currentColor || GROUP_COLORS[0].border) === opt.border;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    updateGroup(groupId, { color: opt.border });
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className={`relative p-0.5 rounded-[9px] cursor-pointer transition-all duration-150 shrink-0 bg-transparent border-none ${
                    isSelected
                      ? "scale-110 opacity-100 ring-2 ring-neutral-700"
                      : "opacity-75 hover:opacity-100 hover:scale-105 active:scale-95"
                  }`}
                  title={opt.name}
                >
                  <MiniGroupBoxIcon border={opt.border} bg={opt.bg} size={26} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function GroupContextMenuPortal({
  group,
  isOpen,
  onClose,
  areObjectsStacked,
  allSelectedAlwaysOnTop,
  handleUngroup,
  handleStackObjects,
  handleCompress,
  handleAlwaysOnTop,
  handleBreakConnections,
  handleDelete,
}: {
  group: WindowGroup;
  isOpen: boolean;
  onClose: () => void;
  areObjectsStacked: boolean;
  allSelectedAlwaysOnTop: boolean;
  handleUngroup: (e: React.MouseEvent) => void;
  handleStackObjects: (e: React.MouseEvent) => void;
  handleCompress: (e: React.MouseEvent) => void;
  handleAlwaysOnTop: (e: React.MouseEvent) => void;
  handleBreakConnections: (e: React.MouseEvent) => void;
  handleDelete: (e: React.MouseEvent) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [stylePos, setStylePos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!isOpen) return;

    function updatePos() {
      const menuEl = menuRef.current;
      const groupEl = document.getElementById(`group-box-${group.id}`);
      if (!groupEl || !menuEl) return;

      const rect = groupEl.getBoundingClientRect();
      const menuW = menuEl.offsetWidth;

      const top = rect.top - 12;
      let left = rect.left + rect.width / 2;

      if (left + menuW / 2 > window.innerWidth - 12) left = window.innerWidth - 12 - menuW / 2;
      if (left - menuW / 2 < 12) left = 12 + menuW / 2;

      setStylePos({ left, top });
    }

    updatePos();
    let rafId = requestAnimationFrame(function loop() {
      updatePos();
      rafId = requestAnimationFrame(loop);
    });

    return () => cancelAnimationFrame(rafId);
  }, [isOpen, group.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleDismiss = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        menuRef.current &&
        !menuRef.current.contains(target as Node) &&
        !target?.closest(".group-color-picker")
      ) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleDismiss, true);
      window.addEventListener("pointerdown", handleDismiss, true);
      window.addEventListener("click", handleDismiss, true);
      window.addEventListener("wheel", handleDismiss, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleDismiss, true);
      window.removeEventListener("pointerdown", handleDismiss, true);
      window.removeEventListener("click", handleDismiss, true);
      window.removeEventListener("wheel", handleDismiss, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="group-context-menu fixed z-[100000] w-[185px] p-1.5 bg-white border-2 border-[#d0d0d0] rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] select-none flex flex-col gap-0.5 pointer-events-auto"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        left: `${stylePos.left}px`,
        top: `${stylePos.top}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleUngroup}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
      >
        <span className="shrink-0 text-[#171717]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17l9.2-9.2M17 17V7H7" />
          </svg>
        </span>
        Ungroup
      </button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleStackObjects}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
      >
        <span className="shrink-0 text-[#171717]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="6" height="6" rx="1.5" />
            <circle cx="16" cy="7" r="1.5" />
            <circle cx="16" cy="16" r="1.5" />
            <circle cx="7" cy="16" r="1.5" />
          </svg>
        </span>
        {areObjectsStacked ? "Unstack objects" : "Stack objects"}
      </button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleCompress}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
      >
        <span className="shrink-0 text-[#171717]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </span>
        {group.compressed ? "Decompress" : "Compress"}
      </button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleAlwaysOnTop}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
      >
        <span className="shrink-0 text-[#171717]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </span>
        {allSelectedAlwaysOnTop ? "Unpin from top" : "Always on top"}
      </button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleBreakConnections}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
      >
        <span className="shrink-0 text-[#171717]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
            <line x1="14.47" y1="14.47" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
          </svg>
        </span>
        Break connection
      </button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleDelete}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
      >
        <span className="shrink-0 text-[#171717]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
        Delete
      </button>
    </div>,
    document.body
  );
}

function SingleGroupItem({ group }: { group: WindowGroup }) {
  const windows = useWindows((s) => s.windows);
  const ungroup = useWindows((s) => s.ungroup);
  const removeWindow = useWindows((s) => s.removeWindow);

  const [menuOpen, setMenuOpen] = useState(false);

  const memberWins = windows.filter((w) => group.memberIds.includes(w.id) && !w.stacked);

  useEffect(() => {
    if (!menuOpen) return;
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".group-context-menu")) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, [menuOpen]);

  const isDraggingGroupRef = useRef(false);

  // Live rAF bounds tracking for active window drag/resize
  useEffect(() => {
    let rafId = 0;
    const isCompressed = !!group.compressed;
    const PAD = isCompressed ? 20 : 44;

    function updateLiveGroupBounds() {
      rafId = 0;
      if (isDraggingGroupRef.current) return;

      const containerEl = document.getElementById(`group-box-${group.id}`);
      if (!containerEl) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const w of memberWins) {
        let wx = w.x ?? 80;
        let wy = w.y ?? 80;
        let ww = w.width ?? 750;
        let wh = w.height ?? 550;

        if (isCompressed) {
          ww = w.contentType === "sticky" ? (w.isExcerptNote ? 140 : 180) : 200;
          wh = w.contentType === "sticky" ? (w.isExcerptNote ? 54 : 120) : 140;
        } else {
          const el = document.getElementById(`win-${w.id}`);
          const b = readLiveWindowWorldBounds(el, w);
          wx = b.left;
          wy = b.top;
          ww = b.right - b.left;
          wh = b.bottom - b.top;
        }

        if (wx < minX) minX = wx;
        if (wy < minY) minY = wy;
        if (wx + ww > maxX) maxX = wx + ww;
        if (wy + wh > maxY) maxY = wy + wh;
      }

      if (minX !== Infinity) {
        containerEl.style.left = `${minX - PAD}px`;
        containerEl.style.top = `${minY - PAD}px`;
        containerEl.style.width = `${maxX - minX + PAD * 2}px`;
        containerEl.style.height = `${maxY - minY + PAD * 2}px`;
      }

      if (isDraggingWindow || isResizingWindow) {
        rafId = requestAnimationFrame(updateLiveGroupBounds);
      }
    }

    function onMouseMove() {
      if ((isDraggingWindow || isResizingWindow) && !isDraggingGroupRef.current && !rafId) {
        rafId = requestAnimationFrame(updateLiveGroupBounds);
      }
    }

    function onMouseDown() {
      if (!isDraggingGroupRef.current && !rafId) {
        rafId = requestAnimationFrame(updateLiveGroupBounds);
      }
    }

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [group.id, group.compressed, memberWins]);

  if (memberWins.length === 0) return null;

  const isCompressed = !!group.compressed;
  const PAD = isCompressed ? 20 : 44;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of memberWins) {
    const wx = w.x ?? 80;
    const wy = w.y ?? 80;
    let ww = w.width ?? 750;
    let wh = w.height ?? 550;

    if (isCompressed) {
      ww = w.contentType === "sticky" ? (w.isExcerptNote ? 140 : 180) : 200;
      wh = w.contentType === "sticky" ? (w.isExcerptNote ? 54 : 120) : 140;
    } else {
      const b = getWindowWorldBounds(w);
      ww = b.right - b.left;
      wh = b.bottom - b.top;
    }

    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx + ww > maxX) maxX = wx + ww;
    if (wy + wh > maxY) maxY = wy + wh;
  }

  const boxX = minX - PAD;
  const boxY = minY - PAD;
  const boxW = maxX - minX + PAD * 2;
  const boxH = maxY - minY + PAD * 2;

  let minMemberZ = Infinity;
  for (const w of memberWins) {
    const effZ = w.pdfMaximized
      ? 100000
      : w.alwaysOnTop
      ? 50000 + (w.zIndex ?? 0)
      : w.zIndex ?? 0;
    if (effZ < minMemberZ) minMemberZ = effZ;
  }
  const boxZIndex = minMemberZ !== Infinity ? Math.max(0, minMemberZ - 1) : 0;

  const handleActivateGroup = () => {
    const state = useWindows.getState();
    const groupAndMemberIds = new Set([group.id, ...group.memberIds]);

    const activeMemberWins = state.windows.filter(
      (w) => group.memberIds.includes(w.id) && !w.stacked
    );

    const childNotes: WindowData[] = [];
    for (const id of groupAndMemberIds) {
      const descs = getDescendantNotes(id, state.windows);
      for (const d of descs) {
        if (!d.stacked && !childNotes.some((cn) => cn.id === d.id) && !group.memberIds.includes(d.id)) {
          childNotes.push(d);
        }
      }
    }

    const allWinsToActivate = [...activeMemberWins, ...childNotes];
    if (allWinsToActivate.length === 0) return;

    const isPinned = allWinsToActivate.some((w) => w.alwaysOnTop);
    const startMaxZ = state.maxZIndex;
    let curMaxZ = startMaxZ;

    const sorted = [...allWinsToActivate].sort((a, b) => {
      if (group.compressed) {
        const aIsSticky = a.contentType === "sticky";
        const bIsSticky = b.contentType === "sticky";
        if (aIsSticky !== bIsSticky) {
          return aIsSticky ? -1 : 1;
        }
      }
      return (a.zIndex ?? 0) - (b.zIndex ?? 0);
    });
    const zMap = new Map<string, number>();
    for (const w of sorted) {
      curMaxZ += 1;
      zMap.set(w.id, curMaxZ);
    }

    const containerEl = document.getElementById(`group-box-${group.id}`);
    const minZ = zMap.get(sorted[0]?.id || "") ?? curMaxZ;
    const baseContainerZ = isPinned ? 50000 + minZ - 1 : Math.max(0, minZ - 1);

    if (containerEl) {
      containerEl.style.zIndex = String(baseContainerZ);
    }

    for (const w of sorted) {
      const el = document.getElementById(`win-${w.id}`);
      if (el) {
        const effZ = isPinned ? 50000 + (zMap.get(w.id) ?? 0) : (zMap.get(w.id) ?? 0);
        el.style.zIndex = String(effZ);
      }
    }

    useWindows.setState((s) => ({
      maxZIndex: curMaxZ,
      windows: s.windows.map((w) => {
        const newZ = zMap.get(w.id);
        return newZ !== undefined ? { ...w, zIndex: newZ, active: true } : { ...w, active: false };
      }),
    }));
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest(".window, .group-context-menu, button")) return;

    e.preventDefault();
    e.stopPropagation();

    handleActivateGroup();

    const startX = e.clientX;
    const startY = e.clientY;

    const state = useWindows.getState();

    const activeMemberWins = state.windows.filter(
      (w) => group.memberIds.includes(w.id) && !w.stacked
    );

    const allWinsToDrag = activeMemberWins;

    const groupTargets = allWinsToDrag
      .map((w) => {
        const el = document.getElementById(`win-${w.id}`);
        if (!el) return null;
        const bLeft = parseFloat(el.style.left) || el.offsetLeft || 0;
        const bTop = parseFloat(el.style.top) || el.offsetTop || 0;
        return { id: w.id, el, baseLeft: bLeft, baseTop: bTop };
      })
      .filter((gt): gt is { id: string; el: HTMLElement; baseLeft: number; baseTop: number } => gt !== null);

    if (groupTargets.length === 0) return;

    const containerEl = document.getElementById(`group-box-${group.id}`);

    isDraggingGroupRef.current = true;
    document.body.style.cursor = "move";
    containerEl?.classList.add("dragging");
    containerEl?.closest(".canvas-world")?.classList.add("gesture-active");
    setDraggingWindow(true);

    for (const gt of groupTargets) {
      gt.el.style.willChange = "transform";
    }
    if (containerEl) {
      containerEl.style.willChange = "transform";
    }

    let rafId = 0;
    let curX = startX;
    let curY = startY;

    function update() {
      rafId = 0;
      const cam = getCamera();
      const rdx = Math.round((curX - startX) / cam.zoom);
      const rdy = Math.round((curY - startY) / cam.zoom);

      for (const gt of groupTargets) {
        gt.el.style.transform = `translate3d(${rdx}px, ${rdy}px, 0)`;
      }
      if (containerEl) {
        containerEl.style.transform = `translate3d(${rdx}px, ${rdy}px, 0)`;
      }
    }

    function onMouseMove(ev: MouseEvent) {
      curX = ev.clientX;
      curY = ev.clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(update);
      }
    }

    function onMouseUp(ev: MouseEvent) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }

      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const cam = getCamera();
      const rdx = Math.round((ev.clientX - startX) / cam.zoom);
      const rdy = Math.round((ev.clientY - startY) / cam.zoom);

      if (containerEl) {
        containerEl.style.left = `${boxX + rdx}px`;
        containerEl.style.top = `${boxY + rdy}px`;
        containerEl.style.willChange = "";
        containerEl.style.transform = "";
      }

      for (const gt of groupTargets) {
        gt.el.style.willChange = "";
        gt.el.style.transform = "";
        const finalLeft = gt.baseLeft + rdx;
        const finalTop = gt.baseTop + rdy;
        gt.el.style.left = `${finalLeft}px`;
        gt.el.style.top = `${finalTop}px`;
      }

      const updates = new Map(
        groupTargets.map((gt) => [gt.id, { x: gt.baseLeft + rdx, y: gt.baseTop + rdy }])
      );

      useWindows.setState((state) => ({
        windows: state.windows.map((w) => {
          const up = updates.get(w.id);
          return up ? { ...w, ...up } : w;
        }),
      }));

      requestAnimationFrame(() => {
        isDraggingGroupRef.current = false;
        setDraggingWindow(false);
        document.body.style.cursor = "";
        containerEl?.classList.remove("dragging");
        containerEl?.closest(".canvas-world")?.classList.remove("gesture-active");
      });
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleUngroup = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ungroup(group.id);
    setMenuOpen(false);
  };

  const handleStackObjects = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const state = useWindows.getState();

    const groupDirectNotes = state.windows.filter(
      (w) =>
        w.contentType === "sticky" &&
        !group.memberIds.includes(w.id) &&
        (w.parentId === group.id || w.parentIds?.includes(group.id))
    );

    if (groupDirectNotes.length > 0) {
      const hasUnstacked = groupDirectNotes.some((w) => !w.stacked);
      const shouldStack = hasUnstacked;

      if (shouldStack) {
        groupDirectNotes.forEach((note) => {
          if (!note.stacked) {
            const noteEl = document.getElementById(`win-${note.id}`);
            if (noteEl) {
              lastUnstackedRects.set(note.id, noteEl.getBoundingClientRect());
            }
            state.toggleStackSingleNote(note.id);
          }
        });
      } else {
        groupDirectNotes.forEach((note) => {
          if (note.stacked) {
            const stubEl = document.getElementById(`stub-${note.id}`);
            if (stubEl) {
              lastStackedStubRects.set(note.id, stubEl.getBoundingClientRect());
            }
            state.unstackNote(note.id);
          }
        });
      }
    }
    setMenuOpen(false);
  };

  const handleCompress = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const containerEl = document.getElementById(`group-box-${group.id}`);
    if (containerEl) {
      containerEl.classList.add("compress-transition");
      setTimeout(() => containerEl.classList.remove("compress-transition"), 350);
    }

    for (const id of group.memberIds) {
      const winEl = document.getElementById(`win-${id}`);
      if (winEl) {
        winEl.classList.add("compress-transition");
        setTimeout(() => winEl.classList.remove("compress-transition"), 350);
      }
    }

    useWindows.getState().toggleCompressGroup(group.id);
    setMenuOpen(false);
  };

  const handleAlwaysOnTop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const allPinned = memberWins.every((w) => w.alwaysOnTop);
    const nextAlwaysOnTop = !allPinned;

    useWindows.setState((state) => {
      let curMaxZ = state.maxZIndex;
      const sortedMembers = state.windows
        .filter((w) => group.memberIds.includes(w.id))
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      const zMap = new Map<string, number>();

      for (const w of sortedMembers) {
        curMaxZ += 1;
        zMap.set(w.id, curMaxZ);
      }

      return {
        maxZIndex: curMaxZ,
        windows: state.windows.map((w) => {
          if (group.memberIds.includes(w.id)) {
            const newZ = zMap.get(w.id) ?? w.zIndex;
            return { ...w, alwaysOnTop: nextAlwaysOnTop, zIndex: newZ };
          }
          return w;
        }),
      };
    });
    setMenuOpen(false);
  };

  const handleBreakConnections = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useWindows.getState().breakGroupExternalConnections(group.id);
    setMenuOpen(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    for (const id of group.memberIds) {
      deleteScroll(id);
      removeWindow(id);
    }
    evictClosedWindowArticles();
    setMenuOpen(false);
  };

  const groupDirectNotes = windows.filter(
    (w) =>
      w.contentType === "sticky" &&
      !group.memberIds.includes(w.id) &&
      (w.parentId === group.id || w.parentIds?.includes(group.id))
  );

  const areObjectsStacked =
    groupDirectNotes.length > 0 ? groupDirectNotes.every((w) => w.stacked) : false;

  const stackedGroupNotes = windows.filter(
    (w) => w.contentType === "sticky" && w.stacked && (w.parentId === group.id || w.parentIds?.includes(group.id))
  );

  const borderColor = group.color || "#333333";
  const allSelectedAlwaysOnTop = memberWins.every((w) => w.alwaysOnTop);

  return (
    <>
      <div
        id={`group-box-${group.id}`}
        className="group-box"
        onMouseDown={handleContainerMouseDown}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest(".window")) return;
          e.preventDefault();
          e.stopPropagation();
          handleActivateGroup();
          setMenuOpen(true);
        }}
        style={{
          position: "absolute",
          left: `${boxX}px`,
          top: `${boxY}px`,
          width: `${boxW}px`,
          height: `${boxH}px`,
          backgroundColor: group.color ? `${group.color}15` : "rgba(0, 0, 0, 0.03)",
          borderRadius: "28px",
          pointerEvents: "auto",
          zIndex: boxZIndex,
        }}
      >
        {/* Dashed Border Overlay (drawn over stacked cards) */}
        <div
          className="absolute inset-0 pointer-events-none rounded-[28px]"
          style={{
            border: `1.5px dashed ${borderColor}`,
            zIndex: 10,
          }}
        />
        {/* Stacked Notes Overlay for Group Box */}
        {stackedGroupNotes.length > 0 && (
          <div className="absolute inset-0 pointer-events-none select-none z-[-1]" style={{ overflow: "visible" }}>
            {(["RIGHT", "LEFT", "TOP", "BOTTOM"] as const).map((side) => {
              const sideNotes = stackedGroupNotes.filter(
                (n) => (n.side ?? "RIGHT") === side
              );
              if (sideNotes.length === 0) return null;

              return (
                <div key={side}>
                  {sideNotes.map((note, i) => {
                    const stubW = 220;
                    const stubH = 160;
                    const total = sideNotes.length;
                    const isCenter = total % 2 === 1 && i === Math.floor(total / 2);
                    const peek = isCenter ? 26 : 18;

                    const spreadX = (i - (total - 1) / 2) * 65;
                    const spreadY = (i - (total - 1) / 2) * 55;
                    const zIndex = -i - 1;

                    let posStyle: React.CSSProperties = {};
                    if (side === "RIGHT") {
                      posStyle = {
                        left: `calc(100% - ${stubW - 22}px)`,
                        top: `calc(50% + ${spreadY - stubH / 2}px)`,
                        zIndex,
                        clipPath: "inset(0 0 0 calc(100% - 70px))",
                      };
                    } else if (side === "LEFT") {
                      posStyle = {
                        left: `calc(-22px)`,
                        top: `calc(50% + ${spreadY - stubH / 2}px)`,
                        zIndex,
                        clipPath: "inset(0 calc(100% - 70px) 0 0)",
                      };
                    } else if (side === "TOP") {
                      posStyle = {
                        top: `calc(-${peek}px)`,
                        left: `calc(50% + ${spreadX - stubW / 2}px)`,
                        zIndex,
                        clipPath: `inset(0 0 calc(100% - ${peek + 50}px) 0)`,
                      };
                    } else {
                      // BOTTOM
                      const botPeek = isCenter ? 26 : 22;
                      posStyle = {
                        top: `calc(100% - ${stubH - botPeek}px)`,
                        left: `calc(50% + ${spreadX - stubW / 2}px)`,
                        zIndex,
                        clipPath: `inset(calc(100% - ${botPeek + 50}px) 0 0 0)`,
                      };
                    }

                    const isImage = !!(note.directImageUrl || note.title?.startsWith("File:"));
                    const colorBg = isImage ? "#e2e8f0" : (note.noteColor || "#fef08a");

                    return (
                      <GroupStackedStubItem
                        key={note.id}
                        note={note}
                        stubW={stubW}
                        stubH={stubH}
                        posStyle={posStyle}
                        colorBg={colorBg}
                        isImage={isImage}
                        imgUrl={note.directImageUrl}
                        side={side}
                        onUnstack={() => useWindows.getState().unstackNote(note.id)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Connection Points (4 dots at the edges) */}
        <button
          type="button"
          className="connection-point point-top"
          title="Add sticky note"
          onMouseDown={(e) => {
            startWireDrag(
              e,
              group.id,
              "TOP",
              (side) => {
                useWindows.getState().addWindow({
                  contentType: "sticky",
                  parentId: group.id,
                  side,
                });
              },
              `group-box-${group.id}`,
              group.memberIds
            );
          }}
        />
        <button
          type="button"
          className="connection-point point-right"
          title="Add sticky note"
          onMouseDown={(e) => {
            startWireDrag(
              e,
              group.id,
              "RIGHT",
              (side) => {
                useWindows.getState().addWindow({
                  contentType: "sticky",
                  parentId: group.id,
                  side,
                });
              },
              `group-box-${group.id}`,
              group.memberIds
            );
          }}
        />
        <button
          type="button"
          className="connection-point point-bottom"
          title="Add sticky note"
          onMouseDown={(e) => {
            startWireDrag(
              e,
              group.id,
              "BOTTOM",
              (side) => {
                useWindows.getState().addWindow({
                  contentType: "sticky",
                  parentId: group.id,
                  side,
                });
              },
              `group-box-${group.id}`,
              group.memberIds
            );
          }}
        />
        <button
          type="button"
          className="connection-point point-left"
          title="Add sticky note"
          onMouseDown={(e) => {
            startWireDrag(
              e,
              group.id,
              "LEFT",
              (side) => {
                useWindows.getState().addWindow({
                  contentType: "sticky",
                  parentId: group.id,
                  side,
                });
              },
              `group-box-${group.id}`,
              group.memberIds
            );
          }}
        />

      </div>

      {/* Top Group Context Menu Portal */}
      <GroupContextMenuPortal
        group={group}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        areObjectsStacked={areObjectsStacked}
        allSelectedAlwaysOnTop={allSelectedAlwaysOnTop}
        handleUngroup={handleUngroup}
        handleStackObjects={handleStackObjects}
        handleCompress={handleCompress}
        handleAlwaysOnTop={handleAlwaysOnTop}
        handleBreakConnections={handleBreakConnections}
        handleDelete={handleDelete}
      />

      {/* Bottom Color Palette Portal */}
      <GroupColorPickerPortal
        groupId={group.id}
        currentColor={group.color}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}

const GroupOverlay = memo(function GroupOverlay() {
  const groups = useWindows((s) => s.groups);

  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((g) => (
        <SingleGroupItem key={g.id} group={g} />
      ))}
    </>
  );
});

export default GroupOverlay;
