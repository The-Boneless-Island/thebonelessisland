import express from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireSession } from "../lib/auth.js";
import { getAIProvider } from "../lib/ai/index.js";
import { getGuildId } from "../lib/serverSettings.js";
import { whatCanWePlay } from "../lib/recommend.js";
import { getNuggiePersona, buildSystemPrompt } from "../lib/persona/nuggie.js";

export const aiChatRouter = express.Router();
aiChatRouter.use(requireSession);

// Cap total history at ~800 chars to keep input tokens predictable.
// Newer messages are kept; old ones are dropped from the front.
const HISTORY_CHAR_BUDGET = 800;

const chatSchema = z.object({
  message: z.string().min(1).max(800),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(600) }))
    .max(12)
    .default([])
});

async function buildCrewContext(discordUserId: string): Promise<string> {
  const guildId = getGuildId();
  if (!guildId) return "No guild configured.";

  const [voiceResult, topGamesResult, recentActivityResult] = await Promise.all([
    db.query<{ discord_user_id: string; display_name: string }>(
      `SELECT discord_user_id, display_name FROM guild_members
       WHERE guild_id = $1 AND in_guild = TRUE AND in_voice = TRUE
       ORDER BY display_name ASC LIMIT 16`,
      [guildId]
    ),
    // Compact: top 8 owned games, just name + count
    db.query<{ name: string; owners: number }>(
      `SELECT g.name, COUNT(DISTINCT u.id)::int AS owners
       FROM games g
       INNER JOIN shareable_user_games ug ON ug.app_id = g.app_id
       INNER JOIN users u ON u.id = ug.user_id
       INNER JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $1 AND gm.in_guild = TRUE
       GROUP BY g.app_id, g.name
       ORDER BY owners DESC
       LIMIT 8`,
      [guildId]
    ),
    // Top 2 recent games per member — ordered so we get the highest playtime first
    db.query<{ display_name: string; game_name: string; playtime_2weeks: number }>(
      `SELECT
         COALESCE(gm.display_name, gm.username) AS display_name,
         g.name AS game_name,
         ug.playtime_2weeks
       FROM shareable_user_games ug
       INNER JOIN games g ON g.app_id = ug.app_id
       INNER JOIN users u ON u.id = ug.user_id
       INNER JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $1 AND gm.in_guild = TRUE
       WHERE ug.playtime_2weeks > 0
       ORDER BY ug.playtime_2weeks DESC
       LIMIT 20`,
      [guildId]
    )
  ]);

  const voiceMembers = voiceResult.rows.map((r) => r.display_name);

  // Compact game list: "Game A(12) Game B(8)"
  const topGames = topGamesResult.rows.map((g) => `${g.name}(${g.owners})`).join(" ");

  // Compact recent activity: "Matt→Helldivers 2(8h) Elden Ring(3h) · Dave→..."
  const recentByMember = new Map<string, string[]>();
  for (const row of recentActivityResult.rows) {
    const existing = recentByMember.get(row.display_name) ?? [];
    if (existing.length < 2) {
      const h = Math.round((row.playtime_2weeks / 60) * 10) / 10;
      existing.push(`${row.game_name}(${h}h)`);
      recentByMember.set(row.display_name, existing);
    }
  }
  const recentStr = [...recentByMember.entries()]
    .map(([name, games]) => `${name}→${games.join(" ")}`)
    .join(" · ");

  const lines: string[] = [];

  if (voiceMembers.length > 0) {
    lines.push(`Voice: ${voiceMembers.join(", ")}`);
  }
  if (topGames) {
    lines.push(`Top owned(count): ${topGames}`);
  }
  if (recentStr) {
    lines.push(`Played this week: ${recentStr}`);
  }

  // Add a top recommendation only when crew is in voice
  if (voiceMembers.length >= 2) {
    const memberIds = voiceResult.rows.map((r) => r.discord_user_id);
    const recs = await whatCanWePlay({ memberIds, sessionLength: "any", maxGroupSize: memberIds.length }).catch(() => []);
    if (recs[0]) {
      lines.push(`Best pick for current voice crew: ${recs[0].name}`);
    }
  }

  return lines.join("\n");
}

/** Trim history from the front to stay within a total char budget. */
function trimHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): Array<{ role: "user" | "assistant"; content: string }> {
  let total = history.reduce((sum, m) => sum + m.content.length, 0);
  const trimmed = [...history];
  while (total > HISTORY_CHAR_BUDGET && trimmed.length > 0) {
    const dropped = trimmed.shift()!;
    total -= dropped.content.length;
  }
  return trimmed;
}

aiChatRouter.post("/chat", async (req, res) => {
  const { message, history } = chatSchema.parse(req.body);
  const discordUserId = String(res.locals.userId);

  let ai;
  try {
    ai = getAIProvider();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI not configured";
    res.status(503).json({ error: msg });
    return;
  }

  let crewContext = "";
  try {
    crewContext = await buildCrewContext(discordUserId);
  } catch (err) {
    console.error("[aiChat] buildCrewContext failed:", err);
  }

  // Persona-driven system prompt — single source of truth across web chat,
  // /nuggie ask, and announcement generation (see lib/persona/nuggie.ts +
  // server_settings nuggie_*). Crew context is appended after the persona
  // block so the cached prefix stays stable per session.
  const persona = getNuggiePersona();
  const systemPrompt = [
    buildSystemPrompt(persona, "web"),
    crewContext ? `\nCrew context:\n${crewContext}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const trimmedHistory = trimHistory(
    history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content }))
  );

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...trimmedHistory,
    { role: "user" as const, content: message }
  ];

  try {
    const result = await ai.complete(messages, { maxTokens: 512 });
    res.json({ reply: result.text, provider: result.provider, model: result.model });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    console.error("[aiChat] ai.complete failed:", err);
    res.status(502).json({ error: `AI error: ${msg}` });
  }
});
