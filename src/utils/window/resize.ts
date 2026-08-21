import { isDraggingWindow } from "./drag";

// shared flag so OnEdge etc. can skip work while a resize is active
export let isResizingWindow = false;

export function Resize(e: React.MouseEvent<HTMLDivElement>) {
        if (isDraggingWindow || isResizingWindow) return

        const target = e.currentTarget

            const rect = target.getBoundingClientRect()
            const startX = e.clientX
            const startY = e.clientY
            const startWidth = rect.width
            const startHeight = rect.height
            const startLeft = rect.left
            const startTop = rect.top
            const cursor = getComputedStyle(target).cursor

            if (cursor === 'default') return

            // Freeze the iframe at its current pixel size so its huge DOM
            // doesn't reflow on every frame. Restored once on mouseup.
            const iframe = target.querySelector<HTMLElement>('iframe')
            if (iframe) {
                const fr = iframe.getBoundingClientRect()
                iframe.style.width = `${fr.width}px`
                iframe.style.height = `${fr.height}px`
            }

            isResizingWindow = true
            let frameRequested = false

            document.body.style.cursor = cursor
            document.body.style.userSelect = 'none'
            target.classList.add('resizing')
            document.body.classList.add('gesture-active')

            // always remember the latest pointer position so no movement
            // is dropped between animation frames (prevents stepping)
            let lastX = startX
            let lastY = startY

            function onMouseMove(ev: MouseEvent) {
                lastX = ev.clientX
                lastY = ev.clientY
                if (isDraggingWindow || frameRequested) return
                    frameRequested = true

                requestAnimationFrame(() => {
                    frameRequested = false
                    const dx = lastX - startX
                    const dy = lastY - startY

                    // handle horizontal & vertical at once for corners
                    switch (cursor) {
                        case 'e-resize':
                        if (startWidth + dx > 100) target.style.width = `${startWidth + dx}px`
                        break
                        case 'w-resize':

                            if (startWidth - dx > 100) {
                                target.style.width = `${startWidth - dx}px`
                            target.style.left = `${startLeft + dx}px`
                            target.style.position = 'absolute'
                        }
                        break
                        case 's-resize':
                        if (startHeight + dy > 100) target.style.height = `${startHeight + dy}px`
                        break
                        case 'n-resize':
                            if (startHeight - dy > 100) {
                                target.style.height = `${startHeight - dy}px`
                            target.style.top = `${startTop + dy}px`
                            target.style.position = 'absolute'
                        }
                        break
                        case 'se-resize':
                        if (startWidth + dx > 100) target.style.width = `${startWidth + dx}px`
                        if (startHeight + dy > 100) target.style.height = `${startHeight + dy}px`
                        break
                        case 'sw-resize':
                            if (startWidth - dx > 100) {
                                target.style.width = `${startWidth - dx}px`
                            target.style.left = `${startLeft + dx}px`
                            target.style.position = 'absolute'
                        }
                        if (startHeight + dy > 100)
                                target.style.height = `${startHeight + dy}px`
                            break
                            case 'ne-resize':
                                if (startWidth + dx > 100)
                                    target.style.width = `${startWidth + dx}px`
                            if (startHeight - dy > 100) {
                                    target.style.height = `${startHeight - dy}px`
                                target.style.top = `${startTop + dy}px`
                                target.style.position = 'absolute'
                            }
                            break
                            case 'nw-resize':
                                if (startWidth - dx > 100) {
                                    target.style.width = `${startWidth - dx}px`
                                target.style.left = `${startLeft + dx}px`
                                target.style.position = 'absolute'
                            }
                            if (startHeight - dy > 100) {
                                    target.style.height = `${startHeight - dy}px`
                                target.style.top = `${startTop + dy}px`
                                target.style.position = 'absolute'
                            }
                            break
                    }
                })
            }

            function onMouseUp() {
                document.body.style.cursor = 'default'
                document.body.style.userSelect = ''
                target.classList.remove('resizing')
                document.body.classList.remove('gesture-active')
                if (iframe) {
                    iframe.style.width = ''
                    iframe.style.height = ''
                }
                isResizingWindow = false
                document.removeEventListener('mousemove', onMouseMove)
                document.removeEventListener('mouseup', onMouseUp)
            }

            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
    }
