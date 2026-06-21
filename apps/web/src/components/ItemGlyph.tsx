// Renders a Nuggies item's icon: real art when `itemData.image` is set,
// otherwise the emoji placeholder. Single swap point so every item surface
// (badges, inventory, shop, achievements) lights up automatically as art
// lands for each item — no per-site change needed when a new image is added.
type GlyphData = { emoji?: string; image?: string };

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
    return (
      <img
        src={itemData.image}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
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
