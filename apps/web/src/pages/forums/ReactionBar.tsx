import { type CSSProperties, type ReactNode } from "react";
import { islandTheme } from "../../theme.js";
import type { ForumCustomEmojiMap, ForumReaction } from "../../types.js";
import { isCustomEmojiKey, REACTION_META } from "./forumShared.js";

const reactionPillBase: CSSProperties = {
  borderRadius: 999,
  fontSize: 13,
  lineHeight: 1,
  cursor: "pointer",
  font: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 4
};

function ReactionPill({
  active,
  count,
  onClick,
  title,
  ariaLabel,
  children
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        ...reactionPillBase,
        background: active ? islandTheme.color.primary : islandTheme.color.panelMutedBg,
        color: active ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
        border: `1px solid ${active ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
        padding: count > 0 ? "4px 10px 4px 8px" : "4px 8px"
      }}
    >
      {children}
      {count > 0 ? <span style={{ fontSize: 12, fontWeight: 700 }}>{count}</span> : null}
    </button>
  );
}

/**
 * Renders one post's reaction chip row: the legacy quick-react keys (in their
 * REACTION_META order) plus any arbitrary Unicode-emoji or Discord-custom-
 * emoji keys, but ONLY for keys that actually have a count > 0 on this post —
 * a post nobody has reacted to renders no chips (and this component returns
 * null outright, so it takes up no space). Reaction keys are never
 * interpolated as HTML — legacy keys use the REACTION_META emoji lookup, raw
 * Unicode keys render as plain text, and custom-emoji keys render an <img>
 * pointed at the CDN url from customEmoji.
 *
 * Adding a *new* reaction only happens via PostActionBar's reaction trigger
 * opening the full EmojiPicker directly — this bar has no "+" of its own.
 */
export function ReactionBar({
  reactions,
  myReactions,
  customEmoji,
  onToggle
}: {
  reactions: Partial<Record<ForumReaction, number>>;
  myReactions: ForumReaction[];
  customEmoji: ForumCustomEmojiMap;
  onToggle: (reaction: ForumReaction) => void;
}) {
  // Extra keys present on the post that aren't part of the legacy quick row —
  // e.g. a member picked a Unicode emoji or a guild custom emoji.
  const legacyKeys = new Set(REACTION_META.map((r) => r.key));
  const extraKeys = Object.keys(reactions).filter((k) => !legacyKeys.has(k as (typeof REACTION_META)[number]["key"]));

  const visibleLegacy = REACTION_META.filter((r) => (reactions[r.key] ?? 0) > 0);
  const visibleExtra = extraKeys.filter((k) => (reactions[k] ?? 0) > 0);

  if (visibleLegacy.length === 0 && visibleExtra.length === 0) return null;

  return (
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {visibleLegacy.map((r) => {
        const count = reactions[r.key] ?? 0;
        const mine = myReactions.includes(r.key);
        return (
          <ReactionPill
            key={r.key}
            active={mine}
            count={count}
            onClick={() => onToggle(r.key)}
            title={r.label}
            ariaLabel={`${r.label}${count ? ` (${count})` : ""}`}
          >
            <span aria-hidden="true">{r.emoji}</span>
          </ReactionPill>
        );
      })}
      {visibleExtra.map((key) => {
        const count = reactions[key] ?? 0;
        const mine = myReactions.includes(key);
        const custom = isCustomEmojiKey(key) ? customEmoji[key] : undefined;
        const label = custom ? `:${custom.name}:` : key;
        return (
          <ReactionPill
            key={key}
            active={mine}
            count={count}
            onClick={() => onToggle(key)}
            title={label}
            ariaLabel={`${label}${count ? ` (${count})` : ""}`}
          >
            {custom ? (
              <img src={custom.url} alt={label} style={{ width: 16, height: 16, verticalAlign: "middle" }} />
            ) : (
              <span aria-hidden="true">{key}</span>
            )}
          </ReactionPill>
        );
      })}
    </div>
  );
}
