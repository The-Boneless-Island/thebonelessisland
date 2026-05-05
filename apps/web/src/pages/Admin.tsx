import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "../api/client.js";
import { IslandButton, IslandCard, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type {
  ForumBan,
  ForumCategory,
  ForumModLogEntry,
  ForumReport,
  GameNight,
  NewsCard,
  NuggiesShopItem,
  Recommendation,
  ServerSetting
} from "../types.js";

type AdminSection =
  | "hub"
  | "configuration"
  | "news"
  | "data-sync"
  | "members"
  | "events"
  | "forums"
  | "library"
  | "economy"
  | "audit";

type NewsCardInput = {
  title: string;
  body: string;
  icon?: string;
  tag?: string | null;
  sourceUrl?: string | null;
};

type AdminPageProps = {
  selectedMemberCount: number;
  recommendations: Recommendation[];
  onRunRecommendation: () => void;
  newsKeywords: string;
  onNewsKeywordsChange: (value: string) => void;
  newsSources: string;
  onNewsSourcesChange: (value: string) => void;
  onSaveNewsControls: () => void;
  profileJson: string;
  newsCards: NewsCard[];
  onCreateNewsCard: (input: NewsCardInput) => void;
  onUpdateNewsCard: (id: string, input: Partial<NewsCardInput>) => void;
  onArchiveNewsCard: (id: string) => void;
  serverSettings: ServerSetting[] | null;
  onLoadServerSettings: () => void;
  onUpdateServerSetting: (key: string, value: string) => void;
  onTestAIConnection: (opts: { provider: string; model?: string; apiKey?: string }) => Promise<{ ok: boolean; provider?: string; model?: string; error?: string }>;
  onTriggerNewsCuration: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
  onTriggerGeneralNewsIngest: () => Promise<{ ok: boolean; fetched?: number; curated?: number; error?: string }>;
  onTriggerGeneralNewsCurate: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
  onTriggerGeneralNewsRecurate: () => Promise<{ ok: boolean; reset?: number; curated?: number; error?: string }>;
};

export function AdminPage(props: AdminPageProps) {
  const [section, setSection] = useState<AdminSection>("hub");

  const handleSelectSection = (s: AdminSection) => {
    setSection(s);
    if ((s === "configuration" || s === "news") && props.serverSettings === null) {
      props.onLoadServerSettings();
    }
  };

  if (section === "hub") {
    return <AdminHub onSelect={handleSelectSection} />;
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SubpageHeader section={section} onBack={() => setSection("hub")} />
      {section === "configuration" ? (
        <ConfigurationSubpage
          settings={props.serverSettings}
          onUpdate={props.onUpdateServerSetting}
          onTest={props.onTestAIConnection}
        />
      ) : null}
      {section === "news" ? (
        <NewsSubpage
          settings={props.serverSettings}
          onUpdate={props.onUpdateServerSetting}
          onIngest={props.onTriggerGeneralNewsIngest}
          onCurate={props.onTriggerGeneralNewsCurate}
          onRecurate={props.onTriggerGeneralNewsRecurate}
          onCurateGameNews={props.onTriggerNewsCuration}
          newsCards={props.newsCards}
          onCreateNewsCard={props.onCreateNewsCard}
          onUpdateNewsCard={props.onUpdateNewsCard}
          onArchiveNewsCard={props.onArchiveNewsCard}
        />
      ) : null}
      {section === "data-sync" ? <DataSyncSubpage /> : null}
      {section === "members" ? <MembersSubpage /> : null}
      {section === "events" ? (
        <EventsSubpage
          selectedMemberCount={props.selectedMemberCount}
          recommendations={props.recommendations}
          onRunRecommendation={props.onRunRecommendation}
        />
      ) : null}
      {section === "forums" ? <ForumsModSubpage /> : null}
      {section === "library" ? <LibrarySubpage /> : null}
      {section === "economy" ? <EconomySubpage /> : null}
      {section === "audit" ? <AuditSubpage profileJson={props.profileJson} /> : null}
    </div>
  );
}

type AdminTile = {
  id: AdminSection;
  title: string;
  blurb: string;
  icon: string;
  accent: string;
};

const ADMIN_TILES: AdminTile[] = [
  { id: "configuration", title: "Configuration", blurb: "Discord server, AI provider, API keys. All server-level settings in one place.", icon: "⚙️", accent: "#6366f1" },
  { id: "news", title: "News", blurb: "External RSS feeds, GNews key, manual triggers, and community drift log cards.", icon: "📰", accent: "#0ea5e9" },
  { id: "data-sync", title: "Data Sync", blurb: "Connector health + live log.", icon: "🔄", accent: "#86efac" },
  { id: "members", title: "Members & Roles", blurb: "Roster, role mapping, onboarding queue.", icon: "👥", accent: "#a78bfa" },
  { id: "events", title: "Game Nights & Events", blurb: "Session defaults, active nights, and recommendation engine tester.", icon: "🎮", accent: "#f59e0b" },
  { id: "forums", title: "Forum Moderation", blurb: "Reports, channel access, word filter.", icon: "💬", accent: "#ef8354" },
  { id: "library", title: "Game Library", blurb: "Featured pick, tag/visibility overrides.", icon: "🗂", accent: "#fb7185" },
  { id: "economy", title: "Economy", blurb: "Nuggies balances, grant/deduct, attendance awards, and shop management.", icon: "🍗", accent: "#f59e0b" },
  { id: "audit", title: "Audit Log", blurb: "Searchable trail with CSV export.", icon: "📜", accent: "#94a3b8" }
];

function AdminHub({ onSelect }: { onSelect: (s: AdminSection) => void }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="island-mono"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: islandTheme.color.textMuted
          }}
        >
          ★ Admin · Parent
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
          Admin
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: islandTheme.color.textSubtle,
            maxWidth: 640
          }}
        >
          Operational + moderation controls for the island. Role-gated to the <strong>Parent</strong> Discord role.
        </p>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14
        }}
      >
        {ADMIN_TILES.map((t) => (
          <HubTile key={t.id} tile={t} onClick={() => onSelect(t.id)} />
        ))}
      </div>
    </div>
  );
}

function HubTile({ tile, onClick }: { tile: AdminTile; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: `linear-gradient(135deg, ${tile.accent}22 0%, ${islandTheme.color.panelBg} 80%)`,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        color: islandTheme.color.textPrimary,
        cursor: "pointer",
        font: "inherit",
        transition: "transform 140ms ease, border-color 140ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = tile.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `${tile.accent}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          marginBottom: 10
        }}
      >
        {tile.icon}
      </div>
      <div className="island-display" style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
        {tile.title}
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.45 }}>
        {tile.blurb}
      </div>
      <div
        className="island-mono"
        style={{
          marginTop: 10,
          fontSize: 11,
          color: tile.accent,
          textTransform: "uppercase",
          letterSpacing: "0.08em"
        }}
      >
        Open →
      </div>
    </button>
  );
}

function SubpageHeader({ section, onBack }: { section: AdminSection; onBack: () => void }) {
  const tile = ADMIN_TILES.find((t) => t.id === section);
  if (!tile) return null;
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
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
        ← Admin hub
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `${tile.accent}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20
          }}
        >
          {tile.icon}
        </div>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800 }}>
          {tile.title}
        </h1>
      </div>
      <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
        {tile.blurb}
      </div>
    </header>
  );
}

function NewsCurationSubpage({
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
        <>
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
              <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 4, lineHeight: 1.5 }}>
                {card.body}
              </div>
              <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 6 }}>
                {card.tag ?? "drift log"} · posted {new Date(card.publishedAt).toLocaleDateString()}
                {card.createdBy ? ` · by ${card.createdBy.displayName}` : ""}
                {card.sourceUrl ? " · linked" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={smallBtn(islandTheme.color.primary, islandTheme.color.primaryText)} onClick={() => setEditing(true)}>
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
        </>
      )}
    </div>
  );
}

function NewsSubpage({
  settings,
  onUpdate,
  onIngest,
  onCurate,
  onRecurate,
  onCurateGameNews,
  newsCards,
  onCreateNewsCard,
  onUpdateNewsCard,
  onArchiveNewsCard
}: {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
  onIngest: () => Promise<{ ok: boolean; fetched?: number; curated?: number; error?: string }>;
  onCurate: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
  onRecurate: () => Promise<{ ok: boolean; reset?: number; curated?: number; error?: string }>;
  onCurateGameNews: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
  newsCards: NewsCard[];
  onCreateNewsCard: (input: NewsCardInput) => void;
  onUpdateNewsCard: (id: string, input: Partial<NewsCardInput>) => void;
  onArchiveNewsCard: (id: string) => void;
}) {
  const [gameCurateState, setGameCurateState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [gameCurateMsg, setGameCurateMsg] = useState("");

  const handleGameCurate = async () => {
    setGameCurateState("running");
    setGameCurateMsg("");
    const result = await onCurateGameNews();
    if (result.ok) {
      setGameCurateState("done");
      setGameCurateMsg(`Curated ${result.curated ?? 0} article${result.curated === 1 ? "" : "s"}`);
    } else {
      setGameCurateState("error");
      setGameCurateMsg(result.error ?? "Curation failed");
    }
    setTimeout(() => setGameCurateState("idle"), 5000);
  };

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <MergedSectionLabel title="External Feeds" />
        <NewsSourcesSubpage
          settings={settings}
          onUpdate={onUpdate}
          onIngest={onIngest}
          onCurate={onCurate}
          onRecurate={onRecurate}
        />
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <MergedSectionLabel title="Game News Curation" />
        <IslandCard style={{ padding: 16, display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
            Re-score and summarize un-curated game news items using the active AI provider.
            Runs automatically on the next news fetch — use this to force an immediate pass.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <IslandButton
              variant="secondary"
              onClick={handleGameCurate}
              disabled={gameCurateState === "running"}
            >
              {gameCurateState === "running" ? "Curating…" : "Re-curate Game News"}
            </IslandButton>
            {gameCurateMsg ? (
              <span style={{ fontSize: 12, color: gameCurateState === "error" ? islandTheme.color.dangerAccent : islandTheme.color.successAccent }}>
                {gameCurateMsg}
              </span>
            ) : null}
          </div>
        </IslandCard>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <MergedSectionLabel title="Drift Log" />
        <NewsCurationSubpage
          newsCards={newsCards}
          onCreateNewsCard={onCreateNewsCard}
          onUpdateNewsCard={onUpdateNewsCard}
          onArchiveNewsCard={onArchiveNewsCard}
        />
      </div>
    </div>
  );
}

function RecommendationsSubpage({
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
      <IslandCard style={{ padding: 16, display: "grid", gap: 10 }}>
        <SubsectionTitle>Inputs</SubsectionTitle>
        <div style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>
          Selected members from Game Nights crew picker:{" "}
          <strong style={{ color: islandTheme.color.textPrimary }}>{selectedMemberCount}</strong>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <Slider label="Library overlap weight" value={1.0} />
          <Slider label="Online crew weight" value={0.8} />
          <Slider label="Novelty weight" value={0.4} />
          <Slider label="Party-friendly weight" value={0.6} />
        </div>
        <IslandButton variant="primary" onClick={onRunRecommendation} style={{ marginTop: 4 }}>
          Run "What can we play"
        </IslandButton>
      </IslandCard>

      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
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
      <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
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

function DataSyncSubpage() {
  const connectors = [
    { name: "Discord OAuth", status: "ok", last: "live" },
    { name: "Discord Members", status: "ok", last: "60s" },
    { name: "Discord Voice State", status: "ok", last: "15s" },
    { name: "Steam OpenID", status: "ok", last: "live" },
    { name: "Steam OwnedGames", status: "ok", last: "30m" },
    { name: "Steam Wishlist", status: "ok", last: "30m" }
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>Connectors</SubsectionTitle>
        {connectors.map((c, i) => (
          <ConnectorRow key={c.name} entry={c} firstRow={i === 0} />
        ))}
      </IslandCard>

      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Live log</SubsectionTitle>
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: islandTheme.color.panelMutedBg,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 8,
            fontFamily: islandTheme.font.mono,
            fontSize: 11,
            color: islandTheme.color.textSubtle,
            maxHeight: 240,
            overflow: "auto"
          }}
        >
{`[ok]   discord.member.sync     guild=1172780198912065536  count=24      4.2s
[ok]   discord.voice.snapshot  in_voice=4                              0.6s
[ok]   steam.owned.refresh     user=donmega   games=141    180KB       2.1s
[ok]   steam.wishlist.refresh  user=donmega   items=38                 1.1s
[ok]   steam.owned.refresh     user=palmwave  games=87     120KB       1.8s
[ok]   steam.wishlist.refresh  user=palmwave  items=12                 0.4s
[ok]   game_nights.scan        scheduled=3   upcoming=2                0.2s`}
        </pre>
      </IslandCard>
    </div>
  );
}

function ConnectorRow({
  entry,
  firstRow
}: {
  entry: { name: string; status: string; last: string };
  firstRow: boolean;
}) {
  const tone =
    entry.status === "ok"
      ? { dot: islandTheme.color.successAccent, label: "OK" }
      : entry.status === "warn"
        ? { dot: islandTheme.color.warnAccent, label: "WARN" }
        : { dot: islandTheme.color.textMuted, label: "OFF" };
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
      <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</div>
      <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
        {entry.last}
      </span>
      <span
        className="island-mono"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: tone.dot,
          display: "flex",
          alignItems: "center",
          gap: 6
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: tone.dot }} />
        {tone.label}
      </span>
    </div>
  );
}

function MembersSubpage() {
  const roster = [
    { handle: "donmega", roles: ["Parent", "Crew"], joined: "2019-04-12", status: "online" },
    { handle: "jkraken", roles: ["Crew", "Captain"], joined: "2020-01-08", status: "online" },
    { handle: "aloha-pirate", roles: ["Crew", "Late-Boat"], joined: "2020-06-22", status: "live" },
    { handle: "palmwave", roles: ["Crew", "Cozy"], joined: "2021-03-17", status: "online" },
    { handle: "ChefNugget", roles: ["Crew"], joined: "2022-11-05", status: "online" },
    { handle: "LoreNugget", roles: ["Crew", "Lore"], joined: "2023-02-19", status: "idle" },
    { handle: "ReefTroll", roles: ["Crew"], joined: "2023-08-30", status: "idle" },
    { handle: "newGuest", roles: ["Onboarding"], joined: "2026-04-29", status: "online" }
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>Roster</SubsectionTitle>
        <div
          className="island-mono"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr 100px 80px auto",
            gap: 12,
            padding: "8px 16px",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: islandTheme.color.textMuted,
            borderTop: `1px solid ${islandTheme.color.cardBorder}`,
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`
          }}
        >
          <div>Handle</div>
          <div>Roles</div>
          <div>Joined</div>
          <div>Status</div>
          <div />
        </div>
        {roster.map((r, i) => (
          <MemberRow key={r.handle} entry={r} firstRow={i === 0} />
        ))}
      </IslandCard>

      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Role mapping</SubsectionTitle>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Discord roles → app capabilities. <strong>Parent</strong> = full admin. <strong>Captain</strong> = host
          privileges. <strong>Onboarding</strong> = read-only until promoted.
        </p>
      </IslandCard>

      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Onboarding queue · 1</SubsectionTitle>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 0"
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>newGuest</div>
            <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>Joined 2 days ago</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={smallBtn(islandTheme.color.primary, islandTheme.color.primaryText)}>
              Promote
            </button>
            <button type="button" style={smallBtn("transparent", islandTheme.color.dangerText, true, islandTheme.color.danger)}>
              Remove
            </button>
          </div>
        </div>
      </IslandCard>
    </div>
  );
}

function MemberRow({
  entry,
  firstRow
}: {
  entry: { handle: string; roles: string[]; joined: string; status: string };
  firstRow: boolean;
}) {
  const dot = entry.status === "online" ? islandTheme.color.successAccent : entry.status === "live" ? islandTheme.color.dangerAccent : islandTheme.color.textMuted;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.4fr 100px 80px auto",
        gap: 12,
        padding: "12px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.handle}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {entry.roles.map((r) => (
          <span
            key={r}
            className="island-mono"
            style={{
              fontSize: 10,
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
        ))}
      </div>
      <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
        {entry.joined}
      </span>
      <span
        className="island-mono"
        style={{ fontSize: 10, color: dot, display: "flex", alignItems: "center", gap: 4 }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
        {entry.status}
      </span>
      <button type="button" style={smallBtn("transparent", islandTheme.color.textMuted, true)}>
        Edit
      </button>
    </div>
  );
}

function GameNightsModSubpage() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16 }}>
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
      </IslandCard>

      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Active sessions</SubsectionTitle>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle }}>
          No sessions live. Inflight nights show here with lock/reopen + force-pick controls.
        </p>
      </IslandCard>
    </div>
  );
}

function ForumsModSubpage() {
  const [tab, setTab] = useState<"reports" | "categories" | "bans" | "log">("reports");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["reports", "categories", "bans", "log"] as const).map((t) => (
          <button
            key={t}
            type="button"
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
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
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
                {r.postId ? <span style={{ color: islandTheme.color.textMuted, marginLeft: 6, fontSize: 11 }}>· post #{r.postId}</span> : null}
              </div>
              <div style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
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
                  color: islandTheme.color.textSubtle
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

  const load = async () => {
    const r = await apiFetch("/forums/categories").then((r) => r.json()).catch(() => ({ categories: [] }));
    setCategories(r.categories ?? []);
  };

  useEffect(() => { void load(); }, []);

  async function remove(id: number) {
    if (!window.confirm("Delete this category? All threads in it will be removed.")) return;
    await apiFetch(`/forums/admin/categories/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
        {categories === null ? (
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
                <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
                  /{c.slug} · {c.threadCount} threads · pos {c.position}
                </div>
              </div>
              <div className="island-mono" style={{ fontSize: 10, color: islandTheme.color.textMuted, padding: "2px 8px", border: `1px solid ${islandTheme.color.cardBorder}`, borderRadius: 999 }}>
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
    <div style={{ display: "grid", gap: 12 }}>
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
                <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
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
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
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
                <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>{e.action}</span>
                {e.targetThreadTitle ? <span> · {e.targetThreadTitle}</span> : null}
                {e.targetUserDisplayName ? <span> · @{e.targetUserDisplayName}</span> : null}
              </div>
              {e.notes ? (
                <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2, fontStyle: "italic" }}>
                  "{e.notes}"
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: islandTheme.color.textMuted, whiteSpace: "nowrap" }}>
              {new Date(e.createdAt).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </IslandCard>
  );
}

function EventsSubpage({
  selectedMemberCount,
  recommendations,
  onRunRecommendation
}: {
  selectedMemberCount: number;
  recommendations: Recommendation[];
  onRunRecommendation: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <MergedSectionLabel title="Game Nights" />
        <GameNightsModSubpage />
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <MergedSectionLabel title="Recommendation Engine" />
        <RecommendationsSubpage
          selectedMemberCount={selectedMemberCount}
          recommendations={recommendations}
          onRunRecommendation={onRunRecommendation}
        />
      </div>
    </div>
  );
}

function LibrarySubpage() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16 }}>
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
      <IslandCard style={{ padding: 16 }}>
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
              style={{ fontSize: 11, color: islandTheme.color.textSubtle }}
            >
              {row.tags}
            </span>
            <button type="button" style={smallBtn("transparent", islandTheme.color.textMuted, true)}>
              Edit
            </button>
          </div>
        ))}
      </IslandCard>
    </div>
  );
}

// ── Server Configuration ──────────────────────────────────────────────────────

const SERVER_CONFIG_META: Record<string, { hint: string; sensitive?: boolean; restart?: boolean }> = {
  discord_guild_id: {
    hint: 'Right-click your server in Discord › "Copy Server ID" (Developer Mode must be on).',
    restart: false
  },
  guild_display_name: {
    hint: "Shown in the admin panel header only. No effect on API behaviour."
  },
  parent_role_name: {
    hint: 'The exact role name from your Discord server that grants admin access here.',
    restart: false
  }
};

// ── News Sources Subpage ─────────────────────────────────────────────────────

const RSS_SOURCE_OPTIONS = [
  { key: "pcgamer", label: "PC Gamer" },
  { key: "rockpapershotgun", label: "Rock Paper Shotgun" },
  { key: "eurogamer", label: "Eurogamer" },
  { key: "kotaku", label: "Kotaku" },
  { key: "ign", label: "IGN" }
];

function NewsSourcesSubpage({
  settings,
  onUpdate,
  onIngest,
  onCurate,
  onRecurate
}: {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
  onIngest: () => Promise<{ ok: boolean; fetched?: number; curated?: number; error?: string }>;
  onCurate: () => Promise<{ ok: boolean; curated?: number; error?: string }>;
  onRecurate: () => Promise<{ ok: boolean; reset?: number; curated?: number; error?: string }>;
}) {
  const getSetting = (key: string) => settings?.find((s) => s.key === key)?.value ?? "";

  const rawSources = getSetting("news_rss_sources") || "pcgamer,rockpapershotgun,eurogamer,kotaku";
  const [enabledSources, setEnabledSources] = useState<Set<string>>(() =>
    new Set(rawSources.split(",").map((s) => s.trim()).filter(Boolean))
  );
  const [devCap, setDevCap] = useState(() => getSetting("news_dev_cap") || "2");
  const [generalEnabled, setGeneralEnabled] = useState(() => getSetting("news_general_enabled") !== "false");
  const [newsApiKey, setNewsApiKey] = useState("");
  const [newsApiKeyIsSet] = [getSetting("newsapi_key") === "••••••••"];

  const [ingestState, setIngestState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [ingestMsg, setIngestMsg] = useState("");
  const [curateState, setCurateState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [curateMsg, setCurateMsg] = useState("");
  const [recurateState, setRecurateState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [recurateMsg, setRecurateMsg] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (settings && !initializedRef.current) {
      const raw = getSetting("news_rss_sources") || "pcgamer,rockpapershotgun,eurogamer,kotaku";
      setEnabledSources(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)));
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

  function toggleSource(key: string) {
    const next = new Set(enabledSources);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEnabledSources(next);
    const value = Array.from(next).join(",");
    onUpdate("news_rss_sources", value);
    flashSaved("rss");
  }

  const accent = "#0ea5e9";

  if (settings === null) {
    return (
      <IslandCard style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading settings…</p>
      </IslandCard>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Status banner */}
      <IslandCard
        style={{
          padding: "14px 18px",
          background: `linear-gradient(135deg, ${accent}22 0%, ${islandTheme.color.panelBg} 100%)`,
          border: `1px solid ${accent}44`
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28 }}>🌐</span>
          <div style={{ flex: 1 }}>
            <div className="island-mono" style={{ fontSize: 10, color: accent, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              External News Feed
            </div>
            <div className="island-display" style={{ fontWeight: 800, fontSize: 18 }}>
              {Array.from(enabledSources).length} RSS source{Array.from(enabledSources).length !== 1 ? "s" : ""} enabled
            </div>
            <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
              {generalEnabled ? "General news feed active" : "General news feed disabled"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !generalEnabled;
              setGeneralEnabled(next);
              onUpdate("news_general_enabled", next ? "true" : "false");
              flashSaved("general_enabled");
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: islandTheme.color.textSubtle,
              fontSize: 13,
              font: "inherit"
            }}
          >
            <Toggle on={generalEnabled} />
            <span>{generalEnabled ? "On" : "Off"}</span>
          </button>
        </div>
      </IslandCard>

      {/* RSS Sources */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>RSS Feeds</SubsectionTitle>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Toggle which outlets contribute to the home page gaming news feed. Changes take effect on the next ingestion run.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {RSS_SOURCE_OPTIONS.map((src) => {
            const active = enabledSources.has(src.key);
            return (
              <button
                key={src.key}
                type="button"
                onClick={() => toggleSource(src.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1.5px solid ${active ? accent : islandTheme.color.cardBorder}`,
                  background: active ? `${accent}18` : islandTheme.color.panelMutedBg,
                  color: islandTheme.color.textPrimary,
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left",
                  transition: "all 140ms"
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: `2px solid ${active ? accent : islandTheme.color.cardBorder}`,
                    background: active ? accent : "transparent",
                    flexShrink: 0,
                    transition: "all 140ms",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    color: islandTheme.color.textInverted
                  }}
                >
                  {active ? "✓" : ""}
                </span>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 400 }}>{src.label}</span>
              </button>
            );
          })}
        </div>
        {saved["rss"] && (
          <div style={{ marginTop: 8, fontSize: 12, color: islandTheme.color.successAccent }}>Sources saved</div>
        )}
      </IslandCard>

      {/* GNews API Key */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>GNews API Key</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Optional. Enables richer search queries based on crew game preferences.{" "}
          <a href="https://gnews.io" target="_blank" rel="noopener noreferrer" style={{ color: accent }}>
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
      </IslandCard>

      {/* Developer Diversity Cap */}
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

      {/* Manual Triggers */}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <IslandButton
              variant="secondary"
              onClick={async () => {
                setIngestState("running");
                setIngestMsg("");
                const result = await onIngest();
                if (result.ok) {
                  setIngestState("done");
                  setIngestMsg(`Fetched ${result.fetched ?? 0} new · curated ${result.curated ?? 0}`);
                } else {
                  setIngestState("error");
                  setIngestMsg(result.error ?? "Failed");
                }
                setTimeout(() => setIngestState("idle"), 6000);
              }}
              disabled={ingestState === "running"}
            >
              {ingestState === "running" ? "Fetching…" : "Fetch & Curate"}
            </IslandButton>
            {ingestMsg && (
              <span style={{ fontSize: 12, color: ingestState === "error" ? islandTheme.color.dangerAccent : islandTheme.color.successAccent }}>
                {ingestMsg}
              </span>
            )}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Curate Existing Articles</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
            Re-run AI scoring and summaries on articles that haven't been curated yet.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <IslandButton
              variant="secondary"
              onClick={async () => {
                setCurateState("running");
                setCurateMsg("");
                const result = await onCurate();
                if (result.ok) {
                  setCurateState("done");
                  setCurateMsg(`Curated ${result.curated ?? 0} article${result.curated === 1 ? "" : "s"}`);
                } else {
                  setCurateState("error");
                  setCurateMsg(result.error ?? "Failed");
                }
                setTimeout(() => setCurateState("idle"), 6000);
              }}
              disabled={curateState === "running"}
            >
              {curateState === "running" ? "Curating…" : "Curate Articles"}
            </IslandButton>
            {curateMsg && (
              <span style={{ fontSize: 12, color: curateState === "error" ? islandTheme.color.dangerAccent : islandTheme.color.successAccent }}>
                {curateMsg}
              </span>
            )}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${islandTheme.color.cardBorder}`, paddingTop: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Regenerate All Summaries</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
            Reset curation on all articles and re-run AI with the updated prompt. Use after prompt changes to get longer, richer summaries. Processes {10} articles per run.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <IslandButton
              variant="danger"
              onClick={async () => {
                setRecurateState("running");
                setRecurateMsg("");
                const result = await onRecurate();
                if (result.ok) {
                  setRecurateState("done");
                  setRecurateMsg(`Reset ${result.reset ?? 0} · curated ${result.curated ?? 0} this pass`);
                } else {
                  setRecurateState("error");
                  setRecurateMsg(result.error ?? "Failed");
                }
                setTimeout(() => setRecurateState("idle"), 8000);
              }}
              disabled={recurateState === "running"}
            >
              {recurateState === "running" ? "Regenerating…" : "Regenerate All Summaries"}
            </IslandButton>
            {recurateMsg && (
              <span style={{ fontSize: 12, color: recurateState === "error" ? islandTheme.color.dangerAccent : islandTheme.color.successAccent }}>
                {recurateMsg}
              </span>
            )}
          </div>
        </div>
      </IslandCard>
    </div>
  );
}

function ServerConfigSubpage({
  settings,
  onUpdate
}: {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]))
  );
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  if (settings === null) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <IslandCard key={i} style={{ padding: "16px 18px" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  height: 14,
                  width: `${55 + i * 15}%`,
                  borderRadius: 6,
                  background: islandTheme.color.panelMutedBg,
                  animation: "settingsSkelPulse 1.4s ease-in-out infinite"
                }}
              />
              <div
                style={{
                  height: 36,
                  borderRadius: 8,
                  background: islandTheme.color.panelMutedBg,
                  animation: "settingsSkelPulse 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`
                }}
              />
            </div>
          </IslandCard>
        ))}
        <style>{`
          @keyframes settingsSkelPulse {
            0%, 100% { opacity: 0.45; }
            50% { opacity: 0.9; }
          }
        `}</style>
      </div>
    );
  }

  if (settings.length === 0) {
    return (
      <IslandCard style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>
          No configurable settings found. Run <code>npm run db:migrate</code> to apply migration 012.
        </p>
      </IslandCard>
    );
  }

  const handleSave = (key: string) => {
    onUpdate(key, drafts[key] ?? "");
    setSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2200);
  };

  const currentGuildId = settings.find((s) => s.key === "discord_guild_id");
  const displayName = settings.find((s) => s.key === "guild_display_name");
  const serverLabel = displayName?.value || currentGuildId?.value || "Not configured";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Active server banner */}
      <IslandCard
        style={{
          padding: "14px 18px",
          background: `linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, ${islandTheme.color.panelBg} 100%)`,
          border: `1px solid rgba(99, 102, 241, 0.35)`
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>⚙️</span>
          <div>
            <div className="island-mono" style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Currently pointed at
            </div>
            <div className="island-display" style={{ fontWeight: 800, fontSize: 18 }}>
              {serverLabel}
            </div>
            {currentGuildId?.envDefault && !currentGuildId?.value ? (
              <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
                Using env fallback: {currentGuildId.envDefault}
              </div>
            ) : null}
          </div>
        </div>
      </IslandCard>

      {/* Warning */}
      <IslandCard
        style={{
          padding: "12px 16px",
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.35)"
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span>⚠️</span>
          <p style={{ margin: 0, fontSize: 13, color: "#fcd34d", lineHeight: 1.5 }}>
            Changing the <strong>Guild ID</strong> takes effect immediately on the next request —
            all member sync, role checks, and crew data will point to the new server.
            Run a member sync after switching to populate the new guild's roster.
          </p>
        </div>
      </IslandCard>

      {/* Setting rows */}
      <div style={{ display: "grid", gap: 14 }}>
        {settings.map((setting) => {
          const meta = SERVER_CONFIG_META[setting.key];
          const draft = drafts[setting.key] ?? setting.value;
          const isDirty = draft !== setting.value;
          const isSaved = saved[setting.key];

          return (
            <IslandCard key={setting.key} style={{ padding: "16px 18px" }}>
              <div style={{ display: "grid", gap: 10 }}>
                {/* Label + key */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{setting.label}</span>
                  <code
                    className="island-mono"
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: islandTheme.color.panelMutedBg,
                      color: islandTheme.color.textMuted
                    }}
                  >
                    {setting.key}
                  </code>
                </div>

                {/* Description */}
                {setting.description ? (
                  <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.5 }}>
                    {setting.description}
                  </p>
                ) : null}

                {/* Env default notice */}
                {setting.envDefault ? (
                  <div
                    className="island-mono"
                    style={{
                      fontSize: 11,
                      color: islandTheme.color.textMuted,
                      padding: "6px 10px",
                      borderRadius: 7,
                      background: islandTheme.color.panelMutedBg,
                      border: `1px solid ${islandTheme.color.cardBorder}`
                    }}
                  >
                    <span style={{ opacity: 0.6 }}>env fallback: </span>
                    <span>{setting.envDefault}</span>
                  </div>
                ) : null}

                {/* Hint */}
                {meta?.hint ? (
                  <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>
                    💡 {meta.hint}
                  </p>
                ) : null}

                {/* Input + save */}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    value={draft}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [setting.key]: e.target.value }))
                    }
                    placeholder={setting.envDefault || `Enter ${setting.label.toLowerCase()}…`}
                    style={{ ...islandInputStyle, flex: 1 }}
                    spellCheck={false}
                  />
                  <IslandButton
                    variant={isSaved ? "secondary" : "primary"}
                    disabled={!isDirty && !isSaved}
                    onClick={() => handleSave(setting.key)}
                    style={{ flexShrink: 0, minWidth: 80 }}
                  >
                    {isSaved ? "✓ Saved" : "Save"}
                  </IslandButton>
                </div>
              </div>
            </IslandCard>
          );
        })}
      </div>
    </div>
  );
}

function AuditSubpage({ profileJson }: { profileJson: string }) {
  const events = [
    { who: "donmega", what: "promoted", target: "newGuest → Crew", ago: "2h" },
    { who: "donmega", what: "approved", target: "news item #392", ago: "5h" },
    { who: "donmega", what: "force-picked", target: "Friday Night → Helldivers II", ago: "yesterday" },
    { who: "system", what: "auto-flagged", target: "thread #4823 (#late-boat)", ago: "1d" }
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="Search audit log…" style={{ ...islandInputStyle, flex: 1, minWidth: 240 }} />
        <button type="button" style={smallBtn("transparent", islandTheme.color.textSubtle, true)}>
          Export CSV
        </button>
      </IslandCard>
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        {events.map((e, i) => (
          <div
            key={e.target + i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              padding: "12px 16px",
              borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
              alignItems: "center"
            }}
          >
            <div>
              <div style={{ fontSize: 13 }}>
                <strong>{e.who}</strong> {e.what} <strong>{e.target}</strong>
              </div>
            </div>
            <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
              {e.ago} ago
            </span>
          </div>
        ))}
      </IslandCard>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, color: islandTheme.color.textMuted }}>
          Profile payload (debug)
        </summary>
        <pre
          style={{
            marginTop: 8,
            padding: 12,
            background: islandTheme.color.panelMutedBg,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 8,
            fontFamily: islandTheme.font.mono,
            fontSize: 11,
            color: islandTheme.color.textSubtle,
            maxHeight: 320,
            overflow: "auto"
          }}
        >
          {profileJson}
        </pre>
      </details>
    </div>
  );
}

function MergedSectionLabel({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.cardBorder }} />
      <span
        className="island-mono"
        style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: islandTheme.color.textMuted }}
      >
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.cardBorder }} />
    </div>
  );
}

function ConfigurationSubpage({
  settings,
  onUpdate,
  onTest
}: {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
  onTest: (opts: { provider: string; model?: string; apiKey?: string }) => Promise<{ ok: boolean; provider?: string; model?: string; error?: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <MergedSectionLabel title="Discord Server" />
        <ServerConfigSubpage settings={settings} onUpdate={onUpdate} />
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <MergedSectionLabel title="AI Provider" />
        <AISettingsSubpage settings={settings} onUpdate={onUpdate} onTest={onTest} />
      </div>
    </div>
  );
}

function SubsectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <h3
      className="island-display"
      style={{
        margin: 0,
        marginBottom: 10,
        fontSize: 14,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: islandTheme.color.textMuted,
        ...style
      }}
    >
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
      <span
        className="island-mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: islandTheme.color.textMuted
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Slider({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: islandTheme.color.textSubtle }}>{label}</span>
        <span className="island-mono" style={{ color: islandTheme.color.textMuted }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 6,
          borderRadius: 999,
          background: islandTheme.color.panelMutedBg,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${islandTheme.color.primaryGlow}, ${islandTheme.palette.sandWarmAccent})`
          }}
        />
      </div>
    </div>
  );
}

function RuleRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderTop: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <span style={{ fontSize: 13 }}>{label}</span>
      <Toggle on={enabled} />
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? "rgba(74, 222, 128, 0.4)" : islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        position: "relative",
        transition: "background 200ms"
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: 999,
          background: on ? islandTheme.color.successAccent : islandTheme.color.textMuted,
          transition: "left 200ms"
        }}
      />
    </span>
  );
}

function smallBtn(bg: string, fg: string, ghost = false, border?: string): CSSProperties {
  return {
    background: bg,
    border: `1px solid ${ghost ? border ?? islandTheme.color.cardBorder : bg}`,
    color: fg,
    fontSize: 11,
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: 999,
    cursor: "pointer",
    font: "inherit"
  };
}

// ── AI Settings subpage ───────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<string, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini"
};

type ModelOption = { value: string; label: string; note?: string };

const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: "claude-haiku-4-5",   label: "Claude Haiku 4.5",   note: "Fastest · cheapest · great for bulk tasks" },
    { value: "claude-sonnet-4-6",  label: "Claude Sonnet 4.6",  note: "Best balance of speed and intelligence" },
    { value: "claude-opus-4-6",    label: "Claude Opus 4.6",    note: "Extended thinking · higher cost" },
    { value: "claude-opus-4-7",    label: "Claude Opus 4.7",    note: "Most capable · best for complex reasoning" },
    { value: "__custom__",         label: "Custom model…",      note: "Enter a model ID manually" }
  ],
  openai: [
    { value: "gpt-4o-mini",        label: "GPT-4o Mini",        note: "Fast · affordable · solid quality" },
    { value: "gpt-4o",             label: "GPT-4o",             note: "Flagship multimodal model" },
    { value: "gpt-4.1-mini",       label: "GPT-4.1 Mini",       note: "Efficient · low latency" },
    { value: "gpt-4.1",            label: "GPT-4.1",            note: "Latest GPT-4 generation" },
    { value: "o4-mini",            label: "o4-mini",            note: "Fast reasoning model" },
    { value: "__custom__",         label: "Custom model…",      note: "Enter a model ID manually" }
  ]
};

function AISettingsSubpage({
  settings,
  onUpdate,
  onTest
}: {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
  onTest: (opts: { provider: string; model?: string; apiKey?: string }) => Promise<{ ok: boolean; provider?: string; model?: string; error?: string }>;
}) {
  const getSetting = (key: string) => settings?.find((s) => s.key === key)?.value ?? "";

  const [provider, setProvider] = useState(() => getSetting("ai_provider"));
  const [model, setModel] = useState(() => getSetting("ai_model"));
  const [customModel, setCustomModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(() => getSetting("ai_enabled") === "true");
  const [testState, setTestState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const apiKeyIsSet = getSetting("ai_api_key") === "••••••••";
  const initializedRef = useRef(false);

  // Derive whether the currently saved model is a known preset or custom
  const knownModels = provider ? (PROVIDER_MODELS[provider] ?? []).map((m) => m.value) : [];
  const isCustomSelected = model === "__custom__" || (model !== "" && !knownModels.includes(model) && model !== "__custom__");
  const selectValue = isCustomSelected ? "__custom__" : model;

  useEffect(() => {
    if (settings && !initializedRef.current) {
      const savedProvider = getSetting("ai_provider");
      const savedModel = getSetting("ai_model");
      setProvider(savedProvider);
      const knownForProvider = (PROVIDER_MODELS[savedProvider] ?? []).map((m) => m.value);
      if (savedModel && !knownForProvider.includes(savedModel)) {
        setModel("__custom__");
        setCustomModel(savedModel);
      } else {
        setModel(savedModel);
      }
      setEnabled(getSetting("ai_enabled") === "true");
      initializedRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const save = (key: string, value: string) => {
    onUpdate(key, value);
    setSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2200);
  };

  const saveModel = () => {
    const actualModel = model === "__custom__" ? customModel.trim() : model;
    save("ai_model", actualModel);
  };

  const handleProviderChange = (p: string) => {
    setProvider(p);
    setModel(PROVIDER_DEFAULTS[p] ?? "");
    setCustomModel("");
  };

  const handleModelSelect = (value: string) => {
    setModel(value);
    if (value !== "__custom__") setCustomModel("");
  };

  const handleTest = async () => {
    if (!provider) return;
    setTestState("running");
    setTestMsg("");
    const result = await onTest({ provider, model: model || undefined, apiKey: apiKey || undefined });
    if (result.ok) {
      setTestState("ok");
      setTestMsg(`Connected · ${result.provider} / ${result.model}`);
    } else {
      setTestState("error");
      setTestMsg(result.error ?? "Connection failed");
    }
    setTimeout(() => setTestState("idle"), 6000);
  };

  if (settings === null) {
    return (
      <IslandCard style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading settings…</p>
      </IslandCard>
    );
  }

  const accent = "#8b5cf6";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Status banner */}
      <IslandCard
        style={{
          padding: "14px 18px",
          background: `linear-gradient(135deg, ${accent}22 0%, ${islandTheme.color.panelBg} 100%)`,
          border: `1px solid ${accent}44`
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28 }}>🤖</span>
          <div style={{ flex: 1 }}>
            <div className="island-mono" style={{ fontSize: 10, color: accent, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              AI Engine
            </div>
            <div className="island-display" style={{ fontWeight: 800, fontSize: 18 }}>
              {provider ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} · ${model || PROVIDER_DEFAULTS[provider] || "default model"}` : "Not configured"}
            </div>
            <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
              {enabled ? "AI features enabled" : "AI features disabled"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !enabled;
              setEnabled(next);
              save("ai_enabled", next ? "true" : "false");
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: islandTheme.color.textSubtle,
              fontSize: 13,
              font: "inherit"
            }}
          >
            <Toggle on={enabled} />
            <span>{enabled ? "On" : "Off"}</span>
          </button>
        </div>
      </IslandCard>

      {/* Provider */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Provider</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Choose your LLM provider. You can swap at any time — no code changes needed.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["anthropic", "openai"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleProviderChange(p)}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: `1.5px solid ${provider === p ? accent : islandTheme.color.cardBorder}`,
                background: provider === p ? `${accent}22` : islandTheme.color.panelMutedBg,
                color: provider === p ? accent : islandTheme.color.textSecondary,
                fontWeight: provider === p ? 700 : 400,
                fontSize: 14,
                cursor: "pointer",
                font: "inherit",
                transition: "all 140ms"
              }}
            >
              {p === "anthropic" ? "Anthropic (Claude)" : "OpenAI (GPT)"}
            </button>
          ))}
        </div>
        {provider ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <IslandButton
              variant="secondary"
              onClick={() => save("ai_provider", provider)}
              disabled={saved["ai_provider"]}
            >
              {saved["ai_provider"] ? "Saved" : "Save Provider"}
            </IslandButton>
          </div>
        ) : null}
      </IslandCard>

      {/* Model */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Model</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          {provider
            ? `Choose a ${provider === "anthropic" ? "Claude" : "GPT"} model. Haiku / Mini tiers are fastest and cheapest — great for news curation. Use Sonnet / GPT-4o for richer reasoning.`
            : "Select a provider above to see available models."}
        </p>

        {provider ? (
          <div style={{ display: "grid", gap: 10 }}>
            {/* Model option tiles */}
            <div style={{ display: "grid", gap: 6 }}>
              {(PROVIDER_MODELS[provider] ?? []).map((opt) => {
                const isSelected = selectValue === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleModelSelect(opt.value)}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: `1.5px solid ${isSelected ? accent : islandTheme.color.cardBorder}`,
                      background: isSelected ? `${accent}18` : islandTheme.color.panelMutedBg,
                      color: islandTheme.color.textPrimary,
                      cursor: "pointer",
                      font: "inherit",
                      transition: "all 140ms",
                      display: "flex",
                      alignItems: "center",
                      gap: 10
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: `2px solid ${isSelected ? accent : islandTheme.color.cardBorder}`,
                        background: isSelected ? accent : "transparent",
                        flexShrink: 0,
                        transition: "all 140ms"
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: isSelected ? 700 : 400, fontSize: 13 }}>
                        {opt.label}
                      </span>
                      {opt.note && opt.value !== "__custom__" ? (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: islandTheme.color.textMuted
                          }}
                        >
                          — {opt.note}
                        </span>
                      ) : null}
                    </span>
                    {opt.value === PROVIDER_DEFAULTS[provider] ? (
                      <span
                        className="island-mono"
                        style={{
                          fontSize: 9,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          background: `${accent}28`,
                          color: accent,
                          padding: "2px 7px",
                          borderRadius: 999
                        }}
                      >
                        Default
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Custom model input — only visible when Custom is selected */}
            {selectValue === "__custom__" ? (
              <input
                style={{ ...islandInputStyle }}
                type="text"
                placeholder={`Enter model ID (e.g. ${provider === "anthropic" ? "claude-opus-4-5" : "gpt-4-turbo"})`}
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                autoFocus
              />
            ) : null}

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IslandButton
                variant="secondary"
                onClick={saveModel}
                disabled={saved["ai_model"] || (selectValue === "__custom__" && !customModel.trim())}
              >
                {saved["ai_model"] ? "Saved" : "Save Model"}
              </IslandButton>
              {saved["ai_model"] ? null : (
                <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                  Currently:{" "}
                  <span className="island-mono" style={{ color: islandTheme.color.textSubtle }}>
                    {getSetting("ai_model") || `${PROVIDER_DEFAULTS[provider] ?? "default"} (default)`}
                  </span>
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 10,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              fontSize: 13,
              color: islandTheme.color.textMuted
            }}
          >
            No provider selected — pick one above to see model options.
          </div>
        )}
      </IslandCard>

      {/* API Key */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>API Key</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          {apiKeyIsSet
            ? "A key is already saved. Enter a new value to replace it, or leave blank to keep the existing key."
            : "Your key is stored server-side and never returned to the browser after saving. You can also set ANTHROPIC_API_KEY / OPENAI_API_KEY in your .env as a fallback."}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            style={{ ...islandInputStyle, flex: 1, fontFamily: islandTheme.font.mono, letterSpacing: "0.05em" }}
            type="password"
            value={apiKey}
            placeholder={apiKeyIsSet ? "••••••••  (key saved — enter new to replace)" : "sk-ant-... or sk-..."}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <IslandButton
            variant="secondary"
            onClick={() => {
              if (apiKey) {
                save("ai_api_key", apiKey);
                setApiKey("");
              }
            }}
            disabled={!apiKey || saved["ai_api_key"]}
          >
            {saved["ai_api_key"] ? "Saved" : "Save Key"}
          </IslandButton>
        </div>
      </IslandCard>

      {/* Test connection */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Test Connection</SubsectionTitle>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Sends a short ping to the provider using the current settings (including any unsaved key entered above).
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <IslandButton
            variant="primary"
            onClick={handleTest}
            disabled={!provider || testState === "running"}
          >
            {testState === "running" ? "Testing…" : "Test Connection"}
          </IslandButton>
          {testMsg ? (
            <span
              className="island-mono"
              style={{
                fontSize: 12,
                color: testState === "ok" ? islandTheme.color.successAccent : islandTheme.color.dangerAccent,
                lineHeight: 1.4
              }}
            >
              {testState === "ok" ? "✓ " : "✗ "}{testMsg}
            </span>
          ) : null}
        </div>
      </IslandCard>
    </div>
  );
}

// ── Economy subpage ───────────────────────────────────────────────────────────

type EconomyOverview = {
  totalSupply: number;
  optedOutCount: number;
  topHolders: { discordUserId: string; username: string; balance: number }[];
};

function EconomySubpage() {
  const [overview, setOverview] = useState<EconomyOverview | null>(null);
  const [shopItems, setShopItems] = useState<NuggiesShopItem[]>([]);
  const [gameNights, setGameNights] = useState<GameNight[]>([]);

  const [grantTarget, setGrantTarget] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [granting, setGranting] = useState(false);

  const [selectedNight, setSelectedNight] = useState<number | "">("");
  const [awarding, setAwarding] = useState(false);
  const [awardMsg, setAwardMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [newItem, setNewItem] = useState({
    name: "", description: "", price: "",
    itemType: "title" as "title" | "flair" | "badge",
    emoji: "", label: "", color: "#f59e0b",
  });
  const [addingItem, setAddingItem] = useState(false);
  const [itemMsg, setItemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const [ovRes, shopRes, nightsRes] = await Promise.all([
      apiFetch("/nuggies/admin/overview"),
      apiFetch("/nuggies/shop"),
      apiFetch("/game-nights"),
    ]);
    if (ovRes.ok) setOverview(await ovRes.json() as EconomyOverview);
    if (shopRes.ok) {
      const d = await shopRes.json() as { items: NuggiesShopItem[] };
      setShopItems(d.items);
    }
    if (nightsRes.ok) {
      const d = await nightsRes.json() as { gameNights: GameNight[] };
      setGameNights((d.gameNights ?? []).filter((n) => n.selectedGameName != null));
    }
  };

  useEffect(() => { void load(); }, []);

  const accent = "#f59e0b";

  const handleGrant = async () => {
    const amount = parseInt(grantAmount, 10);
    if (!grantTarget.trim() || !amount || !grantReason.trim()) return;
    setGranting(true);
    setGrantMsg(null);
    const res = await apiFetch("/nuggies/admin/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toDiscordUserId: grantTarget.trim(), amount, reason: grantReason.trim() }),
    });
    const body = await res.json() as { newBalance?: number; error?: string };
    if (res.ok) {
      setGrantMsg({ ok: true, text: `Done. New balance: ${(body.newBalance ?? 0).toLocaleString()} Nuggies` });
      setGrantTarget(""); setGrantAmount(""); setGrantReason("");
      void load();
    } else {
      setGrantMsg({ ok: false, text: body.error ?? "Failed" });
    }
    setGranting(false);
  };

  const handleAwardAttendance = async () => {
    if (!selectedNight) return;
    setAwarding(true);
    setAwardMsg(null);
    const res = await apiFetch(`/nuggies/admin/award-attendance/${selectedNight}`, { method: "POST" });
    const body = await res.json() as { awarded?: number; error?: string; message?: string };
    if (res.ok) {
      const n = body.awarded ?? 0;
      setAwardMsg({ ok: true, text: `Awarded to ${n} islander${n === 1 ? "" : "s"}.${body.message ? " " + body.message : ""}` });
    } else {
      setAwardMsg({ ok: false, text: body.error ?? "Failed" });
    }
    setAwarding(false);
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.description || !newItem.price || !newItem.emoji) return;
    setAddingItem(true);
    setItemMsg(null);
    const itemData: Record<string, string> = { emoji: newItem.emoji, color: newItem.color };
    if (newItem.itemType === "title" && newItem.label) itemData.label = newItem.label;
    const res = await apiFetch("/nuggies/admin/shop-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newItem.name, description: newItem.description,
        price: parseInt(newItem.price, 10), itemType: newItem.itemType,
        itemData, isActive: true,
      }),
    });
    const body = await res.json() as { ok?: boolean; error?: string };
    if (res.ok && body.ok) {
      setItemMsg({ ok: true, text: "Item created!" });
      setNewItem({ name: "", description: "", price: "", itemType: "title", emoji: "", label: "", color: "#f59e0b" });
      void load();
    } else {
      setItemMsg({ ok: false, text: body.error ?? "Failed" });
    }
    setAddingItem(false);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Overview banner */}
      <IslandCard style={{ padding: "14px 18px", background: `linear-gradient(135deg, ${accent}22 0%, ${islandTheme.color.panelBg} 100%)`, border: `1px solid ${accent}44` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28 }}>🍗</span>
          <div>
            <div className="island-mono" style={{ fontSize: 10, color: accent, textTransform: "uppercase", letterSpacing: "0.12em" }}>Economy Overview</div>
            <div className="island-display" style={{ fontWeight: 800, fontSize: 18 }}>
              {overview ? overview.totalSupply.toLocaleString() : "…"} Nuggies in circulation
            </div>
            <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
              {overview ? `${overview.optedOutCount} opted out` : "Loading…"}
            </div>
          </div>
        </div>
      </IslandCard>

      {/* Top Holders */}
      {overview && overview.topHolders.length > 0 && (
        <IslandCard style={{ padding: "16px 18px" }}>
          <SubsectionTitle>Top Holders</SubsectionTitle>
          <div style={{ display: "grid", gap: 4 }}>
            {overview.topHolders.map((h, i) => (
              <div key={h.discordUserId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: islandTheme.color.panelMutedBg, fontSize: 13 }}>
                <span style={{ fontFamily: islandTheme.font.mono, width: 24, color: islandTheme.color.textMuted, flexShrink: 0 }}>#{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{h.username}</span>
                <span style={{ fontWeight: 700, color: accent }}>₦{h.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </IslandCard>
      )}

      {/* Grant / Deduct */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Grant / Deduct</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Positive = grant, negative = deduct. Bypasses daily cap and opt-out checks.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <input placeholder="Discord User ID" value={grantTarget} onChange={(e) => setGrantTarget(e.target.value)} style={{ ...islandInputStyle }} />
          <input placeholder="Amount (e.g. 200 or -50)" type="number" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} style={{ ...islandInputStyle }} />
          <input placeholder="Reason" value={grantReason} onChange={(e) => setGrantReason(e.target.value)} style={{ ...islandInputStyle }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <IslandButton variant="primary" onClick={() => void handleGrant()} disabled={granting || !grantTarget || !grantAmount || !grantReason}>
              {granting ? "Applying…" : "Apply"}
            </IslandButton>
            {grantMsg && <span style={{ fontSize: 13, color: grantMsg.ok ? islandTheme.color.successAccent : islandTheme.color.dangerAccent }}>{grantMsg.text}</span>}
          </div>
        </div>
      </IslandCard>

      {/* Attendance Awards */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Attendance Awards</SubsectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Award Nuggies to all attendees of a finalized game night. Already-awarded attendees are skipped.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={selectedNight} onChange={(e) => setSelectedNight(e.target.value ? parseInt(e.target.value, 10) : "")} style={{ ...islandInputStyle, flex: 1, minWidth: 200 }}>
            <option value="">Select a game night…</option>
            {gameNights.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} — {n.selectedGameName ?? "?"} ({new Date(n.scheduledFor).toLocaleDateString()})
              </option>
            ))}
          </select>
          <IslandButton variant="primary" onClick={() => void handleAwardAttendance()} disabled={awarding || !selectedNight}>
            {awarding ? "Awarding…" : "Award 🍗 to Attendees"}
          </IslandButton>
          {awardMsg && <span style={{ fontSize: 13, color: awardMsg.ok ? islandTheme.color.successAccent : islandTheme.color.dangerAccent }}>{awardMsg.text}</span>}
        </div>
      </IslandCard>

      {/* Shop Items */}
      <IslandCard style={{ padding: "16px 18px" }}>
        <SubsectionTitle>Shop Items ({shopItems.length})</SubsectionTitle>
        <div style={{ display: "grid", gap: 4, marginBottom: 16 }}>
          {shopItems.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: islandTheme.color.panelMutedBg, fontSize: 13 }}>
              <span style={{ fontSize: 18 }}>{item.itemData.emoji}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{item.name}</span>
              <span style={{ fontSize: 11, color: islandTheme.color.textMuted, textTransform: "capitalize" }}>{item.itemType}</span>
              <span style={{ fontWeight: 700, color: accent }}>₦{item.price.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <SubsectionTitle style={{ marginTop: 8 }}>Add Item</SubsectionTitle>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} style={{ ...islandInputStyle, flex: 2 }} />
            <select value={newItem.itemType} onChange={(e) => setNewItem({ ...newItem, itemType: e.target.value as "title" | "flair" | "badge" })} style={{ ...islandInputStyle, flex: 1 }}>
              <option value="title">Title</option>
              <option value="flair">Flair</option>
              <option value="badge">Badge</option>
            </select>
          </div>
          <input placeholder="Description" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} style={{ ...islandInputStyle }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Price" type="number" min={1} value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} style={{ ...islandInputStyle, width: 100 }} />
            <input placeholder="Emoji" value={newItem.emoji} onChange={(e) => setNewItem({ ...newItem, emoji: e.target.value })} style={{ ...islandInputStyle, width: 72 }} />
            {newItem.itemType === "title" && (
              <input placeholder="Label (display text)" value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} style={{ ...islandInputStyle, flex: 1, minWidth: 120 }} />
            )}
            <input type="color" value={newItem.color} onChange={(e) => setNewItem({ ...newItem, color: e.target.value })} style={{ width: 48, height: 38, borderRadius: 8, border: `1px solid ${islandTheme.color.border}`, padding: 2, background: islandTheme.color.panelMutedBg, cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <IslandButton variant="primary" onClick={() => void handleAddItem()} disabled={addingItem || !newItem.name || !newItem.description || !newItem.price || !newItem.emoji}>
              {addingItem ? "Creating…" : "Create Item"}
            </IslandButton>
            {itemMsg && <span style={{ fontSize: 13, color: itemMsg.ok ? islandTheme.color.successAccent : islandTheme.color.dangerAccent }}>{itemMsg.text}</span>}
          </div>
        </div>
      </IslandCard>
    </div>
  );
}
