import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { db } from "../db/client.js";
import { env } from "../config.js";
import { getGuildId, getParentRoleName } from "./serverSettings.js";

/**
 * Constant-time check of the bot shared-secret header. A plain `===` short-circuits
 * on the first differing byte, leaking the secret's length and matching prefix through
 * response timing; timingSafeEqual always compares the full buffer. Returns false when
 * the header is absent or BOT_API_SHARED_SECRET is unset.
 */
export function isValidBotSecret(headerValue: string | undefined): boolean {
  const expected = env.BOT_API_SHARED_SECRET;
  if (!headerValue || !expected) return false;
  const provided = Buffer.from(headerValue);
  const known = Buffer.from(expected);
  // Length guard keeps timingSafeEqual from throwing on a length mismatch. The
  // secret's length is fixed config, not sensitive, so this branch leaks nothing.
  return provided.length === known.length && timingSafeEqual(provided, known);
}

/** Accepts either a valid session OR a bot request (shared secret + x-discord-user-id header). */
export function requireBotOrSession(req: Request, res: Response, next: NextFunction) {
  const botSecret = req.get("x-island-bot-secret");
  if (isValidBotSecret(botSecret)) {
    const discordUserId = req.get("x-discord-user-id");
    if (!discordUserId) {
      res.status(400).json({ error: "Bot requests require x-discord-user-id header" });
      return;
    }
    res.locals.userId = discordUserId;
    next();
    return;
  }
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.locals.userId = userId;
  next();
}

/** Bot-only: rejects everything except a valid bot shared-secret request. */
export function requireBotSecret(req: Request, res: Response, next: NextFunction) {
  if (!isValidBotSecret(req.get("x-island-bot-secret"))) {
    res.status(401).json({ error: "Bot secret required" });
    return;
  }
  next();
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.locals.userId = userId;
  next();
}

export async function requireParentRole(req: Request, res: Response, next: NextFunction) {
  const discordUserId = req.session?.userId;
  if (!discordUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const guildId = getGuildId();
  if (!guildId) {
    res.status(503).json({ error: "Guild not configured" });
    return;
  }

  const result = await db.query<{ role_names: string[] }>(
    `
      SELECT COALESCE(role_names, '{}'::text[]) AS role_names
      FROM guild_members
      WHERE guild_id = $1
        AND discord_user_id = $2
        AND in_guild = TRUE
      LIMIT 1
    `,
    [guildId, String(discordUserId)]
  );

  const roleNames = result.rows[0]?.role_names ?? [];
  if (!roleNames.includes(getParentRoleName())) {
    res.status(403).json({ error: "Parent role required" });
    return;
  }

  res.locals.userId = discordUserId;
  next();
}
