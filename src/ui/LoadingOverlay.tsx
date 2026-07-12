export function LoadingOverlay({ text, ready = false }: { text: string; ready?: boolean }) {
  return <div className={`loading${ready ? " ready" : ""}`}>{text}</div>;
}
