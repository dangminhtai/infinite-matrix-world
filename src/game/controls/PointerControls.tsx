import { useEffect } from "react";

const INTERACTIVE_SELECTOR = "button,input,select,textarea,.modal,.settingsOverlay,.gameHud,.sidePanel,.minimap,.joystick,.joystickKnob";

export function usePointerControls(onRotate: (dx: number, dy: number, pointerType: string) => void, onZoom: (amount: number) => void, onClickMove: (x: number, y: number) => void) {
  useEffect(() => {
    let draggingRight = false;
    let cameraPointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    let lastPinch = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    const pinchDistance = () => {
      const values = [...pointers.values()];
      if (values.length < 2) return 0;
      return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
    };
    const down = (e: PointerEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest(INTERACTIVE_SELECTOR)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastPinch = pinchDistance();
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      draggingRight = e.pointerType === "touch" ? e.clientX > window.innerWidth / 2 : e.button === 2;
      if (draggingRight) cameraPointerId = e.pointerId;
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchDistance();
      if (pinch && lastPinch) {
        onZoom((lastPinch - pinch) * 1.6);
        lastPinch = pinch;
        return;
      }
      if (!draggingRight || cameraPointerId !== e.pointerId || (e.pointerType === "mouse" && e.buttons === 0)) return;
      onRotate(e.clientX - lastX, e.clientY - lastY, e.pointerType);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      lastPinch = pinchDistance();
      const wasCameraDrag = cameraPointerId === e.pointerId;
      if (e.target instanceof HTMLElement && e.target.closest(INTERACTIVE_SELECTOR)) {
        draggingRight = false;
        cameraPointerId = null;
        return;
      }
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (!wasCameraDrag && e.button === 0 && moved < 8) onClickMove(e.clientX, e.clientY);
      if (wasCameraDrag) {
        draggingRight = false;
        cameraPointerId = null;
      }
    };
    const wheel = (e: WheelEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest(INTERACTIVE_SELECTOR)) return;
      onZoom(e.deltaY);
    };
    const context = (e: MouseEvent) => e.preventDefault();
    const reset = () => {
      draggingRight = false;
      cameraPointerId = null;
      lastPinch = 0;
      pointers.clear();
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", reset);
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("contextmenu", context);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", reset);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("contextmenu", context);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [onClickMove, onRotate, onZoom]);
}
