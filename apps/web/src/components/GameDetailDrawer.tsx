import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiFetch } from "../api/client.js";
import { IslandTag, SpecStrip, memberColor } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { GameCover } from "../steamArt.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
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
import { pathForGamePage } from "../lib/routes.js";

type GameDetailDrawerProps = {
  appId: number | null;
  onClose: () => void;
};

export default function GameDetailDrawer({ appId, onClose }: GameDetailDrawerProps) {
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  // Focus trap, initial focus, body-scroll lock, and focus restore all come
  // from the shared hook; Escape-closes was previously an ad-hoc effect here
  // — the hook now owns that too, so this is a straight replacement.
  const drawerRef = useModalFocus<HTMLElement>({
    isOpen: appId !== null,
    onClose
  });

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

  const specItems = detail ? capabilitySpecItems(detail.store) : [];
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
        ref={drawerRef}
        tabIndex={-1}
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
          padding: 18,
          outline: "none"
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

        {appId !== null ? (
          <Link
            to={pathForGamePage(appId)}
            className="island-mono"
            style={{
              position: "absolute",
              top: 12,
              left: 18,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: islandTheme.color.primaryGlow,
              textDecoration: "none"
            }}
          >
            Full page ↗
          </Link>
        ) : null}

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
              <h2 className="island-display" style={{ margin: 0, fontSize: 22, fontWeight: 700, paddingRight: 36 }}>
                {detail.name}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: islandTheme.color.primaryGlow }}>
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

            {specItems.length > 0 && (
              <div>
                <SpecStrip items={specItems} />
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
