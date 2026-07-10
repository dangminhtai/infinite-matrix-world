import { useEffect } from "react";

export function usePointerControls(onRotate: (dx: number, dy: number) => void, onZoom: (amount: number) => void, onClickMove: (x: number, y: number) => void) {
  useEffect(() => {
    let draggingRight = false;
    let lastX = 0;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      draggingRight = e.button === 2 || e.clientX > window.innerWidth / 2;
    };
    const move = (e: PointerEvent) => {
      if (!draggingRight || e.buttons === 0) return;
      onRotate(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
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
