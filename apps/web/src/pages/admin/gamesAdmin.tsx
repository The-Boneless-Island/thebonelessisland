// Games pages: Game Library, Game Nights, Recommendation Engine.

import { IslandButton, IslandCard, islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { Recommendation } from "../../types.js";
import { Field, RuleRow, Slider, smallBtn, SubsectionTitle } from "./adminUi.js";

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

export function GameNightsAdminPage() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard id="nights-defaults" style={{ padding: 16 }}>
        <SubsectionTitle>Defaults</SubsectionTitle>
        <Field label="Default voice channel">
          <input defaultValue="Lagoon Lounge" style={{ ...islandInputStyle, width: "100%" }} />
        </Field>
        <Field label="Auto-pick window before start">
          <input defaultValue="60 minutes" style={{ ...islandInputStyle, width: "100%" }} />
        </Field>
        <RuleRow label="Allow non-Parent hosts" enabled />
        <RuleRow label="Require crew RSVP before game lock" enabled />
        <RuleRow label="Auto-DM no-shows after night ends" enabled={false} />
        <p style={{ margin: "12px 0 0", fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.5 }}>
          No sessions live right now — inflight nights will appear here with lock / reopen / force-pick controls.
        </p>
      </IslandCard>
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
