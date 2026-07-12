import type { MapWaypoint, TrackedTarget } from "../game/map/types";
import type { EnemyCombatState } from "../game/entities/EntitySystem";

export function HUD({
  health,
  maxHealth,
  stamina,
  swimming,
  climbing,
  interactionLabel,
  interactionKey,
  notification,
  trackedTarget,
  targetDistance,
  waypoint,
  waypointDistance,
  enemyCombat,
  onClearTarget,
  onClearWaypoint,
  onInventory,
  onCharacters,
  onSettings,
}: {
  health: number;
  maxHealth: number;
  stamina: number;
  swimming: boolean;
  climbing: boolean;
  interactionLabel: string;
  interactionKey: string;
  notification: string;
  trackedTarget: TrackedTarget | null;
  targetDistance: string;
  waypoint: MapWaypoint | null;
  waypointDistance: string;
  enemyCombat: EnemyCombatState;
  onClearTarget: () => void;
  onClearWaypoint: () => void;
  onInventory: () => void;
  onCharacters: () => void;
  onSettings: () => void;
}) {
  const trackedLabel = trackedTarget ? "Mục tiêu" : waypoint ? "Mốc đánh dấu" : "";
  const trackedText = trackedTarget ? `Slime · ${targetDistance}` : waypoint ? `Waypoint · ${waypointDistance}` : "";
  const onClearTracked = trackedTarget ? onClearTarget : onClearWaypoint;
  return (
    <div className="gameHud">
      <div className="vitals" aria-label="Trạng thái nhân vật">
        <div className="vitalRow"><span>HP</span><div className="vitalTrack"><i className="healthFill" style={{ width: `${Math.max(0, Math.min(100, health / Math.max(1, maxHealth) * 100))}%` }} /></div><small>{Math.ceil(health)}/{maxHealth}</small></div>
        <div className="vitalRow"><span>ST</span><div className="vitalTrack"><i className="staminaFill" style={{ width: `${stamina}%` }} /></div></div>
      </div>
      {(swimming || climbing) && <div className="movementBadge">{climbing ? "LEO" : "BƠI"}</div>}
      {interactionLabel && <div className="interactionPrompt"><kbd>{interactionKey}</kbd><span>{interactionLabel}</span></div>}
      {notification && <div className="pickupToast">{notification}</div>}
      {(trackedTarget || waypoint) && <div className={`trackedTarget ${waypoint && !trackedTarget ? "waypointTarget" : ""}`}><i aria-hidden="true" /><div><span>{trackedLabel}</span><strong>{trackedText}</strong></div><button type="button" onClick={onClearTracked} title="Bỏ theo dõi" aria-label="Bỏ theo dõi">×</button></div>}
      {enemyCombat && <div className="enemyHealth"><div><span>{enemyCombat.name}</span><strong>Cấp {enemyCombat.level}</strong></div><div><i style={{ width: `${Math.max(0, enemyCombat.hp / Math.max(1, enemyCombat.maxHP) * 100)}%` }} /></div><small>{Math.ceil(enemyCombat.hp)}/{enemyCombat.maxHP}</small></div>}
      <button className="characterButton" type="button" onClick={onCharacters} title="Nhân vật (C)" aria-label="Mở nhân vật">C</button>
      <button className="inventoryButton" type="button" onClick={onInventory} title="Túi đồ" aria-label="Mở túi đồ">▣</button>
      <button className="settingsButton" type="button" onClick={onSettings} title="Cài đặt" aria-label="Mở cài đặt">⚙</button>
    </div>
  );
}
