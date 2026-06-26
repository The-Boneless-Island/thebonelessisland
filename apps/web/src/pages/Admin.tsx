// Admin entry point. The actual UI lives under pages/admin/* — this file just
// wires App-level data/handlers into the per-page components and the layout.

import { useEffect } from "react";
import type { NewsCard, Recommendation, ServerSetting } from "../types.js";
import { AdminLayout } from "./admin/AdminLayout.js";
import type { AdminPageId } from "./admin/adminNav.js";
import { DashboardPage } from "./admin/DashboardPage.js";
import { ForumsModPage, MembersPage } from "./admin/people.js";
import { GameNightsAdminPage, LibraryAdminPage, RecommenderAdminPage } from "./admin/gamesAdmin.js";
import { DriftLogAdminPage, NewsAdminPage, PatchSourcesAdminPage } from "./admin/news.js";
import type { NewsCardInput, EmbedBackfillProgressSnap, RecurateProgressSnap } from "./admin/news.js";
import { EconomyOpsPage, EconomyRulesPage, ShopAdminPage } from "./admin/economy.js";
import { AiAdminPage, PersonaAdminPage } from "./admin/ai.js";
import { BridgeAdminPage, GuildAdminPage } from "./admin/discord.js";
import { AuditAdminPage, SyncAdminPage } from "./admin/system.js";

export type { EmbedBackfillProgressSnap, RecurateProgressSnap } from "./admin/news.js";

type AdminPageProps = {
  selectedMemberCount: number;
  recommendations: Recommendation[];
  onRunRecommendation: () => void;
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
  onTriggerGeneralNewsIngest: () => Promise<{
    ok: boolean;
    fetched?: number;
    curated?: number;
    embedded?: number;
    error?: string;
  }>;
  onTriggerGeneralNewsCurate: () => Promise<{
    ok: boolean;
    curated?: number;
    remaining?: number;
    error?: string;
  }>;
  onTriggerGeneralNewsRecurate: (
    onProgress?: (snap: RecurateProgressSnap) => void
  ) => Promise<{ ok: boolean; reset?: number; curated?: number; error?: string }>;
  onCancelGeneralNewsRecurate: () => Promise<{ ok: boolean; error?: string }>;
  onTriggerGeneralNewsEmbedBackfill: (
    onProgress?: (snap: EmbedBackfillProgressSnap) => void
  ) => Promise<{ ok: boolean; embedded?: number; remaining?: number; error?: string }>;
  onCancelGeneralNewsEmbedBackfill: () => Promise<{ ok: boolean; error?: string }>;
  onFetchGeneralNewsEmbedBackfillStatus: () => Promise<{
    state: "idle" | "running" | "done" | "error";
    total: number;
    embedded: number;
    skipped: number;
    remaining: number;
    batches: number;
    error: string | null;
  } | null>;
  onTriggerGeneralNewsImageBackfill: (
    limit?: number
  ) => Promise<{ ok: boolean; scanned?: number; resolved?: number; remaining?: number; error?: string }>;
  onFetchGeneralNewsRecurateStatus: () => Promise<{
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

export function AdminPage(props: AdminPageProps) {
  // Nearly every admin page reads server settings now — load once on entry.
  useEffect(() => {
    if (props.serverSettings === null) {
      props.onLoadServerSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderPage = (page: AdminPageId, navigate: (page: AdminPageId, anchor?: string) => void) => {
    switch (page) {
      case "dashboard":
        return <DashboardPage settings={props.serverSettings} onNavigate={navigate} />;
      case "members":
        return <MembersPage />;
      case "forums":
        return <ForumsModPage />;
      case "library":
        return <LibraryAdminPage />;
      case "game-nights":
        return <GameNightsAdminPage />;
      case "recommender":
        return (
          <RecommenderAdminPage
            selectedMemberCount={props.selectedMemberCount}
            recommendations={props.recommendations}
            onRunRecommendation={props.onRunRecommendation}
          />
        );
      case "news":
        return (
          <NewsAdminPage
            settings={props.serverSettings}
            onUpdate={props.onUpdateServerSetting}
            onIngest={props.onTriggerGeneralNewsIngest}
            onCurate={props.onTriggerGeneralNewsCurate}
            onRecurate={props.onTriggerGeneralNewsRecurate}
            onCancelRecurate={props.onCancelGeneralNewsRecurate}
            onEmbedBackfill={props.onTriggerGeneralNewsEmbedBackfill}
            onCancelEmbedBackfill={props.onCancelGeneralNewsEmbedBackfill}
            onFetchEmbedBackfillStatus={props.onFetchGeneralNewsEmbedBackfillStatus}
            onImageBackfill={props.onTriggerGeneralNewsImageBackfill}
            onFetchRecurateStatus={props.onFetchGeneralNewsRecurateStatus}
            onCurateGameNews={props.onTriggerNewsCuration}
            onResetGeneralNewsCorpus={props.onResetGeneralNewsCorpus}
          />
        );
      case "patch-sources":
        return <PatchSourcesAdminPage />;
      case "drift-log":
        return (
          <DriftLogAdminPage
            newsCards={props.newsCards}
            onCreateNewsCard={props.onCreateNewsCard}
            onUpdateNewsCard={props.onUpdateNewsCard}
            onArchiveNewsCard={props.onArchiveNewsCard}
          />
        );
      case "economy":
        return <EconomyOpsPage />;
      case "shop":
        return <ShopAdminPage />;
      case "economy-rules":
        return <EconomyRulesPage settings={props.serverSettings} onSave={props.onUpdateServerSetting} />;
      case "ai":
        return (
          <AiAdminPage
            settings={props.serverSettings}
            onUpdate={props.onUpdateServerSetting}
            onTest={props.onTestAIConnection}
          />
        );
      case "persona":
        return <PersonaAdminPage settings={props.serverSettings} onSave={props.onUpdateServerSetting} />;
      case "guild":
        return <GuildAdminPage settings={props.serverSettings} onSave={props.onUpdateServerSetting} />;
      case "bridge":
        return <BridgeAdminPage settings={props.serverSettings} onUpdate={props.onUpdateServerSetting} />;
      case "sync":
        return <SyncAdminPage />;
      case "audit":
        return <AuditAdminPage />;
    }
  };

  return <AdminLayout renderPage={renderPage} />;
}
