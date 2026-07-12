export type ItemDefinition = {
  name: string;
  color: string;
  order: number;
};

export const ITEM_CATALOG: Record<string, ItemDefinition> = {
  primogem: { name: "Nguyên Thạch", color: "#c9a7ff", order: 1 },
  mora: { name: "Mora", color: "#f1c65e", order: 2 },
  slime_condensate: { name: "Dịch Slime", color: "#80c9e8", order: 3 },
};
