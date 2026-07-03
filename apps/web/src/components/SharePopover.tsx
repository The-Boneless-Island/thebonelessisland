// Share-to-Discord (WS5): a small trigger + popover menu that replaces the
// old thin per-page navigator.share buttons. Fetches the admin-curated
// channel list once, posts the chosen target + content id/type to the
// server (which re-fetches content server-side — no client-supplied title/
// body ever leaves this component), and always offers a "Share elsewhere"
// fallback to the browser share sheet / clipboard.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client.js";
import { islandTheme } from "../theme.js";
import { usePushToast } from "../system/toast.js";

export type ShareContentType = "forum_thread" | "forum_post" | "news_item" | "activity_event";

export type ShareTarget = {
  id: number;
  label: string;
  emoji: string | null;
};

let cachedTargets: ShareTarget[] | null = null;
let inFlight: Promise<ShareTarget[]> | null = null;

async function loadShareTargets(): Promise<ShareTarget[]> {
  if (cachedTargets) return cachedTargets;
  if (inFlight) return inFlight;
  inFlight = apiFetch("/share/targets")
    .then((r) => (r.ok ? r.json() : { targets: [] }))
    .then((d) => {
      const targets = Array.isArray(d?.targets) ? (d.targets as ShareTarget[]) : [];
      cachedTargets = targets;
      return targets;
    })
    .catch(() => [])
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Fetches the share-target list once (module-level cache) and exposes the POST /share call. */
export function useShare() {
  const [targets, setTargets] = useState<ShareTarget[] | null>(cachedTargets);

  useEffect(() => {
    if (cachedTargets) return;
    void loadShareTargets().then(setTargets);
  }, []);

  const shareTo = useCallback(
    async (targetId: number, contentType: ShareContentType, contentId: number): Promise<{ ok: boolean; status: number }> => {
      const res = await apiFetch("/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentType, contentId, targetId })
      });
      return { ok: res.ok, status: res.status };
    },
    []
  );

  return { targets: targets ?? cachedTargets ?? [], shareTo };
}

function ShareGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1v9" />
      <polyline points="5 4 8 1 11 4" />
      <path d="M2 9v5h12V9" />
    </svg>
  );
}

type SharePopoverProps = {
  contentType: ShareContentType;
  contentId: number;
  /** Title used only by the "Share elsewhere" (navigator.share / clipboard) fallback — never sent to POST /share. */
  fallbackTitle: string;
  /** URL used only by the "Share elsewhere" fallback. */
  fallbackUrl: string;
  /** Compact icon-only trigger (news cards) vs a labeled button (forum/activity rows). */
  variant?: "icon" | "label";
  align?: "left" | "right";
  /** Trigger icon/text color override — e.g. white over the hero card's dark image gradient. */
  triggerColor?: string;
};

export function SharePopover({
  contentType,
  contentId,
  fallbackTitle,
  fallbackUrl,
  variant = "icon",
  align = "right",
  triggerColor
}: SharePopoverProps) {
  const { targets, shareTo } = useShare();
  const pushToast = usePushToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function handlePick(target: ShareTarget, e: React.MouseEvent) {
    e.stopPropagation();
    setBusyId(target.id);
    try {
      const result = await shareTo(target.id, contentType, contentId);
      if (result.ok) {
        pushToast(`Sent to #${target.label}`, "success");
        setOpen(false);
      } else if (result.status === 409) {
        pushToast("Already shared this recently.", "info");
      } else {
        pushToast("Couldn't send that share. Try again in a moment.", "error");
      }
    } catch {
      pushToast("Couldn't send that share. Try again in a moment.", "error");
    } finally {
      setBusyId(null);
    }
  }

  function shareElsewhere(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    if (navigator.share) {
      navigator.share({ title: fallbackTitle, url: fallbackUrl }).catch(() => {});
      return;
    }
    navigator.clipboard
      ?.writeText(fallbackUrl)
      .then(() => pushToast("Link copied to clipboard.", "success"))
      .catch(() => pushToast("Couldn't copy the link.", "error"));
  }

  const triggerStyle: React.CSSProperties =
    variant === "icon"
      ? {
          background: "transparent",
          border: "none",
          color: triggerColor ?? islandTheme.color.textMuted,
          cursor: "pointer",
          padding: "2px 4px",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "inherit",
          transition: `color ${islandTheme.motion.dur.fast} ease`
        }
      : {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: `1px solid ${islandTheme.color.cardBorder}`,
          color: triggerColor ?? islandTheme.color.textMuted,
          cursor: "pointer",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 12,
          font: "inherit"
        };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="Share"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Share"
        style={triggerStyle}
      >
        <ShareGlyph />
        {variant === "label" ? <span>Share</span> : null}
      </button>
      {open ? (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            [align]: 0,
            minWidth: 200,
            maxWidth: 260,
            background: islandTheme.color.menuBg,
            border: `1px solid ${islandTheme.color.border}`,
            borderRadius: 12,
            boxShadow: islandTheme.shadow.menu,
            backdropFilter: islandTheme.glass.blurMenu,
            WebkitBackdropFilter: islandTheme.glass.blurMenu,
            zIndex: 60,
            overflow: "hidden"
          }}
        >
          <div
            className="island-mono"
            style={{
              padding: "8px 12px",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: islandTheme.color.textMuted,
              borderBottom: `1px solid ${islandTheme.color.cardBorder}`
            }}
          >
            Send to a channel
          </div>
          {targets.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: islandTheme.color.textMuted }}>
              No share channels configured yet.
            </div>
          ) : (
            targets.map((target) => (
              <button
                key={target.id}
                type="button"
                role="menuitem"
                disabled={busyId === target.id}
                onClick={(e) => void handlePick(target, e)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "9px 12px",
                  background: "transparent",
                  border: "none",
                  borderTop: `1px solid ${islandTheme.color.cardBorder}`,
                  cursor: busyId === target.id ? "wait" : "pointer",
                  font: "inherit",
                  fontSize: 13,
                  color: islandTheme.color.textPrimary,
                  textAlign: "left"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {target.emoji ? <span aria-hidden="true">{target.emoji}</span> : null}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  #{target.label}
                </span>
                {busyId === target.id ? <span style={{ fontSize: 11, color: islandTheme.color.textMuted }}>sending…</span> : null}
              </button>
            ))
          )}
          <button
            type="button"
            role="menuitem"
            onClick={shareElsewhere}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "9px 12px",
              background: "transparent",
              border: "none",
              borderTop: `1px solid ${islandTheme.color.cardBorder}`,
              cursor: "pointer",
              font: "inherit",
              fontSize: 13,
              color: islandTheme.color.textMuted,
              textAlign: "left"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span aria-hidden="true">🔗</span>
            <span>Share elsewhere</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
