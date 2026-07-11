export function HUD({
  health,
  stamina,
  swimming,
  interactionLabel,
  interactionKey,
  notification,
  onInventory,
  onSettings,
}: {
  health: number;
  stamina: number;
  swimming: boolean;
  interactionLabel: string;
  interactionKey: string;
  notification: string;
  onInventory: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="gameHud">
      <div className="vitals" aria-label="Trạng thái nhân vật">
        <div className="vitalRow"><span>HP</span><div className="vitalTrack"><i className="healthFill" style={{ width: `${health}%` }} /></div></div>
        <div className="vitalRow"><span>ST</span><div className="vitalTrack"><i className="staminaFill" style={{ width: `${stamina}%` }} /></div></div>
      </div>
      {swimming && <div className="movementBadge">BƠI</div>}
      {interactionLabel && <div className="interactionPrompt"><kbd>{interactionKey}</kbd><span>{interactionLabel}</span></div>}
      {notification && <div className="pickupToast">{notification}</div>}
      <button className="inventoryButton" type="button" onClick={onInventory} title="Túi đồ" aria-label="Mở túi đồ">▣</button>
      <button className="settingsButton" type="button" onClick={onSettings} title="Cài đặt" aria-label="Mở cài đặt">⚙</button>
    </div>
  );
}
