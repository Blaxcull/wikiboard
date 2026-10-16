import { memo } from "react";
import type { WindowData } from "../store/windows";

type Props = {
  win: WindowData;
  onActivate?: () => void;
};

const YouTubeViewer = memo(function YouTubeViewer({ win, onActivate }: Props) {
  const videoId = win.youtubeId;

  if (!videoId) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full p-6 text-gray-400 bg-neutral-900 text-xs">
        <p>No YouTube video specified.</p>
      </div>
    );
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      {/* Click-catcher to activate window if currently inactive */}
      {!win.active && (
        <div
          className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          onMouseDown={(e) => {
            e.stopPropagation();
            onActivate?.();
          }}
          title="Click to focus video"
        />
      )}

      <iframe
        src={embedUrl}
        title={win.title || "YouTube video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="w-full h-full border-0 block select-none"
      />
    </div>
  );
});

export default YouTubeViewer;
