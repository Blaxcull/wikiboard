import { useState, useRef, useEffect, useCallback } from "react";
import { useWindows } from "../store/windows";
import { extractYouTubeId, fetchYouTubeInfo } from "../utils/media";

export default function MediaInsertButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState("");

  const addWindow = useWindows((s) => s.addWindow);
  const updateWindow = useWindows((s) => s.updateWindow);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setLinkError("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      let created = 0;
      for (const file of Array.from(files)) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isImage =
          file.type.startsWith("image/") ||
          /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif)$/i.test(file.name);

        if (isPdf) {
          const url = URL.createObjectURL(file);
          addWindow({
            contentType: "pdf",
            pdfUrl: url,
            url,
            title: file.name.replace(/\.pdf$/i, ""),
            pdfCurrentPage: 1,
            width: 620,
            height: 945,
          });
          created++;
        } else if (isImage) {
          const url = URL.createObjectURL(file);
          addWindow({
            contentType: "image",
            directImageUrl: url,
            url,
            title: file.name,
            width: 320,
            height: 240,
          });
          created++;
        }
      }

      if (created > 0) {
        setIsOpen(false);
        setLinkInput("");
        setLinkError("");
      } else {
        setLinkError("Unsupported file type. Please upload a PDF or an Image.");
      }
    },
    [addWindow]
  );

  // Clipboard paste support (Ctrl+V) when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        processFiles(e.clipboardData.files);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen, processFiles]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkInput.trim();
    if (!trimmed) return;

    // 1. YouTube link or ID
    const youtubeId = extractYouTubeId(trimmed);
    if (youtubeId) {
      const winId = crypto.randomUUID();
      addWindow({
        id: winId,
        contentType: "youtube",
        youtubeUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
        youtubeId,
        title: "YouTube Video",
        width: 480,
        height: 320,
      });

      fetchYouTubeInfo(youtubeId).then((info) => {
        if (info?.title) {
          updateWindow(winId, { title: info.title });
        }
      });

      setIsOpen(false);
      setLinkInput("");
      setLinkError("");
      return;
    }

    // 2. Direct PDF URL
    if (/\.pdf(\?.*)?$/i.test(trimmed)) {
      const filename = trimmed.split("/").pop()?.split("?")[0] || "PDF Document";
      addWindow({
        contentType: "pdf",
        pdfUrl: trimmed,
        url: trimmed,
        title: decodeURIComponent(filename).replace(/\.pdf$/i, ""),
        pdfCurrentPage: 1,
        width: 620,
        height: 945,
      });

      setIsOpen(false);
      setLinkInput("");
      setLinkError("");
      return;
    }

    // 3. Direct Image URL or Data URL
    if (
      /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif)(\?.*)?$/i.test(trimmed) ||
      trimmed.startsWith("data:image/") ||
      trimmed.startsWith("blob:") ||
      /^https?:\/\/.*\.(png|jpe?g|webp|svg|gif|bmp|ico|avif)/i.test(trimmed)
    ) {
      const filename = trimmed.startsWith("data:image/")
        ? "Pasted Image"
        : trimmed.split("/").pop()?.split("?")[0] || "Image";

      addWindow({
        contentType: "image",
        directImageUrl: trimmed,
        url: trimmed,
        title: decodeURIComponent(filename),
        width: 320,
        height: 240,
      });

      setIsOpen(false);
      setLinkInput("");
      setLinkError("");
      return;
    }

    // 4. Any other http/https URL that might be an image
    if (/^https?:\/\//i.test(trimmed)) {
      addWindow({
        contentType: "image",
        directImageUrl: trimmed,
        url: trimmed,
        title: "Image",
        width: 320,
        height: 240,
      });

      setIsOpen(false);
      setLinkInput("");
      setLinkError("");
      return;
    }

    setLinkError("Please enter a valid YouTube, image (PNG/JPG/SVG), or PDF link.");
  };

  return (
    <>
      {/* Floating Insert Media Button */}
      <div
        className="media-insert-container fixed right-4 top-[14px] z-[9990] select-none"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative group">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="Upload or Insert Media"
            aria-expanded={isOpen}
            className={`w-13 h-13 rounded-2xl flex items-center justify-center bg-white/80 backdrop-blur-2xl border border-black/10 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-150 cursor-pointer outline-none ${
              isOpen
                ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                : "text-gray-900 hover:text-gray-950 hover:bg-black/6 active:scale-95"
            }`}
          >
            {/* Unified Upload / Media Card Icon */}
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Outer frame */}
              <rect x="3" y="3" width="18" height="18" rx="4" />
              {/* Mountain/hill graphic */}
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
              {/* Plus badge */}
              <path d="M16 6h4" strokeWidth="2.2" />
              <path d="M18 4v4" strokeWidth="2.2" />
            </svg>
          </button>

          {/* Tooltip on hover when closed */}
          {!isOpen && (
            <div
              role="tooltip"
              className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
            >
              <span>Upload or Insert Media</span>
            </div>
          )}
        </div>
      </div>

      {/* Unified Drop Square Centered Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Upload or Insert Media"
          className="dialog-overlay fixed inset-0 z-[10000] bg-black/25 backdrop-blur-[6px] flex items-center justify-center p-4 select-none animate-[spotlight-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
              setLinkError("");
            }
          }}
        >
          <div
            className="w-full max-w-md bg-white/95 backdrop-blur-2xl border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.2),0_6px_20px_rgba(0,0,0,0.08)] rounded-3xl p-6 relative flex flex-col gap-4 text-gray-900"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setLinkError("");
              }}
              className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors cursor-pointer border-none outline-none"
              aria-label="Close dialog"
            >
              <span className="text-xl leading-none">&times;</span>
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-black/5 flex items-center justify-center text-gray-800">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="4" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                  <path d="M16 6h4" strokeWidth="2.2" />
                  <path d="M18 4v4" strokeWidth="2.2" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 leading-tight">
                  Insert Media
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Upload files or paste media links onto your canvas
                </p>
              </div>
            </div>

            {/* The Big "Drop Square" - using label for 100% native click file picker */}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOver(false);
              }}
              onDrop={handleDrop}
              className={`w-full h-44 rounded-2xl border-2 border-dashed transition-all duration-150 cursor-pointer flex flex-col items-center justify-center p-6 text-center group ${
                isDraggingOver
                  ? "border-blue-500 bg-blue-500/10 scale-[1.01]"
                  : "border-black/15 hover:border-black/35 bg-black/[0.02] hover:bg-black/[0.04]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/*"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-black/5 flex items-center justify-center text-gray-700 group-hover:scale-110 group-hover:text-black transition-all mb-2.5 pointer-events-none">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>

              <p className="text-sm font-semibold text-gray-900 leading-tight pointer-events-none">
                Drag & drop file here, or <span className="text-blue-600 underline">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1.5 pointer-events-none">
                Supports any PDF document or image (PNG, JPG, SVG, WebP)
              </p>
            </label>

            {/* Divider with 'or' */}
            <div className="flex items-center gap-2 px-1">
              <div className="flex-1 h-px bg-black/10" />
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                or paste link
              </span>
              <div className="flex-1 h-px bg-black/10" />
            </div>

            {/* Smart URL / Link Input */}
            <form onSubmit={handleLinkSubmit} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={linkInputRef}
                    type="text"
                    value={linkInput}
                    onChange={(e) => {
                      setLinkInput(e.target.value);
                      if (linkError) setLinkError("");
                    }}
                    placeholder="Paste YouTube, image, or PDF link..."
                    className={`w-full pl-9 pr-3.5 py-2.5 bg-gray-50/80 border rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white transition-all ${
                      linkError
                        ? "border-red-400 focus:ring-2 focus:ring-red-400/20"
                        : "border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    }`}
                  />
                  <svg
                    className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <button
                  type="submit"
                  disabled={!linkInput.trim()}
                  className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 border-none outline-none shrink-0"
                >
                  Add
                </button>
              </div>
              {linkError && (
                <p className="text-xs text-red-500 px-1 leading-tight">{linkError}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
