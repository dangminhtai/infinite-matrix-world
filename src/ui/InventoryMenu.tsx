import type { Inventory } from "../game/core/SaveManager";
import { ITEM_CATALOG } from "../game/items/itemCatalog";

export function InventoryMenu({ inventory, onClose }: { inventory: Inventory; onClose: () => void }) {
  const items = Object.entries(inventory)
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => (ITEM_CATALOG[a]?.order ?? 999) - (ITEM_CATALOG[b]?.order ?? 999));
  return <div className="inventoryOverlay" role="dialog" aria-modal="true" aria-label="Túi đồ">
    <section className="inventoryPanel">
      <header><div><span>Hành trang</span><h2>Túi đồ</h2></div><button className="iconButton" onClick={onClose} title="Đóng" aria-label="Đóng">×</button></header>
      <div className="inventoryGrid">
        {items.length === 0 && <p className="emptyInventory">Chưa có vật phẩm</p>}
        {items.map(([id, amount]) => {
          const item = ITEM_CATALOG[id];
          return <div className="inventoryItem" key={id}><i aria-hidden="true" style={{ background: item?.color }} /><span>{item?.name ?? id}</span><strong>×{amount}</strong></div>;
        })}
      </div>
    </section>
  </div>;
}
