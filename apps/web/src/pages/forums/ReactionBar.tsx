import { Suspense, lazy, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { islandTheme } from "../../theme.js";
import type { ForumCustomEmojiMap, ForumReaction } from "../../types.js";
import { REACTION_META } from "./forumShared.js";

const EmojiPicker = lazy(() => import("./EmojiPicker.js").then((m) => ({ default: m.EmojiPicker })));

/** True for a "c:<snowflake>" Discord custom-emoji reaction key. */
export function isCustomEmojiKey(key: string): boolean {
  return /^c:\d{17,20}$/.test(key);
}

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
 * Renders one post's reaction bar: the 5 legacy quick-react keys, plus any
 * arbitrary Unicode-emoji or Discord-custom-emoji keys already present on the
 * post (from other members' reactions), plus (unless showAddButton is false)
 * a "+" button opening the full EmojiPicker. Reaction keys are never
 * interpolated as HTML — legacy keys use the REACTION_META emoji lookup, raw
 * Unicode keys render as plain text, and custom-emoji keys render an <img>
 * pointed at the CDN url from customEmoji.
 *
 * showAddButton defaults to true; PostActionBar (the per-post hover bar) sets
 * it false and renders its own "+" trigger instead, so this only shows the
 * already-placed reaction chips in that layout.
 */
export function ReactionBar({
  reactions,
  myReactions,
  customEmoji,
  onToggle,
  showAddButton = true
}: {
  reactions: Partial<Record<ForumReaction, number>>;
  myReactions: ForumReaction[];
  customEmoji: ForumCustomEmojiMap;
  onToggle: (reaction: ForumReaction) => void;
  showAddButton?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Extra keys already on the post that aren't part of the legacy quick row —
  // e.g. another member picked a Unicode emoji or a guild custom emoji first.
  const legacyKeys = new Set(REACTION_META.map((r) => r.key));
  const extraKeys = Object.keys(reactions).filter((k) => !legacyKeys.has(k as (typeof REACTION_META)[number]["key"]));

  return (
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
      {REACTION_META.map((r) => {
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
      {extraKeys.map((key) => {
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
      {showAddButton ? (
        <button
          ref={addTriggerRef}
          type="button"
          className="island-btn"
          onClick={() => setPickerOpen((o) => !o)}
          title="Add reaction"
          aria-label="Add reaction"
          aria-expanded={pickerOpen}
          style={{
            ...reactionPillBase,
            background: islandTheme.color.panelMutedBg,
            color: islandTheme.color.textMuted,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            padding: "4px 8px",
            fontWeight: 700
          }}
        >
          +
        </button>
      ) : null}
      {showAddButton && pickerOpen ? (
        <Suspense fallback={null}>
          <EmojiPicker
            anchorRef={addTriggerRef}
            onClose={() => setPickerOpen(false)}
            onPick={(reaction) => {
              onToggle(reaction);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
