import { memo, useEffect, useState } from "react";
import { Link } from "react-router";
import { apiFetch } from "../api/client.js";
import { IslandCard, IslandTag, SpecStrip, memberColor } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { GameCover } from "../steamArt.js";
import {
  capabilitySpecItems,
  clampPct,
  formatHours,
  formatNewsDate,
  formatPrice,
  memberInitials,
  metacriticColor,
  type GameDetail
} from "../lib/gameDetail.js";
import { pathForPlanNight } from "../lib/routes.js";
import type { ForumFeedThread } from "../types.js";

type GameLandingPageProps = {
  appId: number | null;
  onBack: () => void;
};

const CREW_TALK_LIMIT = 5;

async function fetchGameDetail(appId: number): Promise<GameDetail> {
  const res = await apiFetch(`/steam/game/${appId}`);
  if (!res.ok) throw new Error(`Game load failed (${res.status})`);
  const body = (await res.json().catch(() => null)) as GameDetail | null;
  if (!body) throw new Error("Game load failed (empty response)");
  return body;
}

async function fetchCrewTalk(appId: number): Promise<ForumFeedThread[]> {
  const res = await apiFetch(`/forums/threads?appId=${appId}&limit=${CREW_TALK_LIMIT}`);
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return Array.isArray(body?.threads) ? body.threads : [];
}

function GameLandingPageImpl({ appId, onBack }: GameLandingPageProps) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [crewTalk, setCrewTalk] = useState<ForumFeedThread[] | null>(null);

  useEffect(() => {
    if (appId === null) {
      setDetail(null);
      setErrored(false);
      return;
    }
    let active = true;
    setLoading(true);
    setErrored(false);
    setDetail(null);
    setCrewTalk(null);
    void (async () => {
      try {
        const body = await fetchGameDetail(appId);
        if (!active) return;
        setDetail(body);
      } catch {
        if (active) setErrored(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    void fetchCrewTalk(appId).then((threads) => {
      if (active) setCrewTalk(threads);
    });
    return () => {
      active = false;
    };
  }, [appId]);

  const backButton = (
    <button
      type="button"
      className="island-btn"
      onClick={onBack}
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
      ← Back to Library
    </button>
  );

  if (appId === null) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        {backButton}
        <IslandCard style={{ padding: 28, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>No game selected.</p>
        </IslandCard>
      </div>
    );
  }

  if (loading || (!detail && !errored)) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        {backButton}
        <IslandCard style={{ padding: "60px 12px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading game…</p>
        </IslandCard>
      </div>
    );
  }

  if (errored || !detail) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        {backButton}
        <IslandCard style={{ padding: "60px 12px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>
            Couldn't load this game right now. Try again in a bit.
          </p>
        </IslandCard>
      </div>
    );
  }

  const specItems = capabilitySpecItems(detail.store);
  const discount =
    typeof detail.store.priceDiscountPct === "number" && detail.store.priceDiscountPct > 0
      ? detail.store.priceDiscountPct
      : null;
  const heroUrl = detail.store.backgroundUrl ?? undefined;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {backButton}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <IslandCard style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 6",
            minHeight: 180,
            background: heroUrl
              ? `linear-gradient(180deg, rgba(4,10,20,0.15) 0%, rgba(4,10,20,0.92) 100%), url(${heroUrl})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        >
          {!heroUrl ? (
            <GameCover
              appId={detail.appId}
              storedUrl={detail.headerImageUrl}
              variant="hero"
              alt={detail.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              gap: 10,
              padding: 20,
              background: heroUrl ? undefined : "linear-gradient(180deg, rgba(4,10,20,0) 40%, rgba(4,10,20,0.88) 100%)"
            }}
          >
            <h1
              className="island-display"
              style={{ margin: 0, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
            >
              {detail.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: islandTheme.color.primaryGlow }}>
                {formatPrice(detail.store)}
              </span>
              {discount && typeof detail.store.priceInitialCents === "number" ? (
                <span className="island-mono" style={{ fontSize: 13, color: "#e2e8f0", textDecoration: "line-through" }}>
                  ${(detail.store.priceInitialCents / 100).toFixed(2)}
                </span>
              ) : null}
              {discount ? <IslandTag tone="success">-{discount}%</IslandTag> : null}
              {detail.store.releaseComingSoon ? <IslandTag color="#a78bfa">Coming soon</IslandTag> : null}
              {detail.store.releaseDateText ? (
                <span className="island-mono" style={{ fontSize: 12, color: "#e2e8f0" }}>
                  {detail.store.releaseDateText}
                </span>
              ) : null}
              {typeof detail.store.historicalLowCents === "number" ? (
                <span className="island-mono" style={{ fontSize: 12, color: "#e2e8f0" }}>
                  ⬇ Low ${(detail.store.historicalLowCents / 100).toFixed(2)}
                </span>
              ) : null}
              {detail.store.metacriticScore != null ? (
                <a
                  href={detail.store.metacriticUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Metacritic"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 9px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                    color: "#0b1220",
                    background: metacriticColor(detail.store.metacriticScore)
                  }}
                >
                  {detail.store.metacriticScore}
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>METACRITIC</span>
                </a>
              ) : null}
              {[
                detail.store.platformWindows ? "🪟" : null,
                detail.store.platformMac ? "🍎" : null,
                detail.store.platformLinux ? "🐧" : null
              ]
                .filter(Boolean)
                .map((icon) => (
                  <span key={icon} style={{ fontSize: 15 }}>
                    {icon}
                  </span>
                ))}
              {detail.store.controllerSupport ? (
                <span className="island-mono" style={{ fontSize: 11, color: "#e2e8f0" }} title={`Controller: ${detail.store.controllerSupport}`}>
                  🎮 {detail.store.controllerSupport === "full" ? "Full controller" : "Partial controller"}
                </span>
              ) : null}
            </div>
            {specItems.length > 0 ? (
              <div>
                <SpecStrip items={specItems} />
              </div>
            ) : null}
          </div>
        </div>
      </IslandCard>

      {/* ── CTA row ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          to={pathForPlanNight(detail.appId)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 14.5,
            fontWeight: 700,
            color: islandTheme.color.primaryText,
            textDecoration: "none",
            padding: "11px 20px",
            borderRadius: 999,
            background: islandTheme.color.primary
          }}
        >
          🌴 Plan a game night
        </Link>
        <a
          href={`https://store.steampowered.com/app/${detail.appId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="island-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 12,
            fontWeight: 700,
            color: islandTheme.color.textSubtle,
            textDecoration: "none",
            padding: "9px 16px",
            borderRadius: 999,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            background: "transparent"
          }}
        >
          View on Steam ↗
        </a>
      </div>

      {/* ── Description + screenshots ───────────────────────────────────── */}
      {detail.store.shortDescription || detail.store.screenshots.length > 0 ? (
        <IslandCard style={{ display: "grid", gap: 12 }}>
          {detail.store.shortDescription ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: islandTheme.color.textSecondary }}>
              {detail.store.shortDescription}
            </p>
          ) : null}
          {detail.store.screenshots.length > 0 ? (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
              {detail.store.screenshots.map((shot) => (
                <a key={shot.thumb} href={shot.full} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                  <img
                    src={shot.thumb}
                    alt="Screenshot"
                    loading="lazy"
                    style={{ height: 130, borderRadius: 8, border: `1px solid ${islandTheme.color.cardBorder}`, display: "block" }}
                  />
                </a>
              ))}
            </div>
          ) : null}
        </IslandCard>
      ) : null}

      {/* ── Crew ─────────────────────────────────────────────────────────── */}
      <IslandCard style={{ display: "grid", gap: 16 }}>
        <SectionTitle>Crew</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <SubLabel>Owners</SubLabel>
            {detail.owners.length === 0 ? (
              <EmptyNote text="No crew members own this one yet." />
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {detail.owners.map((owner) => (
                  <div
                    key={owner.discordUserId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      borderRadius: 8,
                      background: islandTheme.color.panelMutedBg,
                      border: `1px solid ${islandTheme.color.border}`
                    }}
                  >
                    {owner.avatarUrl ? (
                      <img
                        src={owner.avatarUrl}
                        alt={owner.displayName}
                        width={26}
                        height={26}
                        style={{ borderRadius: 999, flexShrink: 0, objectFit: "cover" }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 999,
                          flexShrink: 0,
                          background: memberColor(owner.discordUserId || owner.displayName),
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          color: islandTheme.color.textDark,
                          fontSize: 12
                        }}
                      >
                        {memberInitials(owner.displayName)}
                      </span>
                    )}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        fontWeight: 600,
                        color: islandTheme.color.textSecondary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {owner.displayName}
                    </span>
                    <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, flexShrink: 0, textAlign: "right" }}>
                      {formatHours(owner.playtimeForever)}
                      {owner.playtime2Weeks > 0 ? ` · ${formatHours(owner.playtime2Weeks)}/2wk` : ""}
                      {owner.lastPlayedAt ? (
                        <>
                          <br />
                          last played {formatNewsDate(owner.lastPlayedAt)}
                        </>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <SubLabel>Wishlisted by ({detail.wishlistedBy.length})</SubLabel>
            {detail.wishlistedBy.length === 0 ? (
              <EmptyNote text="Nobody's got this on their wishlist yet." />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {detail.wishlistedBy.map((w) => (
                  <span
                    key={w.discordUserId}
                    title={w.displayName}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px 4px 4px",
                      borderRadius: 999,
                      background: islandTheme.color.panelMutedBg,
                      border: `1px solid ${islandTheme.color.border}`,
                      fontSize: 12,
                      fontWeight: 600,
                      color: islandTheme.color.textSecondary
                    }}
                  >
                    {w.avatarUrl ? (
                      <img src={w.avatarUrl} alt="" width={20} height={20} style={{ borderRadius: 999, objectFit: "cover" }} />
                    ) : (
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: memberColor(w.discordUserId || w.displayName),
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          color: islandTheme.color.textDark,
                          fontSize: 9
                        }}
                      >
                        {memberInitials(w.displayName)}
                      </span>
                    )}
                    {w.displayName}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {detail.achievements.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <SubLabel>Achievement progress</SubLabel>
            <div style={{ display: "grid", gap: 8 }}>
              {detail.achievements.map((ach, i) => {
                const pct = clampPct(ach.completionPct);
                const maxed = ach.total > 0 && pct >= 100;
                return (
                  <div key={`${ach.displayName}-${i}`} style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: islandTheme.color.textSecondary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {ach.displayName}
                        {maxed ? " ✓" : ""}
                      </span>
                      <span
                        className="island-mono"
                        style={{ flexShrink: 0, fontSize: 12, color: maxed ? islandTheme.color.successAccent : islandTheme.color.textMuted }}
                      >
                        {ach.unlocked}/{ach.total} · {pct}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        background: islandTheme.color.panelMutedBg,
                        border: `1px solid ${islandTheme.color.cardBorder}`,
                        overflow: "hidden"
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 999,
                          background: maxed
                            ? "linear-gradient(90deg, #16a34a, #4ade80)"
                            : "linear-gradient(90deg, #0369a1, #38bdf8)",
                          transition: "width 600ms ease"
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </IslandCard>

      {/* ── Rarest achievements ──────────────────────────────────────────── */}
      {detail.achievementCatalogue.length > 0 ? (
        <IslandCard style={{ display: "grid", gap: 10 }}>
          <SectionTitle>Rarest achievements</SectionTitle>
          <div style={{ display: "grid", gap: 6 }}>
            {detail.achievementCatalogue.map((ach, i) => (
              <div
                key={`${ach.displayName}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: islandTheme.color.panelMutedBg,
                  border: `1px solid ${islandTheme.color.border}`
                }}
              >
                {ach.iconUrl ? (
                  <img src={ach.iconUrl} alt="" width={28} height={28} loading="lazy" style={{ borderRadius: 6, flexShrink: 0 }} />
                ) : null}
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: islandTheme.color.textSecondary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                  title={ach.description ?? undefined}
                >
                  {ach.displayName ?? "Achievement"}
                </span>
                {typeof ach.globalUnlockPct === "number" ? (
                  <span className="island-mono" style={{ flexShrink: 0, fontSize: 12, color: islandTheme.color.textMuted }}>
                    {ach.globalUnlockPct < 10 ? ach.globalUnlockPct.toFixed(1) : Math.round(ach.globalUnlockPct)}%
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </IslandCard>
      ) : null}

      {/* ── Patch notes ──────────────────────────────────────────────────── */}
      {detail.news.length > 0 ? (
        <IslandCard style={{ display: "grid", gap: 10 }}>
          <SectionTitle>Recent patch notes</SectionTitle>
          <div style={{ display: "grid", gap: 6 }}>
            {detail.news.map((item, i) => (
              <a
                key={`${item.url}-${i}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "grid",
                  gap: 3,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: islandTheme.color.panelMutedBg,
                  border: `1px solid ${islandTheme.color.border}`,
                  textDecoration: "none"
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: islandTheme.color.primaryGlow, lineHeight: 1.35 }}>
                  {item.title}
                </span>
                {item.aiSummary ? (
                  <span style={{ fontSize: 12, lineHeight: 1.45, color: islandTheme.color.textSecondary }}>{item.aiSummary}</span>
                ) : null}
                <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
                  {formatNewsDate(item.publishedAt)}
                </span>
              </a>
            ))}
          </div>
        </IslandCard>
      ) : null}

      {/* ── Crew talk ────────────────────────────────────────────────────── */}
      <IslandCard style={{ display: "grid", gap: 10 }}>
        <SectionTitle>Crew talk</SectionTitle>
        {crewTalk === null ? (
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading…</p>
        ) : crewTalk.length === 0 ? (
          <EmptyNote text="No threads about this game yet." />
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {crewTalk.map((t) => (
              <Link
                key={t.id}
                to={`/forums/thread/${t.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: islandTheme.color.panelMutedBg,
                  border: `1px solid ${islandTheme.color.border}`,
                  textDecoration: "none",
                  color: islandTheme.color.textPrimary
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {t.title}
                </span>
                <span className="island-mono" style={{ flexShrink: 0, fontSize: 11, color: islandTheme.color.textMuted }}>
                  {t.replyCount} repl{t.replyCount === 1 ? "y" : "ies"}
                </span>
              </Link>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Link
            to={`/forums?game=${detail.appId}`}
            className="island-mono"
            style={{ fontSize: 12, fontWeight: 700, color: islandTheme.color.primaryGlow, textDecoration: "none" }}
          >
            See all →
          </Link>
          <Link
            to={`/forums/compose/general?game=${detail.appId}`}
            className="island-mono"
            style={{ fontSize: 12, fontWeight: 700, color: islandTheme.color.primaryGlow, textDecoration: "none" }}
          >
            Start a thread →
          </Link>
        </div>
      </IslandCard>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="island-mono"
      style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}
    >
      {children}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="island-mono"
      style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: islandTheme.color.textSubtle }}
    >
      {children}
    </span>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ fontSize: 13, color: islandTheme.color.textMuted, padding: "2px 0" }}>{text}</div>;
}

const GameLandingPage = memo(GameLandingPageImpl);
export default GameLandingPage;
