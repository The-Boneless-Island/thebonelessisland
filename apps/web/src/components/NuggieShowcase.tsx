import { islandTheme } from "../theme.js";
import { EquippedItem } from "../types.js";
import { ItemGlyph } from "./ItemGlyph.js";

// The Nuggies card's "trophy case" — the three equip slots a member shows off.
// Deliberately louder than the inline NuggieBadge pills used in lists/leaderboards:
// this is the homepage focal point that should pull a member back day to day.
const SHOWCASE_SLOTS: Array<{ type: EquippedItem["itemType"]; emoji: string; label: string }> = [
  { type: "title", emoji: "🏷", label: "Title" },
  { type: "flair", emoji: "✨", label: "Flair" },
  { type: "badge", emoji: "🎖", label: "Badge" }
];

function isMilestoneArt(src?: string): boolean {
  return Boolean(src?.includes("/art/milestones/"));
}

function FilledSlot({ item }: { item: EquippedItem }) {
  const { itemData } = item;
  const color = itemData.color || islandTheme.color.nuggieGold;
  const milestone = isMilestoneArt(itemData.image);
  const glyphSize = milestone ? 30 : 28;
  // Title slots carry the worded flex (e.g. "GIGABONELESS"); prefer that over the raw name.
  const caption = item.itemType === "title" && itemData.label ? itemData.label : item.name;

  return (
    <div className="nuggie-showcase-slot" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} title={caption}>
      <div
        className="nuggie-showcase-pedestal"
        style={{
          width: "100%",
          height: 46,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: islandTheme.radius.chip,
          background: `linear-gradient(180deg, ${color}2e 0%, ${color}0d 100%)`,
          border: `1px solid ${color}44`,
          boxShadow: `inset 0 1px 0 ${color}66, 0 2px 8px rgba(2,6,23,0.35)`
        }}
      >
        <span style={{ display: "inline-flex", lineHeight: 0, filter: `drop-shadow(0 0 7px ${color}99)` }}>
          <ItemGlyph itemData={itemData} size={glyphSize} fallback="" />
        </span>
      </div>
      <span
        className="island-mono"
        style={{
          maxWidth: "100%",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color,
          textAlign: "center",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {caption}
      </span>
    </div>
  );
}

function EmptySlot({ slot, onShop }: { slot: (typeof SHOWCASE_SLOTS)[number]; onShop?: () => void }) {
  return (
    <button
      type="button"
      onClick={onShop}
      className="nuggie-showcase-slot"
      title={`No ${slot.label.toLowerCase()} equipped — visit the shop`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: onShop ? "pointer" : "default",
        font: "inherit"
      }}
    >
      <div
        className="nuggie-showcase-pedestal"
        style={{
          width: "100%",
          height: 46,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: islandTheme.radius.chip,
          border: `1px dashed ${islandTheme.color.cardBorder}`,
          background: "rgba(2,6,23,0.18)"
        }}
      >
        <span style={{ fontSize: 22, opacity: 0.4, lineHeight: 1 }}>{slot.emoji}</span>
      </div>
      <span
        className="island-mono"
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: islandTheme.color.textMuted,
          textAlign: "center",
          lineHeight: 1.2
        }}
      >
        {slot.label}
      </span>
    </button>
  );
}

export function NuggieShowcase({ equipped, onShop }: { equipped: EquippedItem[]; onShop?: () => void }) {
  const equippedCount = SHOWCASE_SLOTS.filter((s) => equipped.some((e) => e.itemType === s.type)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          className="island-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: islandTheme.color.nuggieGold
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 9 }}>◆</span>
          On display
        </span>
        <span
          className="island-mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: islandTheme.color.nuggieGold,
            background: "rgba(251,191,119,0.14)",
            border: "1px solid rgba(251,191,119,0.32)",
            borderRadius: islandTheme.radius.pill,
            padding: "1px 8px"
          }}
        >
          {equippedCount} / 3
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          padding: 8,
          borderRadius: islandTheme.radius.control,
          background: islandTheme.color.panelMutedBg,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          boxShadow: "inset 0 1px 2px rgba(2,6,23,0.3)"
        }}
      >
        {SHOWCASE_SLOTS.map((slot) => {
          const item = equipped.find((e) => e.itemType === slot.type);
          return item ? <FilledSlot key={slot.type} item={item} /> : <EmptySlot key={slot.type} slot={slot} onShop={onShop} />;
        })}
      </div>
    </div>
  );
}
