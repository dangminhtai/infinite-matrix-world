export function HUD({
  health,
  stamina,
  showQuestTracker,
  onSettings,
}: {
  health: number;
  stamina: number;
  showQuestTracker: boolean;
  onSettings: () => void;
}) {
  return (
    <div className="gameHud">
      <div className="vitals" aria-label="Trạng thái nhân vật">
        <div className="vitalRow"><span>HP</span><div className="vitalTrack"><i className="healthFill" style={{ width: `${health}%` }} /></div></div>
        <div className="vitalRow"><span>ST</span><div className="vitalTrack"><i className="staminaFill" style={{ width: `${stamina}%` }} /></div></div>
      </div>
      {showQuestTracker && <div className="questTracker"><span>Mục tiêu</span><strong>Khám phá thế giới vô hạn</strong></div>}
      <button className="settingsButton" type="button" onClick={onSettings} title="Cài đặt" aria-label="Mở cài đặt">⚙</button>
    </div>
  );
}
