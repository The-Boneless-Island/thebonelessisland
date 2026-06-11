import cookieSession from "cookie-session";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { env } from "./config.js";
import { installRedactor } from "./lib/logger.js";

// Install console redactor immediately after env is parsed. Every log call
// from this point on (including third-party libraries that use console)
// will have any matching secret value replaced with [REDACTED].
installRedactor();
import { requireSession } from "./lib/auth.js";
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
import { sweepExpiredGames } from "./lib/nuggiesGames.js";
import { processDefaultedLoans } from "./lib/nuggiesLedger.js";
import { syncWishlistPrices } from "./lib/priceSync.js";
import { syncSteamPlayerSummaries } from "./lib/steamPlayerSync.js";
import { buildAndStoreWeeklyDigest } from "./lib/weeklyDigest.js";
import { getAISetting } from "./lib/serverSettings.js";
import { db } from "./db/client.js";
import { forumsRouter } from "./routes/forums.js";
import { taglinesRouter } from "./routes/taglines.js";
import { profileRouter } from "./routes/profile.js";
import { settingsRouter } from "./routes/settings.js";
import { seedCuratedSources } from "./lib/news/curatedSources.js";
import { loadSettings } from "./lib/serverSettings.js";
import { isTaglineStale, refreshTaglines } from "./lib/taglineGenerator.js";
import { runMigrations } from "./db/runMigrations.js";
import { recommendationRouter } from "./routes/recommendations.js";
import { steamRouter, syncAllOwnedGames } from "./routes/steam.js";
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

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true
  })
);
app.use(express.json());

// Session cookie hardening:
//   keys[]     — first signs new cookies, all verify existing ones. Lets
//                you set SESSION_SECRET_PREVIOUS during rotation so users
//                stay logged in across a secret change.
//   secure     — HTTPS-only in prod. Auto-off in dev so localhost works.
//   sameSite   — 'lax' blocks CSRF on state-changing requests while still
//                allowing OAuth redirects from Discord.
//   httpOnly   — JS can't read the cookie → XSS can't exfiltrate session.
//   maxAge     — explicit 30-day expiry caps session theft window.
const sessionKeys = [env.SESSION_SECRET];
if (process.env.SESSION_SECRET_PREVIOUS) {
  sessionKeys.push(process.env.SESSION_SECRET_PREVIOUS);
}
if (env.SESSION_SECRET.length < 32) {
  console.warn("[security] SESSION_SECRET shorter than 32 chars — rotate to a strong random value before prod.");
}
app.use(
  cookieSession({
    name: "island_session",
    keys: sessionKeys,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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

// Rate limits are scoped to specific risk classes; everything else gets the
// generous defaultLimiter. The /internal router stays unlimited because the
// bot is trusted and uses a shared-secret auth header — caller is us.
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
app.use("/nuggies/games", defaultLimiter, nuggiesGamesRouter);
app.use("/nuggies", defaultLimiter, nuggiesRouter);
app.use("/forums", defaultLimiter, forumsRouter);
app.use("/taglines", defaultLimiter, taglinesRouter);
app.use("/internal", internalRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request payload", details: error.flatten() });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

// Run migrations + load settings before accepting requests
async function bootstrap() {
  try {
    const { applied, skipped } = await runMigrations();
    console.log(`[boot] migrations: ${applied} applied, ${skipped} skipped`);
  } catch (err) {
    console.error("[boot] migration runner failed:", err);
  }
  try {
    await loadSettings();
  } catch (err) {
    console.error("[boot] settings load failed — starting anyway:", err);
  }

  try {
    await seedCuratedSources();
  } catch (err) {
    console.error("[boot] news source seed failed — starting anyway:", err);
  }

  // Refresh taglines on startup if stale (> 7 days), then check daily
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

  // Member sync: server is now the sole driver (the web client no longer
  // POSTs /members/sync per tab). Run shortly after boot, then every 60s.
  setTimeout(() => {
    syncGuildMembers()
      .then(() => broadcast("members-changed"))
      .catch((err) => {
        console.error("[members] initial sync failed:", err);
      });
  }, 5_000);
  setInterval(() => {
    syncGuildMembers()
      .then(() => broadcast("members-changed"))
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

  app.listen(Number(env.API_PORT), () => {
    console.log(`API listening on ${env.API_PORT}`);
  });
}

void bootstrap();
