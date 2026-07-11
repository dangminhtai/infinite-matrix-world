export type Inventory = Record<string, number>;

export type WorldSave = {
  inventory: Inventory;
  collected: string[];
  openedChests: string[];
  defeatedEnemies: string[];
};

const MAX_MODIFICATIONS_PER_TYPE = 10_000;

function emptySave(): WorldSave {
  return { inventory: {}, collected: [], openedChests: [], defeatedEnemies: [] };
}

function storageKey(seedKey: string): string {
  return `ihmw.world-save.${seedKey}`;
}

export function loadWorldSave(seedKey: string): WorldSave {
  const raw = localStorage.getItem(storageKey(seedKey));
  if (!raw) return emptySave();
  try {
    const parsed = JSON.parse(raw) as Partial<WorldSave>;
    return {
      inventory: parsed.inventory && typeof parsed.inventory === "object" ? parsed.inventory : {},
      collected: Array.isArray(parsed.collected) ? parsed.collected.slice(-MAX_MODIFICATIONS_PER_TYPE) : [],
      openedChests: Array.isArray(parsed.openedChests) ? parsed.openedChests.slice(-MAX_MODIFICATIONS_PER_TYPE) : [],
      defeatedEnemies: Array.isArray(parsed.defeatedEnemies) ? parsed.defeatedEnemies.slice(-MAX_MODIFICATIONS_PER_TYPE) : [],
    };
  } catch {
    localStorage.removeItem(storageKey(seedKey));
    return emptySave();
  }
}

export function saveWorld(seedKey: string, save: WorldSave): void {
  localStorage.setItem(storageKey(seedKey), JSON.stringify(save));
}

export function addInventoryItem(save: WorldSave, itemId: string, amount: number): void {
  save.inventory[itemId] = Math.max(0, (save.inventory[itemId] ?? 0) + amount);
}

export function addModification(list: string[], id: string): void {
  if (list.includes(id)) return;
  list.push(id);
  if (list.length > MAX_MODIFICATIONS_PER_TYPE) list.splice(0, list.length - MAX_MODIFICATIONS_PER_TYPE);
}
