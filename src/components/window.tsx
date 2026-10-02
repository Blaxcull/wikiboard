import { useRef, memo } from "react";
import startDrag from "@/utils/window/drag";
import { Resize } from "@/utils/window/resize";
import { nextCascadeOffset } from "@/store/windows";
import { startWireDrag } from "@/utils/window/wireDrag";

type WindowProps = {
  /** Inner content to display */
  children?: React.ReactNode;
  /** HTML id attribute */
  id?: string;
  /** CSS class overrides for the entire window */
  className?: string;
  /** CSS style overrides for the entire window */
  style?: React.CSSProperties;
  /** CSS class overrides for the title bar area */
  titleBarClassName?: string;
  /** Content displayed inside the title bar */
  titleBarContent?: React.ReactNode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Called when the close button is clicked */
  onClose?: () => void;
  /** Called when the window is focused (mouse down anywhere on it) */
  onActivate?: () => void;
  /** Called when the window position or size changes */
  onPositionChange?: (pos: { x?: number; y?: number; width?: number; height?: number }) => void;
  /** Called when any of the 4 connection point dots is clicked */
  onAddSticky?: (side: "TOP" | "RIGHT" | "BOTTOM" | "LEFT") => void;
};

const Window = memo(function Window({
  children,
  id,
  className = "",
  style,
  titleBarClassName = "",
  titleBarContent,
  x,
  y,
  width,
  height,
  onClose,
  onActivate,
  onPositionChange,
  onAddSticky,
}: React.PropsWithChildren<WindowProps>) {
  const positioned = useRef(false);

  return (
    <div
      ref={(el) => {
        if (el) {
          if (!positioned.current) {
            positioned.current = true;
            if (x !== undefined && y !== undefined) {
              el.style.left = `${x}px`;
              el.style.top = `${y}px`;
            } else {
              const offset = nextCascadeOffset();
              el.style.top = `${80 + offset}px`;
              el.style.left = `${80 + offset}px`;
            }
          }
          if (width !== undefined) el.style.width = `${width}px`;
          if (height !== undefined) el.style.height = `${height}px`;
        }
      }}
      id={id}
      className={`window ${className}`}
      style={style}
      onMouseDown={(e) => {
        onActivate?.();
        Resize(e, (rect) => {
          onPositionChange?.(rect);
        }, onActivate);
      }}
    >
      <div
        className={`titlebar ${titleBarClassName}`}
        onMouseDown={(e) => {
          e.stopPropagation();
          startDrag(e, (pos) => {
            onPositionChange?.(pos);
          }, onActivate);
        }}
      >
        <div>{titleBarContent}</div>
        {onClose && (
            <button
  type="button"
  className="flex items-center justify-center w-6 h-6 ml-auto border-none bg-transparent text-[#666] text-lg leading-none cursor-pointer rounded transition-all duration-150 hover:text-white hover:bg-[#e74c3c]"
  onMouseDown={(e) => e.stopPropagation()}
  onClick={onClose}
>
  <span className="flex items-center justify-center w-full h-full -mt-[1px]">
    ×
  </span>
</button>
        )}
      </div>

      {children && <div className="window-content">{children}</div>}

      <button
        type="button"
        className="connection-point point-top"
        title="Add sticky note"
        onMouseDown={(e) => {
          const winId = id?.replace(/^win-/, "") || "";
          startWireDrag(e, winId, "TOP", onAddSticky);
        }}
      />
      <button
        type="button"
        className="connection-point point-right"
        title="Add sticky note"
        onMouseDown={(e) => {
          const winId = id?.replace(/^win-/, "") || "";
          startWireDrag(e, winId, "RIGHT", onAddSticky);
        }}
      />
      <button
        type="button"
        className="connection-point point-bottom"
        title="Add sticky note"
        onMouseDown={(e) => {
          const winId = id?.replace(/^win-/, "") || "";
          startWireDrag(e, winId, "BOTTOM", onAddSticky);
        }}
      />
      <button
        type="button"
        className="connection-point point-left"
        title="Add sticky note"
        onMouseDown={(e) => {
          const winId = id?.replace(/^win-/, "") || "";
          startWireDrag(e, winId, "LEFT", onAddSticky);
        }}
      />
    </div>
  );
});

export default Window;
