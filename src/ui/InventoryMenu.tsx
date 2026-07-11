import type { Inventory } from "../game/core/SaveManager";

const ITEM_NAMES: Record<string, string> = {
  matrix_crystal: "Tinh thể ma trận",
  matrix_shard: "Mảnh ma trận",
  echo_core: "Lõi Echo",
};

export function InventoryMenu({ inventory, onClose }: { inventory: Inventory; onClose: () => void }) {
  const items = Object.entries(inventory).filter(([, amount]) => amount > 0);
  return <div className="inventoryOverlay" role="dialog" aria-modal="true" aria-label="Túi đồ">
    <section className="inventoryPanel">
      <header><div><span>Hành trang</span><h2>Túi đồ</h2></div><button className="iconButton" onClick={onClose} title="Đóng" aria-label="Đóng">×</button></header>
      <div className="inventoryGrid">
        {items.length === 0 && <p className="emptyInventory">Chưa có vật phẩm</p>}
        {items.map(([id, amount]) => <div className="inventoryItem" key={id}><i aria-hidden="true" /><span>{ITEM_NAMES[id] ?? id}</span><strong>×{amount}</strong></div>)}
      </div>
    </section>
  </div>;
}
