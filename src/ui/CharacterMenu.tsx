import { useMemo, useState } from "react";
import { CHARACTER_CATALOG, CHARACTER_IDS, type CharacterId } from "../game/characters/characterCatalog";
import { ascensionCostAt, calculateCharacterStats, MAX_CHARACTER_LEVEL, moraCostForNextLevel, needsAscension } from "../game/characters/characterProgression";
import type { PlayerProfile } from "../game/characters/ProfileManager";

export function CharacterMenu({ profile, onPurchase, onSelect, onUpgrade, onUpgradeMax, onAscend, onClose }: {
  profile: PlayerProfile;
  onPurchase: (id: CharacterId) => void;
  onSelect: (id: CharacterId) => void;
  onUpgrade: (id: CharacterId) => void;
  onUpgradeMax: (id: CharacterId) => void;
  onAscend: (id: CharacterId) => void;
  onClose: () => void;
}) {
  const [viewedId, setViewedId] = useState<CharacterId>(profile.selectedCharacterId);
  const definition = CHARACTER_CATALOG[viewedId];
  const progress = profile.characters[viewedId];
  const level = progress?.level ?? 1;
  const stats = useMemo(() => calculateCharacterStats(definition, level), [definition, level]);
  const nextStats = useMemo(() => calculateCharacterStats(definition, Math.min(MAX_CHARACTER_LEVEL, level + 1)), [definition, level]);
  const requiresAscension = progress ? needsAscension(level, progress.ascendedCaps) : false;
  const ascensionCost = ascensionCostAt(level);
  const moraCost = moraCostForNextLevel(level);

  return <div className="characterOverlay" role="dialog" aria-modal="true" aria-label="Nhân vật">
    <section className="characterPanel">
      <header className="characterHeader">
        <div><span>Đội hình khám phá</span><h2>Nhân vật</h2></div>
        <div className="characterWallet"><strong>{profile.wallet.primogem}</strong><span>Nguyên Thạch</span><strong>{profile.wallet.mora}</strong><span>Mora</span><strong>{profile.wallet.slimeCondensate}</strong><span>Dịch Slime</span></div>
        <button className="iconButton" type="button" onClick={onClose} title="Đóng" aria-label="Đóng">×</button>
      </header>
      <nav className="characterList" aria-label="Danh sách nhân vật">
        {CHARACTER_IDS.map((id) => {
          const item = CHARACTER_CATALOG[id];
          const owned = profile.characters[id];
          return <button className={`${viewedId === id ? "active" : ""} ${profile.selectedCharacterId === id ? "selected" : ""}`} type="button" key={id} onClick={() => setViewedId(id)}>
            <span>{item.name}</span><small>{owned ? `Cấp ${owned.level}` : `${item.purchaseCost} Nguyên Thạch`}</small>
          </button>;
        })}
      </nav>
      <div className="characterDetails">
        <div className="characterIdentity"><span>{definition.role}</span><h3>{definition.name}</h3><p>{progress ? `Cấp ${level}/100` : "Chưa sở hữu"}</p></div>
        <div className="characterStats" aria-label="Chỉ số nhân vật">
          <div><span>HP</span><strong>{stats.maxHP}</strong>{progress && level < 100 && <small>+{nextStats.maxHP - stats.maxHP}</small>}</div>
          <div><span>ATK</span><strong>{stats.atk}</strong>{progress && level < 100 && <small>+{nextStats.atk - stats.atk}</small>}</div>
          <div><span>DEF</span><strong>{stats.def}</strong>{progress && level < 100 && <small>+{nextStats.def - stats.def}</small>}</div>
        </div>
        {progress && <div className="characterProgress"><div><i style={{ width: `${level}%` }} /></div><span>{level >= 100 ? "Đã đạt cấp tối đa" : requiresAscension ? `Cần ${ascensionCost} Dịch Slime để mở giới hạn tiếp theo` : `Nâng cấp tiếp theo: ${moraCost.toLocaleString("vi-VN")} Mora`}</span></div>}
        <div className="characterActions">
          {!progress && <button className="primaryButton" type="button" disabled={profile.wallet.primogem < definition.purchaseCost} onClick={() => onPurchase(viewedId)}>Mua · {definition.purchaseCost} Nguyên Thạch</button>}
          {progress && profile.selectedCharacterId !== viewedId && <button type="button" onClick={() => onSelect(viewedId)}>Chọn nhân vật</button>}
          {progress && profile.selectedCharacterId === viewedId && <button type="button" disabled>Đang sử dụng</button>}
          {progress && level < 100 && requiresAscension && <button className="primaryButton" type="button" disabled={profile.wallet.slimeCondensate < (ascensionCost ?? Infinity)} onClick={() => onAscend(viewedId)}>Đột phá · {ascensionCost} Dịch Slime</button>}
          {progress && level < 100 && !requiresAscension && <button className="primaryButton" type="button" disabled={profile.wallet.mora < moraCost} onClick={() => onUpgrade(viewedId)}>Nâng cấp · {moraCost.toLocaleString("vi-VN")} Mora</button>}
          {progress && level < 100 && !requiresAscension && <button type="button" disabled={profile.wallet.mora < moraCost} onClick={() => onUpgradeMax(viewedId)}>Nâng tối đa</button>}
        </div>
      </div>
    </section>
  </div>;
}
