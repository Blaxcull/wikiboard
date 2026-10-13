export type DrawingTool =
  | "select"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "draw"
  | "highlighter"
  | "text"
  | "card"
  | "eraser";

export type FillStyle = "none" | "solid" | "hachure" | "cross-hatch";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type TextAlign = "left" | "center" | "right" | "justify";
export type ListType = "none" | "bullet" | "number" | "check";
export type HeadingLevel = "normal" | "h1" | "h2" | "h3";

export type DrawingElement = {
  id: string;
  type:
    | "rectangle"
    | "diamond"
    | "ellipse"
    | "arrow"
    | "line"
    | "draw"
    | "highlighter"
    | "text"
    | "card";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: { x: number; y: number }[]; // For freehand draw, lines, arrows
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number; // 0 = clean/geometric, 1 = sketchy artist, 2 = cartoon/rough
  roundness?: boolean;
  opacity: number;
  angle?: number;

  // MS Word Rich Text properties
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textAlign?: TextAlign;
  textColor?: string;
  textBgColor?: string;
  listType?: ListType;
  lineHeight?: number;
  heading?: HeadingLevel;
  richHtml?: string;

  // Document card extras
  cardTitle?: string;
};

export type DrawingSettings = {
  bgType?: "dots" | "grid" | "blank";
  bgColor?: string;
  zoom?: number;
  panX?: number;
  panY?: number;
};
