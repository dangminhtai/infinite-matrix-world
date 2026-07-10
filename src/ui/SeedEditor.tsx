import { useState } from "react";
import { DEFAULT_SEED } from "../game/constants";

export function SeedEditor({ seed, onApply, onClose }: { seed: string[][]; onApply: (seed: string[][]) => void; onClose: () => void }) {
  const [size, setSize] = useState(seed.length);
  const [values, setValues] = useState(seed);
  const [error, setError] = useState("");

  function resetDefault(): void {
    const next = DEFAULT_SEED.map((row) => row.map((value) => value.toString()));
    setSize(next.length);
    setValues(next);
    setError("");
  }

  function resize(n: number): void {
    setSize(n);
    setValues(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => values[i]?.[j] ?? (i === j ? "1" : "0"))));
  }

  function apply(): void {
    try {
      values.forEach((row) => row.forEach((value) => BigInt(value.trim())));
      localStorage.setItem("ihmw.seed", JSON.stringify(values));
      onApply(values);
      onClose();
    } catch {
      setError("Seed phải là các số nguyên hợp lệ, có thể âm hoặc rất lớn.");
    }
  }

  return (
    <div className="modal">
      <div className="panel">
        <h2>Seed matrix</h2>
        <label>
          Kích thước
          <select value={size} onChange={(e) => resize(Number(e.target.value))}>
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n} x {n}</option>)}
          </select>
        </label>
        <div className="matrixGrid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {values.map((row, i) => row.map((value, j) => (
            <input
              key={`${i}-${j}`}
              value={value}
              onChange={(e) => setValues((old) => old.map((r, ri) => r.map((v, cj) => (ri === i && cj === j ? e.target.value : v))))}
            />
          )))}
        </div>
        {size > 2 && (
          <p className="warning">
            Seed {size}x{size} nặng hơn rõ vì worker phải chạy nhiều phép BigInt matrix/recurrence hơn cho mỗi điểm terrain.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modalActions">
          <button onClick={resetDefault}>Reset mặc định 2x2</button>
          <button onClick={onClose}>Đóng</button>
          <button onClick={apply}>Áp dụng</button>
        </div>
      </div>
    </div>
  );
}
