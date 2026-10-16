import { memo, useEffect, useRef, useState, useCallback } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import { fetchFileUrl } from "../utils/wiki";
import startDrag from "../utils/window/drag";
import { Resize } from "../utils/window/resize";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

const ImageViewer = memo(function ImageViewer({ win, onClose, onActivate, onPositionChange }: Props) {
  const directUrl =
    win.directImageUrl ||
    (win.url && (win.url.startsWith("blob:") || win.url.startsWith("data:") || win.contentType === "image")
      ? win.url
      : undefined);

  const [fetchedUrl, setFetchedUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(!directUrl);
  const [error, setError] = useState(false);
  const imgUrl = directUrl || fetchedUrl;

  useEffect(() => {
    if (directUrl) return;

    let cancelled = false;
    if (win.title && win.title.startsWith("File:")) {
      fetchFileUrl(win.title)
        .then((info) => {
          if (cancelled) return;
          if (info?.url) {
            setFetchedUrl(info.url);
            useWindows.getState().updateWindow(win.id, { directImageUrl: info.url });
          } else {
            setError(true);
          }
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
            setLoading(false);
          }
        });
    } else {
      setLoading(false);
      setError(true);
    }

    return () => {
      cancelled = true;
    };
  }, [win.title, win.id, directUrl]);

  const hasAdjustedRef = useRef(false);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    if (hasAdjustedRef.current) return;
    hasAdjustedRef.current = true;

    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;

    const aspect = nw / nh;
    let targetW = win.width ?? 260;
    let targetH = Math.round(targetW / aspect);

    if (targetH > 360) {
      targetH = 360;
      targetW = Math.round(targetH * aspect);
    }
    if (targetW > 460) {
      targetW = 460;
      targetH = Math.round(targetW / aspect);
    }

    onPositionChange({ width: Math.max(100, targetW), height: Math.max(100, targetH) });
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onActivate();

      const rect = e.currentTarget.getBoundingClientRect();
      const isCorner = e.clientX >= rect.right - 40 && e.clientY >= rect.bottom - 40;

      if (isCorner) {
        Resize(e, (newRect) => onPositionChange(newRect), onActivate);
      } else {
        startDrag(e, (pos) => onPositionChange(pos), onActivate);
      }
    },
    [onActivate, onPositionChange]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isCorner = e.clientX >= rect.right - 40 && e.clientY >= rect.bottom - 40;
    e.currentTarget.style.cursor = isCorner ? "se-resize" : "move";
  }, []);

  return (
    <div
      className="relative w-full h-full group select-none flex items-center justify-center rounded-2xl overflow-hidden cursor-move"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    >
      {/* Top right floating close button - only visible on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/65 hover:bg-black/90 text-white flex items-center justify-center cursor-pointer shadow-lg text-lg leading-none transition-all duration-150 border border-white/20 active:scale-95 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
        title="Close image"
      >
        <span className="-mt-[2px]">&times;</span>
      </button>

      {/* Subtle bottom-right corner resize handle indicator - only visible on hover */}
      <div className="absolute bottom-1.5 right-1.5 z-20 w-5 h-5 flex items-end justify-end pointer-events-none opacity-0 group-hover:opacity-85 transition-opacity duration-150 pr-0.5 pb-0.5">
        <svg className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="13" cy="13" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
          <circle cx="3" cy="13" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="3" r="1.5" />
        </svg>
      </div>

      {imgUrl ? (
        <img
          src={imgUrl}
          alt={win.title ? win.title.replace(/^File:/i, "").replace(/_/g, " ") : "Image"}
          className="w-full h-full object-cover rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.35)] block"
          draggable={false}
          loading="eager"
          decoding="async"
          onLoad={handleImageLoad}
          onError={() => setError(true)}
        />
      ) : loading ? (
        <div className="p-8 text-white/80 text-xs font-medium tracking-wide flex items-center gap-2 bg-black/40 rounded-2xl">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Loading image…
        </div>
      ) : error ? (
        <div className="p-6 text-white/90 text-xs text-center bg-black/40 rounded-2xl">
          Unable to load image
        </div>
      ) : null}
    </div>
  );
});

export default ImageViewer;
