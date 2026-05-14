import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const Env = z.object({
  API_PORT: z.string().default("3000"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/boneless"),
  SESSION_SECRET: z.string().default("dev-secret"),
  BOT_API_SHARED_SECRET: z.string().default(""),
  DISCORD_CLIENT_ID: z.string().default(""),
  DISCORD_CLIENT_SECRET: z.string().default(""),
  DISCORD_REDIRECT_URI: z.string().default("http://localhost:3000/auth/discord/callback"),
  DISCORD_GUILD_ID: z.string().default(""),
  DISCORD_BOT_TOKEN: z.string().default(""),
  PARENT_ROLE_NAME: z.string().default("Parent"),
  STEAM_WEB_API_KEY: z.string().default(""),
  IGDB_IMAGE_FALLBACK_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  IGDB_CLIENT_ID: z.string().default(""),
  IGDB_CLIENT_SECRET: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default("")
});

export const env = Env.parse(process.env);
