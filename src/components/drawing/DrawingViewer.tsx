import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DrawingElement,
  DrawingTool,
} from "../../types/drawing";
import type { WindowData } from "../../store/windows";
import { useWindows } from "../../store/windows";
import startDrag from "../../utils/window/drag";
import {
  generateSketchyLine,
  generateSketchyRect,
  getRectPath,
  generateSketchyEllipse,
  getEllipsePath,
  generateSketchyDiamond,
  getDiamondPath,
  generateSketchyArrow,
  generateSmoothFreehand,
  generateHachureLines,
  stringToSeed,
} from "../../utils/drawingRenderer";
import ExcalidrawToolbar from "./ExcalidrawToolbar";
import WordRibbon from "./WordRibbon";
import StylePropertiesPanel from "./StylePropertiesPanel";
import RichTextEditor from "./RichTextEditor";

type Props = {
  win: WindowData;
  onClose?: () => void;
  onActivate?: () => void;
  onPositionChange?: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
};

const DEFAULT_ELEMENT_STYLE: Partial<DrawingElement> = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  roundness: true,
  opacity: 1,
  fontFamily: "'Caveat', 'Kalam', cursive",
  fontSize: 20,
  fontWeight: "normal",
  fontStyle: "normal",
  textDecoration: "none",
  textAlign: "left",
  textColor: "#1e1e1e",
  textBgColor: "transparent",
  listType: "none",
  lineHeight: 1.35,
};

export default function DrawingViewer({
  win,
  onClose,
  onActivate,
  onPositionChange,
}: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);

  // Initialize elements from window state or default initial template
  const [elements, setElements] = useState<DrawingElement[]>(() => {
    if (win.drawingElements && win.drawingElements.length > 0) {
      return win.drawingElements;
    }
    // Default welcoming Excalidraw canvas with a sketched card and welcome text
    return [
      {
        id: "welcome-card",
        type: "card",
        x: 60,
        y: 60,
        width: 320,
        height: 220,
        strokeColor: "#2b579a",
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 0,
        roundness: true,
        opacity: 1,
        fontFamily: "'Caveat', 'Kalam', cursive",
        fontSize: 20,
        textColor: "#1e293b",
        textAlign: "left",
        listType: "bullet",
        richHtml: `<h3 style="margin:0 0 8px 0; color:#2b579a; font-size:22px; font-weight:bold;">Welcome to WikiBoard Draw</h3>
<p style="margin:0 0 8px 0; font-size:16px; color:#475569;">An Excalidraw-style whiteboard with <strong>MS Word features</strong>:</p>
<ul style="margin:0; padding-left:20px; font-size:16px;">
  <li><strong>Bullets & Numbering</strong> lists</li>
  <li><strong>Text Align</strong>, <strong>Fonts</strong> & <strong>Sizes</strong></li>
  <li>Hand-drawn sketchy shapes & fills</li>
</ul>`,
      },
      {
        id: "sample-rect",
        type: "rectangle",
        x: 430,
        y: 70,
        width: 170,
        height: 100,
        strokeColor: "#6965db",
        backgroundColor: "#eebefa",
        fillStyle: "hachure",
        strokeWidth: 2.5,
        strokeStyle: "solid",
        roughness: 1,
        roundness: true,
        opacity: 0.9,
      },
      {
        id: "sample-arrow",
        type: "arrow",
        x: 380,
        y: 120,
        width: 45,
        height: 0,
        points: [{ x: 380, y: 120 }, { x: 425, y: 120 }],
        strokeColor: "#e03131",
        backgroundColor: "transparent",
        fillStyle: "none",
        strokeWidth: 2.5,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 1,
      },
    ];
  });

  // History stack for Undo / Redo
  const [history, setHistory] = useState<DrawingElement[][]>([elements]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Tools & UI State
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [isLocked, setIsLocked] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultStyle, setDefaultStyle] = useState<Partial<DrawingElement>>(DEFAULT_ELEMENT_STYLE);
  const [showWordRibbon, setShowWordRibbon] = useState(true);

  // Canvas Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Maximized / Fullscreen inside window manager
  const [isMaximized, setIsMaximized] = useState(!!win.drawingMaximized);

  // Canvas interaction refs
  const canvasRef = useRef<SVGSVGElement>(null);
  const isInteractingRef = useRef(false);
  const interactionModeRef = useRef<"draw" | "drag" | "resize" | "select-box" | "erase" | null>(null);
  const activeResizeHandleRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; originElements: Map<string, { x: number; y: number; width: number; height: number }> }>({
    x: 0,
    y: 0,
    originElements: new Map(),
  });
  const currentDrawElementRef = useRef<DrawingElement | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Sync state to parent window store
  const pushState = useCallback((newElements: DrawingElement[]) => {
    setElements(newElements);
    updateWindow(win.id, { drawingElements: newElements });

    // Update history stack
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIdx + 1);
      return [...sliced, newElements];
    });
    setHistoryIdx((prev) => prev + 1);
  }, [win.id, updateWindow, historyIdx]);

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const nextIdx = historyIdx - 1;
      setHistoryIdx(nextIdx);
      const target = history[nextIdx];
      setElements(target);
      updateWindow(win.id, { drawingElements: target });
    }
  }, [historyIdx, history, win.id, updateWindow]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const nextIdx = historyIdx + 1;
      setHistoryIdx(nextIdx);
      const target = history[nextIdx];
      setElements(target);
      updateWindow(win.id, { drawingElements: target });
    }
  }, [historyIdx, history, win.id, updateWindow]);

  // Convert Screen coordinates to SVG canvas coordinates taking pan and zoom into account
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA" || activeEl?.getAttribute("contenteditable") === "true";
      if (isInput) return;

      if (e.code === "Space" && !e.repeat) {
        setIsSpacePressed(true);
      }

      if (e.key === "Escape") {
        setSelectedIds([]);
        setEditingId(null);
        setActiveTool("select");
      }

      // Delete / Backspace
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        const remaining = elements.filter((el) => !selectedIds.includes(el.id));
        pushState(remaining);
        setSelectedIds([]);
      }

      // Ctrl + Z / Ctrl + Y
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }

      // Ctrl + D (Duplicate)
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        if (selectedIds.length > 0) {
          const toDupe = elements.filter((el) => selectedIds.includes(el.id));
          const duplicated = toDupe.map((el) => ({
            ...el,
            id: crypto.randomUUID(),
            x: el.x + 20,
            y: el.y + 20,
          }));
          pushState([...elements, ...duplicated]);
          setSelectedIds(duplicated.map((d) => d.id));
        }
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "v": setActiveTool("select"); break;
          case "r": setActiveTool("rectangle"); break;
          case "d": setActiveTool("diamond"); break;
          case "o": setActiveTool("ellipse"); break;
          case "a": setActiveTool("arrow"); break;
          case "l": setActiveTool("line"); break;
          case "p": setActiveTool("draw"); break;
          case "h": setActiveTool("highlighter"); break;
          case "t": setActiveTool("text"); break;
          case "w": setActiveTool("card"); break;
          case "e": setActiveTool("eraser"); break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [elements, selectedIds, pushState, handleUndo, handleRedo]);

  // Wheel zoom / pan
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) => Math.min(3, Math.max(0.2, prev * zoomFactor)));
    } else {
      // Pan
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Pointer down on canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    onActivate?.();

    // Space + drag or middle click for panning
    if (isSpacePressed || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    if (e.button !== 0) return;

    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    isInteractingRef.current = true;

    if (activeTool === "eraser") {
      interactionModeRef.current = "erase";
      // Erase hit element
      const hit = elements.find((el) => x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height);
      if (hit) {
        pushState(elements.filter((el) => el.id !== hit.id));
      }
      return;
    }

    if (activeTool === "select") {
      // Check if clicking on an element
      const hit = [...elements].reverse().find((el) => {
        // Broad bounding box check
        const pad = 8;
        return x >= el.x - pad && x <= el.x + el.width + pad && y >= el.y - pad && y <= el.y + el.height + pad;
      });

      if (hit) {
        if (e.shiftKey) {
          // Toggle selection
          setSelectedIds((prev) =>
            prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : [...prev, hit.id]
          );
        } else {
          if (!selectedIds.includes(hit.id)) {
            setSelectedIds([hit.id]);
          }
        }

        interactionModeRef.current = "drag";
        const originMap = new Map();
        const activeIds = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
        for (const id of activeIds) {
          const el = elements.find((item) => item.id === id);
          if (el) originMap.set(id, { x: el.x, y: el.y, width: el.width, height: el.height });
        }
        dragStartRef.current = { x, y, originElements: originMap };
      } else {
        // Clicked empty canvas -> start marquee selection box
        setSelectedIds([]);
        setEditingId(null);
        interactionModeRef.current = "select-box";
        dragStartRef.current = { x, y, originElements: new Map() };
        setSelectionBox({ x, y, w: 0, h: 0 });
      }
      return;
    }

    // Creating a new shape / tool
    interactionModeRef.current = "draw";
    const id = crypto.randomUUID();

    const isHighlighter = activeTool === "highlighter";
    const isPen = activeTool === "draw";

    const newElement: DrawingElement = {
      id,
      type: activeTool,
      x,
      y,
      width: activeTool === "card" ? 300 : (activeTool === "text" ? 160 : 0),
      height: activeTool === "card" ? 200 : (activeTool === "text" ? 50 : 0),
      points: (isPen || isHighlighter || activeTool === "arrow" || activeTool === "line")
        ? [{ x, y }]
        : undefined,
      strokeColor: isHighlighter ? "#fde047" : (defaultStyle.strokeColor || "#1e1e1e"),
      backgroundColor: activeTool === "card" ? "#ffffff" : (defaultStyle.backgroundColor || "transparent"),
      fillStyle: activeTool === "card" ? "solid" : (defaultStyle.fillStyle || "hachure"),
      strokeWidth: isHighlighter ? 18 : (defaultStyle.strokeWidth || 2),
      strokeStyle: defaultStyle.strokeStyle || "solid",
      roughness: activeTool === "card" ? 0 : (defaultStyle.roughness ?? 1),
      roundness: defaultStyle.roundness ?? true,
      opacity: isHighlighter ? 0.45 : (defaultStyle.opacity ?? 1),
      // Rich text properties
      fontFamily: defaultStyle.fontFamily || "'Caveat', 'Kalam', cursive",
      fontSize: defaultStyle.fontSize || 20,
      fontWeight: defaultStyle.fontWeight || "normal",
      fontStyle: defaultStyle.fontStyle || "normal",
      textDecoration: defaultStyle.textDecoration || "none",
      textAlign: defaultStyle.textAlign || "left",
      textColor: defaultStyle.textColor || "#1e1e1e",
      textBgColor: defaultStyle.textBgColor || "transparent",
      listType: activeTool === "card" ? "bullet" : (defaultStyle.listType || "none"),
      lineHeight: defaultStyle.lineHeight || 1.35,
      richHtml: activeTool === "card"
        ? `<h3 style="margin:0 0 6px 0; font-size:20px; font-weight:bold;">Document Note</h3><ul style="margin:0; padding-left:18px;"><li>Bullet item 1</li><li>Bullet item 2</li></ul>`
        : undefined,
      text: activeTool === "text" ? "Double click to edit text" : undefined,
    };

    currentDrawElementRef.current = newElement;
    setElements((prev) => [...prev, newElement]);
  };

  // Pointer move
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }

    if (!isInteractingRef.current) return;
    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (interactionModeRef.current === "erase") {
      const hit = elements.find((el) => x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height);
      if (hit) {
        setElements((prev) => prev.filter((el) => el.id !== hit.id));
      }
      return;
    }

    if (interactionModeRef.current === "drag") {
      const dx = x - dragStartRef.current.x;
      const dy = y - dragStartRef.current.y;
      setElements((prev) =>
        prev.map((el) => {
          const origin = dragStartRef.current.originElements.get(el.id);
          if (!origin) return el;
          return {
            ...el,
            x: origin.x + dx,
            y: origin.y + dy,
            points: el.points?.map((pt) => ({
              x: pt.x + dx,
              y: pt.y + dy,
            })),
          };
        })
      );
      return;
    }

    if (interactionModeRef.current === "resize" && activeResizeHandleRef.current && selectedIds.length === 1) {
      const targetId = selectedIds[0];
      const handle = activeResizeHandleRef.current;
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== targetId) return el;
          let nx = el.x;
          let ny = el.y;
          let nw = el.width;
          let nh = el.height;

          if (handle.includes("e")) nw = Math.max(20, x - el.x);
          if (handle.includes("s")) nh = Math.max(20, y - el.y);
          if (handle.includes("w")) {
            const right = el.x + el.width;
            nx = Math.min(x, right - 20);
            nw = right - nx;
          }
          if (handle.includes("n")) {
            const bottom = el.y + el.height;
            ny = Math.min(y, bottom - 20);
            nh = bottom - ny;
          }

          return { ...el, x: nx, y: ny, width: nw, height: nh };
        })
      );
      return;
    }

    if (interactionModeRef.current === "select-box") {
      const sx = dragStartRef.current.x;
      const sy = dragStartRef.current.y;
      const minX = Math.min(sx, x);
      const minY = Math.min(sy, y);
      const w = Math.abs(x - sx);
      const h = Math.abs(y - sy);
      setSelectionBox({ x: minX, y: minY, w, h });

      // Find intersecting elements
      const hitIds = elements
        .filter((el) => el.x < minX + w && el.x + el.width > minX && el.y < minY + h && el.y + el.height > minY)
        .map((el) => el.id);
      setSelectedIds(hitIds);
      return;
    }

    if (interactionModeRef.current === "draw" && currentDrawElementRef.current) {
      const cur = currentDrawElementRef.current;
      if (cur.type === "draw" || cur.type === "highlighter") {
        const nextPts = [...(cur.points || []), { x, y }];
        cur.points = nextPts;
        setElements((prev) => prev.map((el) => (el.id === cur.id ? { ...el, points: nextPts } : el)));
      } else if (cur.type === "arrow" || cur.type === "line") {
        const startPt = cur.points?.[0] || { x: cur.x, y: cur.y };
        const nextPts = [startPt, { x, y }];
        cur.points = nextPts;
        const minX = Math.min(startPt.x, x);
        const minY = Math.min(startPt.y, y);
        const w = Math.abs(x - startPt.x);
        const h = Math.abs(y - startPt.y);
        setElements((prev) =>
          prev.map((el) => (el.id === cur.id ? { ...el, x: minX, y: minY, width: w, height: h, points: nextPts } : el))
        );
      } else {
        // Shapes: Rect, Ellipse, Diamond
        const sx = cur.x;
        const sy = cur.y;
        const minX = Math.min(sx, x);
        const minY = Math.min(sy, y);
        const w = Math.abs(x - sx);
        const h = Math.abs(y - sy);
        setElements((prev) =>
          prev.map((el) => (el.id === cur.id ? { ...el, x: minX, y: minY, width: w, height: h } : el))
        );
      }
    }
  };

  // Pointer up
  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isInteractingRef.current) return;
    isInteractingRef.current = false;

    if (interactionModeRef.current === "draw" && currentDrawElementRef.current) {
      const drawn = currentDrawElementRef.current;
      // If tiny point, provide reasonable default size
      let finalElements = elements;
      if (drawn.width < 10 && drawn.height < 10 && (drawn.type === "rectangle" || drawn.type === "ellipse" || drawn.type === "diamond")) {
        finalElements = elements.map((el) => (el.id === drawn.id ? { ...el, width: 140, height: 90 } : el));
      }
      pushState(finalElements);
      setSelectedIds([drawn.id]);

      if (!isLocked) {
        setActiveTool("select");
      }
      currentDrawElementRef.current = null;
    } else if (interactionModeRef.current === "drag" || interactionModeRef.current === "resize") {
      pushState(elements);
    }

    interactionModeRef.current = null;
    activeResizeHandleRef.current = null;
    setSelectionBox(null);
  };

  // Update props for selected element(s)
  const handleUpdateProps = (patch: Partial<DrawingElement>) => {
    if (selectedIds.length > 0) {
      const updated = elements.map((el) => (selectedIds.includes(el.id) ? { ...el, ...patch } : el));
      pushState(updated);
    }
    setDefaultStyle((prev) => ({ ...prev, ...patch }));
  };

  // Clear Canvas
  const handleClear = () => {
    if (window.confirm("Clear all elements on this drawing board?")) {
      pushState([]);
      setSelectedIds([]);
      setEditingId(null);
    }
  };

  // Layering
  const handleBringToFront = () => {
    if (selectedIds.length === 0) return;
    const selected = elements.filter((el) => selectedIds.includes(el.id));
    const rest = elements.filter((el) => !selectedIds.includes(el.id));
    pushState([...rest, ...selected]);
  };

  const handleSendToBack = () => {
    if (selectedIds.length === 0) return;
    const selected = elements.filter((el) => selectedIds.includes(el.id));
    const rest = elements.filter((el) => !selectedIds.includes(el.id));
    pushState([...selected, ...rest]);
  };

  const handleDuplicate = () => {
    if (selectedIds.length === 0) return;
    const toDupe = elements.filter((el) => selectedIds.includes(el.id));
    const dupes = toDupe.map((el) => ({
      ...el,
      id: crypto.randomUUID(),
      x: el.x + 24,
      y: el.y + 24,
    }));
    pushState([...elements, ...dupes]);
    setSelectedIds(dupes.map((d) => d.id));
  };

  const handleDelete = () => {
    if (selectedIds.length === 0) return;
    pushState(elements.filter((el) => !selectedIds.includes(el.id)));
    setSelectedIds([]);
  };

  // Export functions
  const handleExportPng = () => {
    if (!canvasRef.current) return;
    const svgEl = canvasRef.current;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const URLObj = window.URL || window.webkitURL || window;
    const blobURL = URLObj.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const dpr = 2; // High-resolution export
      canvas.width = (svgEl.clientWidth || 800) * dpr;
      canvas.height = (svgEl.clientHeight || 600) * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngURL = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.download = `${win.title || "drawing"}.png`;
        a.href = pngURL;
        a.click();
      }
      URLObj.revokeObjectURL(blobURL);
    };
    img.src = blobURL;
  };

  const handleExportSvg = () => {
    if (!canvasRef.current) return;
    const svgEl = canvasRef.current;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `${win.title || "drawing"}.svg`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const dataStr = JSON.stringify({ title: win.title, elements }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `${win.title || "drawing"}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && Array.isArray(parsed.elements)) {
            pushState(parsed.elements);
          }
        } catch {
          alert("Invalid drawing JSON file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Find currently selected element for ribbon and properties panel
  const activeSelectedElement = selectedIds.length === 1 ? elements.find((el) => el.id === selectedIds[0]) || null : null;
  const editingElement = editingId ? elements.find((el) => el.id === editingId) || null : null;

  return (
    <div
      className={`drawing-viewer flex flex-col w-full h-full relative bg-[#fcfcfd] rounded-xl overflow-hidden select-none ${
        isMaximized ? "fixed inset-0 z-[99999] rounded-none" : ""
      }`}
      onMouseDown={onActivate}
    >
      {/* Title Bar with Drag & Actions */}
      <div
        className="drawing-titlebar flex items-center justify-between px-3 h-8 bg-[#f1f5f9] border-b border-[#cbd5e1] text-[#334155] cursor-grab active:cursor-grabbing shrink-0"
        onMouseDown={(e) => {
          if (isMaximized) return;
          startDrag(e, (pos) => onPositionChange?.(pos), onActivate);
        }}
      >
        <div className="flex items-center gap-2">
          {/* Excalidraw / Palette Icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6965db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10c0-2-1-3-3-3h-2.5a2 2 0 0 1-2-2v-1.5c0-1.5-.5-2.5-2.5-3.5Z" />
            <circle cx="7.5" cy="10.5" r="1.5" fill="#6965db" />
            <circle cx="12" cy="7.5" r="1.5" fill="#6965db" />
            <circle cx="16.5" cy="10.5" r="1.5" fill="#6965db" />
          </svg>
          <input
            type="text"
            value={win.title || "Drawing Board"}
            onChange={(e) => updateWindow(win.id, { title: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-transparent border-none text-xs font-semibold text-[#1e293b] focus:outline-none focus:bg-white/60 px-1 rounded hover:bg-white/40 cursor-text max-w-[200px]"
          />
        </div>

        <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
          {/* Word Ribbon Toggle */}
          <button
            type="button"
            onClick={() => setShowWordRibbon(!showWordRibbon)}
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
              showWordRibbon ? "bg-[#2b579a] text-white" : "bg-[#e2e8f0] text-[#334155] hover:bg-[#cbd5e1]"
            }`}
            title="Toggle MS Word Formatting Ribbon"
          >
            Word Ribbon
          </button>

          {/* Close Window Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-5 h-5 flex items-center justify-center rounded text-[#64748b] hover:bg-[#ef4444] hover:text-white cursor-pointer transition-colors"
              title="Close Drawing Board"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Top: Excalidraw Main Tools */}
      <ExcalidrawToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        isLocked={isLocked}
        setIsLocked={setIsLocked}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(3, z * 1.15))}
        onZoomOut={() => setZoom((z) => Math.max(0.2, z * 0.85))}
        onResetZoom={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
        isMaximized={isMaximized}
        onToggleMaximize={() => setIsMaximized(!isMaximized)}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onClear={handleClear}
      />

      {/* MS Word Ribbon Header */}
      {showWordRibbon && (
        <WordRibbon
          activeElement={activeSelectedElement}
          onUpdateProps={handleUpdateProps}
        />
      )}

      {/* Drawing Canvas Area */}
      <div
        className="canvas-container relative flex-1 w-full overflow-hidden bg-[#fafafa]"
        style={{ cursor: isSpacePressed || isPanning ? "grab" : activeTool === "select" ? "default" : "crosshair" }}
        onWheel={handleWheel}
      >
        {/* Floating Excalidraw Style Properties Panel */}
        <StylePropertiesPanel
          element={activeSelectedElement}
          defaultStyle={defaultStyle}
          onUpdateElement={handleUpdateProps}
          onUpdateDefaults={(patch) => setDefaultStyle((prev) => ({ ...prev, ...patch }))}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />

        {/* SVG Drawing Surface */}
        <svg
          ref={canvasRef}
          className="w-full h-full block"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        >
          <defs>
            {/* Background dot pattern */}
            <pattern
              id={`canvas-dots-${win.id}`}
              x={pan.x % (24 * zoom)}
              y={pan.y % (24 * zoom)}
              width={24 * zoom}
              height={24 * zoom}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={12 * zoom} cy={12 * zoom} r={1.2 * zoom} fill="#cbd5e1" />
            </pattern>

            {/* Clip paths for hachure fills */}
            {elements.map((el) => {
              if (el.fillStyle !== "hachure" && el.fillStyle !== "cross-hatch") return null;
              let clipD = "";
              if (el.type === "rectangle" || el.type === "card") {
                clipD = getRectPath(el.x, el.y, el.width, el.height, el.roundness);
              } else if (el.type === "ellipse") {
                clipD = getEllipsePath(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2);
              } else if (el.type === "diamond") {
                clipD = getDiamondPath(el.x, el.y, el.width, el.height);
              }
              if (!clipD) return null;
              return (
                <clipPath key={`clip-${el.id}`} id={`clip-${el.id}`}>
                  <path d={clipD} />
                </clipPath>
              );
            })}
          </defs>

          {/* Background grid */}
          <rect width="100%" height="100%" fill={`url(#canvas-dots-${win.id})`} />

          {/* Zoom and Pan World Container */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {elements.map((el) => {
              const seed = stringToSeed(el.id);
              const isSelected = selectedIds.includes(el.id);

              return (
                <g
                  key={el.id}
                  id={`el-${el.id}`}
                  opacity={el.opacity ?? 1}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (el.type === "text" || el.type === "card") {
                      setEditingId(el.id);
                    }
                  }}
                >
                  {/* Fills & Hatchings */}
                  {el.backgroundColor && el.backgroundColor !== "transparent" && el.fillStyle === "solid" && (
                    <path
                      d={
                        el.type === "rectangle" || el.type === "card"
                          ? getRectPath(el.x, el.y, el.width, el.height, el.roundness)
                          : el.type === "ellipse"
                          ? getEllipsePath(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2)
                          : el.type === "diamond"
                          ? getDiamondPath(el.x, el.y, el.width, el.height)
                          : ""
                      }
                      fill={el.backgroundColor}
                    />
                  )}

                  {/* Hachure Fill (Excalidraw signature style) */}
                  {(el.fillStyle === "hachure" || el.fillStyle === "cross-hatch") && (
                    <g clipPath={`url(#clip-${el.id})`}>
                      {el.backgroundColor && el.backgroundColor !== "transparent" && (
                        <path
                          d={
                            el.type === "rectangle" || el.type === "card"
                              ? getRectPath(el.x, el.y, el.width, el.height, el.roundness)
                              : el.type === "ellipse"
                              ? getEllipsePath(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2)
                              : el.type === "diamond"
                              ? getDiamondPath(el.x, el.y, el.width, el.height)
                              : ""
                          }
                          fill={el.backgroundColor}
                          opacity={0.3}
                        />
                      )}
                      <path
                        d={generateHachureLines(el.x, el.y, el.width, el.height, 9, 45, el.roughness, seed)}
                        stroke={el.strokeColor}
                        strokeWidth={Math.max(1, el.strokeWidth * 0.7)}
                        fill="none"
                      />
                      {el.fillStyle === "cross-hatch" && (
                        <path
                          d={generateHachureLines(el.x, el.y, el.width, el.height, 9, -45, el.roughness, seed + 50)}
                          stroke={el.strokeColor}
                          strokeWidth={Math.max(1, el.strokeWidth * 0.7)}
                          fill="none"
                        />
                      )}
                    </g>
                  )}

                  {/* Sketchy Strokes based on element type */}
                  {el.type === "rectangle" && (
                    <path
                      d={generateSketchyRect(el.x, el.y, el.width, el.height, el.roughness, el.roundness, seed)}
                      stroke={el.strokeColor}
                      strokeWidth={el.strokeWidth}
                      strokeDasharray={el.strokeStyle === "dashed" ? "8 6" : el.strokeStyle === "dotted" ? "3 4" : undefined}
                      fill="none"
                    />
                  )}

                  {el.type === "ellipse" && (
                    <path
                      d={generateSketchyEllipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, el.roughness, seed)}
                      stroke={el.strokeColor}
                      strokeWidth={el.strokeWidth}
                      strokeDasharray={el.strokeStyle === "dashed" ? "8 6" : el.strokeStyle === "dotted" ? "3 4" : undefined}
                      fill="none"
                    />
                  )}

                  {el.type === "diamond" && (
                    <path
                      d={generateSketchyDiamond(el.x, el.y, el.width, el.height, el.roughness, seed)}
                      stroke={el.strokeColor}
                      strokeWidth={el.strokeWidth}
                      strokeDasharray={el.strokeStyle === "dashed" ? "8 6" : el.strokeStyle === "dotted" ? "3 4" : undefined}
                      fill="none"
                    />
                  )}

                  {el.type === "arrow" && el.points && el.points.length >= 2 && (
                    <path
                      d={generateSketchyArrow(el.points[0].x, el.points[0].y, el.points[el.points.length - 1].x, el.points[el.points.length - 1].y, el.roughness, seed)}
                      stroke={el.strokeColor}
                      strokeWidth={el.strokeWidth}
                      fill="none"
                    />
                  )}

                  {el.type === "line" && el.points && el.points.length >= 2 && (
                    <path
                      d={generateSketchyLine(el.points[0].x, el.points[0].y, el.points[el.points.length - 1].x, el.points[el.points.length - 1].y, el.roughness, seed)}
                      stroke={el.strokeColor}
                      strokeWidth={el.strokeWidth}
                      strokeDasharray={el.strokeStyle === "dashed" ? "8 6" : el.strokeStyle === "dotted" ? "3 4" : undefined}
                      fill="none"
                    />
                  )}

                  {(el.type === "draw" || el.type === "highlighter") && el.points && (
                    <path
                      d={generateSmoothFreehand(el.points)}
                      stroke={el.strokeColor}
                      strokeWidth={el.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}

                  {/* Text / MS Word Document Card Rendering */}
                  {(el.type === "text" || el.type === "card") && (
                    <foreignObject
                      x={el.x}
                      y={el.y}
                      width={Math.max(120, el.width)}
                      height={Math.max(40, el.height)}
                      style={{ overflow: "visible" }}
                    >
                      <div
                        className={`w-full h-full p-2.5 rounded-lg select-text ${
                          el.type === "card"
                            ? "bg-white shadow-md border border-[#cbd5e1]"
                            : ""
                        }`}
                        style={{
                          fontFamily: el.fontFamily || "'Caveat', 'Kalam', cursive",
                          fontSize: `${el.fontSize || 20}px`,
                          fontWeight: el.fontWeight || "normal",
                          fontStyle: el.fontStyle || "normal",
                          textDecoration: el.textDecoration || "none",
                          textAlign: el.textAlign || "left",
                          color: el.textColor || el.strokeColor || "#1e1e1e",
                          backgroundColor: el.textBgColor !== "transparent" ? el.textBgColor : (el.type === "card" ? "#ffffff" : "transparent"),
                          lineHeight: el.lineHeight || 1.35,
                          boxSizing: "border-box",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: el.richHtml || (el.text ? el.text.replace(/\n/g, "<br/>") : "Text"),
                        }}
                      />
                    </foreignObject>
                  )}

                  {/* Selected Element Bounding Box & 8 Resize Handles */}
                  {isSelected && (
                    <g>
                      <rect
                        x={el.x - 4}
                        y={el.y - 4}
                        width={el.width + 8}
                        height={el.height + 8}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      {/* Resize handles: nw, n, ne, e, se, s, sw, w */}
                      {[
                        { pos: "nw", cx: el.x - 4, cy: el.y - 4, cursor: "nwse-resize" },
                        { pos: "n", cx: el.x + el.width / 2, cy: el.y - 4, cursor: "ns-resize" },
                        { pos: "ne", cx: el.x + el.width + 4, cy: el.y - 4, cursor: "nesw-resize" },
                        { pos: "e", cx: el.x + el.width + 4, cy: el.y + el.height / 2, cursor: "ew-resize" },
                        { pos: "se", cx: el.x + el.width + 4, cy: el.y + el.height + 4, cursor: "nwse-resize" },
                        { pos: "s", cx: el.x + el.width / 2, cy: el.y + el.height + 4, cursor: "ns-resize" },
                        { pos: "sw", cx: el.x - 4, cy: el.y + el.height + 4, cursor: "nesw-resize" },
                        { pos: "w", cx: el.x - 4, cy: el.y + el.height / 2, cursor: "ew-resize" },
                      ].map((h) => (
                        <rect
                          key={h.pos}
                          x={h.cx - 4}
                          y={h.cy - 4}
                          width={8}
                          height={8}
                          fill="#ffffff"
                          stroke="#6366f1"
                          strokeWidth="1.5"
                          style={{ cursor: h.cursor }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            isInteractingRef.current = true;
                            interactionModeRef.current = "resize";
                            activeResizeHandleRef.current = h.pos;
                          }}
                        />
                      ))}
                    </g>
                  )}
                </g>
              );
            })}

            {/* Marquee Selection Box */}
            {selectionBox && (
              <rect
                x={selectionBox.x}
                y={selectionBox.y}
                width={selectionBox.w}
                height={selectionBox.h}
                fill="rgba(99, 102, 241, 0.12)"
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            )}
          </g>
        </svg>

        {/* In-place Rich Text Editor Modal */}
        {editingElement && (
          <RichTextEditor
            element={editingElement}
            zoom={zoom}
            pan={pan}
            onCommit={(text, richHtml, width, height) => {
              const updated = elements.map((el) =>
                el.id === editingElement.id
                  ? {
                      ...el,
                      text,
                      richHtml,
                      width: width ?? editingElement.width,
                      height: height ?? editingElement.height,
                    }
                  : el
              );
              pushState(updated);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        )}
      </div>
    </div>
  );
}
