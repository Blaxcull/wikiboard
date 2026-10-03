import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindows } from "../store/windows";
import { deleteScroll } from "../utils/scrollMemory";
import { evictClosedWindowArticles } from "../utils/articleCache";
import { stackWindowWithAnimation, stackSingleNoteWithAnimation } from "../utils/stackAnimation";


export type ContextMenuPosition = {
  x: number;
  y: number;
  windowId: string;
};

type Props = {
  pos: ContextMenuPosition | null;
  onClose: () => void;
};

export default function WindowContextMenu({ pos, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [stylePos, setStylePos] = useState({ left: pos?.x ?? 0, top: pos?.y ?? 0 });

  useLayoutEffect(() => {
    if (!pos || !menuRef.current) return;
    const menuEl = menuRef.current;
    const winEl = document.getElementById(`win-${pos.windowId}`);
    if (winEl && menuEl) {
      const rect = winEl.getBoundingClientRect();
      const menuH = menuEl.offsetHeight;
      const menuW = menuEl.offsetWidth;

      let top = rect.top - menuH - 18;
      let left = rect.left + (rect.width - menuW) / 2;

      if (left + menuW > window.innerWidth - 12) left = window.innerWidth - menuW - 12;
      if (left < 12) left = 12;

      setStylePos({ left, top });
    }
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const handleDismiss = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        menuRef.current &&
        !menuRef.current.contains(target as Node) &&
        !target?.closest(".sticky-color-picker")
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
  }, [pos, onClose]);

  const windows = useWindows((s) => s.windows);
  const targetWin = windows.find((w) => w.id === pos?.windowId);
  const isAlwaysOnTop = !!targetWin?.alwaysOnTop;
  const isSticky = targetWin?.contentType === "sticky";
  const isImage = !!(targetWin?.directImageUrl || targetWin?.title?.startsWith("File:"));

  const childNotes = windows.filter(
    (w) => (w.parentId === pos?.windowId || w.parentIds?.includes(pos?.windowId ?? ""))
  );
  const hasUnstackedNotes = childNotes.some((w) => !w.stacked);

  let stackLabel = "Stack notes";
  if (isImage) {
    if (childNotes.length > 0) {
      stackLabel = hasUnstackedNotes ? "Stack notes" : "Unstack notes";
    } else {
      stackLabel = targetWin?.stacked ? "Unstack image" : "Stack image";
    }
  } else if (isSticky) {
    stackLabel = targetWin?.stacked ? "Unstack note" : "Stack note";
  } else {
    stackLabel = childNotes.length > 0 && !hasUnstackedNotes ? "Unstack notes" : "Stack notes";
  }

  if (!pos) return null;

  const items = [
    {
      id: "stack",
      label: stackLabel,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <circle cx="16" cy="7" r="1.5" />
          <circle cx="16" cy="16" r="1.5" />
          <circle cx="7" cy="16" r="1.5" />
        </svg>
      ),
    },
    {
      id: "always-on-top",
      label: isAlwaysOnTop ? "Unpin from top" : "Always on top",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      ),
    },
    {
      id: "break-connection",
      label: "Break connection",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.47" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      id: "delete",
      label: "Delete",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ),
    },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="window-context-menu fixed z-[100000] w-[185px] p-1.5 bg-white border-2 border-[#d0d0d0] rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] select-none"
      style={{ left: stylePos.left, top: stylePos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-semibold text-[#171717] rounded-[10px] transition-colors cursor-pointer border-none bg-transparent hover:bg-black/10 active:bg-black/15 text-left"
          onClick={() => {
            if (item.id === "delete") {
              deleteScroll(pos.windowId);
              useWindows.getState().removeWindow(pos.windowId);
              evictClosedWindowArticles();
            } else if (item.id === "break-connection") {
              useWindows.getState().breakConnections(pos.windowId);
            } else if (item.id === "always-on-top") {
              useWindows.getState().toggleAlwaysOnTop(pos.windowId);
            } else if (item.id === "stack") {
              if (isSticky || (isImage && childNotes.length === 0)) {
                stackSingleNoteWithAnimation(pos.windowId);
              } else {
                stackWindowWithAnimation(pos.windowId);
              }
            }
            onClose();
          }}
        >
          <span className="shrink-0 text-[#171717]">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
