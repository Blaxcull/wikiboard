import { isDraggingWindow } from "./drag";
import { isResizingWindow } from "./resize";

let lastCursor = "";

export function OnEdge(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingWindow || isResizingWindow) return

    const element = e.currentTarget
    const rect = element.getBoundingClientRect()

        const EDGE_MARGIN = 5
        const { clientX: x, clientY: y } = e

        const nearLeft = Math.abs(x - rect.left) <= EDGE_MARGIN
        const nearRight = Math.abs(x - rect.right) <= EDGE_MARGIN
        const nearTop = Math.abs(y - rect.top) <= EDGE_MARGIN
        const nearBottom = Math.abs(y - rect.bottom) <= EDGE_MARGIN

        let cursor = 'default'

        // Corners take priority
        if (nearTop && nearLeft) cursor = 'nw-resize'
            else if (nearTop && nearRight) cursor = 'ne-resize'
                else if (nearBottom && nearLeft) cursor = 'sw-resize'
                    else if (nearBottom && nearRight) cursor = 'se-resize'
                        else if (nearLeft) cursor = 'w-resize'
                            else if (nearRight) cursor = 'e-resize'
                                else if (nearTop) cursor = 'n-resize'
                                    else if (nearBottom) cursor = 's-resize'

        // only touch the DOM when the value actually changes
        if (cursor !== lastCursor) {
            element.style.cursor = cursor
            lastCursor = cursor
        }
}
