import { useRef, useState } from "react";
import type { MoveInput } from "../player/movement";

export function VirtualJoystick({ onChange, size, opacity }: { onChange: (input: MoveInput) => void; size: number; opacity: number }) {
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
      style={{ width: size, height: size, opacity }}
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
      <div className="joystickKnob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}

export function MobileActionButtons({
  onJump,
  onRunChange,
  onInteract,
  onAttack,
  onSkill,
}: {
  onJump: () => void;
  onRunChange: (running: boolean) => void;
  onInteract: () => void;
  onAttack: () => void;
  onSkill: () => void;
}) {
  return (
    <div className="mobileActions">
      <button className="mobileActionButton interactAction" type="button" title="Tương tác" aria-label="Tương tác" onPointerDown={(event) => { event.stopPropagation(); onInteract(); }}>E</button>
      <button className="mobileActionButton attackAction" type="button" title="Tấn công" aria-label="Tấn công" onPointerDown={(event) => { event.stopPropagation(); onAttack(); }}>ATK</button>
      <button className="mobileActionButton skillAction" type="button" title="Kỹ năng" aria-label="Kỹ năng" onPointerDown={(event) => { event.stopPropagation(); onSkill(); }}>SKL</button>
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
