import { useRef, memo } from "react";
import startDrag from "@/utils/window/drag";
import { Resize } from "@/utils/window/resize";
import { nextCascadeOffset } from "@/store/windows";

type WindowProps = {
  /** Inner content to display */
  children?: React.ReactNode;
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
};

const Window = memo(function Window({
  children,
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
}: React.PropsWithChildren<WindowProps>) {
  const positioned = useRef(false);

  return (
    <div
      ref={(el) => {
        if (el && !positioned.current) {
          positioned.current = true;
          if (x !== undefined && y !== undefined) {
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
          } else {
            const offset = nextCascadeOffset();
            el.style.top = `${80 + offset}px`;
            el.style.left = `${80 + offset}px`;
          }
          if (width !== undefined) el.style.width = `${width}px`;
          if (height !== undefined) el.style.height = `${height}px`;
        }
      }}
      className={`window ${className}`}
      style={style}
      onMouseDown={(e) => {
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
            className="close-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>

      {children && <div className="window-content">{children}</div>}
    </div>
  );
});

export default Window;
