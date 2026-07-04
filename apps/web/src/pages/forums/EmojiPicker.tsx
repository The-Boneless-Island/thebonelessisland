import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { apiFetch } from "../../api/client.js";
import { PortalPopover } from "../../components/PortalPopover.js";
import { islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { ForumCustomEmoji, ForumReaction } from "../../types.js";
import emojiData from "../../data/emoji.json" with { type: "json" };
import { REACTION_META } from "./forumShared.js";

type EmojiGroup = { category: string; items: { e: string; n: string }[] };
const EMOJI_GROUPS = emojiData as EmojiGroup[];

type Tab = "quick" | "unicode" | "island";

const tabBtnStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  font: "inherit",
  background: active ? islandTheme.color.panelMutedBg : "transparent",
  color: active ? islandTheme.color.textPrimary : islandTheme.color.textMuted,
  border: "none",
  borderBottom: `2px solid ${active ? islandTheme.color.primary : "transparent"}`
});

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

/**
 * Forum reaction picker: quick row (5 legacy reactions), a searchable Unicode
 * emoji grid grouped by category (sourced from the vendored data/emoji.json —
 * no CDN fetch, CSP-safe), and an "Island" tab of guild custom emoji fetched
 * from GET /forums/emojis. Loaded via React.lazy from ReactionBar so it ships
 * as its own chunk. Selecting any entry calls onPick with the reaction key in
 * the shape the API expects (legacy key, raw Unicode string, or "c:<id>").
 *
 * Renders through the shared PortalPopover (anchored to the "+" trigger in
 * ReactionBar) rather than its own absolute-positioned div — the post it
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
  const [tab, setTab] = useState<Tab>("quick");
  const [search, setSearch] = useState("");
  const [guildEmoji, setGuildEmoji] = useState<ForumCustomEmoji[] | null>(null);

  useEffect(() => {
    if (tab !== "island" || guildEmoji !== null) return;
    let cancelled = false;
    apiFetch("/forums/emojis")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setGuildEmoji(Array.isArray(d?.emojis) ? d.emojis : []); })
      .catch(() => { if (!cancelled) setGuildEmoji([]); });
    return () => { cancelled = true; };
  }, [tab, guildEmoji]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return EMOJI_GROUPS;
    return EMOJI_GROUPS.map((g) => ({
      category: g.category,
      items: g.items.filter((it) => it.n.includes(q))
    })).filter((g) => g.items.length > 0);
  }, [search]);

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
      <div style={{ display: "flex", borderBottom: `1px solid ${islandTheme.color.cardBorder}` }}>
        <button type="button" className="island-btn" style={tabBtnStyle(tab === "quick")} onClick={() => setTab("quick")}>
          Quick
        </button>
        <button type="button" className="island-btn" style={tabBtnStyle(tab === "unicode")} onClick={() => setTab("unicode")}>
          Emoji
        </button>
        <button type="button" className="island-btn" style={tabBtnStyle(tab === "island")} onClick={() => setTab("island")}>
          Island
        </button>
      </div>

      {tab === "quick" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 12 }}>
          {REACTION_META.map((r) => (
            <button
              key={r.key}
              type="button"
              className="island-btn"
              style={gridBtnStyle}
              title={r.label}
              aria-label={r.label}
              onClick={() => onPick(r.key)}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "unicode" ? (
        <div style={{ display: "flex", flexDirection: "column", maxHeight: 320 }}>
          <div style={{ padding: 8 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emoji…"
              autoFocus
              style={{ ...islandInputStyle, width: "100%", fontSize: 13, padding: "0.4rem 0.6rem" }}
            />
          </div>
          <div style={{ overflowY: "auto", padding: "0 8px 8px" }}>
            {filteredGroups.length === 0 ? (
              <p style={{ margin: 0, padding: 12, fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
                No matches.
              </p>
            ) : (
              filteredGroups.map((g) => (
                <div key={g.category} style={{ marginBottom: 8 }}>
                  <div
                    className="island-mono"
                    style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: islandTheme.color.textMuted, padding: "4px 2px" }}
                  >
                    {g.category}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {g.items.map((it) => (
                      <button
                        key={it.e}
                        type="button"
                        className="island-btn"
                        style={gridBtnStyle}
                        title={it.n}
                        aria-label={it.n}
                        onClick={() => onPick(it.e)}
                      >
                        {it.e}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "island" ? (
        <div style={{ maxHeight: 320, overflowY: "auto", padding: 8 }}>
          {guildEmoji === null ? (
            <p style={{ margin: 0, padding: 12, fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>Loading…</p>
          ) : guildEmoji.length === 0 ? (
            <p style={{ margin: 0, padding: 12, fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
              No custom emoji yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {guildEmoji.map((ge) => (
                <button
                  key={ge.id}
                  type="button"
                  className="island-btn"
                  style={{ ...gridBtnStyle, width: 34, height: 34 }}
                  title={`:${ge.name}:`}
                  aria-label={ge.name}
                  onClick={() => onPick(`c:${ge.id}`)}
                >
                  <img src={ge.url} alt={ge.name} style={{ width: 22, height: 22 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </PortalPopover>
  );
}
