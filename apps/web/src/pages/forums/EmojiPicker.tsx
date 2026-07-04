import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { apiFetch } from "../../api/client.js";
import { PortalPopover } from "../../components/PortalPopover.js";
import { islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { ForumCustomEmoji, ForumReaction } from "../../types.js";
import emojiData from "../../data/emoji.json" with { type: "json" };
import { isCustomEmojiKey } from "./forumShared.js";

type EmojiGroup = { category: string; items: { e: string; n: string }[] };
const EMOJI_GROUPS = emojiData as EmojiGroup[];

const MRU_STORAGE_KEY = "bi:emoji-mru";
const MRU_STORED_MAX = 24;
const MRU_SHOWN_MAX = 16;

/** Read the MRU list from localStorage. Never throws — private browsing (or a
 * corrupt value) just yields an empty list. */
function readMru(): string[] {
  try {
    const raw = window.localStorage.getItem(MRU_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/** Push `reaction` to the front of the MRU list (deduped), cap it, and persist. */
function pushMru(reaction: string): string[] {
  const next = [reaction, ...readMru().filter((r) => r !== reaction)].slice(0, MRU_STORED_MAX);
  try {
    window.localStorage.setItem(MRU_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing / storage disabled / quota — MRU just won't persist.
  }
  return next;
}

const gridBtnStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  background: "transparent",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  font: "inherit"
};

const sectionHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: islandTheme.color.menuBg,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: islandTheme.color.textMuted,
  padding: "4px 2px",
  fontWeight: 700
};

function EmojiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))", gap: 2 }}>
      {children}
    </div>
  );
}

function EmojiCell({
  title,
  ariaLabel,
  onClick,
  children
}: {
  title: string;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="island-btn"
      style={gridBtnStyle}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

/**
 * Forum reaction picker: one flat, scrollable, Discord-style panel (no tabs).
 * Top to bottom: a live search box, a client-only "Frequently used" row (MRU,
 * localStorage-backed, hidden while searching), a "The Boneless Island"
 * section of guild custom emoji (fetched once on mount from
 * GET /forums/emojis), then the 8 Unicode categories sourced from the
 * vendored data/emoji.json (no CDN fetch, CSP-safe). Loaded via React.lazy
 * from ReactionBar/PostActionBar so it ships as its own chunk. Selecting any
 * entry calls onPick with the reaction key in the shape the API expects (raw
 * Unicode string, or "c:<id>") — the legacy 5-key quick row is gone from the
 * picker entirely (REACTION_META is still used to *render* reactions already
 * stored on old posts, just not to add new ones).
 *
 * Renders through the shared PortalPopover (anchored to the reaction trigger
 * in PostActionBar) rather than its own absolute-positioned div — the post it
 * lives in sits inside cards that can clip or trap a plain position:absolute
 * child (overflow:hidden / isolation:isolate), and the app's blurred "main"
 * element makes position:fixed misbehave too. PortalPopover owns outside-
 * click, Escape, and positioning.
 */
export function EmojiPicker({
  anchorRef,
  onPick,
  onClose
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (reaction: ForumReaction) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [guildEmoji, setGuildEmoji] = useState<ForumCustomEmoji[] | null>(null);
  const [mru, setMru] = useState<string[]>(() => readMru());

  // Fetch once per picker mount — there are no tabs anymore to lazily gate this on.
  useEffect(() => {
    let cancelled = false;
    apiFetch("/forums/emojis")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setGuildEmoji(Array.isArray(d?.emojis) ? d.emojis : []); })
      .catch(() => { if (!cancelled) setGuildEmoji([]); });
    return () => { cancelled = true; };
  }, []);

  const guildEmojiById = useMemo(() => {
    const map = new Map<string, ForumCustomEmoji>();
    (guildEmoji ?? []).forEach((ge) => map.set(ge.id, ge));
    return map;
  }, [guildEmoji]);

  const q = search.trim().toLowerCase();

  const filteredGuildEmoji = useMemo(() => {
    const list = guildEmoji ?? [];
    if (!q) return list;
    return list.filter((ge) => ge.name.toLowerCase().includes(q));
  }, [guildEmoji, q]);

  const filteredGroups = useMemo(() => {
    if (!q) return EMOJI_GROUPS;
    return EMOJI_GROUPS.map((g) => ({
      category: g.category,
      items: g.items.filter((it) => it.n.includes(q))
    })).filter((g) => g.items.length > 0);
  }, [q]);

  const mruEntries = useMemo(() => {
    if (q) return [];
    return mru
      .map((key) => {
        if (isCustomEmojiKey(key)) {
          const custom = guildEmojiById.get(key.slice(2));
          return custom ? { key, custom } : null;
        }
        return { key, custom: null as ForumCustomEmoji | null };
      })
      .filter((v): v is { key: string; custom: ForumCustomEmoji | null } => v !== null)
      .slice(0, MRU_SHOWN_MAX);
  }, [mru, q, guildEmojiById]);

  // "No matches" should never flash while the guild emoji fetch is still in
  // flight — a loading section counts as visible content, not an empty result.
  const hasAnyMatch =
    mruEntries.length > 0 || filteredGuildEmoji.length > 0 || guildEmoji === null || filteredGroups.length > 0;

  function pick(reaction: string) {
    setMru(pushMru(reaction));
    onPick(reaction);
  }

  return (
    <PortalPopover
      open
      onClose={onClose}
      anchorRef={anchorRef}
      side="top"
      align="left"
      ariaLabel="Add reaction"
      style={{ width: 280, maxWidth: "90vw", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <style>{`
        /* Desktop: the popover surface sizes to content, so the scroll body
           below gets its own explicit ~420px cap. Mobile (≤560px —
           PortalPopover's own bottom-sheet breakpoint) already bounds the
           whole sheet at 70vh via PortalPopover itself, so the body here
           drops its own cap and just flexes to fill whatever the sheet gives
           it (flex: 1 1 auto + min-height: 0 is what lets it shrink-to-fit
           and scroll internally instead of growing past the sheet). */
        .bi-emoji-picker-body { max-height: 420px; }
        @media (max-width: 560px) {
          .bi-emoji-picker-body { max-height: none; }
        }
      `}</style>
      <div style={{ padding: 8, borderBottom: `1px solid ${islandTheme.color.cardBorder}`, flexShrink: 0 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji…"
          autoFocus
          style={{ ...islandInputStyle, width: "100%", fontSize: 13, padding: "0.4rem 0.6rem" }}
        />
      </div>
      <div className="bi-emoji-picker-body" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "0 8px 8px" }}>
        {!hasAnyMatch ? (
          <p style={{ margin: 0, padding: 12, fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
            No matches.
          </p>
        ) : (
          <>
            {mruEntries.length > 0 ? (
              <div style={{ marginBottom: 8 }}>
                <div className="island-mono" style={sectionHeaderStyle}>Frequently used</div>
                <EmojiGrid>
                  {mruEntries.map(({ key, custom }) =>
                    custom ? (
                      <EmojiCell key={key} title={`:${custom.name}:`} ariaLabel={custom.name} onClick={() => pick(key)}>
                        <img src={custom.url} alt={custom.name} style={{ width: 20, height: 20 }} />
                      </EmojiCell>
                    ) : (
                      <EmojiCell key={key} title={key} ariaLabel={key} onClick={() => pick(key)}>
                        {key}
                      </EmojiCell>
                    )
                  )}
                </EmojiGrid>
              </div>
            ) : null}

            {guildEmoji === null || filteredGuildEmoji.length > 0 || (guildEmoji.length === 0 && !q) ? (
              <div style={{ marginBottom: 8 }}>
                <div className="island-mono" style={sectionHeaderStyle}>The Boneless Island</div>
                {guildEmoji === null ? (
                  <p style={{ margin: 0, padding: 12, fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
                    Loading…
                  </p>
                ) : guildEmoji.length === 0 ? (
                  <p style={{ margin: 0, padding: 12, fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
                    No custom emoji yet.
                  </p>
                ) : (
                  <EmojiGrid>
                    {filteredGuildEmoji.map((ge) => (
                      <EmojiCell key={ge.id} title={`:${ge.name}:`} ariaLabel={ge.name} onClick={() => pick(`c:${ge.id}`)}>
                        <img src={ge.url} alt={ge.name} style={{ width: 24, height: 24 }} />
                      </EmojiCell>
                    ))}
                  </EmojiGrid>
                )}
              </div>
            ) : null}

            {filteredGroups.map((g) => (
              <div key={g.category} style={{ marginBottom: 8 }}>
                <div className="island-mono" style={sectionHeaderStyle}>{g.category}</div>
                <EmojiGrid>
                  {g.items.map((it) => (
                    <EmojiCell key={it.e} title={it.n} ariaLabel={it.n} onClick={() => pick(it.e)}>
                      {it.e}
                    </EmojiCell>
                  ))}
                </EmojiGrid>
              </div>
            ))}
          </>
        )}
      </div>
    </PortalPopover>
  );
}
