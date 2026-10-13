import { useState } from "react";
import type {
  DrawingElement,
  TextAlign,
  HeadingLevel,
} from "../../types/drawing";

type Props = {
  activeElement: DrawingElement | null;
  onUpdateProps: (patch: Partial<DrawingElement>) => void;
  onExecuteCommand?: (command: string, value?: string) => void;
};

const FONT_OPTIONS = [
  { label: "Handwritten (Excalidraw)", value: "'Caveat', 'Kalam', cursive" },
  { label: "Sans-Serif (Modern)", value: "system-ui, -apple-system, sans-serif" },
  { label: "Serif (Times / Georgia)", value: "'Times New Roman', Georgia, serif" },
  { label: "Monospace (Code)", value: "'Fira Code', 'Courier New', monospace" },
  { label: "Comic / Casual", value: "'Comic Sans MS', cursive" },
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

const COLOR_PALETTE = [
  "#1e1e1e", // Black
  "#495057", // Charcoal
  "#e03131", // Red
  "#e8590c", // Orange
  "#f08c00", // Amber / Gold
  "#2f9e44", // Green
  "#0c8599", // Cyan
  "#1971c2", // Blue
  "#6741d9", // Purple
  "#c2255c", // Pink
  "#ffffff", // White
];

const HIGHLIGHT_PALETTE = [
  { label: "None", value: "transparent" },
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Cyan", value: "#a5f3fc" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
];

export default function WordRibbon({
  activeElement,
  onUpdateProps,
  onExecuteCommand,
}: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);

  const currentFont = activeElement?.fontFamily || "'Caveat', 'Kalam', cursive";
  const currentSize = activeElement?.fontSize || 20;
  const isBold = activeElement?.fontWeight === "bold";
  const isItalic = activeElement?.fontStyle === "italic";
  const isUnderline = activeElement?.textDecoration === "underline";
  const isStrikethrough = activeElement?.textDecoration === "line-through";
  const currentAlign = activeElement?.textAlign || "left";
  const currentList = activeElement?.listType || "none";
  const currentColor = activeElement?.textColor || activeElement?.strokeColor || "#1e1e1e";
  const currentHighlight = activeElement?.textBgColor || "transparent";
  const currentLineHeight = activeElement?.lineHeight || 1.35;
  const currentHeading = activeElement?.heading || "normal";

  const handleGrowFont = () => {
    const idx = FONT_SIZES.indexOf(currentSize);
    if (idx !== -1 && idx < FONT_SIZES.length - 1) {
      onUpdateProps({ fontSize: FONT_SIZES[idx + 1] });
    } else {
      onUpdateProps({ fontSize: Math.min(96, currentSize + 4) });
    }
  };

  const handleShrinkFont = () => {
    const idx = FONT_SIZES.indexOf(currentSize);
    if (idx !== -1 && idx > 0) {
      onUpdateProps({ fontSize: FONT_SIZES[idx - 1] });
    } else {
      onUpdateProps({ fontSize: Math.max(8, currentSize - 4) });
    }
  };

  return (
    <div className="word-ribbon flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-[#fdfdfd] border-b border-[#e2e8f0] text-[#1e293b] text-xs shadow-xs select-none">
      {/* MS Word Badge / Section */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#e2e8f0]">
        <div className="w-5 h-5 rounded bg-[#2b579a] flex items-center justify-center text-white font-bold text-[10px] shadow-xs">
          W
        </div>
        <span className="font-semibold text-[11px] text-[#2b579a] hidden sm:inline">
          Format
        </span>
      </div>

      {/* Heading / Style Selector */}
      <div className="flex items-center border-r border-[#e2e8f0] pr-1.5">
        <select
          value={currentHeading}
          onChange={(e) => {
            const h = e.target.value as HeadingLevel;
            let sz: number;
            let weight: "normal" | "bold" = isBold ? "bold" : "normal";
            if (h === "h1") {
              sz = 32;
              weight = "bold";
            } else if (h === "h2") {
              sz = 24;
              weight = "bold";
            } else if (h === "h3") {
              sz = 18;
              weight = "bold";
            } else {
              sz = 16;
            }
            onUpdateProps({ heading: h, fontSize: sz, fontWeight: weight });
            onExecuteCommand?.("formatBlock", h === "normal" ? "p" : h);
          }}
          className="h-7 px-1.5 py-0.5 rounded border border-[#cbd5e1] bg-white text-xs text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#2b579a]"
          title="Heading Style"
        >
          <option value="normal">Normal Text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>

      {/* Font Family Dropdown */}
      <div className="flex items-center border-r border-[#e2e8f0] pr-1.5">
        <select
          value={currentFont}
          onChange={(e) => {
            onUpdateProps({ fontFamily: e.target.value });
            onExecuteCommand?.("fontName", e.target.value);
          }}
          className="h-7 max-w-[130px] sm:max-w-[160px] px-1.5 py-0.5 rounded border border-[#cbd5e1] bg-white text-xs text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#2b579a]"
          title="Font Family"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Font Size Selector + Grow/Shrink */}
      <div className="flex items-center gap-0.5 border-r border-[#e2e8f0] pr-1.5">
        <select
          value={currentSize}
          onChange={(e) => {
            const sz = Number(e.target.value);
            onUpdateProps({ fontSize: sz });
            onExecuteCommand?.("fontSize", String(sz));
          }}
          className="h-7 w-12 px-1 py-0.5 rounded border border-[#cbd5e1] bg-white text-xs text-[#334155] text-center focus:outline-none focus:ring-1 focus:ring-[#2b579a]"
          title="Font Size (pt)"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleGrowFont}
          className="w-6 h-7 flex items-center justify-center rounded hover:bg-[#e2e8f0] text-[#334155] font-semibold text-xs transition-colors"
          title="Increase Font Size"
        >
          A<sup className="text-[9px] -top-1">▲</sup>
        </button>
        <button
          type="button"
          onClick={handleShrinkFont}
          className="w-6 h-7 flex items-center justify-center rounded hover:bg-[#e2e8f0] text-[#334155] font-semibold text-xs transition-colors"
          title="Decrease Font Size"
        >
          A<sub className="text-[9px] -bottom-0.5">▼</sub>
        </button>
      </div>

      {/* Font Style Toggles: B, I, U, S */}
      <div className="flex items-center gap-0.5 border-r border-[#e2e8f0] pr-1.5">
        <button
          type="button"
          onClick={() => {
            const next = isBold ? "normal" : "bold";
            onUpdateProps({ fontWeight: next });
            onExecuteCommand?.("bold");
          }}
          className={`w-6 h-7 flex items-center justify-center rounded font-bold text-xs transition-colors ${
            isBold
              ? "bg-[#2b579a] text-white shadow-xs"
              : "text-[#334155] hover:bg-[#e2e8f0]"
          }`}
          title="Bold (Ctrl+B)"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => {
            const next = isItalic ? "normal" : "italic";
            onUpdateProps({ fontStyle: next });
            onExecuteCommand?.("italic");
          }}
          className={`w-6 h-7 flex items-center justify-center rounded italic font-serif text-xs transition-colors ${
            isItalic
              ? "bg-[#2b579a] text-white shadow-xs"
              : "text-[#334155] hover:bg-[#e2e8f0]"
          }`}
          title="Italic (Ctrl+I)"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => {
            const next = isUnderline ? "none" : "underline";
            onUpdateProps({ textDecoration: next });
            onExecuteCommand?.("underline");
          }}
          className={`w-6 h-7 flex items-center justify-center rounded underline text-xs transition-colors ${
            isUnderline
              ? "bg-[#2b579a] text-white shadow-xs"
              : "text-[#334155] hover:bg-[#e2e8f0]"
          }`}
          title="Underline (Ctrl+U)"
        >
          U
        </button>
        <button
          type="button"
          onClick={() => {
            const next = isStrikethrough ? "none" : "line-through";
            onUpdateProps({ textDecoration: next });
            onExecuteCommand?.("strikeThrough");
          }}
          className={`w-6 h-7 flex items-center justify-center rounded line-through text-xs transition-colors ${
            isStrikethrough
              ? "bg-[#2b579a] text-white shadow-xs"
              : "text-[#334155] hover:bg-[#e2e8f0]"
          }`}
          title="Strikethrough"
        >
          S
        </button>
      </div>

      {/* Text Color & Highlight Color Pickers */}
      <div className="flex items-center gap-1 border-r border-[#e2e8f0] pr-1.5 relative">
        {/* Text Color */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowHighlightPicker(false);
            }}
            className="h-7 px-1.5 flex flex-col items-center justify-center rounded hover:bg-[#e2e8f0] text-[#334155] transition-colors"
            title="Font Color"
          >
            <span className="font-bold text-[11px] leading-tight">A</span>
            <span
              className="w-3.5 h-1 rounded-full border border-black/20"
              style={{ backgroundColor: currentColor }}
            />
          </button>

          {showColorPicker && (
            <div className="absolute top-8 left-0 z-50 p-2 bg-white rounded-lg shadow-lg border border-[#cbd5e1] grid grid-cols-6 gap-1 w-44">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onUpdateProps({ textColor: c, strokeColor: c });
                    onExecuteCommand?.("foreColor", c);
                    setShowColorPicker(false);
                  }}
                  className="w-6 h-6 rounded border border-black/15 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
              <div className="col-span-6 mt-1 pt-1 border-t border-[#e2e8f0] flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Custom:</span>
                <input
                  type="color"
                  value={currentColor.startsWith("#") ? currentColor : "#1e1e1e"}
                  onChange={(e) => {
                    onUpdateProps({ textColor: e.target.value, strokeColor: e.target.value });
                    onExecuteCommand?.("foreColor", e.target.value);
                  }}
                  className="w-6 h-6 cursor-pointer border-none bg-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Highlight Color */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowHighlightPicker(!showHighlightPicker);
              setShowColorPicker(false);
            }}
            className="h-7 px-1.5 flex items-center justify-center rounded hover:bg-[#e2e8f0] text-[#334155] transition-colors gap-0.5"
            title="Text Highlight Color"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 11-6 6v3h3l6-6"/>
              <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
            </svg>
            <span
              className="w-2.5 h-2.5 rounded-full border border-black/20"
              style={{ backgroundColor: currentHighlight !== "transparent" ? currentHighlight : "#fff" }}
            />
          </button>

          {showHighlightPicker && (
            <div className="absolute top-8 left-0 z-50 p-2 bg-white rounded-lg shadow-lg border border-[#cbd5e1] flex flex-col gap-1 w-36">
              {HIGHLIGHT_PALETTE.map((h) => (
                <button
                  key={h.value}
                  type="button"
                  onClick={() => {
                    onUpdateProps({ textBgColor: h.value });
                    onExecuteCommand?.("hiliteColor", h.value);
                    setShowHighlightPicker(false);
                  }}
                  className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-[#f1f5f9] text-left"
                >
                  <span
                    className="w-4 h-4 rounded border border-black/15 shrink-0"
                    style={{ backgroundColor: h.value !== "transparent" ? h.value : "#fff" }}
                  />
                  <span>{h.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alignment: Left, Center, Right, Justify */}
      <div className="flex items-center gap-0.5 border-r border-[#e2e8f0] pr-1.5">
        {(["left", "center", "right", "justify"] as TextAlign[]).map((align) => (
          <button
            key={align}
            type="button"
            onClick={() => {
              onUpdateProps({ textAlign: align });
              onExecuteCommand?.(
                align === "left"
                  ? "justifyLeft"
                  : align === "center"
                  ? "justifyCenter"
                  : align === "right"
                  ? "justifyRight"
                  : "justifyFull"
              );
            }}
            className={`w-6 h-7 flex items-center justify-center rounded transition-colors ${
              currentAlign === align
                ? "bg-[#2b579a] text-white shadow-xs"
                : "text-[#334155] hover:bg-[#e2e8f0]"
            }`}
            title={`Align ${align.charAt(0).toUpperCase() + align.slice(1)}`}
          >
            {align === "left" && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="15" y2="12"/>
                <line x1="3" y1="18" x2="19" y2="18"/>
              </svg>
            )}
            {align === "center" && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="6" y1="12" x2="18" y2="12"/>
                <line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
            )}
            {align === "right" && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="9" y1="12" x2="21" y2="12"/>
                <line x1="5" y1="18" x2="21" y2="18"/>
              </svg>
            )}
            {align === "justify" && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Bullets, Numbering, and Checklist */}
      <div className="flex items-center gap-0.5 border-r border-[#e2e8f0] pr-1.5">
        <button
          type="button"
          onClick={() => {
            const next = currentList === "bullet" ? "none" : "bullet";
            onUpdateProps({ listType: next });
            onExecuteCommand?.("insertUnorderedList");
          }}
          className={`h-7 px-2 flex items-center gap-1 rounded transition-colors ${
            currentList === "bullet"
              ? "bg-[#2b579a] text-white shadow-xs"
              : "text-[#334155] hover:bg-[#e2e8f0]"
          }`}
          title="Bullet Points (• Bullet List)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
            <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
          </svg>
          <span className="hidden md:inline text-[11px]">Bullets</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const next = currentList === "number" ? "none" : "number";
            onUpdateProps({ listType: next });
            onExecuteCommand?.("insertOrderedList");
          }}
          className={`h-7 px-2 flex items-center gap-1 rounded transition-colors ${
            currentList === "number"
              ? "bg-[#2b579a] text-white shadow-xs"
              : "text-[#334155] hover:bg-[#e2e8f0]"
          }`}
          title="Numbered List (1, 2, 3...)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="10" y1="6" x2="21" y2="6"/>
            <line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 6h2v-2" strokeWidth="1.8"/>
            <path d="M4 11h2v2H4" strokeWidth="1.8"/>
            <path d="M4 17h2v2H4" strokeWidth="1.8"/>
          </svg>
          <span className="hidden md:inline text-[11px]">Numbers</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const next = currentList === "check" ? "none" : "check";
            onUpdateProps({ listType: next });
          }}
          className={`h-7 px-2 flex items-center gap-1 rounded transition-colors ${
            currentList === "check"
              ? "bg-[#2b579a] text-white shadow-xs"
              : "text-[#334155] hover:bg-[#e2e8f0]"
          }`}
          title="Task Checklist (☐ / ☑)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span className="hidden md:inline text-[11px]">Checklist</span>
        </button>
      </div>

      {/* Line Spacing & Indentation */}
      <div className="flex items-center gap-1">
        <select
          value={currentLineHeight}
          onChange={(e) => onUpdateProps({ lineHeight: Number(e.target.value) })}
          className="h-7 px-1.5 py-0.5 rounded border border-[#cbd5e1] bg-white text-xs text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#2b579a]"
          title="Line Spacing"
        >
          <option value={1.0}>1.0 (Tight)</option>
          <option value={1.25}>1.25 (Normal)</option>
          <option value={1.5}>1.5 (Relaxed)</option>
          <option value={2.0}>2.0 (Double)</option>
        </select>

        <button
          type="button"
          onClick={() => onExecuteCommand?.("outdent")}
          className="w-6 h-7 flex items-center justify-center rounded hover:bg-[#e2e8f0] text-[#334155] transition-colors"
          title="Decrease Indent"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="7 8 3 12 7 16"/>
            <line x1="21" y1="12" x2="11" y2="12"/>
            <line x1="21" y1="6" x2="11" y2="6"/>
            <line x1="21" y1="18" x2="11" y2="18"/>
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onExecuteCommand?.("indent")}
          className="w-6 h-7 flex items-center justify-center rounded hover:bg-[#e2e8f0] text-[#334155] transition-colors"
          title="Increase Indent"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="11 8 15 12 11 16"/>
            <line x1="21" y1="12" x2="15" y2="12"/>
            <line x1="21" y1="6" x2="11" y2="6"/>
            <line x1="21" y1="18" x2="11" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
