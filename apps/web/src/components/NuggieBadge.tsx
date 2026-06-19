import { islandTagStyle } from "../islandUi.js";
import { EquippedItem, NuggiesShopItem } from "../types.js";

type Item = EquippedItem | NuggiesShopItem;

type Props = {
  item: Item;
  size?: "sm" | "md";
};

export function NuggieBadge({ item, size = "md" }: Props) {
  const { itemData, itemType } = item;
  const isTitle = itemType === "title";
  const label = isTitle && itemData.label ? ` ${itemData.label}` : "";

  return (
    <span
      className="island-mono"
      style={{
        ...islandTagStyle({ color: itemData.color }),
        gap: "0.25rem",
        ...(size === "md" ? { fontSize: 12, padding: "2px 8px" } : {})
      }}
    >
      <span>{itemData.emoji}</span>
      {label && <span>{label}</span>}
    </span>
  );
}
