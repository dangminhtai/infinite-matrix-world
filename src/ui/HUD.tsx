import type { TrackedTarget } from "../game/map/types";

export function HUD({
  health,
  stamina,
  swimming,
  climbing,
  interactionLabel,
  interactionKey,
  notification,
  trackedTarget,
  targetDistance,
  onClearTarget,
  onInventory,
  onSettings,
}: {
  health: number;
  stamina: number;
  swimming: boolean;
  climbing: boolean;
  interactionLabel: string;
  interactionKey: string;
  notification: string;
  trackedTarget: TrackedTarget | null;
  targetDistance: string;
  onClearTarget: () => void;
  onInventory: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="gameHud">
      <div className="vitals" aria-label="Trạng thái nhân vật">
        <div className="vitalRow"><span>HP</span><div className="vitalTrack"><i className="healthFill" style={{ width: `${health}%` }} /></div></div>
        <div className="vitalRow"><span>ST</span><div className="vitalTrack"><i className="staminaFill" style={{ width: `${stamina}%` }} /></div></div>
      </div>
      {(swimming || climbing) && <div className="movementBadge">{climbing ? "LEO" : "BƠI"}</div>}
      {interactionLabel && <div className="interactionPrompt"><kbd>{interactionKey}</kbd><span>{interactionLabel}</span></div>}
      {notification && <div className="pickupToast">{notification}</div>}
      {trackedTarget && <div className="trackedTarget"><i aria-hidden="true" /><div><span>Mục tiêu</span><strong>Echo · {targetDistance}</strong></div><button type="button" onClick={onClearTarget} title="Bỏ theo dõi" aria-label="Bỏ theo dõi">×</button></div>}
      <button className="inventoryButton" type="button" onClick={onInventory} title="Túi đồ" aria-label="Mở túi đồ">▣</button>
      <button className="settingsButton" type="button" onClick={onSettings} title="Cài đặt" aria-label="Mở cài đặt">⚙</button>
    </div>
  );
}
