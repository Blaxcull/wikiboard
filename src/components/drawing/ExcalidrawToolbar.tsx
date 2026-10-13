import React from "react";
import type { DrawingTool } from "../../types/drawing";

type Props = {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onClear: () => void;
};

export default function ExcalidrawToolbar({
  activeTool,
  setActiveTool,
  isLocked,
  setIsLocked,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isMaximized,
  onToggleMaximize,
  onExportPng,
  onExportSvg,
  onExportJson,
  onImportJson,
  onClear,
}: Props) {
  const tools: { id: DrawingTool; label: string; shortcut: string; icon: React.ReactNode }[] = [
    {
      id: "select",
      label: "Select",
      shortcut: "V",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="m3 3 7 18 3-7 7-3L3 3Z" />
        </svg>
      ),
    },
    {
      id: "rectangle",
      label: "Rectangle",
      shortcut: "R",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" rx="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      ),
    },
    {
      id: "diamond",
      label: "Diamond",
      shortcut: "D",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 2 22 12 12 22 2 12Z" />
        </svg>
      ),
    },
    {
      id: "ellipse",
      label: "Ellipse",
      shortcut: "O",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="9" />
        </svg>
      ),
    },
    {
      id: "arrow",
      label: "Arrow",
      shortcut: "A",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="19" x2="19" y2="5" />
          <polyline points="9 5 19 5 19 15" />
        </svg>
      ),
    },
    {
      id: "line",
      label: "Line",
      shortcut: "L",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="4" y1="20" x2="20" y2="4" />
        </svg>
      ),
    },
    {
      id: "draw",
      label: "Pencil / Draw",
      shortcut: "P",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      ),
    },
    {
      id: "highlighter",
      label: "Highlighter",
      shortcut: "H",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11-6 6v3h3l6-6"/>
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
        </svg>
      ),
    },
    {
      id: "text",
      label: "Text",
      shortcut: "T",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
      ),
    },
    {
      id: "card",
      label: "Word Document Note",
      shortcut: "W",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      ),
    },
    {
      id: "eraser",
      label: "Eraser",
      shortcut: "E",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </svg>
      ),
    },
  ];

  return (
    <div className="excalidraw-toolbar flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#f8fafc] border-b border-[#e2e8f0] select-none text-[#1e293b]">
      {/* Left: Lock tool + Excalidraw tool buttons */}
      <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xs border border-[#cbd5e1]">
        {/* Tool Lock button */}
        <button
          type="button"
          onClick={() => setIsLocked(!isLocked)}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
            isLocked ? "bg-[#3b82f6] text-white" : "text-[#64748b] hover:bg-[#f1f5f9]"
          }`}
          title={isLocked ? "Keep active tool selected (Locked)" : "Revert to select after drawing (Unlocked)"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {isLocked ? (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </>
            ) : (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
              </>
            )}
          </svg>
        </button>

        <div className="w-[1px] h-5 bg-[#e2e8f0] mx-0.5" />

        {/* Tools */}
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTool(t.id)}
            className={`relative w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
              activeTool === t.id
                ? "bg-[#6965db] text-white shadow-xs font-semibold scale-105"
                : "text-[#334155] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
            }`}
            title={`${t.label} (${t.shortcut})`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Center: History (Undo/Redo) & Zoom Controls */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center bg-white p-1 rounded-xl shadow-xs border border-[#cbd5e1] gap-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#334155] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#334155] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
          </button>
        </div>

        <div className="flex items-center bg-white px-1.5 py-1 rounded-xl shadow-xs border border-[#cbd5e1] gap-1">
          <button
            type="button"
            onClick={onZoomOut}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#334155] hover:bg-[#f1f5f9] cursor-pointer"
            title="Zoom Out"
          >
            -
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-[#475569] hover:bg-[#f1f5f9] cursor-pointer"
            title="Reset Zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#334155] hover:bg-[#f1f5f9] cursor-pointer"
            title="Zoom In"
          >
            +
          </button>
        </div>
      </div>

      {/* Right: Maximize, Export & Clear */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleMaximize}
          className={`h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            isMaximized
              ? "bg-[#0ea5e9] text-white"
              : "bg-white text-[#334155] border border-[#cbd5e1] hover:bg-[#f1f5f9]"
          }`}
          title={isMaximized ? "Restore Window Size" : "Maximize Board to Fullscreen"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {isMaximized ? (
              <>
                <polyline points="4 14 10 14 10 20"/>
                <polyline points="20 10 14 10 14 4"/>
                <line x1="14" y1="10" x2="21" y2="3"/>
                <line x1="3" y1="21" x2="10" y2="14"/>
              </>
            ) : (
              <>
                <polyline points="15 3 21 3 21 9"/>
                <polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/>
                <line x1="3" y1="21" x2="10" y2="14"/>
              </>
            )}
          </svg>
          <span className="hidden sm:inline">{isMaximized ? "Restore" : "Maximize"}</span>
        </button>

        {/* Export Buttons */}
        <div className="flex items-center bg-white p-0.5 rounded-xl shadow-xs border border-[#cbd5e1] gap-0.5">
          <button
            type="button"
            onClick={onExportPng}
            className="h-6 px-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#334155] hover:bg-[#f1f5f9] rounded-md cursor-pointer"
            title="Export image as PNG"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={onExportSvg}
            className="h-6 px-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#334155] hover:bg-[#f1f5f9] rounded-md cursor-pointer"
            title="Export scalable vector SVG"
          >
            SVG
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="h-6 px-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#334155] hover:bg-[#f1f5f9] rounded-md cursor-pointer"
            title="Save diagram JSON"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={onImportJson}
            className="h-6 px-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#334155] hover:bg-[#f1f5f9] rounded-md cursor-pointer"
            title="Load diagram JSON"
          >
            Open
          </button>
        </div>

        {/* Clear Button */}
        <button
          type="button"
          onClick={onClear}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-[#cbd5e1] text-[#ef4444] hover:bg-[#fee2e2] cursor-pointer transition-colors"
          title="Clear Entire Canvas"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
