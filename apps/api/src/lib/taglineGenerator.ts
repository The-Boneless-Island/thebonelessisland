import { AIDisabledError, AINotConfiguredError, getAIProvider } from "./ai/index.js";
import { db } from "../db/client.js";
import { loadSettings } from "./serverSettings.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const GENERATION_PROMPT = `You are a witty copywriter specializing in gaming culture and internet humor. Generate exactly 50 rotating subtitle taglines for "The Boneless Island," a close-knit gaming community website.

These appear as subtitle text beneath the site title — like Minecraft splash text. One is shown per visit.

Audience: Gamers with roots in retro gaming, competitive/esports, horror games, streaming culture. Tight-knit community with chaotic meme energy.

Rules:
- Each tagline: one short line, ideally under 40 characters
- Tone: witty, dry, absurdist, self-deprecating, or unexpectedly profound — never try-hard
- No buzzwords, no marketing copy, nothing generic
- No politics
- Mix site callbacks with standalone non-sequiturs (lean non-sequiturs)
- Weave in "Nuggies" (₦) as fictional currency naturally where it fits (e.g., "Lost ₦160 on a coin flip")
- Include gaming references: retro, esports, horror, streaming culture
- Vary tone across absurdist, gaming-specific, self-referential, meme-y
- This replaces last week's list — keep it fresh, don't repeat obvious ones

Return ONLY a valid JSON array of exactly 50 strings. No explanation, no markdown fences, no code block. Raw JSON only.

Example: ["Tagline one.", "Tagline two.", ...]`;

export async function generateTaglines(): Promise<string[]> {
  const ai = getAIProvider();
  const result = await ai.complete(
    [{ role: "user", content: GENERATION_PROMPT }],
    { maxTokens: 2048, temperature: 0.9 }
  );

  // Strip optional markdown fence the model may emit.
  const raw = result.text.trim();
  const text = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
    : raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`AI returned non-JSON response: ${text.slice(0, 120)}`);
  }

  if (!Array.isArray(parsed) || parsed.length < 10) {
    throw new Error(`AI returned invalid tagline list (length=${Array.isArray(parsed) ? parsed.length : "N/A"})`);
  }

  return (parsed as string[]).slice(0, 50);
}

export async function refreshTaglines(): Promise<void> {
  let taglines: string[];
  try {
    taglines = await generateTaglines();
  } catch (err) {
    if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
      console.log(`[taglines] skipped: ${err.message}`);
      return;
    }
    throw err;
  }
  await db.query(
    `UPDATE server_settings SET value = $1, updated_at = NOW() WHERE key = 'splash_taglines'`,
    [JSON.stringify(taglines)]
  );
  await loadSettings();
  console.log(`[taglines] refreshed ${taglines.length} taglines`);
}

export async function getTaglines(): Promise<string[]> {
  const result = await db.query<{ value: string }>(
    `SELECT value FROM server_settings WHERE key = 'splash_taglines'`
  );
  const raw = result.rows[0]?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function isTaglineStale(): Promise<boolean> {
  const result = await db.query<{ updated_at: string }>(
    `SELECT updated_at FROM server_settings WHERE key = 'splash_taglines'`
  );
  const row = result.rows[0];
  if (!row?.updated_at) return true;
  return Date.now() - new Date(row.updated_at).getTime() > SEVEN_DAYS_MS;
}
