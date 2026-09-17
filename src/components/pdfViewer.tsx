import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import { getCamera } from "../utils/camera";
import PdfSelectionToolbox from "./pdfSelectionToolbox";

GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const QUALITY_SCALE = 1.5;
const MIN_PDF_ZOOM = 0.25;
const MAX_PDF_ZOOM = 5;

type Props = { win: WindowData };

function copyCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement) {
  target.width = source.width;
  target.height = source.height;
  target.style.width = "100%";
  target.style.height = "auto";
  const ctx = target.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
}

const TOOLBAR_BTN =
  "flex items-center justify-center w-8 h-8 p-0 border-0 rounded-lg bg-[rgba(255,255,255,0.1)] text-[#e0e0e0] cursor-pointer hover:bg-[rgba(255,255,255,0.2)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors";

export default function PdfViewer({ win }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(win.pdfCurrentPage ?? 1);
  const [totalPages, setTotalPages] = useState(win.pdfTotalPages ?? 0);
  const [pageAspectRatio, setPageAspectRatio] = useState(1.414);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const updateWindow = useWindows((s) => s.updateWindow);

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());
  const textLayerTasksRef = useRef<Map<number, TextLayer>>(new Map());
  const renderedWidthsRef = useRef<Map<number, number>>(new Map());
  const visiblePagesRef = useRef<Set<number>>(new Set());
  const targetPageRef = useRef<number>(currentPage);

  const isMaximized = !!win.pdfMaximized;
  const prevMaximizedRef = useRef(isMaximized);
  const prevWindowRef = useRef<{ winX: number; winY: number } | null>(null);

  const pdfZoomRef = useRef(1);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  // --- Load PDF document ---
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      if (!win.pdfUrl) return;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(win.pdfUrl);
        if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const loadingTask = getDocument({
          data: new Uint8Array(arrayBuffer),
          standardFontDataUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/standard_fonts/",
        });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        docRef.current = pdfDoc;
        setTotalPages(pdfDoc.numPages);

        try {
          const firstPage = await pdfDoc.getPage(1);
          const vp = firstPage.getViewport({ scale: 1 });
          if (vp.width > 0 && vp.height > 0) {
            setPageAspectRatio(vp.height / vp.width);
          }
        } catch {
          // fallback to default
        }

        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load PDF");
          setLoading(false);
        }
      }
    }

    loadPdf();
    const renderTasks = renderTasksRef.current;
    const renderedWidths = renderedWidthsRef.current;
    const textLayerTasks = textLayerTasksRef.current;
    return () => {
      cancelled = true;
      for (const task of renderTasks.values()) {
        try {
          task.cancel();
        } catch {
          // ignore
        }
      }
      renderTasks.clear();
      renderedWidths.clear();
      for (const tl of textLayerTasks.values()) {
        try {
          tl.cancel();
        } catch {
          // ignore
        }
      }
      textLayerTasks.clear();
      if (docRef.current) {
        docRef.current.cleanup();
        docRef.current = null;
      }
    };
  }, [win.pdfUrl]);

  // --- Render single page ---
  const renderPage = useCallback(async (pageNum: number, availWidth: number) => {
    const doc = docRef.current;
    const canvas = canvasRefs.current.get(pageNum);
    if (!doc || !canvas || availWidth <= 0 || pageNum < 1 || pageNum > doc.numPages) return;

    const renderWidth = isMaximized ? Math.min(availWidth, Math.min(window.innerWidth, window.innerHeight / pageAspectRatio)) : availWidth;

    if (renderedWidthsRef.current.get(pageNum) === renderWidth) return;

    const prevTask = renderTasksRef.current.get(pageNum);
    if (prevTask) {
      try {
        prevTask.cancel();
      } catch {
        // ignore
      }
    }

    // Cancel any existing text layer for this page
    const prevTl = textLayerTasksRef.current.get(pageNum);
    if (prevTl) {
      try {
        prevTl.cancel();
      } catch {
        // ignore
      }
      textLayerTasksRef.current.delete(pageNum);
    }

    try {
      const page = await doc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const cssScale = renderWidth / vp.width;
      const renderScale = cssScale * (window.devicePixelRatio || 1) * QUALITY_SCALE;
      const viewport = page.getViewport({ scale: renderScale });

      const offscreen = document.createElement("canvas");
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const ctx = offscreen.getContext("2d")!;
      ctx.clearRect(0, 0, offscreen.width, offscreen.height);

      const renderTask = page.render({
        canvasContext: ctx as CanvasRenderingContext2D,
        viewport,
      });
      renderTasksRef.current.set(pageNum, renderTask);

      await renderTask.promise;
      renderTasksRef.current.delete(pageNum);

      copyCanvas(offscreen, canvas);
      renderedWidthsRef.current.set(pageNum, renderWidth);

      // Render text layer on top for text selection (only when maximized)
      if (isMaximized) {
        const textLayerEl = textLayerRefs.current.get(pageNum);
        if (textLayerEl) {
          textLayerEl.innerHTML = "";
          const textContent = await page.getTextContent();
          // Measure actual canvas CSS width (forces layout reflow) for precise alignment
          const canvasDisplayWidth = canvas.clientWidth || renderWidth;
          const textScale = canvasDisplayWidth / vp.width;
          textLayerEl.style.setProperty("--scale-factor", String(textScale));
          const textViewport = page.getViewport({ scale: textScale });
          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerEl,
            viewport: textViewport,
          });
          textLayerTasksRef.current.set(pageNum, textLayer);
          await textLayer.render();
          textLayerTasksRef.current.delete(pageNum);
        }
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "name" in err && err.name === "RenderingCancelledException") {
        return;
      }
      console.error(`Page ${pageNum} render error:`, err);
    }
  }, [isMaximized]);

  // --- Cancel text layer tasks when unmaximizing ---
  useEffect(() => {
    if (!isMaximized) {
      for (const tl of textLayerTasksRef.current.values()) {
        try { tl.cancel(); } catch { /* ignore */ }
      }
      textLayerTasksRef.current.clear();
    }
  }, [isMaximized]);

  // --- Render current page in zoomed-out mode ---
  useEffect(() => {
    if (!loading && docRef.current && !isMaximized) {
      const pageEl = pageRefs.current.get(currentPage);
      const container = scrollContainerRef.current;
      const w = pageEl?.clientWidth || (container ? container.clientWidth : 620);
      if (w > 0) {
        renderPage(currentPage, w);
      }
    }
  }, [currentPage, isMaximized, loading, renderPage]);

  // --- Intersection observer for lazy rendering of visible pages in zoomed-in mode ---
  useEffect(() => {
    if (loading || !docRef.current || !scrollContainerRef.current || !isMaximized) return;
    const container = scrollContainerRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute("data-page"));
          if (entry.isIntersecting && pageNum) {
            visiblePagesRef.current.add(pageNum);
            const pageEl = pageRefs.current.get(pageNum);
            const w = pageEl?.clientWidth || 0;
            if (w > 0) {
              renderPage(pageNum, w);
            }
          } else if (pageNum) {
            visiblePagesRef.current.delete(pageNum);
          }
        }
      },
      {
        root: container,
        rootMargin: "800px 0px 800px 0px",
      },
    );

    for (let p = 1; p <= totalPages; p++) {
      const el = pageRefs.current.get(p);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [loading, totalPages, isMaximized, renderPage]);

  // --- Resize observer to re-render visible pages when width changes ---
  useEffect(() => {
    if (loading || !docRef.current || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    let resizeTimer: number | undefined;

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        renderedWidthsRef.current.clear();
        if (isMaximized) {
          for (const p of visiblePagesRef.current) {
            const el = pageRefs.current.get(p);
            const w = el?.clientWidth || 0;
            if (w > 0) renderPage(p, w);
          }
        } else {
          const el = pageRefs.current.get(targetPageRef.current);
          const w = el?.clientWidth || container.clientWidth;
          if (w > 0) renderPage(targetPageRef.current, w);
        }
      }, 150);
    });

    observer.observe(container);
    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [loading, isMaximized, renderPage]);

  // --- Track current active page on scroll (only when zoomed in) ---
  const handleScroll = useCallback(() => {
    if (!isMaximized) return;
    const container = scrollContainerRef.current;
    if (!container || totalPages <= 0) return;

    const containerTop = container.scrollTop;
    const containerFocusPoint = containerTop + container.clientHeight * 0.35;

    let activePage = 1;
    let minDistance = Infinity;

    for (let p = 1; p <= totalPages; p++) {
      const el = pageRefs.current.get(p);
      if (el && el.style.display !== "none") {
        const elTop = el.offsetTop;
        const elCenter = elTop + el.offsetHeight / 2;
        const dist = Math.abs(containerFocusPoint - elCenter);
        if (dist < minDistance) {
          minDistance = dist;
          activePage = p;
        }
      }
    }

    if (activePage !== targetPageRef.current) {
      targetPageRef.current = activePage;
      setCurrentPage(activePage);
      updateWindow(win.id, { pdfCurrentPage: activePage });
    }
  }, [isMaximized, totalPages, win.id, updateWindow]);

  // --- Page navigation helper ---
  const goToPage = useCallback(
    (page: number) => {
      if (page < 1 || page > totalPages) return;
      targetPageRef.current = page;
      setCurrentPage(page);
      updateWindow(win.id, { pdfCurrentPage: page });

      if (isMaximized) {
        const el = pageRefs.current.get(page);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    },
    [isMaximized, totalPages, win.id, updateWindow],
  );

  const prevPage = useCallback(() => goToPage(targetPageRef.current - 1), [goToPage]);
  const nextPage = useCallback(() => goToPage(targetPageRef.current + 1), [goToPage]);

  const toggleMaximize = useCallback(() => {
    if (!isMaximized) {
      prevWindowRef.current = { winX: win.x ?? 80, winY: win.y ?? 80 };
      pdfZoomRef.current = 1;
      if (pagesContainerRef.current) pagesContainerRef.current.style.zoom = "";
      updateWindow(win.id, { pdfMaximized: true });
    } else if (prevWindowRef.current) {
      const prev = prevWindowRef.current;
      pdfZoomRef.current = 1;
      if (pagesContainerRef.current) pagesContainerRef.current.style.zoom = "";
      updateWindow(win.id, { x: prev.winX, y: prev.winY, pdfMaximized: false });
      prevWindowRef.current = null;
    }
  }, [win.id, win.x, win.y, isMaximized, updateWindow]);

  // --- Synchronously position scroll when toggling maximize ---
  useLayoutEffect(() => {
    if (prevMaximizedRef.current !== isMaximized) {
      prevMaximizedRef.current = isMaximized;
      const container = scrollContainerRef.current;
      if (!container) return;

      if (isMaximized) {
        const pageEl = pageRefs.current.get(targetPageRef.current);
        if (pageEl && pageEl.offsetTop > 0) {
          container.scrollTop = pageEl.offsetTop;
        } else if (targetPageRef.current > 1) {
          const availW = Math.min(850, container.clientWidth || 850);
          const pageH = availW * pageAspectRatio;
          const gap = 24;
          container.scrollTop = (targetPageRef.current - 1) * (pageH + gap);
        } else {
          container.scrollTop = 0;
        }
      } else {
        container.scrollTop = 0;
      }
    }
  }, [isMaximized, pageAspectRatio]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!win.active) return;
      if (e.key === "Escape" && isMaximized) {
        e.preventDefault();
        toggleMaximize();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prevPage();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextPage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [win.active, isMaximized, toggleMaximize, prevPage, nextPage]);

  if (error) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-white text-sm text-gray-500">
        <span>Error: {error}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-white text-sm text-gray-500">
        <span>Loading PDF...</span>
      </div>
    );
  }

  const pagesArray = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          e.stopPropagation();

          const container = scrollContainerRef.current;
          const inner = pagesContainerRef.current;
          if (!container || !inner) return;

          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left + container.scrollLeft;
          const mouseY = e.clientY - rect.top + container.scrollTop;

          const oldZoom = pdfZoomRef.current;
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          const newZoom = Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, oldZoom * factor));
          if (newZoom === oldZoom) return;
          pdfZoomRef.current = newZoom;

          inner.style.zoom = String(newZoom);

          const scaleRatio = newZoom / oldZoom;
          container.scrollLeft = mouseX * scaleRatio - (e.clientX - rect.left);
          container.scrollTop = mouseY * scaleRatio - (e.clientY - rect.top);
        }}
        className={`flex-1 min-h-0 relative ${isMaximized ? "overflow-auto" : "overflow-hidden"}`}
        style={{ backgroundColor: "transparent", scrollbarWidth: "none" }}
      >
        <div ref={pagesContainerRef} className="flex flex-col gap-6 w-full items-center pt-0 pb-12" style={{ backgroundColor: "transparent" }}>
          {pagesArray.map((p) => {
            const isVisible = isMaximized || p === currentPage;

            let pageStyle: CSSProperties = {
              display: isVisible ? "block" : "none",
              aspectRatio: `${1 / pageAspectRatio}`,
            };
            if (isMaximized) {
              const cam = getCamera();
              const fitScreenPx = Math.min(window.innerWidth, window.innerHeight / pageAspectRatio);
              pageStyle.maxWidth = `${fitScreenPx / cam.zoom}px`;
              pageStyle.width = "100%";
            }

            return (
              <div
                key={p}
                ref={(el) => {
                  if (el) pageRefs.current.set(p, el);
                  else pageRefs.current.delete(p);
                }}
                data-page={p}
                style={pageStyle}
                className={`relative p-0 mx-auto bg-white ${isMaximized ? "" : "max-w-[850px] w-full"}`}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(p, el);
                    else canvasRefs.current.delete(p);
                  }}
                  className="block w-full h-auto"
                />
                {isMaximized && (
                  <div
                    ref={(el) => {
                      if (el) textLayerRefs.current.set(p, el);
                      else textLayerRefs.current.delete(p);
                    }}
                    className="pdf-text-layer"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={`flex justify-center items-center gap-1 py-1 px-1.5 bg-[rgba(30,30,30,0.85)] backdrop-blur-[8px] rounded-3xl mx-auto ${
          isMaximized
            ? "absolute bottom-3 left-1/2 -translate-x-1/2 z-10"
            : "mb-2 mt-4"
        }`}
        style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.25)" }}
      >
        <button className={TOOLBAR_BTN} title="Bookmark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 2h14a1 1 0 0 1 1 1v19.143a.5.5 0 0 1-.766.424L12 18.03l-7.234 4.536A.5.5 0 0 1 4 22.143V3a1 1 0 0 1 1-1z" />
          </svg>
        </button>
        <button
          className={TOOLBAR_BTN}
          onClick={prevPage}
          disabled={currentPage <= 1}
          title="Previous page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[#e0e0e0] text-[13px] font-sans py-0 px-2.5 min-w-[50px] text-center select-none">
          {currentPage} / {totalPages}
        </span>
        <button
          className={TOOLBAR_BTN}
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          title="Next page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button className={TOOLBAR_BTN} onClick={toggleMaximize} title={isMaximized ? "Exit fullscreen" : "Fullscreen"}>
          {isMaximized ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          )}
        </button>
      </div>
      <PdfSelectionToolbox
        scrollContainerRef={scrollContainerRef}
        isMaximized={isMaximized}
      />
    </>
  );
}
