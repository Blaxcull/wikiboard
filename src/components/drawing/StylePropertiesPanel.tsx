import type {
  DrawingElement,
  FillStyle,
  StrokeStyle,
} from "../../types/drawing";

type Props = {
  element: DrawingElement | null;
  defaultStyle: Partial<DrawingElement>;
  onUpdateElement: (patch: Partial<DrawingElement>) => void;
  onUpdateDefaults: (patch: Partial<DrawingElement>) => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

const STROKE_COLORS = [
  "#1e1e1e", // Black
  "#e03131", // Red
  "#2f9e44", // Green
  "#1971c2", // Blue
  "#f08c00", // Yellow / Orange
  "#6741d9", // Purple
  "#c2255c", // Pink
  "#495057", // Slate
];

const BG_COLORS = [
  "transparent",
  "#ffc9c9", // Pastel Red
  "#b2f2bb", // Pastel Green
  "#a5d8ff", // Pastel Blue
  "#ffec99", // Pastel Yellow
  "#eebefa", // Pastel Purple
  "#fcc2d7", // Pastel Pink
  "#f1f3f5", // Light Gray
];

export default function StylePropertiesPanel({
  element,
  defaultStyle,
  onUpdateElement,
  onUpdateDefaults,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onDelete,
}: Props) {
  const current = element || defaultStyle;

  const strokeColor = current.strokeColor || "#1e1e1e";
  const backgroundColor = current.backgroundColor || "transparent";
  const fillStyle: FillStyle = current.fillStyle || "hachure";
  const strokeWidth = current.strokeWidth || 2;
  const strokeStyle: StrokeStyle = current.strokeStyle || "solid";
  const roughness = current.roughness ?? 1;
  const roundness = current.roundness ?? true;
  const opacity = Math.round((current.opacity ?? 1) * 100);

  const applyChange = (patch: Partial<DrawingElement>) => {
    if (element) {
      onUpdateElement(patch);
    }
    onUpdateDefaults(patch);
  };

  return (
    <div className="style-properties-panel absolute left-3 top-3 z-30 w-52 max-h-[calc(100%-24px)] overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-[#cbd5e1] p-3 text-[#1e293b] text-xs select-none space-y-3 scrollbar-hide">
      <div className="flex items-center justify-between font-bold text-[#475569] text-[11px] uppercase tracking-wider">
        <span>{element ? "Element Style" : "Default Style"}</span>
        {element && (
          <span className="text-[10px] text-[#6366f1] font-semibold bg-[#e0e7ff] px-1.5 py-0.5 rounded-full">
            Selected
          </span>
        )}
      </div>

      {/* Stroke Color */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-[#64748b]">Stroke</div>
        <div className="grid grid-cols-4 gap-1.5">
          {STROKE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => applyChange({ strokeColor: c })}
              className={`w-9 h-6 rounded-md border transition-transform cursor-pointer ${
                strokeColor === c
                  ? "ring-2 ring-[#3b82f6] scale-105 border-black/30"
                  : "border-black/15 hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] text-[#64748b]">Custom color:</span>
          <input
            type="color"
            value={strokeColor.startsWith("#") ? strokeColor : "#1e1e1e"}
            onChange={(e) => applyChange({ strokeColor: e.target.value })}
            className="w-5 h-5 cursor-pointer rounded border-none bg-transparent"
          />
        </div>
      </div>

      {/* Background / Fill Color */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-[#64748b]">Background</div>
        <div className="grid grid-cols-4 gap-1.5">
          {BG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => applyChange({ backgroundColor: c })}
              className={`w-9 h-6 rounded-md border transition-transform cursor-pointer relative overflow-hidden ${
                backgroundColor === c
                  ? "ring-2 ring-[#3b82f6] scale-105 border-black/30"
                  : "border-black/15 hover:scale-105"
              }`}
              style={{ backgroundColor: c === "transparent" ? "#ffffff" : c }}
            >
              {c === "transparent" && (
                <div className="absolute inset-0 flex items-center justify-center text-[#ef4444] text-xs font-bold">
                  /
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Fill Style */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-[#64748b]">Fill Pattern</div>
        <div className="grid grid-cols-4 gap-1">
          {(["none", "solid", "hachure", "cross-hatch"] as FillStyle[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => applyChange({ fillStyle: f })}
              className={`py-1 text-[10px] font-medium rounded-md border text-center transition-colors cursor-pointer ${
                fillStyle === f
                  ? "bg-[#6965db] text-white border-[#6965db]"
                  : "bg-white text-[#475569] border-[#cbd5e1] hover:bg-[#f8fafc]"
              }`}
            >
              {f === "none" ? "None" : f === "solid" ? "Solid" : f === "hachure" ? "Hatch" : "Cross"}
            </button>
          ))}
        </div>
      </div>

      {/* Stroke Width */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-[#64748b]">Stroke Width</div>
        <div className="grid grid-cols-3 gap-1">
          {[
            { label: "Thin", val: 1.5 },
            { label: "Medium", val: 3 },
            { label: "Bold", val: 5 },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => applyChange({ strokeWidth: item.val })}
              className={`py-1 text-[10px] font-medium rounded-md border text-center transition-colors cursor-pointer ${
                strokeWidth === item.val
                  ? "bg-[#6965db] text-white border-[#6965db]"
                  : "bg-white text-[#475569] border-[#cbd5e1] hover:bg-[#f8fafc]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stroke Style */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-[#64748b]">Stroke Style</div>
        <div className="grid grid-cols-3 gap-1">
          {(["solid", "dashed", "dotted"] as StrokeStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => applyChange({ strokeStyle: s })}
              className={`py-1 text-[10px] font-medium rounded-md border text-center transition-colors cursor-pointer ${
                strokeStyle === s
                  ? "bg-[#6965db] text-white border-[#6965db]"
                  : "bg-white text-[#475569] border-[#cbd5e1] hover:bg-[#f8fafc]"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Sloppiness / Roughness */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-[#64748b]">Sloppiness</div>
        <div className="grid grid-cols-3 gap-1">
          {[
            { label: "Architect", val: 0 },
            { label: "Artist", val: 1 },
            { label: "Cartoon", val: 2 },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => applyChange({ roughness: item.val })}
              className={`py-1 text-[10px] font-medium rounded-md border text-center transition-colors cursor-pointer ${
                roughness === item.val
                  ? "bg-[#6965db] text-white border-[#6965db]"
                  : "bg-white text-[#475569] border-[#cbd5e1] hover:bg-[#f8fafc]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Corners: Sharp vs Rounded */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-[#64748b]">Edges</div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => applyChange({ roundness: false })}
            className={`py-1 text-[10px] font-medium rounded-md border text-center transition-colors cursor-pointer ${
              !roundness
                ? "bg-[#6965db] text-white border-[#6965db]"
                : "bg-white text-[#475569] border-[#cbd5e1] hover:bg-[#f8fafc]"
            }`}
          >
            Sharp
          </button>
          <button
            type="button"
            onClick={() => applyChange({ roundness: true })}
            className={`py-1 text-[10px] font-medium rounded-md border text-center transition-colors cursor-pointer ${
              roundness
                ? "bg-[#6965db] text-white border-[#6965db]"
                : "bg-white text-[#475569] border-[#cbd5e1] hover:bg-[#f8fafc]"
            }`}
          >
            Round
          </button>
        </div>
      </div>

      {/* Opacity slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] font-semibold text-[#64748b]">
          <span>Opacity</span>
          <span>{opacity}%</span>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          value={opacity}
          onChange={(e) => applyChange({ opacity: Number(e.target.value) / 100 })}
          className="w-full accent-[#6965db] cursor-pointer"
        />
      </div>

      {/* Action buttons if element selected */}
      {element && (
        <div className="pt-2 border-t border-[#e2e8f0] space-y-1.5">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={onBringToFront}
              className="px-2 py-1 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155] rounded text-[10px] font-semibold cursor-pointer"
            >
              Bring Front
            </button>
            <button
              type="button"
              onClick={onSendToBack}
              className="px-2 py-1 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155] rounded text-[10px] font-semibold cursor-pointer"
            >
              Send Back
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={onDuplicate}
              className="px-2 py-1 bg-[#e0e7ff] hover:bg-[#c7d2fe] text-[#4338ca] rounded text-[10px] font-semibold cursor-pointer"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-2 py-1 bg-[#fee2e2] hover:bg-[#fecaca] text-[#b91c1c] rounded text-[10px] font-semibold cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
