import cookieSession from "cookie-session";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { env } from "./config.js";
import { activityRouter } from "./routes/activity.js";
import { aiChatRouter } from "./routes/aiChat.js";
import { authRouter } from "./routes/auth.js";
import { gameNewsRouter } from "./routes/gameNews.js";
import { gameNewsSourcesRouter } from "./routes/gameNewsSources.js";
import { generalNewsRouter } from "./routes/generalNews.js";
import { internalRouter } from "./routes/internal.js";
import { gameNightRouter } from "./routes/gameNights.js";
import { membersRouter } from "./routes/members.js";
import { newsCardsRouter } from "./routes/newsCards.js";
import { newsSourcesRouter } from "./routes/newsSources.js";
import { nuggiesRouter } from "./routes/nuggies.js";
import { nuggiesGamesRouter } from "./routes/nuggiesGames.js";
import { registerAllGames } from "./lib/games/index.js";
import { ingestAndCurateGeneralNews } from "./lib/generalNewsIngestion.js";
import { sweepExpiredGames } from "./lib/nuggiesGames.js";
import { processDefaultedLoans } from "./lib/nuggiesLedger.js";
import { forumsRouter } from "./routes/forums.js";
import { taglinesRouter } from "./routes/taglines.js";
import { profileRouter } from "./routes/profile.js";
import { settingsRouter } from "./routes/settings.js";
import { seedCuratedSources } from "./lib/news/curatedSources.js";
import { loadSettings } from "./lib/serverSettings.js";
import { isTaglineStale, refreshTaglines } from "./lib/taglineGenerator.js";
import { runMigrations } from "./db/runMigrations.js";
import { recommendationRouter } from "./routes/recommendations.js";
import { steamRouter } from "./routes/steam.js";

const app = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true
  })
);
app.use(express.json());
app.use(
  cookieSession({
    name: "island_session",
    secret: env.SESSION_SECRET,
    sameSite: "lax",
    httpOnly: true
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/ai", aiChatRouter);
app.use("/profile", profileRouter);
app.use("/steam", steamRouter);
app.use("/recommendations", recommendationRouter);
app.use("/game-nights", gameNightRouter);
app.use("/games", gameNewsRouter);
app.use("/game-news-sources", gameNewsSourcesRouter);
app.use("/news-sources", newsSourcesRouter);
app.use("/news", generalNewsRouter);
app.use("/activity", activityRouter);
app.use("/news-cards", newsCardsRouter);
app.use("/members", membersRouter);
app.use("/settings", settingsRouter);
app.use("/nuggies/games", nuggiesGamesRouter);
app.use("/nuggies", nuggiesRouter);
app.use("/forums", forumsRouter);
app.use("/taglines", taglinesRouter);
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

  app.listen(Number(env.API_PORT), () => {
    console.log(`API listening on ${env.API_PORT}`);
  });
}

void bootstrap();
