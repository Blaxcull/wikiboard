import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
        setLinkError("Unsupported file type. Please drop a PDF or an Image.");
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

  const detectedType = useMemo(() => {
    const trimmed = linkInput.trim();
    if (!trimmed) return null;
    if (extractYouTubeId(trimmed)) return "youtube";
    if (/\.pdf(\?.*)?$/i.test(trimmed)) return "pdf";
    if (
      /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif)(\?.*)?$/i.test(trimmed) ||
      trimmed.startsWith("data:image/") ||
      trimmed.startsWith("blob:")
    ) {
      return "image";
    }
    if (/^https?:\/\//i.test(trimmed)) return "link";
    return null;
  }, [linkInput]);

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

    // 4. Any other http/https URL fallback
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
      {/* Floating Toolbar Button */}
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
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
              <path d="M16 6h4" strokeWidth="2.2" />
              <path d="M18 4v4" strokeWidth="2.2" />
            </svg>
          </button>

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

      {/* Modern Center Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Insert Media"
          className="dialog-overlay fixed inset-0 z-[10000] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 select-none animate-[spotlight-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
              setLinkError("");
            }
          }}
        >
          <div
            className="w-full max-w-[420px] bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] rounded-[32px] p-6 relative flex flex-col gap-4 text-gray-900"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-semibold text-gray-950 tracking-tight leading-none">
                  Insert Media
                </h3>
                <p className="text-xs text-gray-400 mt-1 font-normal">
                  Drop documents, images, or paste video links
                </p>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setLinkError("");
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-black/5 active:scale-95 transition-all cursor-pointer border-none outline-none"
                aria-label="Close"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Magnetic Drop Surface */}
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
              className={`relative w-full h-[190px] rounded-2xl transition-all duration-300 cursor-pointer flex flex-col items-center justify-center p-6 text-center group border ${
                isDraggingOver
                  ? "border-blue-500 bg-blue-50/80 ring-4 ring-blue-500/10 scale-[1.01]"
                  : "border-black/[0.07] hover:border-black/20 bg-gradient-to-b from-gray-50/80 to-gray-100/40 hover:from-gray-50 hover:to-gray-100/80 shadow-inner/10"
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

              {/* Floating Media Stack Graphic */}
              <div className="relative w-16 h-12 mb-3 flex items-center justify-center pointer-events-none">
                {/* Left card: Image indicator */}
                <div className="absolute left-1 w-9 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100/80 border border-emerald-300/40 shadow-xs flex items-center justify-center text-emerald-600 -rotate-6 group-hover:-rotate-12 group-hover:-translate-x-1 transition-all duration-300">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </div>

                {/* Right card: Document indicator */}
                <div className="absolute right-1 w-9 h-10 rounded-xl bg-gradient-to-br from-rose-50 to-amber-100/80 border border-rose-300/40 shadow-xs flex items-center justify-center text-rose-600 rotate-6 group-hover:rotate-12 group-hover:translate-x-1 transition-all duration-300">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>

                {/* Center card: Upload Arrow Badge */}
                <div className="relative z-10 w-11 h-11 rounded-2xl bg-white shadow-[0_6px_20px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.06] flex items-center justify-center text-gray-900 group-hover:scale-108 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-300">
                  <svg className="w-5 h-5 text-gray-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
              </div>

              {/* Title Prompt */}
              <p className="text-[13px] font-medium text-gray-800 pointer-events-none leading-snug">
                Drop files here, or{" "}
                <span className="text-gray-950 font-semibold underline underline-offset-4 decoration-gray-300 group-hover:decoration-gray-950 transition-colors">
                  browse
                </span>
              </p>

              {/* Subtle Format Chips */}
              <div className="flex items-center gap-1.5 mt-2.5 pointer-events-none">
                <span className="px-2 py-0.5 rounded-full bg-white/90 border border-black/[0.06] text-[10px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  PDF
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/90 border border-black/[0.06] text-[10px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  PNG
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/90 border border-black/[0.06] text-[10px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  JPG
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/90 border border-black/[0.06] text-[10px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  WebP
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/90 border border-black/[0.06] text-[10px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  SVG
                </span>
              </div>
            </label>

            {/* Seamless URL Bar */}
            <form onSubmit={handleLinkSubmit} className="flex flex-col gap-1.5">
              <div
                className={`relative flex items-center bg-gray-100/70 hover:bg-gray-100/90 focus-within:bg-white border rounded-2xl p-1.5 pl-3 transition-all duration-200 ${
                  linkError
                    ? "border-red-400 ring-4 ring-red-400/15"
                    : "border-black/[0.06] focus-within:border-black/25 focus-within:shadow-[0_0_0_4px_rgba(0,0,0,0.03)]"
                }`}
              >
                {/* Detected Type Icon / Link Icon */}
                <div className="mr-2.5 shrink-0 flex items-center">
                  {detectedType === "youtube" ? (
                    <span className="px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold tracking-wider uppercase">
                      YouTube
                    </span>
                  ) : detectedType === "pdf" ? (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-bold tracking-wider uppercase">
                      PDF
                    </span>
                  ) : detectedType === "image" ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold tracking-wider uppercase">
                      Image
                    </span>
                  ) : (
                    <svg
                      className="w-4 h-4 text-gray-400"
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
                  )}
                </div>

                <input
                  ref={linkInputRef}
                  type="text"
                  value={linkInput}
                  onChange={(e) => {
                    setLinkInput(e.target.value);
                    if (linkError) setLinkError("");
                  }}
                  placeholder="Or paste media link (YouTube, PDF, Image)…"
                  className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder-gray-400 border-none outline-none font-sans"
                />

                <button
                  type="submit"
                  disabled={!linkInput.trim()}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold tracking-tight transition-all active:scale-95 cursor-pointer border-none outline-none shrink-0 flex items-center gap-1 ${
                    linkInput.trim()
                      ? "bg-gray-950 text-white shadow-xs hover:bg-black"
                      : "bg-black/[0.04] text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <span>Insert</span>
                  <span className="text-[10px] opacity-60">↵</span>
                </button>
              </div>

              {linkError && (
                <p className="text-xs text-red-500 px-1 leading-tight">{linkError}</p>
              )}
            </form>

            {/* Quick Keyboard Paste Hint */}
            <div className="pt-0.5 flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5">
                <span>Direct paste:</span>
                <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-black/[0.04] text-gray-600 font-medium border border-black/[0.05]">
                  Ctrl + V
                </kbd>
              </span>
              <span>Drop onto canvas anytime</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
