import { islandTheme } from "../../theme.js";
import { GameCover } from "../../steamArt.js";
import type { ForumLinkPreview, ForumThreadGame, ForumThreadType } from "../../types.js";
import { domainOf, POST_TYPE_BY_KEY } from "./forumShared.js";

export function TypeChip({ type }: { type: ForumThreadType }) {
  const meta = POST_TYPE_BY_KEY[type];
  if (type === "discussion") return null; // discussion is the implicit default
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "0 6px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        background: `${meta.accent}22`,
        border: `1px solid ${meta.accent}55`,
        color: meta.accent,
        verticalAlign: "middle"
      }}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

export function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      style={{
        alignSelf: "flex-start",
        background: "transparent",
        border: "none",
        color: islandTheme.color.primaryGlow,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        padding: 0,
        font: "inherit"
      }}
    >
      {label}
    </button>
  );
}

export function FeedLinkLine({ linkUrl, preview }: { linkUrl: string; preview: ForumLinkPreview | null }) {
  return (
    <div style={{ marginTop: 4, fontSize: 12, color: islandTheme.color.textSubtle, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span aria-hidden="true">🔗</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {preview?.title ? (
          <span style={{ color: islandTheme.color.textPrimary, fontWeight: 600 }}>{preview.title}</span>
        ) : null}
        {preview?.title ? " · " : ""}
        <span style={{ color: islandTheme.color.primaryGlow }}>{preview?.siteName ?? domainOf(linkUrl)}</span>
      </span>
    </div>
  );
}

export function LinkPreviewCard({ linkUrl, preview }: { linkUrl: string; preview: ForumLinkPreview | null }) {
  const domain = preview?.siteName ?? domainOf(linkUrl);
  const clamp2: React.CSSProperties = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical"
  };
  return (
    <a
      href={linkUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{
        display: "flex",
        gap: 12,
        marginTop: 14,
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: islandTheme.color.panelMutedBg,
        textDecoration: "none",
        color: islandTheme.color.textPrimary,
        alignItems: "center"
      }}
    >
      {preview?.imageUrl ? (
        <img
          src={preview.imageUrl}
          alt=""
          loading="lazy"
          style={{ width: 104, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${islandTheme.color.cardBorder}` }}
        />
      ) : (
        <div style={{ width: 104, height: 64, borderRadius: 8, flexShrink: 0, background: islandTheme.color.panelBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }} aria-hidden="true">
          🔗
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: islandTheme.color.primaryGlow, marginBottom: 2 }}>{domain}</div>
        <div style={{ fontSize: 14, fontWeight: 700, wordBreak: "break-word", ...clamp2 }}>{preview?.title ?? linkUrl}</div>
        {preview?.description ? (
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2, ...clamp2 }}>{preview.description}</div>
        ) : null}
      </div>
    </a>
  );
}

export function GameChip({ game }: { game: ForumThreadGame }) {
  return (
    <span
      title={game.name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        marginLeft: 8,
        padding: "1px 8px 1px 2px",
        borderRadius: 6,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: islandTheme.color.panelMutedBg,
        fontSize: 12,
        fontWeight: 700,
        color: islandTheme.color.textSubtle,
        verticalAlign: "middle",
        maxWidth: 220,
        overflow: "hidden",
        whiteSpace: "nowrap"
      }}
    >
      <GameCover
        appId={game.appId}
        storedUrl={game.headerImageUrl}
        alt=""
        style={{ width: 32, height: 15, borderRadius: 3, flexShrink: 0 }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</span>
    </span>
  );
}

export function PinGlyph() {
  return (
    <span
      title="Pinned"
      aria-label="pinned"
      style={{ fontSize: 13, color: islandTheme.color.primaryGlow, flexShrink: 0 }}
    >
      📌
    </span>
  );
}

export function LockGlyph() {
  return (
    <span
      title="Locked"
      aria-label="locked"
      style={{ fontSize: 13, color: islandTheme.color.textMuted, flexShrink: 0 }}
    >
      🔒
    </span>
  );
}
