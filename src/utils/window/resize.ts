export function Resize(e: React.MouseEvent<HTMLDivElement>) {
        const target = e.currentTarget

            const rect = target.getBoundingClientRect()
            const startX = e.clientX
            const startY = e.clientY
            const startWidth = rect.width
            const startHeight = rect.height
            const startLeft = rect.left
            const startTop = rect.top
            const cursor = getComputedStyle(target).cursor

            let frameRequested = false

            document.body.style.cursor = cursor
            document.body.style.userSelect = 'none'


            function onMouseMove(ev: MouseEvent) {
                if (frameRequested) return
                    frameRequested = true

                requestAnimationFrame(() => {
                    frameRequested = false
                    const dx = ev.clientX - startX
                    const dy = ev.clientY - startY

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
                document.removeEventListener('mousemove', onMouseMove)
                document.removeEventListener('mouseup', onMouseUp)
            }

            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
    }
