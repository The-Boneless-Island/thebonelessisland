import { rankBadgeHeight } from "./MilestoneRankBadge.js";

// Renders a Nuggies item icon: real art when `itemData.image` is set, otherwise emoji.
// Milestone rank badges keep shield aspect via rankBadgeHeight().
type GlyphData = { emoji?: string; image?: string };

function isMilestoneBadgeArt(src?: string): boolean {
  return Boolean(src?.includes("/art/milestones/"));
}

export function ItemGlyph({
  itemData,
  size = 22,
  fallback = "✨",
}: {
  itemData: GlyphData;
  size?: number;
  fallback?: string;
}) {
  if (itemData.image) {
    const milestone = isMilestoneBadgeArt(itemData.image);
    const width = size;
    const height = milestone ? rankBadgeHeight(size) : size;
    return (
      <img
        src={itemData.image}
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        style={{
          width,
          height,
          objectFit: "contain",
          display: "inline-block",
          verticalAlign: "middle",
          flexShrink: 0,
        }}
      />
    );
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{itemData.emoji ?? fallback}</span>;
}
