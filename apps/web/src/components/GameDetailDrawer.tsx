import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { IslandTag, memberColor } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { GameCover } from "../steamArt.js";

type GameStore = {
  isSinglePlayer: boolean;
  isOnlineCoop: boolean;
  isLanCoop: boolean;
  isSharedSplitCoop: boolean;
  isOnlinePvp: boolean;
  isMmo: boolean;
  mpMaxPlayersApprox: number | null;
  priceInitialCents: number | null;
  priceFinalCents: number | null;
  priceDiscountPct: number | null;
  isFree: boolean;
  releaseComingSoon: boolean;
  releaseDateText: string | null;
  shortDescription: string | null;
  screenshots: Array<{ thumb: string; full: string }>;
  metacriticScore: number | null;
  metacriticUrl: string | null;
  platformWindows: boolean | null;
  platformMac: boolean | null;
  platformLinux: boolean | null;
  controllerSupport: string | null;
  historicalLowCents: number | null;
};

type CatalogueAchievement = {
  displayName: string | null;
  description: string | null;
  iconUrl: string | null;
  globalUnlockPct: number | null;
};

type GameOwner = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  playtimeForever: number;
  playtime2Weeks: number;
};

type GameAchievement = {
  displayName: string;
  unlocked: number;
  total: number;
  completionPct: number;
};

type GameNews = {
  title: string;
  url: string;
  publishedAt: string;
};

type GameDetail = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  store: GameStore;
  achievementCatalogue: CatalogueAchievement[];
  owners: GameOwner[];
  achievements: GameAchievement[];
  news: GameNews[];
};

type GameDetailDrawerProps = {
  appId: number | null;
  onClose: () => void;
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0h";
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)}m`;
  return `${Math.round(hours).toLocaleString()}h`;
}

function formatPrice(store: GameStore): string {
  if (store.isFree) return "Free";
  if (typeof store.priceFinalCents !== "number") return "—";
  return `$${(store.priceFinalCents / 100).toFixed(2)}`;
}

function formatNewsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function metacriticColor(score: number): string {
  if (score >= 75) return "#a3e635"; // green
  if (score >= 50) return "#fde047"; // yellow
  return "#fb7185"; // red
}


function memberInitials(name: string): string {
  return (name || "??").trim().slice(0, 2).toUpperCase();
}

function capabilityPills(store: GameStore): string[] {
  const pills: string[] = [];
  if (store.isSinglePlayer) pills.push("Single-player");
  if (store.isOnlineCoop) pills.push("Online co-op");
  if (store.isLanCoop) pills.push("LAN co-op");
  if (store.isSharedSplitCoop) pills.push("Split-screen");
  if (store.isOnlinePvp) pills.push("PvP");
  if (store.isMmo) pills.push("MMO");
  if (typeof store.mpMaxPlayersApprox === "number" && store.mpMaxPlayersApprox > 1) {
    pills.push(`Up to ${store.mpMaxPlayersApprox}`);
  }
  return pills;
}

export default function GameDetailDrawer({ appId, onClose }: GameDetailDrawerProps) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (appId === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appId, onClose]);

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
    void (async () => {
      try {
        const res = await apiFetch(`/steam/game/${appId}`);
        if (!active) return;
        if (!res.ok) {
          setErrored(true);
          return;
        }
        const body = (await res.json().catch(() => null)) as GameDetail | null;
        if (!active) return;
        if (!body) {
          setErrored(true);
          return;
        }
        setDetail(body);
      } catch {
        if (active) setErrored(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [appId]);

  if (appId === null) return null;

  const pills = detail ? capabilityPills(detail.store) : [];
  const discount =
    detail && typeof detail.store.priceDiscountPct === "number" && detail.store.priceDiscountPct > 0
      ? detail.store.priceDiscountPct
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end"
      }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(2, 6, 23, 0.6)",
          backdropFilter: "blur(2px)"
        }}
      />
      <aside
        style={{
          position: "relative",
          width: "min(440px, 100%)",
          height: "100%",
          overflowY: "auto",
          background: islandTheme.color.menuBg,
          backdropFilter: islandTheme.glass.blurMenu,
          WebkitBackdropFilter: islandTheme.glass.blurMenu,
          borderLeft: `1px solid ${islandTheme.color.cardBorder}`,
          boxShadow: "-12px 0 40px rgba(2, 6, 23, 0.5)",
          animation: "biDrawerSlideIn 220ms ease",
          display: "grid",
          gap: 16,
          alignContent: "start",
          padding: 18
        }}
      >
        <style>{`
          @keyframes biDrawerSlideIn {
            from { transform: translateX(24px); opacity: 0.4; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="island-mono"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 30,
            height: 30,
            borderRadius: 999,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            background: islandTheme.color.panelMutedBg,
            color: islandTheme.color.textSubtle,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1
          }}
        >
          ✕
        </button>

        {loading ? (
          <div style={{ padding: "60px 12px", textAlign: "center", color: islandTheme.color.textMuted }}>
            Loading game details…
          </div>
        ) : errored || !detail ? (
          <div style={{ padding: "60px 12px", textAlign: "center", color: islandTheme.color.textMuted, fontSize: 13 }}>
            Couldn't load this game right now. Try again in a bit.
          </div>
        ) : (
          <>
            <GameCover
              appId={detail.appId}
              storedUrl={detail.headerImageUrl}
              variant="hero"
              alt={detail.name}
              style={{
                width: "100%",
                aspectRatio: "460 / 215",
                borderRadius: 10,
                border: `1px solid ${islandTheme.color.cardBorder}`
              }}
            />

            <div style={{ display: "grid", gap: 6 }}>
              <h2 className="island-display" style={{ margin: 0, fontSize: 22, fontWeight: 800, paddingRight: 36 }}>
                {detail.name}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: islandTheme.color.primaryGlow }}>
                  {formatPrice(detail.store)}
                </span>
                {discount && typeof detail.store.priceInitialCents === "number" ? (
                  <span
                    className="island-mono"
                    style={{
                      fontSize: 13,
                      color: islandTheme.color.textMuted,
                      textDecoration: "line-through"
                    }}
                  >
                    ${(detail.store.priceInitialCents / 100).toFixed(2)}
                  </span>
                ) : null}
                {discount ? <IslandTag tone="success">-{discount}%</IslandTag> : null}
                {detail.store.releaseComingSoon ? <IslandTag color="#a78bfa">Coming soon</IslandTag> : null}
                {detail.store.releaseDateText ? (
                  <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                    {detail.store.releaseDateText}
                  </span>
                ) : null}
                {typeof detail.store.historicalLowCents === "number" ? (
                  <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                    ⬇ Low ${(detail.store.historicalLowCents / 100).toFixed(2)}
                  </span>
                ) : null}
              </div>
            </div>

            {pills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pills.map((pill) => (
                  <span
                    key={pill}
                    className="island-mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${islandTheme.color.cardBorder}`,
                      color: islandTheme.color.textSubtle,
                      background: islandTheme.color.panelMutedBg,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {pill}
                  </span>
                ))}
              </div>
            )}

            {(detail.store.metacriticScore != null ||
              detail.store.platformWindows ||
              detail.store.platformMac ||
              detail.store.platformLinux ||
              detail.store.controllerSupport) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                      fontWeight: 800,
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
                  <span
                    className="island-mono"
                    style={{ fontSize: 11, color: islandTheme.color.textMuted }}
                    title={`Controller: ${detail.store.controllerSupport}`}
                  >
                    🎮 {detail.store.controllerSupport === "full" ? "Full controller" : "Partial controller"}
                  </span>
                ) : null}
              </div>
            )}

            {detail.store.shortDescription ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: islandTheme.color.textSecondary }}>
                {detail.store.shortDescription}
              </p>
            ) : null}

            {detail.store.screenshots.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  paddingBottom: 4,
                  scrollbarWidth: "thin"
                }}
              >
                {detail.store.screenshots.map((shot) => (
                  <a
                    key={shot.thumb}
                    href={shot.full}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flexShrink: 0 }}
                  >
                    <img
                      src={shot.thumb}
                      alt="Screenshot"
                      loading="lazy"
                      style={{
                        height: 92,
                        borderRadius: 8,
                        border: `1px solid ${islandTheme.color.cardBorder}`,
                        display: "block"
                      }}
                    />
                  </a>
                ))}
              </div>
            )}

            {detail.achievementCatalogue.length > 0 && (
              <Section title="Rarest achievements">
                <div style={{ display: "grid", gap: 6 }}>
                  {detail.achievementCatalogue.slice(0, 6).map((ach, i) => (
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
                        <img
                          src={ach.iconUrl}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          style={{ borderRadius: 6, flexShrink: 0 }}
                        />
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
                        <span
                          className="island-mono"
                          style={{ flexShrink: 0, fontSize: 12, color: islandTheme.color.textMuted }}
                        >
                          {ach.globalUnlockPct < 10
                            ? ach.globalUnlockPct.toFixed(1)
                            : Math.round(ach.globalUnlockPct)}
                          %
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Crew owners">
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
                            fontWeight: 800,
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
                      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, flexShrink: 0 }}>
                        {formatHours(owner.playtimeForever)}
                        {owner.playtime2Weeks > 0 ? ` · ${formatHours(owner.playtime2Weeks)}/2wk` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {detail.achievements.length > 0 && (
              <Section title="Achievement progress">
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
                            style={{
                              flexShrink: 0,
                              fontSize: 12,
                              color: maxed ? islandTheme.color.successAccent : islandTheme.color.textMuted
                            }}
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
              </Section>
            )}

            {detail.news.length > 0 && (
              <Section title="Recent patch notes">
                <div style={{ display: "grid", gap: 6 }}>
                  {detail.news.map((item, i) => (
                    <a
                      key={`${item.url}-${i}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "grid",
                        gap: 2,
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
                      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                        {formatNewsDate(item.publishedAt)}
                      </span>
                    </a>
                  ))}
                </div>
              </Section>
            )}

            <a
              href={`https://store.steampowered.com/app/${detail.appId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="island-mono"
              style={{
                justifySelf: "start",
                fontSize: 12,
                fontWeight: 700,
                color: islandTheme.color.textSubtle,
                textDecoration: "none",
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                background: "transparent"
              }}
            >
              View on Steam ↗
            </a>
          </>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <div
        className="island-mono"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: islandTheme.color.textMuted
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ fontSize: 13, color: islandTheme.color.textMuted, padding: "2px 0" }}>{text}</div>;
}
