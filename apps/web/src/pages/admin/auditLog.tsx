import {
  activityAuditDetailFields,
  activityAuditSummary,
  auditRowsToCsv,
  modLogAuditDetailFields,
  modLogAuditSummary,
  type AuditDetailField,
  type AuditScope,
} from "@island/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, islandInputStyle } from "../../islandUi.js";
import { getTransactionDisplay } from "../../lib/nuggiesTransactionDisplay.js";
import { islandTheme } from "../../theme.js";
import type { ActivityEvent, NuggieTransaction } from "../../types.js";
import { SubsectionTitle } from "./adminUi.js";

type AuditEntry =
  | { kind: "activity"; createdAt: string; event: ActivityEvent }
  | {
      kind: "mod";
      createdAt: string;
      mod: {
        id: number;
        action: string;
        notes: string | null;
        createdAt: string;
        moderatorDisplayName: string;
        targetThreadTitle: string | null;
        targetThreadId: number | null;
        targetPostId: number | null;
        targetUserDisplayName: string | null;
      };
    };

const SCOPES: { id: AuditScope; label: string; hint: string }[] = [
  { id: "admin", label: "Admin actions", hint: "Settings, drift log, game nights, shop, onboarding" },
  { id: "economy", label: "Economy", hint: "Grants, attendance, loans, daily claims, big wins" },
  { id: "moderation", label: "Forum moderation", hint: "Bans, deletes, mod edits" },
  { id: "community", label: "Crew activity", hint: "RSVPs, forums posts, milestones — not admin ops" },
  { id: "all", label: "Everything", hint: "Admin + economy + moderation + crew" },
];

const ADMIN_EVENT_TYPES = [
  "admin.settings_changed",
  "admin.onboarding_reset_all",
  "game_night.admin_updated",
  "game_night.admin_deleted",
  "news.card_published",
  "news.card_updated",
  "news.card_archived",
  "nuggies.admin_adjustment",
  "nuggies.attendance_awarded",
  "nuggies.shop_item_changed",
];

const ECONOMY_TX_TYPES = [
  { value: "", label: "All types" },
  { value: "admin_grant", label: "Admin grant" },
  { value: "admin_deduct", label: "Admin deduct" },
  { value: "attendance", label: "Attendance" },
  { value: "trade_in", label: "Trade in" },
  { value: "trade_out", label: "Trade out" },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function DetailGrid({ fields }: { fields: AuditDetailField[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(100px, 140px) 1fr",
        gap: "6px 12px",
        padding: "12px 16px",
        background: islandTheme.color.panelMutedBg,
        borderTop: `1px solid ${islandTheme.color.cardBorder}`,
        fontSize: 13,
      }}
    >
      {fields.map((f) => (
        <div key={f.label} style={{ display: "contents" }}>
          <div style={{ color: islandTheme.color.textMuted, fontWeight: 600 }}>{f.label}</div>
          <div style={{ color: islandTheme.color.textSecondary, wordBreak: "break-word" }}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

type AdminLedgerRow = NuggieTransaction & {
  user: { discordUserId: string; displayName: string };
};

function EconomyLedgerPanel() {
  const [rows, setRows] = useState<AdminLedgerRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [userQuery, setUserQuery] = useState("");
  const [txType, setTxType] = useState("");

  const load = useCallback(() => {
    setLoadState("loading");
    const params = new URLSearchParams({ limit: "40" });
    if (userQuery.trim()) params.set("discordUserId", userQuery.trim());
    if (txType) params.set("type", txType);
    void apiFetch(`/nuggies/admin/transactions?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { transactions?: AdminLedgerRow[] } | null) => {
        if (!d) {
          setLoadState("error");
          return;
        }
        setRows(d.transactions ?? []);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [userQuery, txType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <IslandCard style={{ padding: 16 }}>
      <SubsectionTitle>Nuggies ledger</SubsectionTitle>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
        Immutable economy rows — filter by crew member Discord ID or transaction type.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <input
          style={{ ...islandInputStyle, flex: "1 1 180px", minWidth: 0 }}
          placeholder="Discord user ID (optional)"
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
        />
        <select
          style={{ ...islandInputStyle, flex: "0 1 160px" }}
          value={txType}
          onChange={(e) => setTxType(e.target.value)}
        >
          {ECONOMY_TX_TYPES.map((t) => (
            <option key={t.value || "all"} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <IslandButton variant="secondary" onClick={load}>
          Apply
        </IslandButton>
      </div>
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        {loadState === "loading" ? (
          <div style={{ padding: 16, fontSize: 13, color: islandTheme.color.textMuted }}>Loading ledger…</div>
        ) : loadState === "error" ? (
          <div style={{ padding: 16, fontSize: 13, color: islandTheme.color.dangerText }}>Couldn’t load ledger.</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: islandTheme.color.textMuted }}>No matching rows.</div>
        ) : (
          rows.map((tx, i) => {
            const display = getTransactionDisplay(tx);
            return (
              <div
                key={tx.id}
                style={{
                  padding: "12px 16px",
                  borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
                }}
              >
                <div style={{ fontSize: 13 }}>
                  <strong>{tx.user.displayName}</strong> — {display.title}
                </div>
                <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
                  {display.subtitle} · {tx.amount >= 0 ? "+" : ""}₦{Math.abs(tx.amount).toLocaleString()} ·{" "}
                  {relTime(tx.createdAt)}
                </div>
              </div>
            );
          })
        )}
      </IslandCard>
    </IslandCard>
  );
}

export function AuditAdminPage() {
  const [scope, setScope] = useState<AuditScope>("admin");
  const [search, setSearch] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [eventType, setEventType] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const buildQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({ scope, limit: "50" });
      if (search.trim()) params.set("q", search.trim());
      if (since) params.set("since", new Date(since).toISOString());
      if (until) params.set("until", new Date(until).toISOString());
      if (eventType && scope === "admin") params.set("eventType", eventType);
      if (cursor) params.set("cursor", cursor);
      return params.toString();
    },
    [scope, search, since, until, eventType]
  );

  const load = useCallback(
    (append = false, cursor: string | null = null) => {
      setLoadState("loading");
      void apiFetch(`/activity/admin/audit?${buildQuery(cursor)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { entries?: AuditEntry[]; nextCursor?: string | null } | null) => {
          if (!d) {
            setLoadState("error");
            return;
          }
          setEntries((prev) => (append ? [...prev, ...(d.entries ?? [])] : d.entries ?? []));
          setNextCursor(d.nextCursor ?? null);
          setLoadState("ready");
        })
        .catch(() => setLoadState("error"));
    },
    [buildQuery]
  );

  useEffect(() => {
    setExpandedKey(null);
    load(false);
  }, [scope, load]);

  const exportCsv = useCallback(() => {
    const rows = entries.map((entry) => {
      if (entry.kind === "activity") {
        const e = entry.event;
        const summary = activityAuditSummary({
          id: e.id,
          eventType: e.eventType,
          createdAt: e.createdAt,
          actor: e.actor ? { displayName: e.actor.displayName, discordUserId: e.actor.discordUserId } : null,
          target: e.target ? { displayName: e.target.displayName, discordUserId: e.target.discordUserId } : null,
          game: e.game ? { name: e.game.name, appId: e.game.appId } : null,
          gameNightId: e.gameNightId,
          payload: e.payload,
        });
        return {
          kind: "activity" as const,
          createdAt: fmtTime(entry.createdAt),
          actor: e.actor?.displayName ?? "system",
          summary,
          detail: e.eventType,
        };
      }
      const summary = modLogAuditSummary(entry.mod);
      return {
        kind: "mod" as const,
        createdAt: fmtTime(entry.createdAt),
        actor: entry.mod.moderatorDisplayName,
        summary,
        detail: entry.mod.action,
      };
    });
    const blob = new Blob([auditRowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `island-audit-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, scope]);

  const scopeHint = useMemo(() => SCOPES.find((s) => s.id === scope)?.hint ?? "", [scope]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Audit log</SubsectionTitle>
        <p style={{ margin: "0 0 12px 0", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Who did what, when — admin decisions, economy moves, and forum moderation. Click a row for full detail.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${scope === s.id ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
                background: scope === s.id ? islandTheme.color.primaryGlow : "transparent",
                color: scope === s.id ? islandTheme.color.primaryText : islandTheme.color.textSecondary,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p style={{ margin: "0 0 12px 0", fontSize: 12, color: islandTheme.color.textMuted }}>{scopeHint}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <input
            style={{ ...islandInputStyle, flex: "1 1 200px", minWidth: 0 }}
            placeholder="Search summary, type, payload…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="datetime-local"
            style={{ ...islandInputStyle, flex: "0 1 200px" }}
            value={since}
            onChange={(e) => setSince(e.target.value)}
            title="From"
          />
          <input
            type="datetime-local"
            style={{ ...islandInputStyle, flex: "0 1 200px" }}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            title="Until"
          />
          {scope === "admin" && (
            <select
              style={{ ...islandInputStyle, flex: "0 1 220px" }}
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              <option value="">All admin event types</option>
              {ADMIN_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <IslandButton variant="secondary" onClick={() => load(false)}>
            Search
          </IslandButton>
          <IslandButton variant="secondary" onClick={exportCsv} disabled={entries.length === 0}>
            Export CSV
          </IslandButton>
        </div>
      </IslandCard>

      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        {loadState === "loading" && entries.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: islandTheme.color.textMuted }}>Loading audit entries…</div>
        ) : loadState === "error" && entries.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: islandTheme.color.dangerText }}>Couldn’t load audit log.</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: islandTheme.color.textMuted }}>No entries match these filters.</div>
        ) : (
          entries.map((entry, i) => {
            const key = entry.kind === "activity" ? `a-${entry.event.id}` : `m-${entry.mod.id}`;
            const open = expandedKey === key;
            const actor =
              entry.kind === "activity"
                ? entry.event.actor?.displayName ?? "system"
                : entry.mod.moderatorDisplayName;
            const summary =
              entry.kind === "activity"
                ? activityAuditSummary({
                    id: entry.event.id,
                    eventType: entry.event.eventType,
                    createdAt: entry.event.createdAt,
                    actor: entry.event.actor
                      ? { displayName: entry.event.actor.displayName, discordUserId: entry.event.actor.discordUserId }
                      : null,
                    target: entry.event.target
                      ? { displayName: entry.event.target.displayName, discordUserId: entry.event.target.discordUserId }
                      : null,
                    game: entry.event.game ? { name: entry.event.game.name, appId: entry.event.game.appId } : null,
                    gameNightId: entry.event.gameNightId,
                    payload: entry.event.payload,
                  })
                : modLogAuditSummary(entry.mod);
            const detailFields =
              entry.kind === "activity"
                ? activityAuditDetailFields({
                    id: entry.event.id,
                    eventType: entry.event.eventType,
                    createdAt: entry.event.createdAt,
                    actor: entry.event.actor
                      ? { displayName: entry.event.actor.displayName, discordUserId: entry.event.actor.discordUserId }
                      : null,
                    target: entry.event.target
                      ? { displayName: entry.event.target.displayName, discordUserId: entry.event.target.discordUserId }
                      : null,
                    game: entry.event.game ? { name: entry.event.game.name, appId: entry.event.game.appId } : null,
                    gameNightId: entry.event.gameNightId,
                    payload: entry.event.payload,
                  })
                : modLogAuditDetailFields(entry.mod);

            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => setExpandedKey(open ? null : key)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    padding: "12px 16px",
                    alignItems: "center",
                    border: "none",
                    borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
                    background: open ? islandTheme.color.panelMutedBg : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "inherit",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13 }}>
                      <strong>{actor}</strong> — {summary}
                    </div>
                    <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
                      {entry.kind === "activity" ? entry.event.eventType : `mod · ${entry.mod.action}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: islandTheme.color.textMuted, whiteSpace: "nowrap" }}>
                    {relTime(entry.createdAt)}
                  </span>
                </button>
                {open && <DetailGrid fields={detailFields} />}
              </div>
            );
          })
        )}
      </IslandCard>

      {nextCursor && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <IslandButton variant="secondary" onClick={() => load(true, nextCursor)} disabled={loadState === "loading"}>
            {loadState === "loading" ? "Loading…" : "Load more"}
          </IslandButton>
        </div>
      )}

      <EconomyLedgerPanel />
    </div>
  );
}
