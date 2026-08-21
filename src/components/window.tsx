import { useRef } from "react";
import startDrag from "@/utils/window/drag";
import { Resize } from "@/utils/window/resize";
import { OnEdge } from "@/utils/window/onEdge";
import { nextCascadeOffset } from "@/store/windows";

type WindowProps = {
  /** Inner content to display */
  children?: React.ReactNode;
  /** CSS class overrides for the entire window */
  className?: string;
  /** CSS class overrides for the title bar area */
  titleBarClassName?: string;
  /** Content displayed inside the title bar */
  titleBarContent?: React.ReactNode;
  /** Called when the close button is clicked */
  onClose?: () => void;
  /** Called when the window is focused (mouse down anywhere on it) */
  onActivate?: () => void;
};

export default function Window({
  children,
  className = "",
  titleBarClassName = "",
  titleBarContent,
  onClose,
  onActivate,
}: React.PropsWithChildren<WindowProps>) {
  const positioned = useRef(false);

  return (
    <div
      ref={(el) => {
        if (el && !positioned.current) {
          positioned.current = true;
          const offset = nextCascadeOffset();
          el.style.top = `${80 + offset}px`;
          el.style.left = `${80 + offset}px`;
        }
      }}
      className={`window ${className}`}
      onMouseMove={(e) => OnEdge(e)}
      onMouseDown={(e) => {
        Resize(e);
        onActivate?.();
      }}
    >
      <div
        className={`titlebar ${titleBarClassName}`}
        onMouseDown={(e) => startDrag(e)}
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
}
