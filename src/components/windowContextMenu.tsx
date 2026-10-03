import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWindows } from "../store/windows";
import { deleteScroll } from "../utils/scrollMemory";
import { evictClosedWindowArticles } from "../utils/articleCache";

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

      const top = rect.top - menuH - 18;
      let left = rect.left + (rect.width - menuW) / 2;

      if (left + menuW > window.innerWidth - 12) left = window.innerWidth - menuW - 12;
      if (left < 12) left = 12;

      setStylePos({ left, top });
    }
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const handleDismiss = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  if (!pos) return null;

  const items = [
    {
      id: "stack",
      label: "Stack",
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
      label: "Always on top",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      ),
    },
    {
      id: "duplicate",
      label: "Duplicate",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </svg>
      ),
    },
    {
      id: "break-connection",
      label: "Break connection",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
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
      className="fixed z-[100000] w-[185px] p-1.5 bg-white border-2 border-[#d0d0d0] rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] select-none"
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
