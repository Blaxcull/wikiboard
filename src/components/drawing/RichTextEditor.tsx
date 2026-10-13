import { useEffect, useRef } from "react";
import type { DrawingElement } from "../../types/drawing";

type Props = {
  element: DrawingElement;
  zoom?: number;
  pan?: { x: number; y: number };
  onCommit: (text: string, richHtml?: string, width?: number, height?: number) => void;
  onCancel: () => void;
};

export default function RichTextEditor({ element, zoom = 1, pan = { x: 0, y: 0 }, onCommit, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus();

      // Place caret at end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const handleFinish = () => {
    if (!editorRef.current) return;
    const innerText = editorRef.current.innerText || "";
    const innerHtml = editorRef.current.innerHTML || "";
    const rect = editorRef.current.getBoundingClientRect();
    const newW = Math.max(element.width, rect.width / zoom);
    const newH = Math.max(element.height, rect.height / zoom);
    onCommit(innerText, innerHtml, newW, newH);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }

    // Ctrl+B, Ctrl+I, Ctrl+U
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        document.execCommand("bold");
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        document.execCommand("italic");
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        document.execCommand("underline");
      }
    }

    // Enter in list mode
    if (e.key === "Enter" && !e.shiftKey) {
      if (element.listType === "bullet") {
        // execCommand insertUnorderedList or let default handle
      } else if (element.listType === "number") {
        // execCommand insertOrderedList
      }
    }
  };

  const fontFamily = element.fontFamily || "'Caveat', 'Kalam', cursive";
  const fontSize = element.fontSize || 20;
  const fontWeight = element.fontWeight || "normal";
  const fontStyle = element.fontStyle || "normal";
  const textDecoration = element.textDecoration || "none";
  const textAlign = element.textAlign || "left";
  const textColor = element.textColor || element.strokeColor || "#1e1e1e";
  const textBgColor = element.textBgColor || "transparent";
  const lineHeight = element.lineHeight || 1.35;

  return (
    <div
      ref={containerRef}
      className="rich-text-editor-overlay absolute z-40"
      style={{
        left: `${element.x * zoom + pan.x}px`,
        top: `${element.y * zoom + pan.y}px`,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
        minWidth: `${Math.max(120, element.width)}px`,
        minHeight: `${Math.max(40, element.height)}px`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={handleFinish}
        onKeyDown={handleKeyDown}
        className="w-full h-full p-2 rounded-lg border-2 border-[#3b82f6] bg-white/95 shadow-xl outline-none focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/40 cursor-text overflow-auto"
        style={{
          fontFamily,
          fontSize: `${fontSize}px`,
          fontWeight,
          fontStyle,
          textDecoration,
          textAlign,
          color: textColor,
          backgroundColor: textBgColor !== "transparent" ? textBgColor : "rgba(255, 255, 255, 0.95)",
          lineHeight,
          minWidth: `${element.width}px`,
          minHeight: `${element.height}px`,
        }}
        dangerouslySetInnerHTML={{
          __html:
            element.richHtml ||
            (element.text
              ? element.text.replace(/\n/g, "<br/>")
              : (element.type === "card"
                  ? "<h3>Document Title</h3><p>Type your notes here...</p><ul><li>First key point</li><li>Second key point</li></ul>"
                  : "Type text...")),
        }}
      />
      <div className="flex items-center justify-between text-[10px] text-[#64748b] bg-white px-2 py-0.5 mt-1 rounded shadow-xs border border-[#cbd5e1]">
        <span>Press <kbd className="font-semibold text-[#1e293b]">Esc</kbd> or click outside to commit</span>
        <span className="text-[#3b82f6] font-medium">Ctrl+B/I/U supported</span>
      </div>
    </div>
  );
}
