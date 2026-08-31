import { isDraggingWindow } from "./drag";
import { isResizingWindow } from "./resize";

let lastCursor = "";

function computeCursor(x: number, y: number, rect: DOMRect): string {
    const EDGE_MARGIN = 5
    const nearLeft = Math.abs(x - rect.left) <= EDGE_MARGIN
    const nearRight = Math.abs(x - rect.right) <= EDGE_MARGIN
    const nearTop = Math.abs(y - rect.top) <= EDGE_MARGIN
    const nearBottom = Math.abs(y - rect.bottom) <= EDGE_MARGIN

    if (nearTop && nearLeft) return 'nw-resize'
    if (nearTop && nearRight) return 'ne-resize'
    if (nearBottom && nearLeft) return 'sw-resize'
    if (nearBottom && nearRight) return 'se-resize'
    if (nearLeft) return 'w-resize'
    if (nearRight) return 'e-resize'
    if (nearTop) return 'n-resize'
    if (nearBottom) return 's-resize'
    return 'default'
}

export function OnEdge(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingWindow || isResizingWindow) return

    const element = e.currentTarget
    const rect = element.getBoundingClientRect()
    const cursor = computeCursor(e.clientX, e.clientY, rect)

    if (cursor !== lastCursor) {
        element.style.cursor = cursor
        lastCursor = cursor
    }
}

let delegateAttached = false;

export function attachEdgeDelegate() {
    if (delegateAttached) return;
    delegateAttached = true;

    document.addEventListener("mousemove", (e: MouseEvent) => {
        if (isDraggingWindow || isResizingWindow) return;

        const target = (e.target as HTMLElement).closest?.(".window") as HTMLElement | null;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const cursor = computeCursor(e.clientX, e.clientY, rect);

        if (cursor !== lastCursor) {
            target.style.cursor = cursor;
            lastCursor = cursor;
        }
    });
}
