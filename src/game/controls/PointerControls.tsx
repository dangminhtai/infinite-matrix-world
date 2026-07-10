import { useEffect } from "react";

export function usePointerControls(onRotate: (dx: number, dy: number) => void, onZoom: (amount: number) => void, onClickMove: (x: number, y: number) => void) {
  useEffect(() => {
    let draggingRight = false;
    let lastX = 0;
    let lastY = 0;
    let lastPinch = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    const pinchDistance = () => {
      const values = [...pointers.values()];
      if (values.length < 2) return 0;
      return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastPinch = pinchDistance();
      lastX = e.clientX;
      lastY = e.clientY;
      draggingRight = e.button === 2 || e.clientX > window.innerWidth / 2;
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchDistance();
      if (pinch && lastPinch) {
        onZoom((lastPinch - pinch) * 1.6);
        lastPinch = pinch;
        return;
      }
      if (!draggingRight || e.buttons === 0) return;
      onRotate(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      lastPinch = pinchDistance();
      if (!draggingRight && e.button === 0) onClickMove(e.clientX, e.clientY);
      draggingRight = false;
    };
    const wheel = (e: WheelEvent) => onZoom(e.deltaY);
    const context = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("contextmenu", context);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("contextmenu", context);
    };
  }, [onClickMove, onRotate, onZoom]);
}
