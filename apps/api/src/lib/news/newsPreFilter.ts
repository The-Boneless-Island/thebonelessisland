import { db } from "../../db/client.js";

const MIN_TEXT_CHARS = 40;

const GAMING_SIGNAL =
  /\b(video game|gaming|playstation|xbox|nintendo|steam deck|steam|patch notes|dlc|multiplayer|esports|game developer|game studio|valve|bethesda|ubisoft|call of duty|elden ring|fortnite|minecraft|capcom|fromsoftware|dlc|season pass|battle pass)\b/i;
const ENTERTAINMENT_SIGNAL =
  /\b(box office|oscar|emmy|golden globe|streaming series|season finale|marvel studios|disney movie|film review|movie review|tv show premiere|cinema release|hollywood|red carpet)\b/i;

export function looksLikeNonGamingNews(title: string, body: string): boolean {
  const text = `${title} ${body}`.trim();
  if (!text) return false;
  if (GAMING_SIGNAL.test(text)) return false;
  return ENTERTAINMENT_SIGNAL.test(text);
}
const BLOCKED_HOSTS = new Set([
  "click.linksynergy.com",
  "bit.ly",
  "t.co"
]);

export type PreFilterRow = {
  id: number;
  external_id: string;
  title: string;
  url: string;
  contents: string | null;
};

export function preFilterReason(row: PreFilterRow): string | null {
  const title = (row.title ?? "").trim();
  if (title.length < 8) return "title_too_short";

  const body = (row.contents ?? "").trim();
  const combined = `${title} ${body}`.trim();
  if (combined.length < MIN_TEXT_CHARS) return "excerpt_too_short";

  try {
    const host = new URL(row.url).hostname.replace(/^www\./, "").toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return "blocked_domain";
  } catch {
    return "invalid_url";
  }

  if (looksLikeNonGamingNews(title, body)) return "off_topic_entertainment";

  return null;
}

/** Mark row as handled without LLM curation — keeps it out of the AI queue. */
export async function markPreFiltered(id: number, reason: string): Promise<void> {
  await db.query(
    `UPDATE general_news
        SET ai_curated_at = NOW(),
            ai_relevance_score = 0,
            ai_summary = NULL,
            ai_validation_failed = FALSE,
            ai_last_validation_errors = NULL,
            pre_filter_reason = $2
      WHERE id = $1`,
    [id, reason]
  );
}

export async function applyPreFilter<T extends PreFilterRow>(rows: T[]): Promise<T[]> {
  const kept: T[] = [];
  for (const row of rows) {
    const reason = preFilterReason(row);
    if (reason) {
      await markPreFiltered(row.id, reason);
      console.log(`[generalNews] pre-filter skip id=${row.id} (${reason})`);
    } else {
      kept.push(row);
    }
  }
  return kept;
}
