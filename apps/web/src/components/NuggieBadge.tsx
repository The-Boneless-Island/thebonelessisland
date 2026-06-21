import { islandTagStyle } from "../islandUi.js";
import { EquippedItem, NuggiesShopItem } from "../types.js";
import { ItemGlyph } from "./ItemGlyph.js";

type Item = EquippedItem | NuggiesShopItem;

type Props = {
  item: Item;
  size?: "sm" | "md";
};

export function NuggieBadge({ item, size = "md" }: Props) {
  const { itemData, itemType } = item;
  const isTitle = itemType === "title";
  const label = isTitle && itemData.label ? ` ${itemData.label}` : "";
  const milestoneArt = Boolean(itemData.image?.includes("/art/milestones/"));
  const glyphSize = size === "md" ? 16 : milestoneArt ? 24 : 14;

  // Milestone rank badges ship their own frame — skip the colored tag pill.
  if (milestoneArt && !label) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
        <ItemGlyph itemData={itemData} size={glyphSize} fallback="" />
      </span>
    );
  }

  return (
    <span
      className="island-mono"
      style={{
        ...islandTagStyle({ color: itemData.color }),
        gap: "0.25rem",
        ...(size === "md" ? { fontSize: 12, padding: "2px 8px" } : {})
      }}
    >
      <ItemGlyph itemData={itemData} size={glyphSize} fallback="" />
      {label && <span>{label}</span>}
    </span>
  );
}
