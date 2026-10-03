import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindows, type WindowData, type WindowGroup } from "../store/windows";
import { getWindowWorldBounds } from "./selectionOverlay";
import { deleteScroll } from "../utils/scrollMemory";
import { evictClosedWindowArticles } from "../utils/articleCache";
import { stackWindowWithAnimation } from "../utils/stackAnimation";
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
    const PAD = 44;

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
        const el = document.getElementById(`win-${w.id}`);
        const b = readLiveWindowWorldBounds(el, w);
        if (b.left < minX) minX = b.left;
        if (b.top < minY) minY = b.top;
        if (b.right > maxX) maxX = b.right;
        if (b.bottom > maxY) maxY = b.bottom;
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

    window.addEventListener("mousemove", onMouseMove, true);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove, true);
    };
  }, [group.id, memberWins]);

  if (memberWins.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of memberWins) {
    const b = getWindowWorldBounds(w);
    if (b.left < minX) minX = b.left;
    if (b.top < minY) minY = b.top;
    if (b.right > maxX) maxX = b.right;
    if (b.bottom > maxY) maxY = b.bottom;
  }

  // Spacing between member windows and the group border
  const PAD = 44;
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
    const isPinned = memberWins.some((w) => w.alwaysOnTop);
    const startMaxZ = useWindows.getState().maxZIndex;
    let curMaxZ = startMaxZ;

    const sorted = [...memberWins].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
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

    const groupTargets = memberWins
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

      isDraggingGroupRef.current = false;
      setDraggingWindow(false);
      document.body.style.cursor = "";
      containerEl?.closest(".canvas-world")?.classList.remove("gesture-active");
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
    const groupAndMemberIds = new Set([group.id, ...group.memberIds]);

    const childNotes = state.windows.filter(
      (w) =>
        (w.parentId && groupAndMemberIds.has(w.parentId)) ||
        w.parentIds?.some((pid) => groupAndMemberIds.has(pid))
    );

    if (childNotes.length > 0) {
      const hasUnstacked = childNotes.some((w) => !w.stacked);
      const shouldStack = hasUnstacked;

      useWindows.setState((s) => ({
        windows: s.windows.map((w) => {
          const isChild =
            (w.parentId && groupAndMemberIds.has(w.parentId)) ||
            w.parentIds?.some((pid) => groupAndMemberIds.has(pid));

          if (isChild) {
            return { ...w, stacked: shouldStack };
          }
          return w;
        }),
      }));
    } else if (memberWins.length > 0) {
      stackWindowWithAnimation(memberWins[0].id);
    }
    setMenuOpen(false);
  };

  const handleCompress = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (memberWins.length === 0) {
      setMenuOpen(false);
      return;
    }

    const GAP = 20;

    let startX = Infinity;
    let startY = Infinity;
    for (const w of memberWins) {
      const wx = w.x ?? 80;
      const wy = w.y ?? 80;
      if (wx < startX) startX = wx;
      if (wy < startY) startY = wy;
    }

    const N = memberWins.length;
    const cols = Math.ceil(Math.sqrt(N));

    const sortedWins = [...memberWins].sort((a, b) => {
      const ay = a.y ?? 0, by = b.y ?? 0;
      if (Math.abs(ay - by) > 60) return ay - by;
      return (a.x ?? 0) - (b.x ?? 0);
    });

    const colWidths: number[] = new Array(cols).fill(0);
    const rowHeights: number[] = new Array(Math.ceil(N / cols)).fill(0);

    sortedWins.forEach((w, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const ww = w.width ?? 750;
      const wh = w.height ?? 550;
      if (ww > colWidths[c]) colWidths[c] = ww;
      if (wh > rowHeights[r]) rowHeights[r] = wh;
    });

    const updates = new Map<string, { x: number; y: number }>();

    sortedWins.forEach((w, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;

      let x = startX;
      for (let ci = 0; ci < c; ci++) {
        x += colWidths[ci] + GAP;
      }

      let y = startY;
      for (let ri = 0; ri < r; ri++) {
        y += rowHeights[ri] + GAP;
      }

      updates.set(w.id, { x, y });
    });

    useWindows.setState((state) => ({
      windows: state.windows.map((w) => {
        const up = updates.get(w.id);
        return up ? { ...w, ...up } : w;
      }),
    }));

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

  const stackedGroupNotes = windows.filter(
    (w) => w.stacked && (w.parentId === group.id || w.parentIds?.includes(group.id))
  );

  const groupAndMemberIds = new Set([group.id, ...group.memberIds]);
  const childNotes = windows.filter(
    (w) =>
      (w.parentId && groupAndMemberIds.has(w.parentId)) ||
      w.parentIds?.some((pid) => groupAndMemberIds.has(pid))
  );

  const areObjectsStacked =
    childNotes.length > 0
      ? childNotes.every((w) => w.stacked)
      : memberWins.length > 0
      ? memberWins.every((w) => w.stacked)
      : false;

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
                      };
                    } else if (side === "LEFT") {
                      posStyle = {
                        left: `calc(-22px)`,
                        top: `calc(50% + ${spreadY - stubH / 2}px)`,
                        zIndex,
                      };
                    } else if (side === "TOP") {
                      posStyle = {
                        top: `calc(-${peek}px)`,
                        left: `calc(50% + ${spreadX - stubW / 2}px)`,
                        zIndex,
                      };
                    } else {
                      // BOTTOM
                      posStyle = {
                        top: `calc(100% - ${stubH - (isCenter ? 26 : 22)}px)`,
                        left: `calc(50% + ${spreadX - stubW / 2}px)`,
                        zIndex,
                      };
                    }

                    const isImage = !!(note.directImageUrl || note.title?.startsWith("File:"));
                    const colorBg = isImage ? "#e2e8f0" : (note.noteColor || "#fef08a");

                    return (
                      <div
                        key={note.id}
                        className="absolute pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-[1.02] rounded-[10px] border border-black/20 shadow-md overflow-hidden"
                        style={{
                          width: `${stubW}px`,
                          height: `${stubH}px`,
                          background: colorBg,
                          ...posStyle,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          useWindows.getState().unstackNote(note.id);
                        }}
                        title={`Click to unstack note`}
                      >
                        {isImage && note.directImageUrl && (
                          <img
                            src={note.directImageUrl}
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
              `group-box-${group.id}`
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
              `group-box-${group.id}`
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
              `group-box-${group.id}`
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
              `group-box-${group.id}`
            );
          }}
        />

        {/* Top Group Context Menu */}
        {menuOpen && (
          <div
            className="group-context-menu w-[185px] p-1.5 bg-white border-2 border-[#d0d0d0] rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] select-none flex flex-col gap-0.5"
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
              position: "absolute",
              left: `${boxW / 2}px`,
              top: "-14px",
              transform: "translate(-50%, -100%)",
              pointerEvents: "auto",
              zIndex: 99999,
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
              Compress
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
          </div>
        )}
      </div>

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
