export function OnEdge(e: React.MouseEvent<HTMLDivElement>) {
    const element = e.currentTarget
    const rect = element.getBoundingClientRect()

        const EDGE_MARGIN = 5
        const { clientX: x, clientY: y } = e

        const nearLeft = Math.abs(x - rect.left) <= EDGE_MARGIN
        const nearRight = Math.abs(x - rect.right) <= EDGE_MARGIN
        const nearTop = Math.abs(y - rect.top) <= EDGE_MARGIN
        const nearBottom = Math.abs(y - rect.bottom) <= EDGE_MARGIN

        // Corners take priority
        if (nearTop && nearLeft) element.style.cursor = 'nw-resize'
            else if (nearTop && nearRight) element.style.cursor = 'ne-resize'
                else if (nearBottom && nearLeft) element.style.cursor = 'sw-resize'
                    else if (nearBottom && nearRight) element.style.cursor = 'se-resize'
                        else if (nearLeft) element.style.cursor = 'w-resize'
                            else if (nearRight) element.style.cursor = 'e-resize'
                                else if (nearTop) element.style.cursor = 'n-resize'
                                    else if (nearBottom) element.style.cursor = 's-resize'
                                        else element.style.cursor = 'default'
}
