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
  BannerToggle,
  Field,
  InlineSettings,
  SectionLabel,
  smallBtn,
  SubsectionTitle
} from "./adminUi.js";
import { ADMIN_PAGES, inlineSettingKeysFor } from "./adminNav.js";

// Accent comes from the nav registry — one source for sidebar, search, and page chrome.
const ACCENT = ADMIN_PAGES["news"].accent;

export type RecurateProgressSnap = {
  state: "running" | "done" | "error";
  reset: number;
  curated: number;
  processed: number;
  merged: number;
  duplicates: number;
  failed: number;
  costUsd: number;
  total: number;
  error: string | null;
};

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
  onIngest: () => Promise<{ ok: boolean; fetched?: number; curated?: number; error?: string }>;
  onCurate: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
  onRecurate: (
    onProgress?: (snap: RecurateProgressSnap) => void
  ) => Promise<{ ok: boolean; reset?: number; curated?: number; error?: string }>;
  onCancelRecurate: () => Promise<{ ok: boolean; error?: string }>;
  onEmbedBackfill: (
    limit?: number
  ) => Promise<{ ok: boolean; embedded?: number; remaining?: number; error?: string }>;
  onFetchRecurateStatus: () => Promise<{
    state: "idle" | "running" | "done" | "error";
    reset: number;
    curated: number;
    processed?: number;
    merged?: number;
    duplicates?: number;
    failed?: number;
    costUsd?: number;
    total: number;
    error: string | null;
  } | null>;
  onCurateGameNews: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
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
    <div style={{ display: "grid", gap: 16 }}>
      <AdminStatusBanner
        id="news-status"
        accent={ACCENT}
        icon="🌐"
        kicker="External News Feed"
        title={generalEnabled ? "External news feed active" : "External news feed disabled"}
        subtitle="Sources, keys, and pipeline controls below"
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

      <div id="news-sources">
        <NewsSourceRegistryPanel accent={ACCENT} />
      </div>

      {/* API keys */}
      <IslandCard id="news-keys" style={{ padding: "16px 18px", display: "grid", gap: 16 }}>
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
      </IslandCard>

      {/* Developer Diversity Cap */}
      <IslandCard id="news-dev-cap" style={{ padding: "16px 18px" }}>
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

      <div id="news-triggers">
        <ManualTriggersCard {...props} />
      </div>

      <div id="news-validation" style={{ display: "grid", gap: 12 }}>
        <SectionLabel title="AI Validation Failures" />
        <ValidationFailuresStats />
      </div>

      <InlineSettings
        keys={inlineSettingKeysFor("news")}
        settings={settings}
        onSave={onUpdate}
        title="More settings"
      />
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
  onFetchRecurateStatus,
  onCurateGameNews
}: NewsPageProps) {
  const [ingestState, setIngestState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [ingestMsg, setIngestMsg] = useState("");
  const [curateState, setCurateState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [curateMsg, setCurateMsg] = useState("");
  const [gameCurateState, setGameCurateState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [gameCurateMsg, setGameCurateMsg] = useState("");
  const [recurateState, setRecurateState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [recurateMsg, setRecurateMsg] = useState("");
  const [recurateProgress, setRecurateProgress] = useState<{
    processed: number;
    curated: number;
    merged: number;
    duplicates: number;
    failed: number;
    costUsd: number;
    total: number;
  } | null>(null);

  function progressMsg(processed: number, total: number, costUsd: number): string {
    const costStr = costUsd > 0 ? ` · est. $${costUsd.toFixed(3)} spent` : "";
    if (total <= 0) return `Regenerating… ${processed} processed${costStr}`;
    const pct = Math.min(100, Math.round((processed / total) * 100));
    return `Regenerating… ${processed} / ${total} (${pct}%)${costStr}`;
  }

  function doneMsg(p: { curated: number; merged: number; duplicates: number; failed: number; costUsd: number; total: number }): string {
    const costStr = p.costUsd > 0 ? ` — est. $${p.costUsd.toFixed(3)} total spend` : "";
    return (
      `Done — ${p.total} articles processed: ` +
      `${p.curated} new cards, ` +
      `${p.merged} merged into existing cards, ` +
      `${p.duplicates} dropped as duplicates` +
      (p.failed > 0 ? `, ${p.failed} validation-failed` : "") +
      costStr
    );
  }

  function handleRecurateSnap(snap: RecurateProgressSnap) {
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
      setRecurateMsg(progressMsg(snap.processed, snap.total, snap.costUsd));
    } else if (snap.state === "done") {
      setRecurateState("done");
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
      setRecurateMsg(progressMsg(job.processed ?? 0, job.total, job.costUsd ?? 0));

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

  const statusColor = (state: "idle" | "running" | "done" | "error") =>
    state === "error"
      ? islandTheme.color.dangerAccent
      : state === "done"
        ? islandTheme.color.successAccent
        : islandTheme.color.textSubtle;

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
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="secondary"
            onClick={async () => {
              setIngestState("running");
              setIngestMsg("Fetching feeds and running AI curation — may take up to a minute…");
              const result = await onIngest();
              if (result.ok) {
                setIngestState("done");
                setIngestMsg(
                  `Fetched ${result.fetched ?? 0} new · curated ${result.curated ?? 0}` +
                    (result.fetched === 0 ? " (no new articles since last run)" : "")
                );
                setTimeout(() => setIngestState("idle"), 8000);
              } else {
                setIngestState("error");
                setIngestMsg(result.error ?? "Ingestion failed");
                setTimeout(() => setIngestState("idle"), 20000);
              }
            }}
            disabled={ingestState === "running"}
          >
            {ingestState === "running" ? "Fetching…" : "Fetch & Curate"}
          </IslandButton>
          {ingestMsg && (
            <span role="status" aria-live="polite" style={{ fontSize: 12, color: statusColor(ingestState) }}>
              {ingestMsg}
            </span>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Curate Existing Articles</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Re-run AI scoring and summaries on articles that haven't been curated yet. Processes one batch (up to 25 articles) per run.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="secondary"
            onClick={async () => {
              setCurateState("running");
              setCurateMsg("Running AI curation pass…");
              const result = await onCurate();
              if (result.ok) {
                setCurateState("done");
                setCurateMsg(
                  result.curated && result.curated > 0
                    ? `Curated ${result.curated} article${result.curated === 1 ? "" : "s"}`
                    : "No un-curated articles to process"
                );
                setTimeout(() => setCurateState("idle"), 8000);
              } else {
                setCurateState("error");
                setCurateMsg(result.error ?? "Curation failed");
                setTimeout(() => setCurateState("idle"), 20000);
              }
            }}
            disabled={curateState === "running"}
          >
            {curateState === "running" ? "Curating…" : "Curate Articles"}
          </IslandButton>
          {curateMsg && (
            <span role="status" aria-live="polite" style={{ fontSize: 12, color: statusColor(curateState) }}>
              {curateMsg}
            </span>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Re-curate Game News</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Re-score and summarize un-curated Steam game news using the active AI provider. Runs automatically on the next news fetch — use this to force an immediate pass.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="secondary"
            onClick={async () => {
              setGameCurateState("running");
              setGameCurateMsg("Running AI curation pass…");
              const result = await onCurateGameNews();
              if (result.ok) {
                setGameCurateState("done");
                setGameCurateMsg(
                  result.curated && result.curated > 0
                    ? `Curated ${result.curated} article${result.curated === 1 ? "" : "s"}`
                    : "No un-curated articles to process"
                );
                setTimeout(() => setGameCurateState("idle"), 8000);
              } else {
                setGameCurateState("error");
                setGameCurateMsg(result.error ?? "Curation failed");
                setTimeout(() => setGameCurateState("idle"), 20000);
              }
            }}
            disabled={gameCurateState === "running"}
          >
            {gameCurateState === "running" ? "Curating…" : "Re-curate Game News"}
          </IslandButton>
          {gameCurateMsg && (
            <span role="status" aria-live="polite" style={{ fontSize: 12, color: statusColor(gameCurateState) }}>
              {gameCurateMsg}
            </span>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Regenerate All Summaries</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Reset curation on all articles and re-run AI with the updated prompt. Use after prompt changes to get longer, richer summaries. Runs in the background — safe to leave the page; progress will resume when you return.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <IslandButton
            variant="danger"
            onClick={async () => {
              setRecurateState("running");
              setRecurateProgress(null);
              setRecurateMsg("Starting…");
              const result = await onRecurate(handleRecurateSnap);
              if (!result.ok) {
                setRecurateState("error");
                setRecurateMsg(result.error ?? "Recurate failed");
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
          {recurateState === "running" && (
            <IslandButton
              variant="secondary"
              onClick={async () => {
                const result = await onCancelRecurate();
                if (!result.ok) {
                  setRecurateMsg(`Cancel failed: ${result.error ?? "unknown"}`);
                } else {
                  setRecurateMsg("Cancel requested — stopping after current pass…");
                }
              }}
            >
              Cancel
            </IslandButton>
          )}
          {recurateMsg && (
            <span role="status" aria-live="polite" style={{ fontSize: 12, color: statusColor(recurateState) }}>
              {recurateMsg}
            </span>
          )}
        </div>
        {recurateState === "running" && recurateProgress && recurateProgress.total > 0 && (
          <div
            style={{
              marginTop: 8,
              height: 4,
              borderRadius: 2,
              background: islandTheme.color.panelMutedBg,
              overflow: "hidden",
              maxWidth: 320
            }}
            aria-hidden="true"
          >
            <div
              style={{
                width: `${Math.min(100, Math.round((recurateProgress.processed / recurateProgress.total) * 100))}%`,
                height: "100%",
                background: islandTheme.color.dangerAccent,
                transition: "width 400ms ease"
              }}
            />
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Embedding Backfill</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          Generate semantic vectors (OpenAI text-embedding-3-small) for every article missing one. Required for deterministic cosine-similarity clustering. Processes up to 200 rows per click — re-click until "Done — 0 remaining". Costs roughly $0.02 per 1000 articles.
        </div>
        <EmbedBackfillButton onEmbedBackfill={onEmbedBackfill} />
      </div>
    </IslandCard>
  );
}

function EmbedBackfillButton({
  onEmbedBackfill
}: {
  onEmbedBackfill: (
    limit?: number
  ) => Promise<{ ok: boolean; embedded?: number; remaining?: number; error?: string }>;
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <IslandButton
        variant="secondary"
        disabled={state === "running"}
        onClick={async () => {
          setState("running");
          let totalEmbedded = 0;
          // Loop until the server reports 0 remaining. Server caps each call at
          // 500 rows for HTTP-request bounding; 50 iterations covers ~25K rows
          // which is well past anything we'll realistically hold.
          for (let i = 0; i < 50; i++) {
            setMsg(`Embedding batch ${i + 1}… (${totalEmbedded} embedded so far)`);
            const result = await onEmbedBackfill(500);
            if (!result.ok) {
              setState("error");
              setMsg(result.error ?? "Backfill failed");
              return;
            }
            totalEmbedded += result.embedded ?? 0;
            const remaining = result.remaining ?? 0;
            if (remaining === 0 || (result.embedded ?? 0) === 0) {
              setState("done");
              setMsg(`Done — ${totalEmbedded} embedded, ${remaining} remaining.`);
              setTimeout(() => setState("idle"), 15000);
              return;
            }
          }
          setState("done");
          setMsg(`Stopped at iteration cap — ${totalEmbedded} embedded. Click again to continue.`);
          setTimeout(() => setState("idle"), 15000);
        }}
      >
        {state === "running" ? "Embedding…" : "Embed Missing Articles"}
      </IslandButton>
      {msg && (
        <span
          role="status"
          aria-live="polite"
          style={{
            fontSize: 12,
            color:
              state === "error"
                ? islandTheme.color.dangerAccent
                : state === "done"
                  ? islandTheme.color.successAccent
                  : islandTheme.color.textSubtle
          }}
        >
          {msg}
        </span>
      )}
    </div>
  );
}

// ── Validation failures ──────────────────────────────────────────────────────

type ValidationFailureRow = {
  id: number;
  title: string;
  sourceName: string;
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
        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: islandTheme.color.textMuted, fontWeight: 600 }}>
            Recent failures ({data.recent.length})
          </summary>
          <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {data.recent.map((row) => (
              <li key={row.id}>
                <span style={{ color: islandTheme.color.textPrimary }}>{row.title}</span>{" "}
                <span style={{ color: islandTheme.color.textMuted }}>
                  · {row.sourceName} · {row.errors.join(", ") || "?"} · {row.retryCount} retr{row.retryCount === 1 ? "y" : "ies"}
                </span>
              </li>
            ))}
          </ul>
        </details>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
