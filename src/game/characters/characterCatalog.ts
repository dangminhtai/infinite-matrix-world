import aetherUrl from "../../models/genshin_impact_aether.glb?url";
import columbinaUrl from "../../models/character/columbina.glb?url";
import furinaUrl from "../../models/character/furina.glb?url";
import huTaoUrl from "../../models/character/hu_tao.glb?url";
import mavuikaUrl from "../../models/character/mavuika.glb?url";
import nahidaUrl from "../../models/character/nahida.glb?url";
import zhongliUrl from "../../models/character/zhongli.glb?url";

export const CHARACTER_IDS = ["aether", "columbina", "furina", "hu_tao", "mavuika", "nahida", "zhongli"] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export type CharacterDefinition = {
  id: CharacterId;
  name: string;
  role: string;
  modelUrl: string;
  purchaseCost: number;
  baseHP: number;
  baseATK: number;
  baseDEF: number;
  modelHeight: number;
  rotationY: number;
};

export const CHARACTER_CATALOG: Record<CharacterId, CharacterDefinition> = {
  aether: { id: "aether", name: "Aether", role: "Cân bằng", modelUrl: aetherUrl, purchaseCost: 0, baseHP: 1000, baseATK: 55, baseDEF: 55, modelHeight: 1.58, rotationY: 0 },
  nahida: { id: "nahida", name: "Nahida", role: "Tấn công", modelUrl: nahidaUrl, purchaseCost: 60, baseHP: 820, baseATK: 72, baseDEF: 42, modelHeight: 1.58, rotationY: 0 },
  furina: { id: "furina", name: "Furina", role: "HP cân bằng", modelUrl: furinaUrl, purchaseCost: 80, baseHP: 1080, baseATK: 62, baseDEF: 48, modelHeight: 1.58, rotationY: 0 },
  hu_tao: { id: "hu_tao", name: "Hu Tao", role: "Sát thương cao", modelUrl: huTaoUrl, purchaseCost: 90, baseHP: 900, baseATK: 82, baseDEF: 38, modelHeight: 1.58, rotationY: 0 },
  zhongli: { id: "zhongli", name: "Zhongli", role: "Phòng thủ", modelUrl: zhongliUrl, purchaseCost: 90, baseHP: 1250, baseATK: 48, baseDEF: 78, modelHeight: 1.58, rotationY: 0 },
  mavuika: { id: "mavuika", name: "Mavuika", role: "Tấn công bền bỉ", modelUrl: mavuikaUrl, purchaseCost: 100, baseHP: 1050, baseATK: 78, baseDEF: 52, modelHeight: 1.58, rotationY: 0 },
  columbina: { id: "columbina", name: "Columbina", role: "Cao cấp cân bằng", modelUrl: columbinaUrl, purchaseCost: 120, baseHP: 1100, baseATK: 76, baseDEF: 60, modelHeight: 1.58, rotationY: 0 },
};

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && CHARACTER_IDS.includes(value as CharacterId);
}
