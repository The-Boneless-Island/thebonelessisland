import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client.js";
import { islandTheme } from "../theme.js";
import type { ForumNotification } from "../types.js";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

/**
 * Global forum notification bell. Polls every 60s; click an item to open the
 * thread (deep-linked to the post). In-app only — no push.
 */
export function NotificationBell({ onOpenThread }: { onOpenThread: (threadId: number, postId: number | null) => void }) {
  const [items, setItems] = useState<ForumNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/forums/notifications");
      if (!r.ok) return;
      const d = await r.json();
      setItems(Array.isArray(d?.items) ? d.items : []);
      setUnread(typeof d?.unreadCount === "number" ? d.unreadCount : 0);
    } catch {
      /* offline / transient — keep last state */
    }
  }, []);

  useEffect(() => {
    void load();
    const h = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(h);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function markAll() {
    setUnread(0);
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    try {
      await apiFetch("/forums/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
    } catch {
      /* ignore */
    }
  }

  async function openItem(n: ForumNotification) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await apiFetch("/forums/notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: [n.id] })
        });
      } catch {
        /* ignore */
      }
    }
    if (n.threadId) onOpenThread(n.threadId, n.postId);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        onClick={() => { setOpen((o) => !o); if (!open) void load(); }}
        style={{
          position: "relative",
          width: 38,
          height: 38,
          borderRadius: 999,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          background: islandTheme.color.panelMutedBg,
          color: islandTheme.color.textPrimary,
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        🔔
        {unread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: islandTheme.color.dangerAccent,
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${islandTheme.color.panelBg}`
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: 46,
            right: 0,
            width: 320,
            maxWidth: "90vw",
            maxHeight: 420,
            overflowY: "auto",
            background: islandTheme.color.menuBg,
            border: `1px solid ${islandTheme.color.border}`,
            borderRadius: 12,
            boxShadow: islandTheme.shadow.menu,
            zIndex: 40
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${islandTheme.color.cardBorder}` }}>
            <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
              Notifications
            </span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                style={{ background: "transparent", border: "none", color: islandTheme.color.primaryGlow, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700 }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p style={{ margin: 0, padding: 18, fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
              No notifications yet.
            </p>
          ) : (
            items.slice(0, 15).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void openItem(n)}
                style={{
                  display: "flex",
                  gap: 10,
                  width: "100%",
                  padding: "10px 14px",
                  background: n.read ? "transparent" : `${islandTheme.color.primary}14`,
                  border: "none",
                  borderTop: `1px solid ${islandTheme.color.cardBorder}`,
                  cursor: "pointer",
                  font: "inherit",
                  color: islandTheme.color.textPrimary,
                  textAlign: "left"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = n.read ? "transparent" : `${islandTheme.color.primary}14`; }}
              >
                {n.actorAvatarUrl ? (
                  <img src={n.actorAvatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 30, height: 30, borderRadius: 999, background: islandTheme.color.panelMutedBg, flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.35 }}>
                    <strong>{n.actorName ?? "Someone"}</strong>{" "}
                    {n.type === "mention" ? "mentioned you in" : "replied in"}{" "}
                    <span style={{ color: islandTheme.color.primaryGlow }}>{n.threadTitle ?? "a thread"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>{relTime(n.createdAt)} ago</div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
