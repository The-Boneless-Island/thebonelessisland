// Discord-style per-post hover action bar (WS1 Part D). Replaces the old
// always-visible Quote/Edit/Delete/Report row: nothing shows until the post
// card is hovered/focused-within, then this compact icon row appears pinned
// to the post's top-right corner. Reaction CHIPS stay in the post footer as
// before (see ReactionBar with showAddButton=false) — only the "+" trigger
// moves here, alongside Share/Quote/Edit/Delete/Report.

import { Suspense, lazy, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SharePopover } from "../../components/SharePopover.js";
import { islandTheme } from "../../theme.js";
import type { ForumReaction } from "../../types.js";

const EmojiPicker = lazy(() => import("./EmojiPicker.js").then((m) => ({ default: m.EmojiPicker })));

// ── Inline icon glyphs ──────────────────────────────────────────────────────
// Modeled after SharePopover.tsx's ShareGlyph for weight/style consistency:
// 16px viewBox, currentColor stroke, no fill, simple line-art.

function IconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function ReactGlyph() {
  return (
    <IconWrap>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.4 8.6c.5 1.1 1.5 1.8 2.6 1.8s2.1-.7 2.6-1.8" />
      <path d="M6 6.2h.01" />
      <path d="M10 6.2h.01" />
    </IconWrap>
  );
}

function ShareForwardGlyph() {
  return (
    <IconWrap>
      <path d="M8 1v9" />
      <polyline points="5 4 8 1 11 4" />
      <path d="M2 9v5h12V9" />
    </IconWrap>
  );
}

function QuoteGlyph() {
  return (
    <IconWrap>
      <path d="M4.5 4.2c-1.6.7-2.2 2-2.2 3.6 0 1.7 1.2 2.9 2.7 2.9 1.3 0 2.3-1 2.3-2.3 0-1.2-.9-2.1-2-2.1-.2 0-.4 0-.6.1.1-.9.9-1.7 2-2.1z" />
      <path d="M11 4.2c-1.6.7-2.2 2-2.2 3.6 0 1.7 1.2 2.9 2.7 2.9 1.3 0 2.3-1 2.3-2.3 0-1.2-.9-2.1-2-2.1-.2 0-.4 0-.6.1.1-.9.9-1.7 2-2.1z" />
    </IconWrap>
  );
}

function EditGlyph() {
  return (
    <IconWrap>
      <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
    </IconWrap>
  );
}

function DeleteGlyph() {
  return (
    <IconWrap>
      <path d="M3 4.5h10" />
      <path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" />
    </IconWrap>
  );
}

function ReportGlyph() {
  return (
    <IconWrap>
      <path d="M3.5 1.5v13" />
      <path d="M3.5 2.5c1.4-.9 2.6-.9 4 0s2.6.9 4 0v6c-1.4.9-2.6.9-4 0s-2.6-.9-4 0z" />
    </IconWrap>
  );
}

// ── Action bar ───────────────────────────────────────────────────────────────

const iconBtnBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 6,
  color: islandTheme.color.textSubtle,
  cursor: "pointer",
  font: "inherit"
};

type PostActionBarProps = {
  postId: number;
  fallbackUrl: string;
  canEdit: boolean;
  isOwner: boolean;
  onQuote?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onReact: (reaction: ForumReaction) => void;
};

/**
 * Pinned top-right icon row for one forum post. Visibility is controlled
 * entirely by the scoped <style> block below (className "bi-post-action-bar",
 * on the ancestor className "bi-post-hover-target") — same pattern as the
 * hover overlay in apps/web/src/components/PosterCard.tsx.
 */
export function PostActionBar({
  postId,
  fallbackUrl,
  canEdit,
  isOwner,
  onQuote,
  onEdit,
  onDelete,
  onReport,
  onReact
}: PostActionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactTriggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div
      className="bi-post-action-bar"
      role="toolbar"
      aria-label="Post actions"
      style={{
        position: "absolute",
        top: 10,
        right: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: islandTheme.color.panelMutedBg,
        backdropFilter: islandTheme.glass.blurMenu,
        WebkitBackdropFilter: islandTheme.glass.blurMenu,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        boxShadow: islandTheme.shadow.cardIdle
      }}
    >
      <button
        ref={reactTriggerRef}
        type="button"
        className="island-btn"
        onClick={() => setPickerOpen((o) => !o)}
        title="Add reaction"
        aria-label="Add reaction"
        aria-expanded={pickerOpen}
        style={iconBtnBase}
      >
        <ReactGlyph />
      </button>
      {pickerOpen ? (
        <Suspense fallback={null}>
          <EmojiPicker
            anchorRef={reactTriggerRef}
            onClose={() => setPickerOpen(false)}
            onPick={(reaction) => {
              onReact(reaction);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      ) : null}

      <SharePopover
        contentType="forum_post"
        contentId={postId}
        fallbackTitle="Boneless Island forum post"
        fallbackUrl={fallbackUrl}
        variant="icon"
        align="right"
        triggerColor={islandTheme.color.textSubtle}
      />

      {onQuote ? (
        <button type="button" className="island-btn" onClick={onQuote} title="Quote" aria-label="Quote" style={iconBtnBase}>
          <QuoteGlyph />
        </button>
      ) : null}
      {canEdit ? (
        <button type="button" className="island-btn" onClick={onEdit} title="Edit" aria-label="Edit" style={iconBtnBase}>
          <EditGlyph />
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className="island-btn"
          onClick={onDelete}
          title="Delete"
          aria-label="Delete"
          style={{ ...iconBtnBase, color: islandTheme.color.dangerText }}
        >
          <DeleteGlyph />
        </button>
      ) : null}
      {!isOwner ? (
        <button type="button" className="island-btn" onClick={onReport} title="Report" aria-label="Report" style={iconBtnBase}>
          <ReportGlyph />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Reveal-on-hover CSS, following the exact pattern PosterCard.tsx uses for
 * its own hover overlay: hidden + pointer-events:none by default on
 * hover-capable devices, revealed on the ancestor's :hover or the bar's own
 * :focus-within (so Tab-navigation reveals it); always-on at reduced opacity
 * for touch devices, going full-opacity on :focus-within there too; no
 * transition at all under prefers-reduced-motion. Render this once per
 * thread panel (not once per post) — it's a static stylesheet, not scoped to
 * a per-post class.
 */
export const POST_ACTION_BAR_CSS = `
  .bi-post-action-bar {
    opacity: 0;
    pointer-events: none;
    transition: opacity ${islandTheme.motion.dur.fast} ease;
  }
  .bi-post-hover-target:hover .bi-post-action-bar,
  .bi-post-action-bar:focus-within {
    opacity: 1;
    pointer-events: auto;
  }
  @media (hover: none) {
    .bi-post-action-bar {
      opacity: 0.55;
      pointer-events: auto;
    }
    .bi-post-action-bar:focus-within {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bi-post-action-bar {
      transition: none;
    }
  }
`;
