import { useSyncExternalStore } from "react";
import { getCamera, subscribeCamera } from "../utils/camera";
import {
  zoomIn,
  zoomOut,
  snapZoomTo100,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../utils/canvas/zoom";

export default function ZoomControl() {
  const zoom = useSyncExternalStore(
    subscribeCamera,
    () => getCamera().zoom,
    () => 1,
  );

  const percentage = Math.round(zoom * 100);

  const handleSnapTo100 = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    snapZoomTo100();
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    zoomOut();
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    zoomIn();
  };

  return (
    <aside
      aria-label="Zoom controls"
      className="zoom-control flex items-center bg-[#eaedf5]/95 backdrop-blur-md border border-black/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06)] rounded-xl px-1.5 py-1 select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Zoom Out Button (-) */}
      <button
        type="button"
        onClick={handleZoomOut}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Zoom out"
        title="Zoom out"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-black/5 active:bg-black/10 active:scale-95 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-all duration-100 cursor-pointer border-none outline-none"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Percentage Display (clicks snap to 100% instantly) */}
      <button
        type="button"
        onClick={handleSnapTo100}
        aria-label={`Current zoom ${percentage}%. Click to snap to 100%`}
        title="Click to snap to 100%"
        className="px-2 py-1 min-w-[48px] text-center text-xs font-normal text-gray-600 hover:text-gray-900 hover:bg-black/5 active:bg-black/10 rounded-md transition-colors cursor-pointer select-none tabular-nums border-none outline-none"
      >
        {percentage}%
      </button>

      {/* Zoom In Button (+) */}
      <button
        type="button"
        onClick={handleZoomIn}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in"
        title="Zoom in"
        className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-black/5 active:bg-black/10 active:scale-95 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-all duration-100 cursor-pointer border-none outline-none"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </aside>
  );
}
