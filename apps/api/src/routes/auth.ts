import { createHash, randomBytes } from "node:crypto";
import express from "express";
import { z } from "zod";
import { env } from "../config.js";
import { db } from "../db/client.js";

const discordScope = encodeURIComponent("identify guilds.members.read");
export const authRouter = express.Router();

// Cookie name must match the one configured in server.ts so logout clears the
// right cookie (the __Host- prefix in prod is part of the name).
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-island_session" : "island_session";

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// express-session's regenerate/save/destroy are callback-based; promisify so the
// OAuth handler can await them in order (fixation defense: regenerate the
// pre-login session id once the user is authenticated).
function regenerateSession(req: express.Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );
}
function saveSession(req: express.Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
}

function redirectWithAuthError(res: express.Response, reason: string) {
  const separator = env.WEB_ORIGIN.includes("?") ? "&" : "?";
  res.redirect(`${env.WEB_ORIGIN}${separator}authError=${encodeURIComponent(reason)}`);
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1)
});

const discordUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  avatar: z.string().nullable(),
  global_name: z.string().nullable().optional(),
  banner: z.string().nullable().optional(),
  accent_color: z.number().nullable().optional(),
  premium_type: z.number().nullable().optional()
});

// Discord CDN: animated avatars/banners use an `a_` hash prefix and are served
// as .gif; everything else as .png. Always request an explicit size.
function discordAvatarUrl(userId: string, hash: string | null): string | null {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=256`;
}

function discordBannerUrl(userId: string, hash: string | null | undefined): string | null {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${userId}/${hash}.${ext}?size=600`;
}

authRouter.get("/discord/login", (req, res) => {
  // state defends the OAuth round-trip against CSRF; PKCE (S256) additionally
  // binds the auth code to this browser so an intercepted code can't be
  // redeemed elsewhere. PKCE is now recommended for confidential clients too
  // (RFC 9700 / OAuth 2.1); client_secret is still sent at token exchange.
  const state = randomBytes(16).toString("hex");
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;
  const redirect = [
    "https://discord.com/oauth2/authorize",
    `?client_id=${env.DISCORD_CLIENT_ID}`,
    "&response_type=code",
    `&redirect_uri=${encodeURIComponent(env.DISCORD_REDIRECT_URI)}`,
    `&scope=${discordScope}`,
    `&state=${state}`,
    `&code_challenge=${codeChallenge}`,
    "&code_challenge_method=S256"
  ].join("");
  res.redirect(redirect);
});

authRouter.get("/discord/callback", async (req, res) => {
  if (req.session?.userId) {
    res.redirect(env.WEB_ORIGIN);
    return;
  }

  const { code, state } = req.query;
  if (!code || !state || state !== req.session?.oauthState) {
    res.status(400).json({ error: "Invalid OAuth callback state" });
    return;
  }
  const codeVerifier = req.session?.codeVerifier;

  try {
    const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: env.DISCORD_REDIRECT_URI,
        // PKCE: bind the code to the verifier minted at /login.
        ...(codeVerifier ? { code_verifier: codeVerifier } : {})
      })
    });

    if (!tokenResp.ok) {
      res.status(401).json({ error: "OAuth token exchange failed" });
      return;
    }

    const tokenJson = tokenResponseSchema.parse(await tokenResp.json());
    const meResp = await fetch("https://discord.com/api/users/@me", {
      headers: { authorization: `Bearer ${tokenJson.access_token}` }
    });

    if (!meResp.ok) {
      res.status(401).json({ error: "Discord user lookup failed" });
      return;
    }

    const me = discordUserSchema.parse(await meResp.json());

    if (!env.DISCORD_GUILD_ID) {
      req.session.destroy(() => redirectWithAuthError(res, "guild_not_configured"));
      return;
    }

    const guildMemberResp = await fetch(
      `https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
      {
        headers: { authorization: `Bearer ${tokenJson.access_token}` }
      }
    );
    if (!guildMemberResp.ok) {
      req.session.destroy(() => redirectWithAuthError(res, "not_in_guild"));
      return;
    }

    const upsert = await db.query<{ id: string }>(
      `
        INSERT INTO users (discord_user_id)
        VALUES ($1)
        ON CONFLICT (discord_user_id) DO UPDATE SET discord_user_id = EXCLUDED.discord_user_id
        RETURNING id
      `,
      [me.id]
    );
    const userId = upsert.rows[0]?.id;

    if (!userId) {
      throw new Error("User upsert failed");
    }

    await db.query(
      `
        INSERT INTO discord_profiles
          (user_id, username, avatar_url, global_name, banner_url, accent_color, premium_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id)
        DO UPDATE SET
          username = EXCLUDED.username,
          avatar_url = EXCLUDED.avatar_url,
          global_name = EXCLUDED.global_name,
          banner_url = EXCLUDED.banner_url,
          accent_color = EXCLUDED.accent_color,
          premium_type = EXCLUDED.premium_type
      `,
      [
        userId,
        me.username,
        discordAvatarUrl(me.id, me.avatar),
        me.global_name ?? null,
        discordBannerUrl(me.id, me.banner),
        me.accent_color ?? null,
        me.premium_type ?? null
      ]
    );

    // Regenerate the session id now that the user is authenticated (drops the
    // pre-login id that carried oauthState/codeVerifier — session fixation
    // defense), then stamp identity + creation time and persist before redirect.
    await regenerateSession(req);
    req.session.userId = me.id;
    req.session.createdAt = Date.now();
    await saveSession(req);
    res.redirect(env.WEB_ORIGIN);
  } catch (error) {
    console.error("OAuth callback failed", error);
    res.status(502).json({ error: "Discord authentication failed" });
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    res.json({ ok: true });
  });
});
