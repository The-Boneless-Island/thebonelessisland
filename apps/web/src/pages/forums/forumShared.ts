import { createElement, type CSSProperties, type ReactNode } from "react";
import { islandTagStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { ForumReactionKey, ForumThreadType } from "../../types.js";

export type PostTypeMeta = { key: ForumThreadType; emoji: string; label: string; blurb: string; accent: string };

export const POST_TYPES: PostTypeMeta[] = [
  { key: "discussion", emoji: "💬", label: "Discussion", blurb: "A question, a hot take, anything worth talking about.", accent: "#38bdf8" },
  { key: "memory", emoji: "📸", label: "Memory", blurb: "Screenshots, photos and stories from our adventures.", accent: "#a855f7" },
  { key: "recommendation", emoji: "⭐", label: "Recommendation", blurb: "A game, show, or anything worth the crew's time.", accent: "#fbbf77" },
  { key: "resource", emoji: "🧰", label: "Resource", blurb: "A link to a tool or guide others should know about.", accent: "#4ade80" }
];

export const POST_TYPE_BY_KEY: Record<ForumThreadType, PostTypeMeta> =
  Object.fromEntries(POST_TYPES.map((t) => [t.key, t])) as Record<ForumThreadType, PostTypeMeta>;

// The fixed reaction palette. Order here is the display order in the bar.
export const REACTION_META: { key: ForumReactionKey; emoji: string; label: string }[] = [
  { key: "nug", emoji: "👍", label: "Nug" },
  { key: "heart", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😂", label: "Haha" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "salute", emoji: "🫡", label: "Respect" }
];

export type ForumView =
  | { mode: "home" }
  | { mode: "category"; slug: string }
  | { mode: "thread"; threadId: number; postId?: number }
  | { mode: "compose"; categorySlug: string; type?: ForumThreadType };

export const FEED_PAGE_SIZE = 30;

export function parseForumView(pathname: string): ForumView {
  const rest = pathname.replace(/^\/forums\/?/, "");
  let m: RegExpExecArray | null;
  if ((m = /^thread\/(\d+)(?:\/post\/(\d+))?/.exec(rest))) {
    return { mode: "thread", threadId: Number(m[1]), postId: m[2] ? Number(m[2]) : undefined };
  }
  if ((m = /^category\/([a-z0-9-]+)/.exec(rest))) return { mode: "category", slug: m[1] };
  if ((m = /^compose\/([a-z0-9-]+)(?:\/(discussion|memory|recommendation|resource))?/.exec(rest))) {
    return { mode: "compose", categorySlug: m[1], type: m[2] as ForumThreadType | undefined };
  }
  return { mode: "home" };
}

export function forumPath(view: ForumView): string {
  switch (view.mode) {
    case "thread": return `/forums/thread/${view.threadId}${view.postId ? `/post/${view.postId}` : ""}`;
    case "category": return `/forums/category/${view.slug}`;
    case "compose": return `/forums/compose/${view.categorySlug}${view.type ? `/${view.type}` : ""}`;
    default: return "/forums";
  }
}

export function typePill(active: boolean, accent: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    font: "inherit",
    background: active ? `${accent}26` : islandTheme.color.panelMutedBg,
    color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
    border: `1px solid ${active ? accent : islandTheme.color.cardBorder}`
  };
}

export function chipStyle(active: boolean, accent: string): CSSProperties {
  return { ...islandTagStyle({ color: accent, active }), cursor: "pointer" };
}

export function renderSnippet(snippet: string | null): ReactNode {
  if (!snippet) return null;
  const START = String.fromCharCode(1);
  const END = String.fromCharCode(2);
  const out: ReactNode[] = [];
  let key = 0;
  snippet.split(START).forEach((part, idx) => {
    if (idx === 0) { if (part) out.push(part); return; }
    const endIdx = part.indexOf(END);
    if (endIdx === -1) { out.push(part); return; }
    const hl = part.slice(0, endIdx);
    const after = part.slice(endIdx + 1);
    out.push(
      createElement("mark", {
        key: key++,
        style: { background: `${islandTheme.color.nuggieGold}55`, color: "inherit", borderRadius: 3, padding: "0 2px" }
      }, hl)
    );
    if (after) out.push(after);
  });
  return out;
}

export function listRowStyle(firstRow: boolean): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
    cursor: "pointer",
    font: "inherit",
    color: islandTheme.color.textPrimary
  };
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
