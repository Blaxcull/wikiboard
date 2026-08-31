// shared flag so other handlers can skip work while a drag is active
export let isDraggingWindow = false;

export default function startDrag(
  e: React.MouseEvent<HTMLDivElement>,
  onDragEnd?: (pos: { x: number; y: number }) => void,
) {
  const target = e.currentTarget.parentElement;
  if (!target) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const rect = target.getBoundingClientRect();

  const EDGE_MARGIN = 5;
  const nearLeft = Math.abs(e.clientX - rect.left) <= EDGE_MARGIN;
  const nearRight = Math.abs(e.clientX - rect.right) <= EDGE_MARGIN;
  const nearTop = Math.abs(e.clientY - rect.top) <= EDGE_MARGIN;
  const nearBottom = Math.abs(e.clientY - rect.bottom) <= EDGE_MARGIN;

  if (nearLeft || nearRight || nearTop || nearBottom) return;

  let isDragging = false;
  let framePending = false;
  let mouseX = 0;
  let mouseY = 0;
  let shiftX = 0;
  let shiftY = 0;

  // base position captured at drag start — transform offsets from this
  let baseLeft = 0;
  let baseTop = 0;

  function beginDragging() {
    if (!target) return;
    isDragging = true;
    isDraggingWindow = true;

    target.classList.add("dragging");
    document.body.classList.add("gesture-active");
    document.body.style.cursor = "move";

    // freeze base position so transform is relative to it
    const parsedLeft = parseFloat(target.style.left);
    const parsedTop = parseFloat(target.style.top);
    baseLeft = isNaN(parsedLeft) ? rect.left : parsedLeft;
    baseTop = isNaN(parsedTop) ? rect.top : parsedTop;

    shiftX = startX - baseLeft;
    shiftY = startY - baseTop;
  }

  function updatePosition() {
    if (!target) return;
    framePending = false;
    let dx = mouseX - shiftX - baseLeft;
    let dy = mouseY - shiftY - baseTop;

    if (baseLeft + dx < 0) dx = -baseLeft;
    if (baseTop + dy < 0) dy = -baseTop;

    // GPU-composited move — no layout, no paint
    target.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function onMouseMove(ev: MouseEvent) {
    if (!isDragging && !framePending) {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);

      if (dx > 4 || dy > 4) {
        beginDragging();
      }
    }

    if (!isDragging) return;

    mouseX = ev.clientX;
    mouseY = ev.clientY;

    if (!framePending) {
      framePending = true;
      requestAnimationFrame(updatePosition);
    }
  }

  function onMouseUp() {
    if (isDragging && target) {
      // commit transform offset to layout properties
      const dx = parseFloat(target.style.transform?.match(/translate\(([-\d.]+)px/)?.[1] || "0");
      const dy = parseFloat(target.style.transform?.match(/translate\([-\d.]+px,\s*([-\d.]+)px/)?.[1] || "0");
      const finalLeft = Math.max(0, baseLeft + dx);
      const finalTop = Math.max(0, baseTop + dy);

      target.style.transform = "";
      target.style.left = `${finalLeft}px`;
      target.style.top = `${finalTop}px`;

      onDragEnd?.({ x: finalLeft, y: finalTop });
    }
    isDragging = false;
    isDraggingWindow = false;
    target?.classList.remove("dragging");
    document.body.classList.remove("gesture-active");
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  e.preventDefault();
}
