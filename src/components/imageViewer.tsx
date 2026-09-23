import { useEffect, useRef, useState } from "react";
import type { WindowData } from "../store/windows";
import { fetchFileUrl } from "../utils/wiki";
import startDrag from "../utils/window/drag";

type Props = {
  win: WindowData;
  onClose: () => void;
  onActivate: () => void;
  onPositionChange: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

export default function ImageViewer({ win, onClose, onActivate, onPositionChange }: Props) {
  const directUrl = win.directImageUrl;
  const [fetchedUrl, setFetchedUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(!directUrl);
  const [error, setError] = useState(false);

  const imgUrl = directUrl || fetchedUrl;

  useEffect(() => {
    if (directUrl) return;

    let cancelled = false;
    if (win.title.startsWith("File:")) {
      fetchFileUrl(win.title)
        .then((info) => {
          if (cancelled) return;
          if (info?.url) {
            setFetchedUrl(info.url);
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
    }

    return () => {
      cancelled = true;
    };
  }, [win.title, directUrl]);

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

  return (
    <div
      className="relative w-full h-full group select-none flex items-center justify-center"
      onMouseDown={(e) => {
        onActivate();
        startDrag(e, (pos) => onPositionChange(pos), onActivate);
      }}
    >
      {/* Floating close button on top right of the image */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center cursor-pointer shadow-lg text-lg leading-none transition-colors border border-white/20"
        title="Close image"
      >
        <span className="-mt-[2px]">×</span>
      </button>

      {imgUrl ? (
        <img
          src={imgUrl}
          alt={win.title.replace(/^File:/i, "").replace(/_/g, " ")}
          className="w-full h-full object-cover rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.35)] block"
          draggable={false}
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
}
