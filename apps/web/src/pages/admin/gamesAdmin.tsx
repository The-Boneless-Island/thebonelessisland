// Games pages: Game Library, Game Nights, Recommendation Engine.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, islandInputStyle, islandTagStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { Recommendation } from "../../types.js";
import { Field, Slider, smallBtn, SubsectionTitle } from "./adminUi.js";

// ── Game Library ─────────────────────────────────────────────────────────────

export function LibraryAdminPage() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard id="library-featured" style={{ padding: 16 }}>
        <SubsectionTitle>Featured pick</SubsectionTitle>
        <Field label="Game of the Month">
          <input defaultValue="Deep Sea Dunkers: The Kraken's Hoard" style={{ ...islandInputStyle, width: "100%" }} />
        </Field>
        <Field label="Override blurb">
          <input
            defaultValue="Co-op submarine looting in haunted reefs."
            style={{ ...islandInputStyle, width: "100%" }}
          />
        </Field>
        <IslandButton variant="primary">Save</IslandButton>
      </IslandCard>
      <IslandCard id="library-tags" style={{ padding: 16 }}>
        <SubsectionTitle>Tag overrides</SubsectionTitle>
        {[
          { game: "Lethal Company", tags: "horror, co-op" },
          { game: "Helldivers II", tags: "co-op, shooter" },
          { game: "Stardew Valley", tags: "cozy, co-op" }
        ].map((row, i) => (
          <div
            key={row.game}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto",
              gap: 12,
              padding: "10px 0",
              borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
              alignItems: "center"
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{row.game}</div>
            <span
              className="island-mono"
              style={{ fontSize: 12, color: islandTheme.color.textSubtle }}
            >
              {row.tags}
            </span>
            <button type="button" className="island-btn" style={smallBtn("transparent", islandTheme.color.textMuted, true)}>
              Edit
            </button>
          </div>
        ))}
      </IslandCard>
    </div>
  );
}

// ── Game Nights ──────────────────────────────────────────────────────────────

type AdminGameNight = {
  id: number;
  title: string;
  scheduledFor: string;
  hostName: string | null;
  selectedAppId: number | null;
  selectedGameName: string | null;
  attendeeCount: number;
  isPast: boolean;
};

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatNightWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function GameNightsAdminPage() {
  const [nights, setNights] = useState<AdminGameNight[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const r = await apiFetch("/game-nights/admin/all").then((res) => res.json());
      setNights(r.gameNights ?? []);
      setError(null);
    } catch {
      setNights([]);
      setError("Failed to load game nights.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(night: AdminGameNight) {
    if (
      !window.confirm(
        `Delete "${night.title}"? This permanently removes the night along with its RSVPs and votes. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId(night.id);
    const res = await apiFetch(`/game-nights/${night.id}`, { method: "DELETE" }).catch(() => null);
    setBusyId(null);
    if (!res || !res.ok) {
      setError("Delete failed.");
      return;
    }
    if (editingId === night.id) setEditingId(null);
    await load();
  }

  async function clearPick(night: AdminGameNight) {
    setBusyId(night.id);
    const res = await apiFetch(`/game-nights/${night.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedAppId: null })
    }).catch(() => null);
    setBusyId(null);
    if (!res || !res.ok) {
      setError("Failed to clear the locked game.");
      return;
    }
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error ? (
        <IslandCard style={{ padding: "10px 14px", borderColor: islandTheme.color.danger }}>
          <span style={{ fontSize: 12, color: islandTheme.color.dangerText }}>{error}</span>
        </IslandCard>
      ) : null}

      <IslandCard id="nights-manage" style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>
          Scheduled nights · {nights?.length ?? 0}
        </SubsectionTitle>
        <p style={{ margin: 0, padding: "4px 16px 12px", fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.5 }}>
          Every night, upcoming and ended. Edit the title or time, clear a locked game pick, or delete the night
          entirely.
        </p>

        {nights === null ? (
          <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>
            Loading game nights…
          </p>
        ) : nights.length === 0 ? (
          <p style={{ margin: 0, padding: "10px 16px 16px", fontSize: 13, color: islandTheme.color.textMuted }}>
            No game nights scheduled yet.
          </p>
        ) : (
          nights.map((night, i) => (
            <div
              key={night.id}
              style={{
                display: "grid",
                gap: 10,
                padding: "14px 16px",
                borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
                opacity: busyId === night.id ? 0.55 : 1
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                  {night.title}
                  {night.isPast ? (
                    <span className="island-mono" style={{ ...islandTagStyle({ color: islandTheme.color.textMuted }), fontSize: 10 }}>
                      ENDED
                    </span>
                  ) : null}
                </div>
                <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
                  {formatNightWhen(night.scheduledFor)}
                </div>
              </div>

              <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>Host: {night.hostName ?? "—"}</span>
                <span>· {night.attendeeCount} crew</span>
                <span>
                  ·{" "}
                  {night.selectedGameName ? (
                    <>
                      Pick: <strong style={{ color: islandTheme.color.textPrimary }}>{night.selectedGameName}</strong>
                    </>
                  ) : (
                    <span style={{ color: islandTheme.color.textMuted }}>No game locked</span>
                  )}
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busyId === night.id}
                  onClick={() => setEditingId(editingId === night.id ? null : night.id)}
                  style={smallBtn(islandTheme.color.panelMutedBg, islandTheme.color.textSubtle, true)}
                >
                  {editingId === night.id ? "Close" : "Edit"}
                </button>
                {night.selectedAppId ? (
                  <button
                    type="button"
                    disabled={busyId === night.id}
                    onClick={() => clearPick(night)}
                    style={smallBtn(islandTheme.color.panelMutedBg, islandTheme.color.textSubtle, true)}
                  >
                    Clear pick
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === night.id}
                  onClick={() => remove(night)}
                  style={smallBtn("transparent", islandTheme.color.dangerText, true, islandTheme.color.danger)}
                >
                  Delete
                </button>
              </div>

              {editingId === night.id ? (
                <GameNightEditor
                  night={night}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await load();
                  }}
                  onError={setError}
                />
              ) : null}
            </div>
          ))
        )}
      </IslandCard>
    </div>
  );
}

function GameNightEditor({
  night,
  onCancel,
  onSaved,
  onError
}: {
  night: AdminGameNight;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(night.title);
  const [when, setWhen] = useState(toLocalInputValue(night.scheduledFor));
  const [saving, setSaving] = useState(false);

  async function save() {
    const body: { title?: string; scheduledFor?: string } = {};
    const trimmed = title.trim();
    if (trimmed && trimmed !== night.title) body.title = trimmed;
    if (when) {
      const next = new Date(when);
      if (!Number.isNaN(next.getTime()) && next.getTime() !== new Date(night.scheduledFor).getTime()) {
        body.scheduledFor = next.toISOString();
      }
    }
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    const res = await apiFetch(`/game-nights/${night.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      onError("Failed to save changes.");
      return;
    }
    await onSaved();
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        borderRadius: 10,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...islandInputStyle, width: "100%" }} />
      </Field>
      <Field label="Scheduled for">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          style={{ ...islandInputStyle, width: "100%" }}
        />
      </Field>
      <div style={{ display: "flex", gap: 6 }}>
        <IslandButton variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </IslandButton>
        <button
          type="button"
          onClick={onCancel}
          style={smallBtn(islandTheme.color.panelMutedBg, islandTheme.color.textSubtle, true)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Recommendation Engine ────────────────────────────────────────────────────

const WEIGHTS: Array<{ label: string; value: number; hint: string }> = [
  {
    label: "Library overlap weight",
    value: 1.0,
    hint: "How much it matters that the picked crew actually owns the game. 1.0 = ownership dominates the score."
  },
  {
    label: "Online crew weight",
    value: 0.8,
    hint: "Boost for games whose owners are online right now — favors picks you can start immediately."
  },
  {
    label: "Novelty weight",
    value: 0.4,
    hint: "Boost for games the crew hasn't played recently. Higher = fewer repeats of last week's pick."
  },
  {
    label: "Party-friendly weight",
    value: 0.6,
    hint: "Boost for games that comfortably fit the whole selected group (co-op, high player caps)."
  }
];

export function RecommenderAdminPage({
  selectedMemberCount,
  recommendations,
  onRunRecommendation
}: {
  selectedMemberCount: number;
  recommendations: Recommendation[];
  onRunRecommendation: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard id="rec-weights" style={{ padding: 16, display: "grid", gap: 10 }}>
        <SubsectionTitle>Scoring weights</SubsectionTitle>
        <div style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>
          Selected members from the Games page crew picker:{" "}
          <strong style={{ color: islandTheme.color.textPrimary }}>{selectedMemberCount}</strong>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {WEIGHTS.map((w) => (
            <Slider key={w.label} label={w.label} value={w.value} hint={w.hint} />
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.5 }}>
          Weights are currently fixed server-side; this view shows the live formula. In-app tuning is planned.
        </p>
        <IslandButton variant="primary" onClick={onRunRecommendation} style={{ marginTop: 4 }}>
          Run "What can we play"
        </IslandButton>
      </IslandCard>

      <IslandCard id="rec-results" style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>
          Ranked results · {recommendations.length}
        </SubsectionTitle>
        {recommendations.length ? (
          recommendations.map((r, i) => <RecRow key={r.appId} rec={r} firstRow={i === 0} />)
        ) : (
          <p style={{ padding: "10px 16px 16px", margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>
            No tester results yet. Pick crew + run.
          </p>
        )}
      </IslandCard>
    </div>
  );
}

function RecRow({ rec, firstRow }: { rec: Recommendation; firstRow: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 12,
        padding: "12px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{rec.name}</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>{rec.reason}</div>
      </div>
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {rec.owners} own · miss {rec.nearMatchMissingMembers}
      </span>
      <span
        className="island-mono"
        style={{ fontSize: 13, fontWeight: 700, color: islandTheme.palette.sandWarmAccent }}
      >
        {rec.score.toFixed(2)}
      </span>
    </div>
  );
}
