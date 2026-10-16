import { useState, useEffect } from "react";
import { toggleSearchBox } from "../utils/search";
import { useWindows } from "../store/windows";

export default function LeftMenu() {
  const isTextToolActive = useWindows((s) => s.isTextToolActive);
  const toggleTextTool = useWindows((s) => s.toggleTextTool);
  const isSelectToolActive = useWindows((s) => s.isSelectToolActive);
  const toggleSelectTool = useWindows((s) => s.toggleSelectTool);
  const connectionStyle = useWindows((s) => s.connectionStyle);
  const setConnectionStyle = useWindows((s) => s.setConnectionStyle);
  const isEraserToolActive = useWindows((s) => s.isEraserToolActive);
  const toggleEraserTool = useWindows((s) => s.toggleEraserTool);
  const drawingTool = useWindows((s) => s.drawingTool);
  const setDrawingTool = useWindows((s) => s.setDrawingTool);
  const addWindow = useWindows((s) => s.addWindow);
  const [shapesMenuOpen, setShapesMenuOpen] = useState(false);
  const [selectedShape, setSelectedShape] = useState<"rectangle" | "circle" | "diamond" | "line" | "arrow">("rectangle");
  const [searchOpen, setSearchOpen] = useState(false);

  const handleAddStickyNote = () => {
    addWindow({
      contentType: "sticky",
      title: "Note",
      stickyText: "",
      noteColor: "yellow",
      width: 260,
      height: 200,
    });
  };

  useEffect(() => {
    const handleSearchState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === "boolean") {
        setSearchOpen(customEvent.detail.open);
      }
    };
    window.addEventListener("wikiboard:search-state", handleSearchState as EventListener);
    return () => {
      window.removeEventListener("wikiboard:search-state", handleSearchState as EventListener);
    };
  }, []);

  return (
    <aside
      aria-label="Side menu"
      className="left-menu fixed left-4 top-1/2 -translate-y-1/2 z-[9990] flex flex-col items-center bg-white/80 backdrop-blur-2xl border border-black/10 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-1.5 select-none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center gap-1.5">
        {/* Search Icon Button (First item in the menu) */}
        <div className="relative group">
          <button
            type="button"
            onClick={toggleSearchBox}
            aria-label="Search Wikipedia"
            aria-pressed={searchOpen}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
              searchOpen
                ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                : "text-gray-900 hover:bg-black/6 active:scale-95"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16" y2="16" />
            </svg>
          </button>

          {/* Right Flyout Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
          >
            <span>Search</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-sans leading-none text-gray-200">
              Alt + Space
            </kbd>
          </div>
        </div>

        {/* Text Box / Note Button ('T') (Second item in the menu) */}
        <div className="relative group">
          <button
            type="button"
            onClick={toggleTextTool}
            aria-label="Text Tool (Click anywhere to write)"
            aria-pressed={isTextToolActive}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
              isTextToolActive
                ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                : "text-gray-900 hover:bg-black/6 active:scale-95"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="9" y1="20" x2="15" y2="20" />
            </svg>
          </button>

          {/* Right Flyout Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
          >
            <span>{isTextToolActive ? "Cancel Text Tool" : "Text Tool"}</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-sans leading-none text-gray-200">
              T
            </kbd>
          </div>
        </div>

        {/* When in shape mode, show the 5 shape tools inline replacing items 3-7 */}
        {shapesMenuOpen || drawingTool !== null ? (
          <>
            {/* 1. Rectangle / Square */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setSelectedShape("rectangle");
                  setDrawingTool("rectangle");
                }}
                aria-label="Draw Rectangle"
                aria-pressed={drawingTool === "rectangle"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  drawingTool === "rectangle"
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
              <div role="tooltip" className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap z-50 backdrop-blur-md">
                <span>Rectangle / Square</span>
              </div>
            </div>

            {/* 2. Circle */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setSelectedShape("circle");
                  setDrawingTool("circle");
                }}
                aria-label="Draw Circle"
                aria-pressed={drawingTool === "circle"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  drawingTool === "circle"
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </button>
              <div role="tooltip" className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap z-50 backdrop-blur-md">
                <span>Circle</span>
              </div>
            </div>

            {/* 3. Diamond */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setSelectedShape("diamond");
                  setDrawingTool("diamond");
                }}
                aria-label="Draw Diamond"
                aria-pressed={drawingTool === "diamond"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  drawingTool === "diamond"
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 3 21 12 12 21 3 12" />
                </svg>
              </button>
              <div role="tooltip" className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap z-50 backdrop-blur-md">
                <span>Diamond</span>
              </div>
            </div>

            {/* 4. Normal Line */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setSelectedShape("line");
                  setDrawingTool("line");
                }}
                aria-label="Draw Line"
                aria-pressed={drawingTool === "line"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  drawingTool === "line"
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="4" y1="20" x2="20" y2="4" />
                </svg>
              </button>
              <div role="tooltip" className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap z-50 backdrop-blur-md">
                <span>Straight Line</span>
              </div>
            </div>

            {/* 5. Arrow Line */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setSelectedShape("arrow");
                  setDrawingTool("arrow");
                }}
                aria-label="Draw Arrow"
                aria-pressed={drawingTool === "arrow"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  drawingTool === "arrow"
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="19" x2="19" y2="5" />
                  <polyline points="10 5 19 5 19 14" />
                </svg>
              </button>
              <div role="tooltip" className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap z-50 backdrop-blur-md">
                <span>Arrow</span>
              </div>
            </div>

            {/* Shapes Tool Toggle Button (Kept visible so clicking it closes the shapes menu) */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setShapesMenuOpen(false);
                  setDrawingTool(null);
                }}
                aria-label="Close Shapes Menu"
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] active:scale-95"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* Square at bottom-left */}
                  <rect x="3.5" y="10.5" width="9" height="9" rx="1.8" />
                  {/* Circle at top-right */}
                  <circle cx="15.5" cy="8.5" r="5" />
                </svg>
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap z-50 backdrop-blur-md"
              >
                <span>Close Shapes Menu</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Sticky Note Button ('N' or Click to Add Sticky Note) (Third item in the menu) */}
            <div className="relative group">
              <button
                type="button"
                onClick={handleAddStickyNote}
                aria-label="Add Sticky Note"
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none text-gray-900 hover:bg-black/6 active:scale-95"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="#fef08a"
                  stroke="#ca8a04"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                  <path d="M15 3v6h6" />
                </svg>
              </button>

              {/* Right Flyout Tooltip */}
              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
              >
                <span>Add Sticky Note</span>
                <kbd className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-sans leading-none text-gray-200">
                  N
                </kbd>
              </div>
            </div>

            {/* Selection Tool Button ('V' or Click to toggle Marquee Selection) (Fourth item in the menu) */}
            <div className="relative group">
              <button
                type="button"
                onClick={toggleSelectTool}
                aria-label="Selection Tool (Drag to select)"
                aria-pressed={isSelectToolActive}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  isSelectToolActive
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <img
                  src="/icons/selection.png"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className={`w-5 h-5 object-contain transition-opacity duration-150 select-none pointer-events-none ${
                    isSelectToolActive
                      ? "opacity-100"
                      : "opacity-90"
                  }`}
                />
              </button>

              {/* Right Flyout Tooltip */}
              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
              >
                <span>{isSelectToolActive ? "Exit Selection Tool" : "Selection Tool"}</span>
                <kbd className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded font-sans leading-none text-gray-200">
                  V
                </kbd>
              </div>
            </div>

            {/* Curved Connection / Line Button (Fifth item in menu) */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setConnectionStyle("curved")}
                aria-label="Curved Line (No arrowhead)"
                aria-pressed={connectionStyle === "curved"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  connectionStyle === "curved"
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <img
                  src="/icons/curved-line.svg"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className={`w-5 h-5 object-contain transition-opacity duration-150 select-none pointer-events-none ${
                    connectionStyle === "curved"
                      ? "opacity-100"
                      : "opacity-90"
                  }`}
                />
              </button>

              {/* Right Flyout Tooltip */}
              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
              >
                <span>Curved Line</span>
              </div>
            </div>

            {/* Pointy Arrow Button (Sixth item in menu — default) */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setConnectionStyle("pointy")}
                aria-label="Pointy Arrow"
                aria-pressed={connectionStyle === "pointy"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  connectionStyle === "pointy"
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <circle cx="5" cy="18" r="1.8" fill="currentColor" stroke="none" />
                  <path d="M5 18 C 11 18, 9 6, 15 6" />
                  <path d="M14 2.5 L19.5 6 L14 9.5 Z" fill="currentColor" stroke="none" />
                </svg>
              </button>

              {/* Right Flyout Tooltip */}
              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
              >
                <span>Pointy Arrow (Default)</span>
              </div>
            </div>

            {/* Eraser Tool Button (Before Shapes button) */}
            <div className="relative group">
              <button
                type="button"
                onClick={toggleEraserTool}
                aria-label="Eraser Tool"
                aria-pressed={isEraserToolActive}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none ${
                  isEraserToolActive
                    ? "bg-black/10 text-gray-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] scale-[0.98]"
                    : "text-gray-900 hover:bg-black/6 active:scale-95"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                  <path d="M22 21H7" />
                  <path d="m5 11 9 9" />
                </svg>
              </button>

              {/* Right Flyout Tooltip */}
              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
              >
                <span>Eraser Tool</span>
              </div>
            </div>

            {/* Shapes / Drawing Tool Button (After Eraser button) */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setShapesMenuOpen(true);
                  setDrawingTool(selectedShape);
                }}
                aria-label="Shapes Tool"
                aria-pressed={drawingTool !== null}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border-none outline-none text-gray-900 hover:bg-black/6 active:scale-95"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* Square at bottom-left */}
                  <rect x="3.5" y="10.5" width="9" height="9" rx="1.8" />
                  {/* Circle at top-right */}
                  <circle cx="15.5" cy="8.5" r="5" />
                </svg>
              </button>

              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900/90 text-white text-xs font-medium rounded-lg shadow-lg opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 whitespace-nowrap flex items-center gap-2 z-50 backdrop-blur-md"
              >
                <span>Draw Shapes</span>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
