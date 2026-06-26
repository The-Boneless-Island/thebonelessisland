// News pages: Gaming News (feeds + curation + validation), Patch Sources, Drift Log.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../api/client.js";
import {
  createNewsSource,
  deleteNewsSource,
  listNewsServices,
  listNewsSources,
  testNewsSource,
  updateNewsSource,
  type NewsSource,
  type NewsSourceKind,
  type ServiceStatus
} from "../../api/newsSources.js";
import {
  createPatchSource,
  deletePatchSource,
  getPatchSourceCandidates,
  getPatchSources,
  testPatchSourceUrl,
  updatePatchSource
} from "../../api/patchSources.js";
import { IslandButton, IslandCard, islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type {
  NewsCard,
  PatchSourceCandidate,
  PatchSourceRow,
  PatchSourceTestResult,
  ServerSetting
} from "../../types.js";
import {
  AdminStatusBanner,
  AdminTabs,
  BannerToggle,
  Field,
  InlineSettings,
  SectionLabel,
  smallBtn,
  SubsectionTitle
} from "./adminUi.js";
import {
  ADMIN_PAGES,
  inlineSettingKeysFor,
  NEWS_FEED_TUNING_KEYS,
  NEWS_PRUNE_KEYS,
  NEWS_STORAGE_TIER_KEYS
} from "./adminNav.js";

// Accent comes from the nav registry — one source for sidebar, search, and page chrome.
const ACCENT = ADMIN_PAGES["news"].accent;

export type RecurateProgressSnap = {
  state: "running" | "done" | "error";
  reset: number;
  curated: number;
  processed: number;
  remaining: number;
  merged: number;
  duplicates: number;
  failed: number;
  costUsd: number;
  total: number;
  error: string | null;
};

export type EmbedBackfillProgressSnap = {
  state: "running" | "done" | "error";
  total: number;
  embedded: number;
  skipped: number;
  remaining: number;
  batches: number;
  error: string | null;
};

type AdminRunState = "idle" | "running" | "done" | "error";

function adminStatusColor(state: AdminRunState): string {
  if (state === "error") return islandTheme.color.dangerAccent;
  if (state === "done") return islandTheme.color.successAccent;
  return islandTheme.color.textSubtle;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function AdminTriggerFeedback({
  state,
  hint,
  message,
  progress,
  onCancel,
  cancelDisabled
}: {
  state: AdminRunState;
  hint?: string;
  message?: string;
  progress?: { value: number; max: number };
  onCancel?: () => void;
  cancelDisabled?: boolean;
}) {
  if (state === "idle" && !message) return null;
  const pct =
    progress && progress.max > 0
      ? Math.min(100, Math.round((progress.value / progress.max) * 100))
      : null;

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10, width: "100%" }}>
      {state === "running" && hint ? (
        <span style={{ fontSize: 11, color: islandTheme.color.textMuted, lineHeight: 1.45 }}>{hint}</span>
      ) : null}
      {message ? (
        <span role="status" aria-live="polite" style={{ fontSize: 12, color: adminStatusColor(state), lineHeight: 1.5 }}>
          {message}
        </span>
      ) : null}
      {state === "running" && pct !== null ? (
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: islandTheme.color.panelMutedBg,
            overflow: "hidden",
            maxWidth: 420
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: islandTheme.color.primary,
              transition: "width 400ms ease"
            }}
          />
        </div>
      ) : null}
      {onCancel && state === "running" ? (
        <div>
          <IslandButton variant="ghost" size="sm" disabled={cancelDisabled} onClick={onCancel}>
            Cancel
          </IslandButton>
        </div>
      ) : null}
    </div>
  );
}

export type NewsCardInput = {
  title: string;
  body: string;
  icon?: string;
  tag?: string | null;
  sourceUrl?: string | null;
};

type NewsPageProps = {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
  onIngest: () => Promise<{
    ok: boolean;
    fetched?: number;
    curated?: number;
    embedded?: number;
    error?: string;
  }>;
  onCurate: () => Promise<{ ok: boolean; curated?: number; remaining?: number; error?: string }>;
  onRecurate: (
    onProgress?: (snap: RecurateProgressSnap) => void
  ) => Promise<{ ok: boolean; reset?: number; curated?: number; error?: string }>;
  onCancelRecurate: () => Promise<{ ok: boolean; error?: string }>;
  onEmbedBackfill: (
    onProgress?: (snap: EmbedBackfillProgressSnap) => void
  ) => Promise<{ ok: boolean; embedded?: number; remaining?: number; error?: string }>;
  onCancelEmbedBackfill: () => Promise<{ ok: boolean; error?: string }>;
  onFetchEmbedBackfillStatus: () => Promise<{
    state: "idle" | "running" | "done" | "error";
    total: number;
    embedded: number;
    skipped: number;
    remaining: number;
    batches: number;
    error: string | null;
  } | null>;
  onImageBackfill: (
    limit?: number
  ) => Promise<{ ok: boolean; scanned?: number; resolved?: number; remaining?: number; error?: string }>;
  onFetchRecurateStatus: () => Promise<{
    state: "idle" | "running" | "done" | "error";
    reset: number;
    curated: number;
    processed?: number;
    remaining?: number;
    merged?: number;
    duplicates?: number;
    failed?: number;
    costUsd?: number;
    total: number;
    error: string | null;
  } | null>;
  onCurateGameNews: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
  onResetGeneralNewsCorpus: (opts: {
    confirm: string;
    ingestAfter?: boolean;
  }) => Promise<{
    ok: boolean;
    deletedArticles?: number;
    deletedFeedback?: number;
    ingestStarted?: boolean;
    error?: string;
  }>;
};

export function NewsAdminPage(props: NewsPageProps) {
  const { settings, onUpdate } = props;
  const getSetting = (key: string) => settings?.find((s) => s.key === key)?.value ?? "";

  const [devCap, setDevCap] = useState(() => getSetting("news_dev_cap") || "2");
  const [generalEnabled, setGeneralEnabled] = useState(() => getSetting("news_general_enabled") !== "false");
  const [newsApiKey, setNewsApiKey] = useState("");
  const newsApiKeyIsSet = getSetting("newsapi_key") === "••••••••";
  const [youtubeApiKey, setYoutubeApiKey] = useState("");
  const youtubeApiKeyIsSet = getSetting("youtube_api_key") === "••••••••";
  const [curationWebhook, setCurationWebhook] = useState("");
  const curationWebhookIsSet = getSetting("news_curation_alert_webhook_url") === "••••••••";
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (settings && !initializedRef.current) {
      setDevCap(getSetting("news_dev_cap") || "2");
      setGeneralEnabled(getSetting("news_general_enabled") !== "false");
      initializedRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  function flashSaved(key: string) {
    setSaved((p) => ({ ...p, [key]: true }));
    setTimeout(() => setSaved((p) => ({ ...p, [key]: false })), 2200);
  }

  if (settings === null) {
    return (
      <IslandCard style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading settings…</p>
      </IslandCard>
    );
  }

  return (
    <AdminTabs
      page="news"
      trailing={
        <InlineSettings
          keys={inlineSettingKeysFor("news")}
          settings={settings}
          onSave={onUpdate}
          title="More settings"
        />
      }
      tabs={[
        {
          anchor: "news-status",
          label: "Feed",
          content: (
            <AdminStatusBanner
              accent={ACCENT}
              icon="🌐"
              kicker="External News Feed"
              title={generalEnabled ? "External news feed active" : "External news feed disabled"}
              subtitle="Sources, keys, and pipeline controls live in the tabs above"
              control={
                <BannerToggle
                  on={generalEnabled}
                  onToggle={() => {
                    const next = !generalEnabled;
                    setGeneralEnabled(next);
                    onUpdate("news_general_enabled", next ? "true" : "false");
                  }}
                />
              }
            />
          )
        },
        {
          anchor: "news-sources",
          label: "Sources",
          content: <NewsSourceRegistryPanel accent={ACCENT} />
        },
        {
          anchor: "news-keys",
          label: "API keys",
          content: (
      <IslandCard style={{ padding: "16px 18px", display: "grid", gap: 16 }}>
        <SubsectionTitle style={{ marginBottom: 0 }}>API Keys</SubsectionTitle>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>GNews</div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Optional. Enables richer search queries based on crew game preferences.{" "}
            <a href="https://gnews.io" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
              Get a free key at gnews.io
            </a>{" "}
            (100 requests/day on the free tier). Leave blank to use RSS feeds only.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="password"
              placeholder={newsApiKeyIsSet ? "••••••••  (key is set)" : "Paste key here"}
              value={newsApiKey}
              onChange={(e) => setNewsApiKey(e.target.value)}
              style={{ ...islandInputStyle, flex: 1 }}
            />
            <IslandButton
              variant="secondary"
              onClick={() => {
                if (!newsApiKey.trim()) return;
                onUpdate("newsapi_key", newsApiKey.trim());
                setNewsApiKey("");
                flashSaved("newsapi_key");
              }}
              disabled={!newsApiKey.trim() || saved["newsapi_key"]}
            >
              {saved["newsapi_key"] ? "Saved" : "Save Key"}
            </IslandButton>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>YouTube</div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Optional. Unlocks YouTube channel uploads as news signal.{" "}
            <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
              Get a free key from Google Cloud Console
            </a>{" "}
            (10,000 units/day on the free tier — plenty for hourly polling).
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="password"
              placeholder={youtubeApiKeyIsSet ? "••••••••  (key is set)" : "Paste key here"}
              value={youtubeApiKey}
              onChange={(e) => setYoutubeApiKey(e.target.value)}
              style={{ ...islandInputStyle, flex: 1 }}
            />
            <IslandButton
              variant="secondary"
              onClick={() => {
                if (!youtubeApiKey.trim()) return;
                onUpdate("youtube_api_key", youtubeApiKey.trim());
                setYoutubeApiKey("");
                flashSaved("youtube_api_key");
              }}
              disabled={!youtubeApiKey.trim() || saved["youtube_api_key"]}
            >
              {saved["youtube_api_key"] ? "Saved" : "Save Key"}
            </IslandButton>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Curation alerts (Discord)</div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Optional webhook URL. Nuggie pings this channel when curation fetches articles but produces zero cards, or when validation failures spike.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="password"
              placeholder={curationWebhookIsSet ? "••••••••  (webhook is set)" : "https://discord.com/api/webhooks/…"}
              value={curationWebhook}
              onChange={(e) => setCurationWebhook(e.target.value)}
              style={{ ...islandInputStyle, flex: 1 }}
            />
            <IslandButton
              variant="secondary"
              onClick={() => {
                if (!curationWebhook.trim()) return;
                onUpdate("news_curation_alert_webhook_url", curationWebhook.trim());
                setCurationWebhook("");
                flashSaved("news_curation_alert_webhook_url");
              }}
              disabled={!curationWebhook.trim() || saved["news_curation_alert_webhook_url"]}
            >
              {saved["news_curation_alert_webhook_url"] ? "Saved" : "Save Webhook"}
            </IslandButton>
          </div>
        </div>
      </IslandCard>
          )
        },
        {
          anchor: "news-retention",
          label: "Archive",
          content: (
            <NewsRetentionSettingsPanel settings={settings} onSave={onUpdate} onResetCorpus={props.onResetGeneralNewsCorpus} />
          )
        },
        {
          anchor: "news-dev-cap",
          label: "Dev cap",
          content: (
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Developer Diversity Cap</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Maximum games per developer included in the Steam news ingestion. Prevents prolific studios (e.g. Valve) from dominating the feed. Default: 2.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            min={1}
            max={10}
            value={devCap}
            onChange={(e) => setDevCap(e.target.value)}
            style={{ ...islandInputStyle, width: 80 }}
          />
          <IslandButton
            variant="secondary"
            onClick={() => {
              onUpdate("news_dev_cap", devCap);
              flashSaved("news_dev_cap");
            }}
            disabled={saved["news_dev_cap"]}
          >
            {saved["news_dev_cap"] ? "Saved" : "Save"}
          </IslandButton>
          <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>games per developer</span>
        </div>
      </IslandCard>
          )
        },
        {
          anchor: "news-triggers",
          label: "Triggers",
          content: <ManualTriggersCard {...props} />
        },
        {
          anchor: "news-validation",
          label: "Validation",
          content: (
            <>
              <SectionLabel title="Pipeline health" />
              <NewsPipelineHealthPanel />
              <SectionLabel title="AI Validation Failures" />
              <ValidationFailuresStats />
            </>
          )
        }
      ]}
    />
  );
}

// ── Archive & feed tuning ───────────────────────────────────────────────────

function NewsRetentionSettingsPanel({
  settings,
  onSave,
  onResetCorpus
}: {
  settings: ServerSetting[];
  onSave: (key: string, value: string) => Promise<void> | void;
  onResetCorpus: NewsPageProps["onResetGeneralNewsCorpus"];
}) {
  const [confirmText, setConfirmText] = useState("");
  const [resetState, setResetState] = useState<AdminRunState>("idle");
  const [resetMsg, setResetMsg] = useState("");
  const [retireState, setRetireState] = useState<AdminRunState>("idle");
  const [retireMsg, setRetireMsg] = useState("");
  const [ingestAfterReset, setIngestAfterReset] = useState(true);
  const confirmPhrase = "SCRUB THE ARCHIVE";
  const confirmReady = confirmText.trim().toUpperCase() === confirmPhrase;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle style={{ marginBottom: 8 }}>Tide &amp; archive</SubsectionTitle>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.6 }}>
          The news pipeline keeps three layers. <strong style={{ color: islandTheme.color.textPrimary }}>Hot</strong>{" "}
          stories sit on the dock — full cards, embeddings, and auto-curation.{" "}
          <strong style={{ color: islandTheme.color.textPrimary }}>Warm</strong> stories move to the archive: still
          searchable, but stripped of bulky RSS text to save space. Anything past warm gets swept on the{" "}
          <strong style={{ color: islandTheme.color.textPrimary }}>nightly tide</strong> (validation junk, never-curated
          backlog, and truly ancient rows).
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.55 }}>
          Settings below are grouped by what they affect: what the crew sees on Gaming News, how long we keep each tier,
          and what the cleanup job is allowed to delete.
        </p>
      </IslandCard>

      <IslandCard style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
        <div>
          <div
            className="island-mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: ACCENT,
              marginBottom: 6
            }}
          >
            What the crew sees
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Controls the Gaming News dock and when the server fetches fresh headlines — no extra AI cost, just RSS/API
            timing and feed window.
          </p>
        </div>
        <InlineSettings
          keys={[...NEWS_FEED_TUNING_KEYS]}
          settings={settings}
          onSave={onSave}
          title=""
        />
      </IslandCard>

      <IslandCard style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
        <div>
          <div
            className="island-mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: ACCENT,
              marginBottom: 6
            }}
          >
            Hot &amp; warm storage
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            How long raw articles and embeddings stay before the archive strips bulk and search keeps summaries only.
          </p>
        </div>
        <InlineSettings
          keys={[...NEWS_STORAGE_TIER_KEYS]}
          settings={settings}
          onSave={onSave}
          title=""
        />
      </IslandCard>

      <IslandCard style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
        <div>
          <div
            className="island-mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: islandTheme.color.warnAccent,
              marginBottom: 6
            }}
          >
            Nightly cleanup
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Rows the nightly job is allowed to delete permanently. Lower numbers clear junk faster; raise them while
            debugging a bad curation deploy.
          </p>
        </div>
        <InlineSettings
          keys={[...NEWS_PRUNE_KEYS]}
          settings={settings}
          onSave={onSave}
          title=""
        />
      </IslandCard>

      <IslandCard
        style={{
          padding: "16px 18px",
          display: "grid",
          gap: 12,
          borderColor: islandTheme.color.dangerAccent + "55"
        }}
      >
        <div>
          <div
            className="island-mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: islandTheme.color.dangerAccent,
              marginBottom: 6
            }}
          >
            Scrub the archive
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Wipes every ingested external headline, validation failure, and curation run — a clean dock for the current
            pipeline. Member mutes and source registry stay put. Use this when an old backlog is stuck and re-curate
            keeps failing.
          </p>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: islandTheme.color.textMuted }}>
          <input
            type="checkbox"
            checked={ingestAfterReset}
            onChange={(e) => setIngestAfterReset(e.target.checked)}
          />
          Fetch fresh headlines right after the scrub
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={`Type ${confirmPhrase} to confirm`}
            style={{ ...islandInputStyle, flex: "1 1 220px", maxWidth: 360 }}
            disabled={resetState === "running"}
          />
          <IslandButton
            variant="secondary"
            onClick={async () => {
              setResetState("running");
              setResetMsg("Scrubbing the archive…");
              const result = await onResetCorpus({
                confirm: confirmPhrase,
                ingestAfter: ingestAfterReset
              });
              if (result.ok) {
                setResetState("done");
                setConfirmText("");
                setResetMsg(
                  `Removed ${(result.deletedArticles ?? 0).toLocaleString()} articles` +
                    (result.ingestStarted ? " · fresh fetch started in the background" : "") +
                    " — hit Fetch & Curate on Triggers if the feed is still empty"
                );
                setTimeout(() => setResetState("idle"), 15000);
              } else {
                setResetState("error");
                setResetMsg(result.error ?? "Reset failed");
                setTimeout(() => setResetState("idle"), 20000);
              }
            }}
            disabled={resetState === "running" || !confirmReady}
            style={
              confirmReady
                ? { borderColor: islandTheme.color.dangerAccent, color: islandTheme.color.dangerAccent }
                : undefined
            }
          >
            {resetState === "running" ? "Scrubbing…" : "Scrub archive & start fresh"}
          </IslandButton>
        </div>
        <AdminTriggerFeedback state={resetState} message={resetMsg} />
      </IslandCard>

      <IslandCard style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
        <div>
          <div
            className="island-mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: islandTheme.color.warnAccent,
              marginBottom: 6
            }}
          >
            Retire stale backlog
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Marks never-curated articles older than 14 days as handled — no AI cost. Use this when Discord shows a huge
            uncurated count but Scrub feels too heavy. Then run Fetch &amp; Curate for recent headlines only.
          </p>
        </div>
        <div>
          <IslandButton
            variant="secondary"
            disabled={retireState === "running"}
            onClick={async () => {
              setRetireState("running");
              setRetireMsg("Retiring stale rows…");
              try {
                const res = await apiFetch("/news/general/retire-stale-backlog", {
                  method: "POST",
                  credentials: "include"
                });
                const data = (await res.json()) as {
                  ok: boolean;
                  retired?: number;
                  remainingUncurated?: number;
                  error?: string;
                };
                if (data.ok) {
                  setRetireState("done");
                  setRetireMsg(
                    `Retired ${(data.retired ?? 0).toLocaleString()} stale row(s) · ${(data.remainingUncurated ?? 0).toLocaleString()} still in the recent window`
                  );
                  setTimeout(() => setRetireState("idle"), 12000);
                } else {
                  setRetireState("error");
                  setRetireMsg(data.error ?? "Retire failed");
                  setTimeout(() => setRetireState("idle"), 15000);
                }
              } catch (err) {
                setRetireState("error");
                setRetireMsg(err instanceof Error ? err.message : "Retire failed");
                setTimeout(() => setRetireState("idle"), 15000);
              }
            }}
          >
            {retireState === "running" ? "Retiring…" : "Retire stale backlog"}
          </IslandButton>
        </div>
        <AdminTriggerFeedback state={retireState} message={retireMsg} />
      </IslandCard>
    </div>
  );
}

function NewsPipelineDiagnosticsPanel() {
  const [diag, setDiag] = useState<{
    likelyCause: string;
    suggestedAction: string;
    totals: { articles: number; uncurated: number; liveCards: number };
    uncuratedByAge: { withinCurationWindow: number; outsideCurationWindow: number };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/news/general/diagnostics")
      .then(async (res) => {
        if (!res.ok) return;
        const payload = (await res.json()) as { diagnostics?: typeof diag };
        if (!cancelled) setDiag(payload.diagnostics ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!diag || diag.totals.articles === 0) return null;

  return (
    <div
      style={{
        fontSize: 11,
        color: islandTheme.color.textSubtle,
        lineHeight: 1.55,
        paddingTop: 8,
        borderTop: `1px solid ${islandTheme.color.border}`
      }}
    >
      <div style={{ fontWeight: 600, color: islandTheme.color.textPrimary, marginBottom: 4 }}>Diagnostics</div>
      <div>
        {diag.totals.articles.toLocaleString()} total · {diag.totals.uncurated.toLocaleString()} uncurated (
        {diag.uncuratedByAge.withinCurationWindow.toLocaleString()} within 14d ·{" "}
        {diag.uncuratedByAge.outsideCurationWindow.toLocaleString()} outside 14d) ·{" "}
        {diag.totals.liveCards.toLocaleString()} live cards
      </div>
      <div style={{ marginTop: 6, color: islandTheme.color.warnAccent }}>{diag.likelyCause}</div>
      <div style={{ marginTop: 4 }}>{diag.suggestedAction}</div>
    </div>
  );
}

// ── Manual triggers ──────────────────────────────────────────────────────────

function ManualTriggersCard({
  onIngest,
  onCurate,
  onRecurate,
  onCancelRecurate,
  onEmbedBackfill,
  onCancelEmbedBackfill,
  onFetchEmbedBackfillStatus,
  onImageBackfill,
  onFetchRecurateStatus,
  onCurateGameNews
}: NewsPageProps) {
  const [ingestState, setIngestState] = useState<AdminRunState>("idle");
  const [ingestMsg, setIngestMsg] = useState("");
  const [ingestHint, setIngestHint] = useState("");
  const [ingestStartedAt, setIngestStartedAt] = useState<number | null>(null);
  const [curateState, setCurateState] = useState<AdminRunState>("idle");
  const [curateMsg, setCurateMsg] = useState("");
  const [curateHint, setCurateHint] = useState("");
  const [gameCurateState, setGameCurateState] = useState<AdminRunState>("idle");
  const [gameCurateMsg, setGameCurateMsg] = useState("");
  const [gameCurateHint, setGameCurateHint] = useState("");
  const [recurateState, setRecurateState] = useState<AdminRunState>("idle");
  const [recurateMsg, setRecurateMsg] = useState("");
  const [recurateHint, setRecurateHint] = useState("");
  const [recurateProgress, setRecurateProgress] = useState<{
    processed: number;
    curated: number;
    merged: number;
    duplicates: number;
    failed: number;
    costUsd: number;
    total: number;
  } | null>(null);

  function progressMsg(processed: number, total: number, remaining: number, costUsd: number): string {
    const costStr = costUsd > 0 ? ` · est. $${costUsd.toFixed(3)} spent` : "";
    if (total <= 0) return `Regenerating… ${processed} processed${costStr}`;
    const pct = Math.min(100, Math.round((processed / total) * 100));
    const remainingStr = remaining > 0 ? ` · ${remaining.toLocaleString()} left` : "";
    return `Regenerating… ${processed.toLocaleString()} / ${total.toLocaleString()} (${pct}%)${remainingStr}${costStr}`;
  }

  function doneMsg(p: {
    curated: number;
    merged: number;
    duplicates: number;
    failed: number;
    costUsd: number;
    processed: number;
    remaining: number;
    total: number;
    error: string | null;
  }): string {
    const costStr = p.costUsd > 0 ? ` · est. $${p.costUsd.toFixed(3)} spent` : "";
    const lines = [
      `Curated ${p.processed.toLocaleString()} / ${p.total.toLocaleString()} articles`,
      `${p.curated.toLocaleString()} live cards`,
      `${p.merged} merged`,
      `${p.duplicates} duplicates`,
      p.failed > 0 ? `${p.failed} validation-failed` : null,
      p.remaining > 0 ? `${p.remaining.toLocaleString()} still waiting` : null,
      costStr.trim() || null
    ].filter(Boolean);
    if (p.error) return `${p.error} — ${lines.join(" · ")}`;
    return `Done — ${lines.join(" · ")}`;
  }

  function handleRecurateSnap(snap: RecurateProgressSnap) {
    setRecurateHint(
      snap.state === "running"
        ? "Runs on the server — safe to leave this tab. Progress updates every few seconds."
        : ""
    );
    if (snap.state === "running") {
      setRecurateState("running");
      setRecurateProgress({
        processed: snap.processed,
        curated: snap.curated,
        merged: snap.merged,
        duplicates: snap.duplicates,
        failed: snap.failed,
        costUsd: snap.costUsd,
        total: snap.total
      });
      setRecurateMsg(progressMsg(snap.processed, snap.total, snap.remaining, snap.costUsd));
    } else if (snap.state === "done" || snap.state === "error") {
      setRecurateState(snap.state === "error" ? "error" : "done");
      setRecurateProgress({
        processed: snap.processed,
        curated: snap.curated,
        merged: snap.merged,
        duplicates: snap.duplicates,
        failed: snap.failed,
        costUsd: snap.costUsd,
        total: snap.total
      });
      setRecurateMsg(doneMsg(snap));
    } else {
      setRecurateState("error");
      setRecurateMsg(snap.error ?? "Recurate failed");
    }
  }

  // On mount: re-attach to an in-flight recurate job (survives page navigation / refresh)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const job = await onFetchRecurateStatus();
      if (cancelled || !job || job.state !== "running") return;
      setRecurateState("running");
      setRecurateProgress({
        processed: job.processed ?? 0,
        curated: job.curated,
        merged: job.merged ?? 0,
        duplicates: job.duplicates ?? 0,
        failed: job.failed ?? 0,
        costUsd: job.costUsd ?? 0,
        total: job.total
      });
      setRecurateMsg(progressMsg(job.processed ?? 0, job.total, job.remaining ?? job.total, job.costUsd ?? 0));

      const result = await onRecurate((snap) => {
        if (cancelled) return;
        handleRecurateSnap(snap);
      });
      if (cancelled) return;
      if (!result.ok) {
        setRecurateState("error");
        setRecurateMsg(result.error ?? "Recurate failed");
      }
      setTimeout(() => {
        if (!cancelled) setRecurateState("idle");
      }, 12000);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ingestState !== "running" || ingestStartedAt === null) return;
    const timer = setInterval(() => {
      setIngestMsg((prev) => {
        const base = prev.split(" · elapsed")[0];
        return `${base} · elapsed ${formatElapsed(Date.now() - ingestStartedAt)}`;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ingestState, ingestStartedAt]);

  return (
    <IslandCard style={{ padding: "16px 18px", display: "grid", gap: 14 }}>
      <SubsectionTitle>Manual Triggers</SubsectionTitle>
      <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
        Ingestion and curation run automatically in the background when the news feed is loaded. Use these to kick off an immediate pass.
      </p>

      <div>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Fetch + Curate External News</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Pull from all enabled RSS feeds and GNews API, upsert new articles, then run AI curation.
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="secondary"
            onClick={async () => {
              const started = Date.now();
              setIngestStartedAt(started);
              setIngestState("running");
              setIngestHint("Pulling RSS/GNews, embedding new rows, then running AI curation. Usually 30–90s.");
              setIngestMsg("Fetching feeds and curating…");
              const result = await onIngest();
              if (result.ok) {
                setIngestState("done");
                setIngestMsg(
                  `Fetched ${result.fetched ?? 0} new · curated ${result.curated ?? 0} cards · embedded ${result.embedded ?? 0} new · elapsed ${formatElapsed(Date.now() - started)}` +
                    (result.fetched === 0 ? " — nothing new since last run" : "")
                );
                setIngestHint("");
                setTimeout(() => setIngestState("idle"), 12000);
              } else {
                setIngestState("error");
                setIngestMsg(result.error ?? "Ingestion failed");
                setIngestHint("");
                setTimeout(() => setIngestState("idle"), 20000);
              }
              setIngestStartedAt(null);
            }}
            disabled={ingestState === "running"}
          >
            {ingestState === "running" ? "Fetching…" : "Fetch & Curate"}
          </IslandButton>
        </div>
        <AdminTriggerFeedback state={ingestState} hint={ingestHint} message={ingestMsg} />
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Curate Existing Articles</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          AI-curate articles still waiting in the backlog (cluster-aware batches). One click processes the next pool — run again if remaining &gt; 0.
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="secondary"
            onClick={async () => {
              setCurateState("running");
              setCurateHint("Scoring and writing summaries for uncurated rows. May take a few minutes on Bedrock.");
              setCurateMsg("Running AI curation pass…");
              const result = await onCurate();
              if (result.ok) {
                setCurateState("done");
                const remaining = result.remaining ?? 0;
                if ((result.curated ?? 0) > 0) {
                  setCurateMsg(
                    `Curated ${result.curated} new card${result.curated === 1 ? "" : "s"} · ~${remaining.toLocaleString()} still uncurated`
                  );
                } else if (remaining > 0) {
                  setCurateMsg(
                    `No new cards this pass · ~${remaining.toLocaleString()} still uncurated — check Validation tab`
                  );
                } else {
                  setCurateMsg("Backlog clear — nothing left to curate");
                }
                setCurateHint("");
                setTimeout(() => setCurateState("idle"), 12000);
              } else {
                setCurateState("error");
                setCurateMsg(result.error ?? "Curation failed");
                setCurateHint("");
                setTimeout(() => setCurateState("idle"), 20000);
              }
            }}
            disabled={curateState === "running"}
          >
            {curateState === "running" ? "Curating…" : "Curate Articles"}
          </IslandButton>
        </div>
        <AdminTriggerFeedback state={curateState} hint={curateHint} message={curateMsg} />
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Re-curate Game News</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Re-score and summarize un-curated Steam game news using the active AI provider. Runs automatically on the next news fetch — use this to force an immediate pass.
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="secondary"
            onClick={async () => {
              setGameCurateState("running");
              setGameCurateHint("Steam patch/news summaries — usually under a minute.");
              setGameCurateMsg("Curating game news…");
              const result = await onCurateGameNews();
              if (result.ok) {
                setGameCurateState("done");
                setGameCurateMsg(
                  result.curated && result.curated > 0
                    ? `Curated ${result.curated} Steam article${result.curated === 1 ? "" : "s"}`
                    : "No un-curated Steam articles to process"
                );
                setGameCurateHint("");
                setTimeout(() => setGameCurateState("idle"), 8000);
              } else {
                setGameCurateState("error");
                setGameCurateMsg(result.error ?? "Curation failed");
                setGameCurateHint("");
                setTimeout(() => setGameCurateState("idle"), 20000);
              }
            }}
            disabled={gameCurateState === "running"}
          >
            {gameCurateState === "running" ? "Curating…" : "Re-curate Game News"}
          </IslandButton>
        </div>
        <AdminTriggerFeedback state={gameCurateState} hint={gameCurateHint} message={gameCurateMsg} />
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Regenerate All Summaries</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Reset curation on all articles and re-run AI with the updated prompt. Only for small corpora after prompt
          changes — if you have thousands of rows, use <strong>Archive → Scrub the archive</strong> instead (Regenerate
          marks every row uncurated again and will stall).
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="danger"
            onClick={async () => {
              setRecurateState("running");
              setRecurateProgress(null);
              setRecurateHint("Runs on the server — safe to leave this tab. Progress updates every few seconds.");
              setRecurateMsg("Starting full corpus re-curation…");
              const result = await onRecurate(handleRecurateSnap);
              if (!result.ok) {
                setRecurateState("error");
                setRecurateMsg(result.error ?? "Recurate failed");
                setRecurateHint("");
              }
              setTimeout(() => setRecurateState("idle"), 12000);
            }}
            disabled={recurateState === "running"}
          >
            {recurateState === "running"
              ? recurateProgress && recurateProgress.total > 0
                ? `Regenerating… ${Math.min(100, Math.round((recurateProgress.processed / recurateProgress.total) * 100))}%`
                : "Regenerating…"
              : "Regenerate All Summaries"}
          </IslandButton>
        </div>
        <AdminTriggerFeedback
          state={recurateState}
          hint={recurateHint}
          message={recurateMsg}
          progress={
            recurateProgress && recurateProgress.total > 0
              ? { value: recurateProgress.processed, max: recurateProgress.total }
              : undefined
          }
          onCancel={
            recurateState === "running"
              ? async () => {
                  const result = await onCancelRecurate();
                  if (!result.ok) {
                    setRecurateMsg(`Cancel failed: ${result.error ?? "unknown"}`);
                  } else {
                    setRecurateMsg("Cancel requested — stopping after current pass…");
                  }
                }
              : undefined
          }
        />
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Embedding Backfill</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Generate Titan/OpenAI vectors for every article missing one. One click runs until done (or you cancel) — runs on the server so it won&apos;t time out. Safe to leave the tab.
        </div>
        <EmbedBackfillButton
          onEmbedBackfill={onEmbedBackfill}
          onCancelEmbedBackfill={onCancelEmbedBackfill}
          onFetchEmbedBackfillStatus={onFetchEmbedBackfillStatus}
        />
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Cover Image Backfill</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Scrape an og:image cover for existing articles that have none (mainly Reddit + image-less RSS). The ingest hook only covers newly-fetched articles, so run this once after enabling the image feature. Processes 20 rows per request and loops until none remain.
        </div>
        <ImageBackfillButton onImageBackfill={onImageBackfill} />
      </div>
    </IslandCard>
  );
}

function ImageBackfillButton({
  onImageBackfill
}: {
  onImageBackfill: (
    limit?: number
  ) => Promise<{ ok: boolean; scanned?: number; resolved?: number; remaining?: number; error?: string }>;
}) {
  const [state, setState] = useState<AdminRunState>("idle");
  const [msg, setMsg] = useState("");
  const [hint, setHint] = useState("");
  const [progress, setProgress] = useState<{ value: number; max: number } | undefined>();

  return (
    <div>
      <IslandButton
        variant="secondary"
        disabled={state === "running"}
        onClick={async () => {
          setState("running");
          setHint("Scraping og:image URLs — loops automatically until none remain.");
          let totalResolved = 0;
          let estimatedTotal = 0;
          for (let i = 0; i < 80; i++) {
            setMsg(`Batch ${i + 1}… ${totalResolved} cover${totalResolved === 1 ? "" : "s"} found so far`);
            const result = await onImageBackfill(20);
            if (!result.ok) {
              setState("error");
              setMsg(result.error ?? "Backfill failed");
              setHint("");
              setProgress(undefined);
              return;
            }
            totalResolved += result.resolved ?? 0;
            const remaining = result.remaining ?? 0;
            if (estimatedTotal === 0 && remaining + totalResolved > 0) {
              estimatedTotal = remaining + totalResolved;
            }
            if (estimatedTotal > 0) {
              setProgress({ value: estimatedTotal - remaining, max: estimatedTotal });
            }
            if (remaining === 0 || (result.scanned ?? 0) === 0) {
              setState("done");
              setMsg(`Done — ${totalResolved} cover${totalResolved === 1 ? "" : "s"} scraped · ${remaining} remaining`);
              setHint("");
              setProgress(undefined);
              setTimeout(() => setState("idle"), 15000);
              return;
            }
          }
          setState("done");
          setMsg(`Paused at safety cap — ${totalResolved} covers scraped. Click again to continue.`);
          setHint("");
          setProgress(undefined);
          setTimeout(() => setState("idle"), 15000);
        }}
      >
        {state === "running" ? "Scraping…" : "Backfill Cover Images"}
      </IslandButton>
      <AdminTriggerFeedback state={state} hint={hint} message={msg} progress={progress} />
    </div>
  );
}

function embedProgressMsg(snap: EmbedBackfillProgressSnap): string {
  if (snap.state === "error") return snap.error ?? "Embed backfill failed";
  if (snap.total <= 0 && snap.state === "done") return "Nothing to embed — all rows already have vectors.";
  const done = snap.total - snap.remaining;
  const pct = snap.total > 0 ? Math.min(100, Math.round((done / snap.total) * 100)) : 0;
  const skippedStr = snap.skipped > 0 ? ` · ${snap.skipped.toLocaleString()} skip-sentinel` : "";
  if (snap.state === "done") {
    if (snap.remaining > 0) {
      return `Partial — ${snap.embedded.toLocaleString()} embedded${skippedStr} · ${snap.remaining.toLocaleString()} still missing (${pct}% of ${snap.total.toLocaleString()})`;
    }
    return `Done — ${snap.embedded.toLocaleString()} embedded${skippedStr} · 0 remaining`;
  }
  return `Embedding… ${done.toLocaleString()} / ${snap.total.toLocaleString()} (${pct}%) · batch ${snap.batches}${skippedStr} · ${snap.remaining.toLocaleString()} left`;
}

function EmbedBackfillButton({
  onEmbedBackfill,
  onCancelEmbedBackfill,
  onFetchEmbedBackfillStatus
}: {
  onEmbedBackfill: (
    onProgress?: (snap: EmbedBackfillProgressSnap) => void
  ) => Promise<{ ok: boolean; embedded?: number; remaining?: number; error?: string }>;
  onCancelEmbedBackfill: () => Promise<{ ok: boolean; error?: string }>;
  onFetchEmbedBackfillStatus: () => Promise<{
    state: "idle" | "running" | "done" | "error";
    total: number;
    embedded: number;
    skipped: number;
    remaining: number;
    batches: number;
    error: string | null;
  } | null>;
}) {
  const [state, setState] = useState<AdminRunState>("idle");
  const [msg, setMsg] = useState("");
  const [hint, setHint] = useState("");
  const [progress, setProgress] = useState<{ value: number; max: number } | undefined>();
  const [cancelPending, setCancelPending] = useState(false);

  function applySnap(snap: EmbedBackfillProgressSnap) {
    if (snap.state === "running") {
      setState("running");
      setHint("Runs on the server — safe to leave this tab. Titan embed calls take a while on large backlogs.");
      setMsg(embedProgressMsg(snap));
      if (snap.total > 0) {
        setProgress({ value: snap.total - snap.remaining, max: snap.total });
      }
    } else if (snap.state === "done") {
      setState("done");
      setHint("");
      setMsg(embedProgressMsg(snap));
      setProgress(undefined);
      setCancelPending(false);
    } else {
      setState("error");
      setHint("");
      setMsg(embedProgressMsg(snap));
      setProgress(undefined);
      setCancelPending(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const job = await onFetchEmbedBackfillStatus();
      if (cancelled || !job || job.state !== "running") return;
      applySnap({ ...job, state: "running", skipped: job.skipped ?? 0 });
      const result = await onEmbedBackfill((snap) => {
        if (!cancelled) applySnap(snap);
      });
      if (cancelled) return;
      if (!result.ok) {
        setState("error");
        setMsg(result.error ?? "Embed backfill failed");
      }
      setTimeout(() => {
        if (!cancelled) setState("idle");
      }, 15000);
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <IslandButton
        variant="secondary"
        disabled={state === "running"}
        onClick={async () => {
          setState("running");
          setCancelPending(false);
          setMsg("Starting embed backfill…");
          setHint("Queuing server job…");
          const result = await onEmbedBackfill((snap) => applySnap(snap));
          if (!result.ok) {
            setState("error");
            setMsg(result.error ?? "Embed backfill failed");
            setHint("");
            setProgress(undefined);
          }
          setTimeout(() => setState("idle"), 15000);
        }}
      >
        {state === "running"
          ? progress
            ? `Embedding… ${Math.min(100, Math.round((progress.value / progress.max) * 100))}%`
            : "Embedding…"
          : "Embed All Missing"}
      </IslandButton>
      <AdminTriggerFeedback
        state={state}
        hint={hint}
        message={msg}
        progress={progress}
        cancelDisabled={cancelPending}
        onCancel={
          state === "running"
            ? async () => {
                setCancelPending(true);
                setMsg("Cancel requested — finishing current batch…");
                const result = await onCancelEmbedBackfill();
                if (!result.ok) {
                  setCancelPending(false);
                  setMsg(`Cancel failed: ${result.error ?? "unknown"}`);
                }
              }
            : undefined
        }
      />
    </div>
  );
}

// ── Pipeline health + validation failures ─────────────────────────────────────

type NewsPipelineHealth = {
  status: "healthy" | "degraded" | "critical" | "off";
  embeddingBackend: string;
  embeddingsMissing: number;
  liveCards: number;
  validationFailures: number;
  uncuratedBacklog: number;
  lastRun: {
    at: string;
    kind: string;
    fetched: number;
    curated: number;
    failed: number;
    embedded: number;
    provider: string | null;
    errorSummary: string | null;
  } | null;
  lastBatch?: {
    parsedCount: number;
    matchCounts: Record<string, number>;
    failedCount: number;
  } | null;
};

function NewsPipelineHealthPanel() {
  const [health, setHealth] = useState<NewsPipelineHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/news/general/health")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { health?: NewsPipelineHealth };
        if (!cancelled) setHealth(payload.health ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <IslandCard style={{ padding: 16, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: islandTheme.color.dangerText }}>{error}</span>
      </IslandCard>
    );
  }
  if (!health) {
    return (
      <IslandCard style={{ padding: 16, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>Loading pipeline health…</span>
      </IslandCard>
    );
  }

  const statusColor =
    health.status === "healthy"
      ? islandTheme.color.successAccent
      : health.status === "off"
        ? islandTheme.color.textMuted
        : health.status === "degraded"
          ? islandTheme.color.warnAccent
          : islandTheme.color.dangerAccent;

  const lastRun = health.lastRun;
  const lastRunLine = lastRun
    ? `${lastRun.kind} · fetched ${lastRun.fetched} · curated ${lastRun.curated} · embedded ${lastRun.embedded}${
        lastRun.errorSummary ? ` · error: ${lastRun.errorSummary}` : ""
      }`
    : "No runs recorded yet";

  return (
    <IslandCard style={{ padding: 16, marginBottom: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          aria-hidden="true"
          style={{ width: 10, height: 10, borderRadius: 999, background: statusColor, flexShrink: 0 }}
        />
        <span style={{ fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>{health.status}</span>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          embeddings via {health.embeddingBackend}
          {health.embeddingsMissing > 0 ? ` · ${health.embeddingsMissing.toLocaleString()} missing` : ""}
        </span>
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
        {health.liveCards.toLocaleString()} live cards · {health.validationFailures.toLocaleString()} validation
        failures · {health.uncuratedBacklog.toLocaleString()} uncurated backlog
      </div>
      <div style={{ fontSize: 11, color: islandTheme.color.textMuted, lineHeight: 1.4 }}>
        Last run{lastRun ? ` (${new Date(lastRun.at).toLocaleString()})` : ""}: {lastRunLine}
      </div>
      {(health.embeddingsMissing > 0 || health.validationFailures > 0 || health.uncuratedBacklog > 0) && (
        <div
          style={{
            fontSize: 11,
            color: islandTheme.color.textSubtle,
            lineHeight: 1.5,
            paddingTop: 4,
            borderTop: `1px solid ${islandTheme.color.border}`
          }}
        >
          {health.embeddingsMissing > 0 && (
            <div>
              Missing embeddings ({health.embeddingsMissing.toLocaleString()}) — expected after switching to
              Bedrock Titan (vectors were reset). Run <strong>Embed Missing Articles</strong> on the Triggers tab
              until this reaches zero.
            </div>
          )}
          {health.validationFailures > 0 && (
            <div style={{ marginTop: health.embeddingsMissing > 0 ? 6 : 0 }}>
              Validation failures ({health.validationFailures.toLocaleString()}) — check error types on this tab.
              For large backlogs use <strong>Archive → Scrub the archive</strong>, not Regenerate All Summaries.
            </div>
          )}
          {health.uncuratedBacklog > 0 && (
            <div style={{ marginTop: 6 }}>
              Uncurated backlog ({health.uncuratedBacklog.toLocaleString()}) — rows with no AI pass yet. Most
              historical rows are outside the 14-day auto-curate window; use <strong>Archive → Retire stale backlog</strong>{" "}
              or Scrub the archive.
            </div>
          )}
        </div>
      )}
      <NewsPipelineDiagnosticsPanel />
      {health.lastBatch && (health.lastBatch.matchCounts.none ?? 0) > 0 && (
        <div style={{ fontSize: 11, color: islandTheme.color.warnAccent }}>
          Last batch: {health.lastBatch.failedCount} validation failure(s);{" "}
          {health.lastBatch.matchCounts.none} article(s) had no AI match (parsed {health.lastBatch.parsedCount}).
        </div>
      )}
      {health.status !== "healthy" && health.status !== "off" && (
        <div style={{ fontSize: 11, color: islandTheme.color.textMuted, lineHeight: 1.4 }}>
          Set a Discord webhook under the <strong>API keys</strong> tab (<code>news_curation_alert_webhook_url</code>)
          to get automatic alerts when curation stalls or backlogs grow (6–12h cooldown, no spam).
        </div>
      )}
    </IslandCard>
  );
}

// ── Validation failures ──────────────────────────────────────────────────────

type ValidationFailureRow = {
  id: number;
  title: string;
  sourceName: string;
  url: string;
  excerpt: string;
  errors: string[];
  retryCount: number;
  curatedAt: string;
};

type ValidationFailuresPayload = {
  count: number;
  recent: ValidationFailureRow[];
};

function ValidationFailuresStats() {
  const [data, setData] = useState<ValidationFailuresPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/news/general/validation-failures")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ValidationFailuresPayload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <IslandCard style={{ padding: 16 }}>
        <span style={{ fontSize: 12, color: islandTheme.color.dangerText }}>{error}</span>
      </IslandCard>
    );
  }
  if (!data) {
    return (
      <IslandCard style={{ padding: 16 }}>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>Loading…</span>
      </IslandCard>
    );
  }

  const hasFailures = data.count > 0;

  return (
    <IslandCard style={{ padding: 16 }}>
      <p style={{ margin: "0 0 10px 0", fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
        Articles where the AI failed to produce all 4 required sections after retries are hidden from the public feed. Use Regenerate above to clear retry counters and try again.
      </p>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 8,
          color: hasFailures ? islandTheme.color.dangerText : islandTheme.color.successAccent
        }}
      >
        {hasFailures ? `${data.count} article${data.count === 1 ? "" : "s"} failed validation` : "All articles passed"}
      </div>
      {hasFailures && data.recent.length > 0 ? (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {data.recent.map((row) => (
            <div
              key={row.id}
              style={{
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                background: islandTheme.color.panelMutedBg
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: islandTheme.color.textPrimary, lineHeight: 1.4 }}>
                {row.title}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: islandTheme.color.textMuted }}>
                {row.sourceName} · {row.errors.join(", ") || "?"} · {row.retryCount} retr
                {row.retryCount === 1 ? "y" : "ies"}
              </div>
              {row.excerpt ? (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                  {row.excerpt}
                  {row.excerpt.length >= 280 ? "…" : ""}
                </p>
              ) : null}
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: islandTheme.color.primaryGlow }}
              >
                Open source ↗
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </IslandCard>
  );
}

// ── News source registry ─────────────────────────────────────────────────────

const KIND_META: Record<NewsSourceKind, { label: string; icon: string; hint: string }> = {
  rss: { label: "RSS Feeds", icon: "📰", hint: "Paste any RSS / Atom feed URL." },
  reddit: { label: "Reddit", icon: "👽", hint: "Enter a subreddit name (no r/ prefix)." },
  youtube: { label: "YouTube", icon: "📺", hint: "Channel ID (starts with UC). Needs a YouTube API key." },
  gnews: { label: "GNews API", icon: "🔍", hint: "Search query passed to GNews.io. Needs an API key." }
};

const KIND_ORDER: NewsSourceKind[] = ["rss", "reddit", "youtube", "gnews"];

function NewsSourceRegistryPanel({ accent }: { accent: string }) {
  const [sources, setSources] = useState<NewsSource[] | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, { count: number; titles: string[]; error?: string }>>({});
  const [addingKind, setAddingKind] = useState<NewsSourceKind | null>(null);
  const [newName, setNewName] = useState("");
  const [newIdentifier, setNewIdentifier] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, svc] = await Promise.all([listNewsSources(), listNewsServices()]);
    setSources(s);
    setServices(svc);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleEnabled(src: NewsSource) {
    setBusyId(src.id);
    try {
      const updated = await updateNewsSource(src.id, { enabled: !src.enabled });
      setSources((prev) => (prev ?? []).map((s) => (s.id === src.id ? updated : s)));
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(src: NewsSource) {
    if (!confirm(`Delete custom source "${src.name}"?`)) return;
    setBusyId(src.id);
    try {
      await deleteNewsSource(src.id);
      setSources((prev) => (prev ?? []).filter((s) => s.id !== src.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(src: NewsSource) {
    setBusyId(src.id);
    try {
      const result = await testNewsSource(src.id);
      setPreviews((p) => ({
        ...p,
        [src.id]: { count: result.count, titles: result.preview.map((i) => i.title) }
      }));
    } catch (err) {
      setPreviews((p) => ({
        ...p,
        [src.id]: { count: 0, titles: [], error: err instanceof Error ? err.message : "Test failed" }
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd(kind: NewsSourceKind) {
    if (!newName.trim() || !newIdentifier.trim()) return;
    setAddError(null);
    try {
      const created = await createNewsSource({
        kind,
        name: newName.trim(),
        identifier: newIdentifier.trim()
      });
      setSources((prev) => [...(prev ?? []), created]);
      setNewName("");
      setNewIdentifier("");
      setAddingKind(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Add failed");
    }
  }

  if (sources === null) {
    return (
      <IslandCard style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading sources…</p>
      </IslandCard>
    );
  }

  const byKind: Record<NewsSourceKind, NewsSource[]> = { rss: [], reddit: [], youtube: [], gnews: [] };
  for (const s of sources) byKind[s.kind].push(s);

  return (
    <IslandCard style={{ padding: "16px 18px", display: "grid", gap: 16 }}>
      <SubsectionTitle>Sources</SubsectionTitle>

      {/* Service readiness chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {services.map((svc) => {
          const meta = KIND_META[svc.kind];
          return (
            <div
              key={svc.kind}
              title={svc.blocker ?? "Ready"}
              className="island-mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: svc.ready
                  ? "rgba(34, 197, 94, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
                color: svc.ready ? islandTheme.color.successSoft : islandTheme.color.dangerSoft,
                border: `1px solid ${svc.ready ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                fontSize: 12,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontWeight: 700
              }}
            >
              <span aria-hidden="true">{meta.icon}</span>
              <span>{meta.label}</span>
              <span style={{ opacity: 0.7 }}>·</span>
              <span>{svc.ready ? "Ready" : "Configure key"}</span>
            </div>
          );
        })}
      </div>

      {KIND_ORDER.map((kind) => {
        const meta = KIND_META[kind];
        const rows = byKind[kind];
        const enabledCount = rows.filter((r) => r.enabled).length;
        return (
          <div key={kind} style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {meta.icon} {meta.label}
              </span>
              <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, letterSpacing: "0.06em" }}>
                {enabledCount} / {rows.length} enabled
              </span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => {
                  if (addingKind === kind) {
                    setAddingKind(null);
                  } else {
                    setAddingKind(kind);
                    setNewName("");
                    setNewIdentifier("");
                    setAddError(null);
                  }
                }}
                className="island-mono"
                style={{
                  background: "transparent",
                  border: `1px solid ${accent}`,
                  color: accent,
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  font: "inherit"
                }}
              >
                {addingKind === kind ? "Cancel" : "+ Add custom"}
              </button>
            </div>

            {addingKind === kind && (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 12,
                  border: `1px dashed ${accent}`,
                  borderRadius: 8,
                  background: `${accent}08`
                }}
              >
                <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                  {meta.hint}
                </div>
                <input
                  type="text"
                  placeholder="Display name (e.g. PC Gamer)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ ...islandInputStyle }}
                />
                <input
                  type="text"
                  placeholder={
                    kind === "rss" ? "https://example.com/feed.xml"
                      : kind === "reddit" ? "subredditname"
                        : kind === "youtube" ? "UCxxxxxxxxxxxxxxxxxxxxxx"
                          : "search query"
                  }
                  value={newIdentifier}
                  onChange={(e) => setNewIdentifier(e.target.value)}
                  style={{ ...islandInputStyle }}
                />
                {addError && (
                  <div style={{ fontSize: 12, color: islandTheme.color.dangerAccent }}>{addError}</div>
                )}
                <div>
                  <IslandButton
                    variant="primary"
                    onClick={() => void handleAdd(kind)}
                    disabled={!newName.trim() || !newIdentifier.trim()}
                  >
                    Add
                  </IslandButton>
                </div>
              </div>
            )}

            {rows.length === 0 && (
              <div style={{ fontSize: 12, color: islandTheme.color.textMuted, padding: "4px 0" }}>
                No sources yet for this provider.
              </div>
            )}
            {rows.map((src) => {
              const preview = previews[src.id];
              return (
                <div
                  key={src.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${src.enabled ? `${accent}55` : islandTheme.color.cardBorder}`,
                    background: src.enabled ? `${accent}10` : islandTheme.color.panelMutedBg,
                    opacity: busyId === src.id ? 0.6 : 1
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void toggleEnabled(src)}
                    disabled={busyId === src.id}
                    title={src.enabled ? "Disable" : "Enable"}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `2px solid ${src.enabled ? accent : islandTheme.color.cardBorder}`,
                      background: src.enabled ? accent : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "#0f172a",
                      padding: 0
                    }}
                  >
                    {src.enabled ? "✓" : ""}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{src.name}</span>
                      {src.is_preset && (
                        <span className="island-mono" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 999, background: islandTheme.color.panelBg, color: islandTheme.color.textMuted, border: `1px solid ${islandTheme.color.cardBorder}`, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          preset
                        </span>
                      )}
                      {src.last_error && (
                        <span className="island-mono" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 999, background: "rgba(239, 68, 68, 0.15)", color: islandTheme.color.dangerSoft, border: "1px solid rgba(239, 68, 68, 0.4)", letterSpacing: "0.06em", textTransform: "uppercase" }} title={src.last_error}>
                          error
                        </span>
                      )}
                    </div>
                    <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {src.identifier}
                      {src.last_fetched_at && ` · fetched ${new Date(src.last_fetched_at).toLocaleString()}`}
                    </div>
                    {(src.items_fetched_total ?? 0) > 0 ? (
                      <div style={{ fontSize: 11, color: islandTheme.color.textSubtle, marginTop: 2 }}>
                        Yield: {src.items_curated_total ?? 0}/{src.items_fetched_total} curated
                        {(src.validation_fail_total ?? 0) > 0
                          ? ` · ${src.validation_fail_total} validation fail`
                          : ""}
                        {(src.fail_streak ?? 0) > 0 ? ` · ${src.fail_streak} fail streak` : ""}
                      </div>
                    ) : null}
                    {preview && (
                      <div style={{ marginTop: 6, padding: 6, borderRadius: 4, background: islandTheme.color.panelBg, fontSize: 12, color: islandTheme.color.textSubtle }}>
                        {preview.error ? (
                          <span style={{ color: islandTheme.color.dangerAccent }}>✗ {preview.error}</span>
                        ) : (
                          <>
                            <span style={{ color: islandTheme.color.successAccent }}>✓ {preview.count} item{preview.count === 1 ? "" : "s"}</span>
                            {preview.titles.slice(0, 3).map((t, i) => (
                              <div key={i} style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {t}</div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => void handleTest(src)}
                      disabled={busyId === src.id}
                      className="island-mono"
                      style={{ background: "transparent", border: `1px solid ${islandTheme.color.cardBorder}`, color: islandTheme.color.textSubtle, padding: "3px 8px", borderRadius: 4, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", font: "inherit" }}
                    >
                      Test
                    </button>
                    {!src.is_preset && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(src)}
                        disabled={busyId === src.id}
                        className="island-mono"
                        style={{ background: "transparent", border: `1px solid ${islandTheme.color.dangerAccent}`, color: islandTheme.color.dangerAccent, padding: "3px 8px", borderRadius: 4, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", font: "inherit" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </IslandCard>
  );
}

// ── Patch Sources page ───────────────────────────────────────────────────────

export function PatchSourcesAdminPage() {
  const [candidates, setCandidates] = useState<PatchSourceCandidate[]>([]);
  const [sourcesByApp, setSourcesByApp] = useState<Map<number, PatchSourceRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openAddFor, setOpenAddFor] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [cand, groups] = await Promise.all([getPatchSourceCandidates(), getPatchSources()]);
      setCandidates(cand);
      const map = new Map<number, PatchSourceRow[]>();
      for (const g of groups) map.set(g.appId, g.sources);
      setSourcesByApp(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patch sources");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, search]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Extra patch sources (escape hatch)</SubsectionTitle>
        <p style={{ fontSize: 13, color: islandTheme.color.textSubtle, margin: "0 0 12px 0", lineHeight: 1.5 }}>
          Steam Community Announcements are pulled automatically for every game in the crew library — that
          covers ~95% of patch coverage. Use this section only for games <em>not</em> on Steam (League, Diablo
          IV via battle.net, Riot launcher titles) or for fan-curated feeds when official patch notes aren't on Steam.
        </p>
        <div
          style={{
            background: islandTheme.color.panelMutedBg,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            color: islandTheme.color.textSubtle,
            lineHeight: 1.6,
            marginBottom: 12
          }}
        >
          <div style={{ fontWeight: 700, color: islandTheme.color.textPrimary, marginBottom: 4 }}>Common patterns</div>
          <div>
            Subreddit: <code className="island-mono">https://www.reddit.com/r/&lt;subreddit&gt;/.rss</code>
          </div>
          <div>Official feeds: most publishers expose <code className="island-mono">/news/rss</code>, <code className="island-mono">/feed</code>, or <code className="island-mono">/atom.xml</code></div>
          <div>
            GitHub releases: <code className="island-mono">https://github.com/&lt;org&gt;/&lt;repo&gt;/releases.atom</code>
          </div>
        </div>
        <input
          type="search"
          placeholder="Filter games…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...islandInputStyle, width: "100%" }}
        />
      </IslandCard>

      {error ? (
        <IslandCard style={{ padding: 12, borderColor: islandTheme.color.danger }}>
          <span style={{ color: islandTheme.color.dangerText, fontSize: 13 }}>{error}</span>
        </IslandCard>
      ) : null}

      {loading ? (
        <IslandCard style={{ padding: 16 }}>
          <span style={{ color: islandTheme.color.textMuted, fontSize: 13 }}>Loading top 50 crew games…</span>
        </IslandCard>
      ) : filtered.length === 0 ? (
        <IslandCard style={{ padding: 16 }}>
          <span style={{ color: islandTheme.color.textMuted, fontSize: 13 }}>
            {candidates.length === 0
              ? "No crew-owned games yet. Sync a Steam library first."
              : "No games match that filter."}
          </span>
        </IslandCard>
      ) : (
        filtered.map((cand) => (
          <PatchSourceGameCard
            key={cand.appId}
            candidate={cand}
            sources={sourcesByApp.get(cand.appId) ?? []}
            isAddOpen={openAddFor === cand.appId}
            onOpenAdd={() => setOpenAddFor(cand.appId)}
            onCloseAdd={() => setOpenAddFor(null)}
            onChanged={refresh}
          />
        ))
      )}
    </div>
  );
}

function PatchSourceGameCard({
  candidate,
  sources,
  isAddOpen,
  onOpenAdd,
  onCloseAdd,
  onChanged
}: {
  candidate: PatchSourceCandidate;
  sources: PatchSourceRow[];
  isAddOpen: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onChanged: () => void;
}) {
  return (
    <IslandCard style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        {candidate.headerImageUrl ? (
          <div
            role="img"
            aria-label={candidate.name}
            style={{
              width: 80,
              height: 38,
              borderRadius: 6,
              background: `center / cover no-repeat url(${JSON.stringify(candidate.headerImageUrl)})`,
              flexShrink: 0
            }}
          />
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{candidate.name}</div>
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            {candidate.owners} owner{candidate.owners === 1 ? "" : "s"} · {sources.length} source
            {sources.length === 1 ? "" : "s"}
          </div>
        </div>
        {!isAddOpen ? (
          <button type="button" className="island-btn" style={smallBtn(islandTheme.color.primary, islandTheme.color.primaryText)} onClick={onOpenAdd}>
            + Source
          </button>
        ) : null}
      </div>

      {sources.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          {sources.map((src) => (
            <PatchSourceRowEditor key={src.id} row={src} onChanged={onChanged} />
          ))}
        </div>
      ) : null}

      {isAddOpen ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${islandTheme.color.cardBorder}` }}>
          <PatchSourceAddForm
            appId={candidate.appId}
            onCancel={onCloseAdd}
            onSaved={() => {
              onCloseAdd();
              onChanged();
            }}
          />
        </div>
      ) : null}
    </IslandCard>
  );
}

function PatchSourceRowEditor({ row, onChanged }: { row: PatchSourceRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(row.sourceUrl);
  const [label, setLabel] = useState(row.label ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const result = await updatePatchSource(row.id, {
      sourceUrl,
      label: label.trim() ? label.trim() : null
    });
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function toggleEnabled() {
    setBusy(true);
    setMsg(null);
    const result = await updatePatchSource(row.id, { enabled: !row.enabled });
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`Delete this source? ${row.label ?? row.sourceUrl}`)) return;
    setBusy(true);
    await deletePatchSource(row.id);
    setBusy(false);
    onChanged();
  }

  return (
    <div
      style={{
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: 8,
        padding: 10,
        opacity: row.enabled ? 1 : 0.55
      }}
    >
      {editing ? (
        <div style={{ display: "grid", gap: 6 }}>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            style={{ ...islandInputStyle, width: "100%" }}
          />
          <input
            type="text"
            placeholder="Label (e.g. r/leagueoflegends)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ ...islandInputStyle, width: "100%" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="island-btn" disabled={busy} style={smallBtn(islandTheme.color.primary, islandTheme.color.primaryText)} onClick={save}>
              Save
            </button>
            <button type="button" className="island-btn" disabled={busy} style={smallBtn("transparent", islandTheme.color.textMuted, true)} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {msg ? <span style={{ fontSize: 12, color: islandTheme.color.dangerText }}>{msg}</span> : null}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              {row.label ?? row.sourceUrl}
              <span
                className="island-mono"
                style={{ marginLeft: 8, fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase" }}
              >
                {row.sourceType}
              </span>
            </div>
            {row.label ? (
              <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.sourceUrl}
              </div>
            ) : null}
            {row.lastError ? (
              <div style={{ fontSize: 12, color: islandTheme.color.dangerText, marginTop: 4 }}>
                ⚠ {row.lastError}
              </div>
            ) : null}
            {row.fetchedAt ? (
              <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 2 }}>
                Last fetch: {new Date(row.fetchedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              className="island-btn"
              disabled={busy}
              style={smallBtn("transparent", row.enabled ? islandTheme.color.successAccent : islandTheme.color.textMuted, true)}
              onClick={toggleEnabled}
              title={row.enabled ? "Disable" : "Enable"}
            >
              {row.enabled ? "On" : "Off"}
            </button>
            <button type="button" className="island-btn" disabled={busy} style={smallBtn("transparent", islandTheme.color.textMuted, true)} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="island-btn" disabled={busy} style={smallBtn("transparent", islandTheme.color.dangerText, true, islandTheme.color.danger)} onClick={remove}>
              Delete
            </button>
          </div>
          {msg ? <span style={{ gridColumn: "1 / -1", fontSize: 12, color: islandTheme.color.dangerText }}>{msg}</span> : null}
        </div>
      )}
    </div>
  );
}

function PatchSourceAddForm({
  appId,
  onCancel,
  onSaved
}: {
  appId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [sourceType, setSourceType] = useState<"rss" | "atom">("rss");
  const [sourceUrl, setSourceUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<PatchSourceTestResult | null>(null);

  async function runTest() {
    if (!sourceUrl) return;
    setBusy(true);
    setError(null);
    setTestResult(null);
    const result = await testPatchSourceUrl(sourceUrl);
    setTestResult(result);
    setBusy(false);
  }

  async function save() {
    if (!sourceUrl) return;
    setBusy(true);
    setError(null);
    const result = await createPatchSource({
      appId,
      sourceType,
      sourceUrl,
      label: label.trim() ? label.trim() : null
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Field label="Type">
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as "rss" | "atom")}
          style={{ ...islandInputStyle, width: 120 }}
        >
          <option value="rss">RSS</option>
          <option value="atom">Atom</option>
        </select>
      </Field>
      <Field label="Feed URL">
        <input
          type="url"
          placeholder="https://www.reddit.com/r/leagueoflegends/.rss"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          style={{ ...islandInputStyle, width: "100%" }}
        />
      </Field>
      <Field label="Label (optional)">
        <input
          type="text"
          placeholder="r/leagueoflegends"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ ...islandInputStyle, width: "100%" }}
        />
      </Field>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="island-btn"
          disabled={busy || !sourceUrl}
          style={smallBtn("transparent", islandTheme.color.textMuted, true)}
          onClick={runTest}
        >
          Test
        </button>
        <button
          type="button"
          className="island-btn"
          disabled={busy || !sourceUrl}
          style={smallBtn(islandTheme.color.primary, islandTheme.color.primaryText)}
          onClick={save}
        >
          Save
        </button>
        <button
          type="button"
          className="island-btn"
          disabled={busy}
          style={smallBtn("transparent", islandTheme.color.textMuted, true)}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      {testResult ? (
        <div
          style={{
            fontSize: 12,
            color: testResult.ok ? islandTheme.color.successAccent : islandTheme.color.dangerText,
            padding: 8,
            background: islandTheme.color.panelMutedBg,
            borderRadius: 6,
            border: `1px solid ${islandTheme.color.cardBorder}`
          }}
        >
          {testResult.ok ? (
            <>
              <div>✓ Feed OK ({testResult.itemCount ?? 0} items)</div>
              {testResult.feedTitle ? <div>Feed: {testResult.feedTitle}</div> : null}
              {testResult.sample ? <div>Latest: {testResult.sample.title}</div> : null}
            </>
          ) : (
            <>✗ {testResult.error}</>
          )}
        </div>
      ) : null}
      {error ? <span style={{ fontSize: 12, color: islandTheme.color.dangerText }}>{error}</span> : null}
    </div>
  );
}

// ── Drift Log page ───────────────────────────────────────────────────────────

export function DriftLogAdminPage({
  newsCards,
  onCreateNewsCard,
  onUpdateNewsCard,
  onArchiveNewsCard
}: {
  newsCards: NewsCard[];
  onCreateNewsCard: (input: NewsCardInput) => void;
  onUpdateNewsCard: (id: string, input: Partial<NewsCardInput>) => void;
  onArchiveNewsCard: (id: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>New drift log card</SubsectionTitle>
        <p style={{ margin: "4px 0 12px", fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Posts here show up on the Home page Drift Log for the whole crew. Keep it short, in-island, and link the source if it's a patch note or article.
        </p>
        <NewsCardEditor
          mode="create"
          onSubmit={(input) => onCreateNewsCard(input)}
        />
      </IslandCard>

      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>
          Published cards · {newsCards.length}
        </SubsectionTitle>
        {newsCards.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "10px 16px 16px",
              fontSize: 13,
              color: islandTheme.color.textMuted
            }}
          >
            No drift log cards yet. Post the first one above.
          </p>
        ) : (
          newsCards.map((card, i) => (
            <NewsCardRow
              key={card.id}
              card={card}
              firstRow={i === 0}
              onUpdate={(input) => onUpdateNewsCard(card.id, input)}
              onArchive={() => onArchiveNewsCard(card.id)}
            />
          ))
        )}
      </IslandCard>
    </div>
  );
}

function NewsCardEditor({
  mode,
  initial,
  onSubmit,
  onCancel
}: {
  mode: "create" | "edit";
  initial?: { title: string; body: string; icon: string; tag: string | null; sourceUrl: string | null };
  onSubmit: (input: NewsCardInput) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "🌊");
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");

  const submit = () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) return;
    onSubmit({
      title: trimmedTitle,
      body: trimmedBody,
      icon: icon.trim() || "🌊",
      tag: tag.trim() ? tag.trim() : null,
      sourceUrl: sourceUrl.trim() ? sourceUrl.trim() : null
    });
    if (mode === "create") {
      setTitle("");
      setBody("");
      setIcon("🌊");
      setTag("");
      setSourceUrl("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 8 }}>
        <Field label="Icon">
          <input
            value={icon}
            maxLength={4}
            onChange={(e) => setIcon(e.target.value)}
            style={{ ...islandInputStyle, width: "100%", textAlign: "center", fontSize: 18 }}
          />
        </Field>
        <Field label="Headline">
          <input
            value={title}
            placeholder="Tide check: Stardew 1.6.9 lands"
            onChange={(e) => setTitle(e.target.value)}
            style={{ ...islandInputStyle, width: "100%" }}
          />
        </Field>
      </div>
      <Field label="Body">
        <textarea
          value={body}
          rows={3}
          placeholder="One short paragraph. Keep it island-flavored — what does the crew need to know?"
          onChange={(e) => setBody(e.target.value)}
          style={{ ...islandInputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>
      <div className="bi-admin-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Tag (optional)">
          <input
            value={tag}
            placeholder="patch · sale · cozy"
            onChange={(e) => setTag(e.target.value)}
            style={{ ...islandInputStyle, width: "100%" }}
          />
        </Field>
        <Field label="Source URL (optional)">
          <input
            value={sourceUrl}
            placeholder="https://"
            onChange={(e) => setSourceUrl(e.target.value)}
            style={{ ...islandInputStyle, width: "100%" }}
          />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <IslandButton variant="primary" onClick={submit}>
          {mode === "create" ? "Post to drift log" : "Save changes"}
        </IslandButton>
        {onCancel ? (
          <IslandButton variant="secondary" onClick={onCancel}>
            Cancel
          </IslandButton>
        ) : null}
      </div>
    </div>
  );
}

function NewsCardRow({
  card,
  firstRow,
  onUpdate,
  onArchive
}: {
  card: NewsCard;
  firstRow: boolean;
  onUpdate: (input: NewsCardInput) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
        display: "grid",
        gap: 8
      }}
    >
      {editing ? (
        <NewsCardEditor
          mode="edit"
          initial={{
            title: card.title,
            body: card.body,
            icon: card.icon,
            tag: card.tag,
            sourceUrl: card.sourceUrl
          }}
          onSubmit={(input) => {
            onUpdate(input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 12, alignItems: "start" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: islandTheme.color.panelMutedBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22
            }}
          >
            {card.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{card.title}</div>
            <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 4, lineHeight: 1.5, maxWidth: "68ch" }}>
              {card.body}
            </div>
            <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 6 }}>
              {card.tag ?? "drift log"} · posted {new Date(card.publishedAt).toLocaleDateString()}
              {card.createdBy ? ` · by ${card.createdBy.displayName}` : ""}
              {card.sourceUrl ? " · linked" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="island-btn" style={smallBtn(islandTheme.color.primary, islandTheme.color.primaryText)} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              style={smallBtn("transparent", islandTheme.color.dangerText, true, islandTheme.color.danger)}
              onClick={onArchive}
            >
              Archive
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
