import { useRef, useState } from "react";
import type { MoveInput } from "../player/movement";

export function VirtualJoystick({ onChange }: { onChange: (input: MoveInput) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function update(clientX: number, clientY: number): void {
    const rect = base.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(x, y);
    const max = rect.width * 0.34;
    const scale = len > max ? max / len : 1;
    const nx = x * scale;
    const ny = y * scale;
    setKnob({ x: nx, y: ny });
    onChange({ x: nx / max, y: ny / max });
  }

  function release(): void {
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  }

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.buttons) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        release();
      }}
      onPointerCancel={(e) => {
        e.stopPropagation();
        release();
      }}
    >
      <div className="joystickKnob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

export function MobileActionButtons({
  onJump,
  onRunChange,
}: {
  onJump: () => void;
  onRunChange: (running: boolean) => void;
}) {
  return (
    <div className="mobileActions">
      <button
        className="mobileActionButton runAction"
        type="button"
        title="Chạy"
        aria-label="Chạy"
        onPointerDown={(event) => { event.stopPropagation(); onRunChange(true); }}
        onPointerUp={(event) => { event.stopPropagation(); onRunChange(false); }}
        onPointerCancel={() => onRunChange(false)}
      >RUN</button>
      <button
        className="mobileActionButton jumpAction"
        type="button"
        title="Nhảy"
        aria-label="Nhảy"
        onPointerDown={(event) => { event.stopPropagation(); onJump(); }}
      >↑</button>
    </div>
  );
}
