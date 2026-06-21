// People pages: Members & Roles, Forum Moderation.

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, islandInputStyle, islandTagStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { ForumBan, ForumCategory, ForumModLogEntry, ForumReport, GuildMember } from "../../types.js";
import { Field, smallBtn, SubsectionTitle } from "./adminUi.js";

// ── Members & Roles ──────────────────────────────────────────────────────────

export function MembersPage() {
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch("/members");
        if (!res.ok) {
          if (!cancelled) setLoadState("error");
          return;
        }
        const data = (await res.json().catch(() => null)) as { members?: GuildMember[] } | null;
        if (!cancelled) {
          setMembers(data?.members ?? []);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [members]
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard id="members-roster" style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>
          Roster{loadState === "ready" ? ` · ${sorted.length}` : ""}
        </SubsectionTitle>
        <div
          className="island-mono"
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1.6fr 90px 80px",
            gap: 12,
            padding: "8px 16px",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: islandTheme.color.textMuted,
            borderTop: `1px solid ${islandTheme.color.cardBorder}`,
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`
          }}
        >
          <div>Member</div>
          <div>Roles</div>
          <div>Presence</div>
          <div>In guild</div>
        </div>
        {loadState === "loading" ? (
          <div style={{ padding: "16px", fontSize: 13, color: islandTheme.color.textMuted }}>
            Loading roster…
          </div>
        ) : loadState === "error" ? (
          <div style={{ padding: "16px", fontSize: 13, color: islandTheme.color.dangerText }}>
            Couldn’t load the roster. Try again in a moment.
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 13, color: islandTheme.color.textMuted }}>
            No members synced yet.
          </div>
        ) : (
          sorted.map((m, i) => <MemberRow key={m.discordUserId} entry={m} firstRow={i === 0} />)
        )}
      </IslandCard>

      <IslandCard id="members-roles" style={{ padding: 16 }}>
        <SubsectionTitle>Role mapping</SubsectionTitle>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Discord roles drive app capabilities. Admin access is granted by role in Discord — manage roles
          there and they sync here automatically.
        </p>
      </IslandCard>

      <IslandCard id="members-onboarding" style={{ padding: 16 }}>
        <SubsectionTitle>Onboarding</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Re-show the <strong>Washed Ashore</strong> tour to every member on their next visit. Use this after
          adding new steps or when you want the whole crew to see updated onboarding content.
        </p>
        <OnboardingResetButton />
      </IslandCard>
    </div>
  );
}

function OnboardingResetButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const statusColor =
    state === "error"
      ? islandTheme.color.dangerAccent
      : state === "done"
        ? islandTheme.color.successAccent
        : islandTheme.color.textSubtle;

  async function handleClick() {
    if (
      !window.confirm(
        "Re-show the Washed Ashore onboarding tour to all members?\n\nEvery member will see the tour again on their next visit."
      )
    ) {
      return;
    }
    setState("running");
    setMsg("Resetting onboarding for all members…");
    try {
      const res = await apiFetch("/admin/onboarding/reset-all", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; reset?: number; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setState("error");
        setMsg(data?.error ?? `Reset failed (${res.status})`);
        setTimeout(() => setState("idle"), 20000);
        return;
      }
      setState("done");
      setMsg(`Done — ${data.reset ?? 0} member${(data.reset ?? 0) === 1 ? "" : "s"} will see the tour again on their next visit.`);
      setTimeout(() => setState("idle"), 15000);
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Reset failed");
      setTimeout(() => setState("idle"), 20000);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <IslandButton variant="secondary" disabled={state === "running"} onClick={() => void handleClick()}>
        {state === "running" ? "Resetting…" : "Re-show onboarding to all members"}
      </IslandButton>
      {msg && (
        <span role="status" aria-live="polite" style={{ fontSize: 12, color: statusColor }}>
          {msg}
        </span>
      )}
    </div>
  );
}

const PRESENCE_LABEL: Record<NonNullable<GuildMember["presenceStatus"]>, string> = {
  online: "online",
  idle: "idle",
  dnd: "dnd",
  offline: "offline"
};

function MemberRow({ entry, firstRow }: { entry: GuildMember; firstRow: boolean }) {
  const presence = entry.presenceStatus;
  const dot =
    presence === "online"
      ? islandTheme.color.successAccent
      : presence === "idle"
        ? islandTheme.color.warnAccent
        : presence === "dnd"
          ? islandTheme.color.dangerAccent
          : islandTheme.color.textMuted;
  const presenceText = entry.inVoice
    ? "in voice"
    : presence
      ? PRESENCE_LABEL[presence]
      : "unknown";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1.6fr 90px 80px",
        gap: 12,
        padding: "12px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.displayName}</div>
        <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          @{entry.username}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {entry.roleNames.length === 0 ? (
          <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>—</span>
        ) : (
          entry.roleNames.map((r) => (
            <span
              key={r}
              className="island-mono"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: islandTheme.color.panelMutedBg,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                color: islandTheme.color.textSubtle
              }}
            >
              {r}
            </span>
          ))
        )}
      </div>
      <span
        className="island-mono"
        style={{ fontSize: 12, color: dot, display: "flex", alignItems: "center", gap: 4 }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
        {presenceText}
      </span>
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.successAccent }}>
        in guild
      </span>
    </div>
  );
}

// ── Forum Moderation ─────────────────────────────────────────────────────────

export function ForumsModPage({ initialTab }: { initialTab?: string }) {
  const valid = ["reports", "categories", "bans", "log"] as const;
  type Tab = (typeof valid)[number];
  const [tab, setTab] = useState<Tab>(
    valid.includes(initialTab as Tab) ? (initialTab as Tab) : "reports"
  );
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {valid.map((t) => (
          <button
            key={t}
            type="button"
            className="island-btn"
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? islandTheme.color.primary : islandTheme.color.panelMutedBg,
              color: tab === t ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
              border: `1px solid ${tab === t ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              font: "inherit",
              textTransform: "capitalize"
            }}
          >
            {t === "log" ? "Mod Log" : t}
          </button>
        ))}
      </div>
      {tab === "reports" ? <ForumReportsTab /> : null}
      {tab === "categories" ? <ForumCategoriesTab /> : null}
      {tab === "bans" ? <ForumBansTab /> : null}
      {tab === "log" ? <ForumModLogTab /> : null}
    </div>
  );
}

function ForumReportsTab() {
  const [reports, setReports] = useState<ForumReport[] | null>(null);

  const load = async () => {
    const r = await apiFetch("/forums/admin/reports").then((r) => r.json()).catch(() => ({ reports: [] }));
    setReports(r.reports ?? []);
  };

  useEffect(() => { void load(); }, []);

  async function resolve(id: number, action: "dismiss" | "delete_post" | "delete_thread") {
    await apiFetch(`/forums/admin/reports/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    });
    await load();
  }

  if (reports === null) {
    return <IslandCard><p style={{ margin: 0, color: islandTheme.color.textSubtle }}>Loading reports…</p></IslandCard>;
  }

  return (
    <IslandCard id="forums-reports" style={{ padding: 0, overflow: "hidden" }}>
      <SubsectionTitle style={{ padding: "14px 16px 0" }}>Open Reports · {reports.length}</SubsectionTitle>
      {reports.length === 0 ? (
        <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>
          No open reports. The crew is being well-behaved.
        </p>
      ) : (
        reports.map((r, i) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gap: 8,
              padding: "14px 16px",
              borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {r.threadTitle ? `Thread: ${r.threadTitle}` : `Report #${r.id}`}
                {r.postId ? <span style={{ color: islandTheme.color.textMuted, marginLeft: 6, fontSize: 12 }}>· post #{r.postId}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>
            <div style={{ fontSize: 12, color: islandTheme.color.textSubtle }}>
              Reporter: <strong>{r.reporterDisplayName}</strong> @{r.reporterUsername}
              {r.targetDisplayName ? ` · Target: ${r.targetDisplayName}` : ""}
            </div>
            <div style={{ fontSize: 13, color: islandTheme.color.textPrimary, fontStyle: "italic" }}>
              "{r.reason}"
            </div>
            {r.postBody ? (
              <div
                style={{
                  fontSize: 12,
                  background: islandTheme.color.panelMutedBg,
                  border: `1px solid ${islandTheme.color.cardBorder}`,
                  borderRadius: 8,
                  padding: 10,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: islandTheme.color.textSubtle,
                  maxWidth: "68ch"
                }}
              >
                {r.postBody.slice(0, 500)}
                {r.postBody.length > 500 ? "…" : ""}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={() => resolve(r.id, "dismiss")} style={smallBtn(islandTheme.color.panelMutedBg, islandTheme.color.textSubtle, true)}>
                Dismiss
              </button>
              {r.postId ? (
                <button type="button" onClick={() => resolve(r.id, "delete_post")} style={smallBtn("transparent", islandTheme.color.dangerText, true, islandTheme.color.danger)}>
                  Delete Post
                </button>
              ) : null}
              {r.threadId ? (
                <button type="button" onClick={() => resolve(r.id, "delete_thread")} style={smallBtn("transparent", islandTheme.color.dangerText, true, islandTheme.color.danger)}>
                  Delete Thread
                </button>
              ) : null}
            </div>
          </div>
        ))
      )}
    </IslandCard>
  );
}

function ForumCategoriesTab() {
  const [categories, setCategories] = useState<ForumCategory[] | null>(null);
  const [editing, setEditing] = useState<ForumCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const r = await apiFetch("/forums/categories");
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? `Load failed (${r.status})`);
      setCategories(data?.categories ?? []);
    } catch (err) {
      // Surface the failure — silently treating a 500 as "no categories"
      // hides real backend/schema problems from the one person who can fix them.
      setLoadError(err instanceof Error ? err.message : "Load failed");
      setCategories([]);
    }
  };

  useEffect(() => { void load(); }, []);

  async function remove(id: number) {
    if (!window.confirm("Delete this category? All threads in it will be removed.")) return;
    await apiFetch(`/forums/admin/categories/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div id="forums-categories" style={{ display: "grid", gap: 12 }}>
      {creating ? (
        <CategoryEditor mode="create" onCancel={() => setCreating(false)} onSaved={async () => { setCreating(false); await load(); }} />
      ) : (
        <IslandButton variant="primary" onClick={() => setCreating(true)} style={{ alignSelf: "flex-start" }}>
          + New Category
        </IslandButton>
      )}
      {editing ? (
        <CategoryEditor
          mode="edit"
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      ) : null}
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>
          Categories · {categories?.length ?? 0}
        </SubsectionTitle>
        {loadError ? (
          <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.dangerText }}>
            Couldn't load categories: {loadError}
          </p>
        ) : categories === null ? (
          <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>Loading…</p>
        ) : categories.length === 0 ? (
          <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>No categories yet.</p>
        ) : (
          categories.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto auto",
                gap: 12,
                padding: "12px 16px",
                alignItems: "center",
                borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `${c.accentColor}33`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18
                }}
              >
                {c.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name} {c.isLocked ? "🔒" : ""}</div>
                <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
                  /{c.slug} · {c.threadCount} threads · pos {c.position}
                </div>
              </div>
              <div className="island-mono" style={islandTagStyle({ color: c.accentColor })}>
                {c.accentColor}
              </div>
              <button type="button" onClick={() => setEditing(c)} style={smallBtn(islandTheme.color.panelMutedBg, islandTheme.color.textSubtle, true)}>
                Edit
              </button>
              <button type="button" onClick={() => remove(c.id)} style={smallBtn("transparent", islandTheme.color.dangerText, true, islandTheme.color.danger)}>
                Delete
              </button>
            </div>
          ))
        )}
      </IslandCard>
    </div>
  );
}

function CategoryEditor({
  mode,
  initial,
  onCancel,
  onSaved
}: {
  mode: "create" | "edit";
  initial?: ForumCategory;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "💬");
  const [accent, setAccent] = useState(initial?.accentColor ?? "#3b82f6");
  const [position, setPosition] = useState(initial?.position ?? 999);
  const [isLocked, setIsLocked] = useState(initial?.isLocked ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const url = mode === "create" ? "/forums/admin/categories" : `/forums/admin/categories/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const body = mode === "create"
        ? { slug, name, description, icon, accentColor: accent, position, isLocked }
        : { name, description, icon, accentColor: accent, position, isLocked };
      const r = await apiFetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        throw new Error(data?.error ?? "Save failed");
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <IslandCard style={{ padding: 16 }}>
      <SubsectionTitle>{mode === "create" ? "New category" : `Edit: ${initial?.name}`}</SubsectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {mode === "create" ? (
          <Field label="Slug (URL-safe)">
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="general" style={{ ...islandInputStyle, width: "100%" }} />
          </Field>
        ) : null}
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...islandInputStyle, width: "100%" }} />
        </Field>
        <Field label="Icon (emoji)">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} style={{ ...islandInputStyle, width: "100%" }} />
        </Field>
        <Field label="Accent color (#hex)">
          <input value={accent} onChange={(e) => setAccent(e.target.value)} style={{ ...islandInputStyle, width: "100%" }} />
        </Field>
        <Field label="Position (lower = higher)">
          <input type="number" value={position} onChange={(e) => setPosition(parseInt(e.target.value, 10) || 0)} style={{ ...islandInputStyle, width: "100%" }} />
        </Field>
        <Field label="Locked (no new threads)">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} />
            <span style={{ fontSize: 13 }}>{isLocked ? "Locked" : "Open"}</span>
          </label>
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...islandInputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>
      {error ? (
        <p style={{ margin: "4px 0 8px", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <IslandButton variant="primary" onClick={save} disabled={busy || name.length === 0 || (mode === "create" && slug.length < 2)}>
          {busy ? "Saving…" : "Save"}
        </IslandButton>
        <IslandButton onClick={onCancel}>Cancel</IslandButton>
      </div>
    </IslandCard>
  );
}

function ForumBansTab() {
  const [bans, setBans] = useState<ForumBan[] | null>(null);
  const [discordUserId, setDiscordUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const r = await apiFetch("/forums/admin/bans").then((r) => r.json()).catch(() => ({ bans: [] }));
    setBans(r.bans ?? []);
  };

  useEffect(() => { void load(); }, []);

  async function ban() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch("/forums/admin/bans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discordUserId: discordUserId.trim(), reason: reason.trim() })
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        throw new Error(data?.error ?? "Ban failed");
      }
      setDiscordUserId("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ban failed");
    } finally {
      setBusy(false);
    }
  }

  async function unban(id: string) {
    if (!window.confirm("Lift the ban?")) return;
    await apiFetch(`/forums/admin/bans/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div id="forums-bans" style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Ban a user</SubsectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8, alignItems: "end" }}>
          <Field label="Discord user ID">
            <input value={discordUserId} onChange={(e) => setDiscordUserId(e.target.value)} placeholder="123456789012345678" style={{ ...islandInputStyle, width: "100%" }} />
          </Field>
          <Field label="Reason">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spam, harassment, etc." style={{ ...islandInputStyle, width: "100%" }} />
          </Field>
          <IslandButton variant="danger" onClick={ban} disabled={busy || !discordUserId || !reason}>
            {busy ? "Banning…" : "Ban"}
          </IslandButton>
        </div>
        {error ? <p style={{ margin: "4px 0 0", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p> : null}
      </IslandCard>
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>Active bans · {bans?.length ?? 0}</SubsectionTitle>
        {bans === null ? (
          <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>Loading…</p>
        ) : bans.length === 0 ? (
          <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>No active bans.</p>
        ) : (
          bans.map((b, i) => (
            <div
              key={b.discordUserId}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 12,
                padding: "12px 16px",
                alignItems: "center",
                borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`
              }}
            >
              {b.avatarUrl ? (
                <img src={b.avatarUrl} alt={b.displayName} style={{ width: 36, height: 36, borderRadius: 999, border: `1px solid ${islandTheme.color.border}` }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 999, background: islandTheme.color.panelMutedBg }} />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{b.displayName}</div>
                <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
                  {b.reason} · banned by {b.bannedByDisplayName} · {new Date(b.createdAt).toLocaleDateString()}
                  {b.expiresAt ? ` · expires ${new Date(b.expiresAt).toLocaleDateString()}` : " · permanent"}
                </div>
              </div>
              <button type="button" onClick={() => unban(b.discordUserId)} style={smallBtn(islandTheme.color.panelMutedBg, islandTheme.color.textSubtle, true)}>
                Unban
              </button>
            </div>
          ))
        )}
      </IslandCard>
    </div>
  );
}

function ForumModLogTab() {
  const [log, setLog] = useState<ForumModLogEntry[] | null>(null);

  useEffect(() => {
    apiFetch("/forums/admin/mod-log")
      .then((r) => r.json())
      .then((d) => setLog(d.log ?? []))
      .catch(() => setLog([]));
  }, []);

  return (
    <IslandCard id="forums-log" style={{ padding: 0, overflow: "hidden" }}>
      <SubsectionTitle style={{ padding: "14px 16px 0" }}>Recent moderator actions</SubsectionTitle>
      {log === null ? (
        <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>Loading…</p>
      ) : log.length === 0 ? (
        <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>No actions yet.</p>
      ) : (
        log.map((e, i) => (
          <div
            key={e.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              padding: "10px 16px",
              alignItems: "center",
              borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: islandTheme.color.primaryGlow }}>{e.moderatorDisplayName}</span>
                {" "}
                <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>{e.action}</span>
                {e.targetThreadTitle ? <span> · {e.targetThreadTitle}</span> : null}
                {e.targetUserDisplayName ? <span> · @{e.targetUserDisplayName}</span> : null}
              </div>
              {e.notes ? (
                <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2, fontStyle: "italic" }}>
                  "{e.notes}"
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: islandTheme.color.textMuted, whiteSpace: "nowrap" }}>
              {new Date(e.createdAt).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </IslandCard>
  );
}
