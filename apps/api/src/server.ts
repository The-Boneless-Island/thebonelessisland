import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { ZodError } from "zod";
import { env } from "./config.js";
import { installRedactor } from "./lib/logger.js";
import { initSentry, Sentry } from "./lib/sentry.js";
import { installProcessFatalHandlers, log } from "./lib/structuredLog.js";

// Install console redactor immediately after env is parsed. Every log call
// from this point on (including third-party libraries that use console)
// will have any matching secret value replaced with [REDACTED].
installRedactor();
initSentry("api");
installProcessFatalHandlers("api");
import { isValidBotSecret, requireSession } from "./lib/auth.js";
import { addSubscriber, removeSubscriber, broadcast } from "./lib/eventBus.js";
import { activityRouter } from "./routes/activity.js";
import { aiChatRouter } from "./routes/aiChat.js";
import { authRouter } from "./routes/auth.js";
import { digestRouter } from "./routes/digest.js";
import { gameNewsRouter } from "./routes/gameNews.js";
import { gameNewsSourcesRouter } from "./routes/gameNewsSources.js";
import { generalNewsRouter } from "./routes/generalNews.js";
import { internalRouter } from "./routes/internal.js";
import { gameNightRouter } from "./routes/gameNights.js";
import { membersRouter, syncGuildMembers } from "./routes/members.js";
import { newsCardsRouter } from "./routes/newsCards.js";
import { newsSourcesRouter } from "./routes/newsSources.js";
import { nuggiesRouter } from "./routes/nuggies.js";
import { nuggiesGamesRouter } from "./routes/nuggiesGames.js";
import { registerAllGames } from "./lib/games/index.js";
import { ingestAndCurateGeneralNews } from "./lib/generalNewsIngestion.js";
import { runNewsPipelineHealthSweep } from "./lib/news/newsCurationHealth.js";
import { reconcileInterruptedPipelineJobs } from "./lib/news/newsPipelineJobs.js";
import { runNewsRetentionSweep } from "./lib/news/newsRetention.js";
import { ingestNewsForApps } from "./lib/gameNewsIngestion.js";
import { resolveCrewLibraryAppIds } from "./lib/patchAlerts.js";
import { sweepExpiredGames } from "./lib/nuggiesGames.js";
import { processDefaultedLoans } from "./lib/nuggiesLedger.js";
import { syncWishlistPrices } from "./lib/priceSync.js";
import { syncSteamPlayerSummaries } from "./lib/steamPlayerSync.js";
import { buildAndStoreWeeklyDigest } from "./lib/weeklyDigest.js";
import { getAISetting, getGuildId } from "./lib/serverSettings.js";
import { db } from "./db/client.js";
import { forumsRouter } from "./routes/forums.js";
import { patchAlertsRouter } from "./routes/patchAlerts.js";
import { FORUM_UPLOAD_DIR, sweepOrphanUploads } from "./lib/forumUploads.js";
import { taglinesRouter } from "./routes/taglines.js";
import { profileRouter } from "./routes/profile.js";
import { settingsRouter } from "./routes/settings.js";
import { adminOnboardingRouter } from "./routes/adminOnboarding.js";
import { seedCuratedSources } from "./lib/news/curatedSources.js";
import { loadSettings } from "./lib/serverSettings.js";
import { isTaglineStale, refreshTaglines } from "./lib/taglineGenerator.js";
import { runMigrations } from "./db/runMigrations.js";
import { backfillNuggiesTransactionReasons } from "./db/backfillNuggiesReasons.js";
import { snapshotCrewTrending } from "./lib/crewTrendingSnapshots.js";
import { recommendationRouter } from "./routes/recommendations.js";
import { steamRouter, syncAllOwnedGames } from "./routes/steam.js";
import { refreshSteamAppList, repairMissingGameNames } from "./lib/steamAppList.js";
import { authLimiter, aiLimiter, steamLimiter, defaultLimiter } from "./middleware/rateLimit.js";

const app = express();

// Behind Caddy + Cloudflare in production. Trust one proxy hop (Caddy) so
// req.ip — used by the IP-based rate limiters — and req.secure reflect the
// real client forwarded via X-Forwarded-For instead of the proxy's address.
// Caddy is configured (trusted_proxies + Cf-Connecting-IP, see infra/Caddyfile)
// to write a clean X-Forwarded-For from Cloudflare's real-visitor header, so
// the value Express reads here is trustworthy. Without this, every request
// would share the proxy's IP and collapse the rate-limit buckets.
app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";

// Defense-in-depth security headers on the API host. Caddy already sets the
// shared SPA-facing headers (nosniff, X-Frame-Options, Referrer-Policy,
// Permissions-Policy) on both hosts and Cloudflare owns HSTS, so those are
// disabled here to avoid duplicate/conflicting headers — helmet adds the rest.
// CORP is set to same-site so the SPA (apex) can embed upload images served
// from the API subdomain; COEP stays off (it would break cross-origin CDN art).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"]
      }
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: false,
    xFrameOptions: false,
    xContentTypeOptions: false,
    referrerPolicy: false
  })
);

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true
  })
);
app.use(express.json());

// CSP violation reports from the SPA's Report-Only policy (set at Caddy).
// Mounted before the session + CSRF middleware so unauthenticated, possibly
// cross-site browser reports aren't blocked. Logged only — no DB, no storage.
app.post(
  "/csp-reports",
  defaultLimiter,
  express.json({
    type: ["application/csp-report", "application/reports+json", "application/json"],
    limit: "16kb"
  }),
  (req, res) => {
    // Log only the two diagnostic fields we act on (which directive fired, what
    // was blocked) — never the raw report body. A CSP report is an opaque,
    // browser-supplied blob that could carry a stray token or PII.
    const report = (req.body?.["csp-report"] ?? req.body ?? {}) as Record<string, unknown>;
    const directive =
      typeof report["violated-directive"] === "string" ? report["violated-directive"] : "unknown";
    const blockedUri =
      typeof report["blocked-uri"] === "string" ? report["blocked-uri"] : "unknown";
    console.warn("[csp-report]", directive, blockedUri);
    res.status(204).end();
  }
);

// Server-side session store hardening:
//   store      — Postgres-backed (connect-pg-simple): sessions are rows, so a
//                ban / guild-removal can revoke them instantly (see the sweep
//                in bootstrap) and they survive secret rotation.
//   secret[]   — first signs new cookies, all verify existing ones, so
//                SESSION_SECRET_PREVIOUS keeps users logged in across rotation.
//   name       — __Host- prefix in prod (requires Secure + Path=/ + no Domain).
//   secure     — HTTPS-only in prod; off in dev so localhost works.
//   sameSite   — 'lax' blocks cross-site CSRF while allowing OAuth redirects.
//   rolling    — every response resets maxAge → 30-day idle timeout.
// Session fixation is closed by regenerate-on-login (routes/auth.ts) and the
// 90-day absolute cap below.
const sessionSecrets = [env.SESSION_SECRET];
if (process.env.SESSION_SECRET_PREVIOUS) {
  sessionSecrets.push(process.env.SESSION_SECRET_PREVIOUS);
}
if (env.SESSION_SECRET.length < 32) {
  console.warn("[security] SESSION_SECRET shorter than 32 chars — rotate to a strong random value before prod.");
}
const PgSessionStore = connectPgSimple(session);
app.use(
  session({
    store: new PgSessionStore({
      pool: db,
      tableName: "session",
      createTableIfMissing: false // table is owned by migration 062
    }),
    name: isProd ? "__Host-island_session" : "island_session",
    secret: sessionSecrets,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000
    }
  })
);

// Absolute session lifetime cap. rolling:true never expires an active session
// on its own, so stamp createdAt at login and hard-destroy anything older than
// 90 days regardless of activity.
const MAX_SESSION_AGE_MS = 90 * 24 * 60 * 60 * 1000;
app.use((req, _res, next) => {
  const createdAt = req.session?.createdAt;
  if (typeof createdAt === "number" && Date.now() - createdAt > MAX_SESSION_AGE_MS) {
    req.session.destroy(() => next());
    return;
  }
  next();
});

// CSRF defense. SameSite=lax alone is not sufficient (OWASP 2025), so verify
// request provenance on every state-changing request: modern browsers send
// Sec-Fetch-Site; fall back to Origin for legacy UAs. Bot/server callers
// authenticate with a shared-secret header (not forgeable cross-site) and are
// exempt. Never fail open.
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
app.use((req, res, next) => {
  if (CSRF_SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (isValidBotSecret(req.get("x-island-bot-secret"))) {
    next();
    return;
  }
  const secFetchSite = req.get("sec-fetch-site");
  if (secFetchSite) {
    if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
      next();
      return;
    }
    res.status(403).json({ error: "Cross-site request blocked" });
    return;
  }
  const origin = req.get("origin");
  if (origin && origin === env.WEB_ORIGIN) {
    next();
    return;
  }
  res.status(403).json({ error: "Origin verification failed" });
});

// Set when runMigrations() throws during a dev boot (prod exits instead).
// Surfaced on /health as a boolean only — the full error stays in the boot
// logs (banner). Exposing the raw migration error to unauthenticated callers
// leaks schema/internal detail, so /health reports just ok/failed.
let migrationFailure: string | null = null;

app.get("/health", (_req, res) => {
  if (migrationFailure !== null) {
    res.json({ ok: false, migrations: "failed" });
    return;
  }
  res.json({ ok: true, migrations: "ok" });
});

// Server-sent events stream for push freshness (members + game nights).
// Mounted directly with only requireSession, ahead of the rate-limited router
// mounts, because this is a single long-lived connection per tab and the
// per-minute defaultLimiter must not throttle it. SSE is additive immediacy:
// the client keeps a lighter polling fallback so correctness never depends on
// this stream surviving Cloudflare/Caddy buffering.
app.get("/events", requireSession, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(": connected\n\n");

  addSubscriber(res);

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSubscriber(res);
  });
});

// Real-user Core Web Vitals beacons from the SPA (sent as text/plain to avoid a
// CORS preflight that sendBeacon can't perform). Logged for trend visibility,
// not stored. requireSession keeps it from being an open logging sink.
app.post(
  "/vitals",
  defaultLimiter,
  requireSession,
  express.text({ type: "*/*", limit: "4kb" }),
  (req, res) => {
    if (typeof req.body === "string" && req.body.length > 0) {
      log.info("web-vitals", "beacon", { body: req.body.slice(0, 500) });
    }
    res.status(204).end();
  }
);

app.post(
  "/client-errors",
  defaultLimiter,
  requireSession,
  express.text({ type: "*/*", limit: "8kb" }),
  (req, res) => {
    if (typeof req.body === "string" && req.body.length > 0) {
      log.error("client-errors", "react render error", { body: req.body.slice(0, 2000) });
      Sentry.captureMessage("client render error", {
        level: "error",
        extra: { body: req.body.slice(0, 2000) },
      });
    }
    res.status(204).end();
  }
);

// Rate limits are scoped to specific risk classes; everything else gets the
// generous defaultLimiter. The /internal router stays unlimited because the
// bot is trusted and uses a shared-secret auth header — caller is us.
// Forum image uploads, served from the local volume. Files are immutable
// (UUID-named, re-encoded WebP), so cache hard and forbid MIME sniffing.
app.use(
  "/uploads",
  express.static(FORUM_UPLOAD_DIR, {
    immutable: true,
    maxAge: "30d",
    index: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
  })
);

app.use("/auth", authLimiter, authRouter);
app.use("/ai", aiLimiter, aiChatRouter);
app.use("/steam", steamLimiter, steamRouter);

app.use("/digest", defaultLimiter, digestRouter);
app.use("/profile", defaultLimiter, profileRouter);
app.use("/recommendations", defaultLimiter, recommendationRouter);
app.use("/game-nights", defaultLimiter, gameNightRouter);
app.use("/games", defaultLimiter, gameNewsRouter);
app.use("/game-news-sources", defaultLimiter, gameNewsSourcesRouter);
app.use("/news-sources", defaultLimiter, newsSourcesRouter);
app.use("/news", defaultLimiter, generalNewsRouter);
app.use("/activity", defaultLimiter, activityRouter);
app.use("/news-cards", defaultLimiter, newsCardsRouter);
app.use("/members", defaultLimiter, membersRouter);
app.use("/settings", defaultLimiter, settingsRouter);
app.use("/admin/onboarding", defaultLimiter, adminOnboardingRouter);
app.use("/nuggies/games", defaultLimiter, nuggiesGamesRouter);
app.use("/nuggies", defaultLimiter, nuggiesRouter);
app.use("/forums", defaultLimiter, forumsRouter);
app.use("/patch-alerts", defaultLimiter, patchAlertsRouter);
app.use("/taglines", defaultLimiter, taglinesRouter);
app.use("/internal", internalRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request payload", details: error.flatten() });
    return;
  }

  log.error("api", "unhandled route error", {
    err: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  Sentry.captureException(error);
  res.status(500).json({ error: "Internal server error" });
});

// Revoke sessions for members who are no longer in the guild (left or banned).
// Sessions are rows, so this is a single sweep; run right after each member
// sync so a removed member loses access within ~60s without a server restart.
// Guild membership is the source of truth — guild_members retains last-known
// state on a failed sync, so this never mass-logs-out on a transient error.
async function revokeDepartedSessions() {
  const guildId = getGuildId();
  if (!guildId) return;
  await db.query(
    `
      DELETE FROM "session" s
      WHERE (s.sess->>'userId') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM guild_members gm
          WHERE gm.discord_user_id = s.sess->>'userId'
            AND gm.guild_id = $1
            AND gm.in_guild = TRUE
        )
    `,
    [guildId]
  );
}

// Run migrations + load settings before accepting requests
async function bootstrap() {
  // Migrations are load-bearing: serving with a drifted schema turns missing
  // tables into request-time 500s while the process looks healthy. In prod,
  // refuse to start — docker restart policy + the old container's image make
  // a crash loop the visible, recoverable failure mode. In dev, keep the
  // server up (the failure may be the very thing being worked on) but make
  // the breakage impossible to miss: banner + /health degradation.
  try {
    const { applied, skipped } = await runMigrations();
    console.log(`[boot] migrations: ${applied} applied, ${skipped} skipped`);
    log.info("boot", "migrations complete", { applied, skipped });
    try {
      await backfillNuggiesTransactionReasons();
    } catch (err) {
      console.error("[boot] nuggies reason backfill failed — starting anyway:", err);
    }
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      console.error("[boot] FATAL: migration runner failed — refusing to serve with a drifted schema:", err);
      process.exit(1);
    }
    migrationFailure = err instanceof Error ? err.message : String(err);
    const bannerLines = [
      "[boot] MIGRATIONS FAILED — schema is drifted",
      "Endpoints touching unapplied migrations will 500.",
      "/health now reports { ok: false, migrations: 'failed' }.",
      "Fix the error below, then restart (or run npm run db:migrate).",
    ];
    console.error(
      [
        "",
        `╔${"═".repeat(68)}╗`,
        ...bannerLines.map((line) => `║  ${line.padEnd(64)}  ║`),
        `╚${"═".repeat(68)}╝`,
      ].join("\n"),
      err
    );
  }
  try {
    await loadSettings();
  } catch (err) {
    console.error("[boot] settings load failed — starting anyway:", err);
  }

  try {
    await seedCuratedSources();
    await reconcileInterruptedPipelineJobs();
  } catch (err) {
    console.error("[boot] news source seed failed — starting anyway:", err);
  }
  try {
    if (await isTaglineStale()) {
      console.log("[boot] taglines stale — refreshing...");
      await refreshTaglines();
    }
  } catch (err) {
    console.error("[boot] tagline refresh failed:", err);
  }

  setInterval(() => {
    void isTaglineStale().then((stale) => {
      if (stale) {
        return refreshTaglines().catch((err) => {
          console.error("[taglines] scheduled refresh failed:", err);
        });
      }
    });
  }, 24 * 60 * 60 * 1000);

  // Forum orphan-upload sweep: drops never-attached images (composer abandoned)
  // older than 24h, freeing disk. Runs shortly after boot, then every 6 hours.
  setTimeout(() => {
    sweepOrphanUploads()
      .then((n) => { if (n > 0) console.log(`[forums] swept ${n} orphan upload(s)`); })
      .catch((err) => console.error("[forums] orphan upload sweep failed:", err));
  }, 45_000);
  setInterval(() => {
    sweepOrphanUploads()
      .then((n) => { if (n > 0) console.log(`[forums] swept ${n} orphan upload(s)`); })
      .catch((err) => console.error("[forums] orphan upload sweep failed:", err));
  }, 6 * 60 * 60 * 1000);

  // Register Nuggies game handlers + sweep expired sessions every 30s
  registerAllGames();
  setInterval(() => {
    sweepExpiredGames().catch((err) => {
      console.error("[nuggies-games] sweep failed:", err);
    });
  }, 30_000);

  // Loan sweep: defaults active loans past due (seizes collateral) and
  // cancels stale pending offers (24h TTL). Runs at boot + every 5 min.
  processDefaultedLoans().catch((err) => {
    console.error("[nuggies-loans] initial sweep failed:", err);
  });
  setInterval(() => {
    processDefaultedLoans().catch((err) => {
      console.error("[nuggies-loans] sweep failed:", err);
    });
  }, 5 * 60 * 1000);

  // Background news refresh — guarantees fresh stories every 4 hours even
  // when no members visit the gaming-news page. Page-load triggers still run
  // as before; the 1-hour ingest cooldown inside ingestAndCurateGeneralNews
  // prevents duplicate work when both fire close together. Force=false so
  // the cooldown is respected.
  setInterval(() => {
    ingestAndCurateGeneralNews().catch((err) => {
      console.error("[generalNews] scheduled background ingest failed:", err);
    });
  }, 4 * 60 * 60 * 1000);

  // Pipeline health sweep — bounded autopilot recovery, then Discord if still degraded.
  const runHealthSweep = () =>
    runNewsPipelineHealthSweep().catch((err) => {
      console.error("[generalNews] pipeline health sweep failed:", err);
    });
  setTimeout(runHealthSweep, 2 * 60 * 1000);
  setInterval(runHealthSweep, 6 * 60 * 60 * 1000);

  // Nightly retention: tier assignment, warm-tier stripping, prune dead rows.
  const runRetentionSweep = () =>
    runNewsRetentionSweep().catch((err) => {
      console.error("[news-retention] sweep failed:", err);
    });
  setTimeout(runRetentionSweep, 5 * 60 * 1000);
  setInterval(runRetentionSweep, 24 * 60 * 60 * 1000);

  // Crew-library patch alerts: poll Steam/RSS sources on a tighter cadence than
  // the lazy page-load ingest so Discord alerts land within ~20 minutes.
  const runPatchAlertIngest = () =>
    resolveCrewLibraryAppIds()
      .then((appIds) =>
        appIds.length > 0
          ? ingestNewsForApps(appIds, { staleAfterMs: 20 * 60 * 1000, maxApps: 25 })
          : { ingestedApps: 0, ingestedItems: 0 }
      )
      .then(({ ingestedApps, ingestedItems }) => {
        if (ingestedApps > 0 || ingestedItems > 0) {
          console.log(`[patchAlerts] ingest: ${ingestedApps} app(s), ${ingestedItems} item(s)`);
        }
      });

  setTimeout(() => {
    runPatchAlertIngest().catch((err) => {
      console.error("[patchAlerts] initial ingest failed:", err);
    });
  }, 90_000);
  setInterval(() => {
    runPatchAlertIngest().catch((err) => {
      console.error("[patchAlerts] scheduled ingest failed:", err);
    });
  }, 20 * 60 * 1000);

  // Member sync: server is now the sole driver (the web client no longer
  // POSTs /members/sync per tab). Run shortly after boot, then every 60s.
  setTimeout(() => {
    syncGuildMembers()
      .then(() => broadcast("members-changed"))
      .then(() => revokeDepartedSessions())
      .catch((err) => {
        console.error("[members] initial sync failed:", err);
      });
  }, 5_000);
  setInterval(() => {
    syncGuildMembers()
      .then(() => broadcast("members-changed"))
      .then(() => revokeDepartedSessions())
      .catch((err) => {
        console.error("[members] scheduled sync failed:", err);
      });
  }, 60_000);

  // Wishlist price sync: refreshes sale prices on wishlisted games via
  // CheapShark so the Games wishlist card can flag active discounts. Runs
  // shortly after boot, then daily.
  setTimeout(() => {
    syncWishlistPrices().catch((err) => {
      console.error("[priceSync] initial wishlist price sync failed:", err);
    });
  }, 10_000);
  setInterval(() => {
    syncWishlistPrices().catch((err) => {
      console.error("[priceSync] scheduled wishlist price sync failed:", err);
    });
  }, 24 * 60 * 60 * 1000);

  // Steam owned-games auto-sync: keeps each linked member's library fresh
  // without requiring a manual click. Each user is internally gated by a
  // per-user cooldown inside syncAllOwnedGames, so a frequent sweep is safe
  // and cheap. Runs shortly after boot, then every 30 minutes.
  setTimeout(() => {
    syncAllOwnedGames()
      .then(({ usersSynced }) => {
        console.log(`[steam] auto owned-games sync: ${usersSynced} user(s)`);
      })
      .catch((err) => {
        console.error("[steam] initial owned-games sync failed:", err);
      });
  }, 20_000);
  setInterval(() => {
    syncAllOwnedGames()
      .then(({ usersSynced }) => {
        console.log(`[steam] auto owned-games sync: ${usersSynced} user(s)`);
      })
      .catch((err) => {
        console.error("[steam] scheduled owned-games sync failed:", err);
      });
  }, 30 * 60 * 1000);

  // Crew-trending snapshot: records today's per-app rolling 2-week totals so
  // the home page can show "up/down vs last fortnight" deltas. Cheap single
  // upsert; runs after the first owned-games sync settles, then twice daily
  // (same-day re-runs just refresh today's row).
  setTimeout(() => {
    snapshotCrewTrending()
      .then(({ apps }) => console.log(`[trending] snapshot: ${apps} app(s)`))
      .catch((err) => console.error("[trending] initial snapshot failed:", err));
  }, 60_000);
  setInterval(() => {
    snapshotCrewTrending()
      .catch((err) => console.error("[trending] scheduled snapshot failed:", err));
  }, 12 * 60 * 60 * 1000);

  // Steam player-summary sync: one batched GetPlayerSummaries call refreshes
  // every linked member's persona/avatar/in-game status/account age, plus a
  // per-user Steam level pass. Runs shortly after boot, then every 15 minutes
  // (in-game status is the freshness-sensitive field).
  setTimeout(() => {
    syncSteamPlayerSummaries()
      .then(({ synced }) => console.log(`[steam] player-summary sync: ${synced} player(s)`))
      .catch((err) => console.error("[steam] initial player-summary sync failed:", err));
  }, 25_000);
  setInterval(() => {
    syncSteamPlayerSummaries()
      .then(({ synced }) => console.log(`[steam] player-summary sync: ${synced} player(s)`))
      .catch((err) => console.error("[steam] scheduled player-summary sync failed:", err));
  }, 15 * 60 * 1000);

  // Weekly Tide digest: rebuilds the crew recap, then announces it once per
  // week via the bot outbox. buildAndStoreWeeklyDigest UPSERTs by week_start,
  // so we run it on a 7-day interval (plus once shortly after boot) and only
  // post to Discord when the returned weekStart differs from the last one we
  // announced — guarding against duplicate posts across restarts within a week.
  let lastPostedDigestWeek: string | null = null;
  const runWeeklyDigest = async () => {
    const digest = await buildAndStoreWeeklyDigest();
    if (digest.weekStart === lastPostedDigestWeek) {
      return;
    }
    const topPlayed = digest.played[0];
    const lines = [
      "**Tide check — this week on the island**",
      `🗓️ ${digest.attendance.totalRsvps} RSVPs across ${digest.attendance.nights.length} game night${digest.attendance.nights.length === 1 ? "" : "s"}`,
    ];
    if (topPlayed) {
      lines.push(`🎮 Most played: ${topPlayed.name} (${topPlayed.crewMinutes2Weeks} crew minutes)`);
    }
    if (digest.queued.length > 0) {
      lines.push(`🌊 In the queue: ${digest.queued[0].name}${digest.queued.length > 1 ? ` +${digest.queued.length - 1} more` : ""}`);
    }
    const summary = lines.join("\n");

    const channelId = getAISetting("milestone_channel_id");
    const payload: { summary: string; channelId?: string } = { summary };
    if (channelId) {
      payload.channelId = channelId;
    }
    await db.query(
      `INSERT INTO bot_announcements (kind, payload) VALUES ('tide.weekly', $1::jsonb)`,
      [JSON.stringify(payload)]
    );
    lastPostedDigestWeek = digest.weekStart;
  };
  setTimeout(() => {
    runWeeklyDigest().catch((err) => {
      console.error("[tide] initial weekly digest failed:", err);
    });
  }, 15_000);
  setInterval(() => {
    runWeeklyDigest().catch((err) => {
      console.error("[tide] scheduled weekly digest failed:", err);
    });
  }, 7 * 24 * 60 * 60 * 1000);

  // Steam app-list warm + placeholder-name repair. The storefront appdetails
  // endpoint only accepts one appid per request, so it can't bulk-resolve
  // names; GetAppList gives the full appid->name catalog in one call. We warm
  // the cache shortly after boot (so wishlist syncs resolve names instantly),
  // refresh it daily, and run a bounded sweep that fixes any game row still
  // holding the 'app-<id>' placeholder (e.g. wishlist items, whose Steam API
  // returns appids only). Lookups are in-memory, so the sweep is cheap.
  setTimeout(() => {
    refreshSteamAppList(true)
      .then((count) => {
        console.log(`[steam] app-list cached: ${count} app(s)`);
        return repairMissingGameNames(500);
      })
      .then((fixed) => {
        if (fixed > 0) console.log(`[steam] repaired ${fixed} placeholder game name(s)`);
      })
      .catch((err) => console.error("[steam] initial app-list warm / name repair failed:", err));
  }, 8_000);
  setInterval(() => {
    refreshSteamAppList()
      .then(() => repairMissingGameNames(200))
      .then((fixed) => {
        if (fixed > 0) console.log(`[steam] repaired ${fixed} placeholder game name(s)`);
      })
      .catch((err) => console.error("[steam] scheduled name repair failed:", err));
  }, 30 * 60 * 1000);

  app.listen(Number(env.API_PORT), () => {
    console.log(`API listening on ${env.API_PORT}`);
  });
}

void bootstrap();
