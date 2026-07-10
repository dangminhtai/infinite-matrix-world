import { useState } from "react";

export function TeleportDialog({ onApply, onClose }: { onApply: (x: bigint, y: bigint) => void; onClose: () => void }) {
  const [x, setX] = useState("100000000000000000000000000000");
  const [y, setY] = useState("-99999999999999999999999999999");
  const [error, setError] = useState("");

  function apply(): void {
    try {
      onApply(BigInt(x.trim()), BigInt(y.trim()));
      onClose();
    } catch {
      setError("Tọa độ phải là số nguyên BigInt hợp lệ.");
    }
  }

  return (
    <div className="modal">
      <div className="panel">
        <h2>Teleport</h2>
        <input value={x} onChange={(e) => setX(e.target.value)} />
        <input value={y} onChange={(e) => setY(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <div className="modalActions">
          <button onClick={onClose}>Đóng</button>
          <button onClick={apply}>Đi</button>
        </div>
      </div>
    </div>
  );
}
