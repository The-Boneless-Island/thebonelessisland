import {
  formatNuggiesReason,
  isLegacyNuggiesReason,
  parseLegacyReason,
} from "@island/shared";
import { db } from "./client.js";

const BACKFILL_KEY = "nuggies_reason_backfill_v1";

type TxRow = {
  id: string;
  user_id: string;
  amount: string;
  type: string;
  reason: string;
  reference_id: string | null;
};

async function resolveDisplayName(discordUserId: string): Promise<string | null> {
  const r = await db.query<{ name: string }>(
    `SELECT COALESCE(gm.display_name, dp.username, u.discord_user_id) AS name
     FROM users u
     LEFT JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id
     LEFT JOIN discord_profiles dp ON dp.user_id = u.id
     WHERE u.discord_user_id = $1
     LIMIT 1`,
    [discordUserId]
  );
  return r.rows[0]?.name ?? null;
}

function extractTradeDiscordId(type: string, reason: string, referenceId: string | null): string | null {
  if (referenceId?.startsWith("trade:")) {
    return referenceId.slice("trade:".length);
  }
  const out = reason.match(/^Sent to (\d+)/);
  if (type === "trade_out" && out) return out[1];
  const inn = reason.match(/^Received from (\d+)/);
  if (type === "trade_in" && inn) return inn[1];
  return null;
}

export async function backfillNuggiesTransactionReasons(): Promise<{ updated: number; skipped: number }> {
  const done = await db.query<{ value: string }>(
    "SELECT value FROM server_settings WHERE key = $1 LIMIT 1",
    [BACKFILL_KEY]
  );
  if (done.rows[0]?.value === "done") {
    return { updated: 0, skipped: 0 };
  }

  const rows = await db.query<TxRow>(
    `SELECT id, user_id, amount, type, reason, reference_id
     FROM nuggies_transactions
     ORDER BY id ASC`
  );

  let updated = 0;
  let skipped = 0;
  const nameCache = new Map<string, string>();

  for (const row of rows.rows) {
    const amount = parseInt(row.amount, 10);
    const type = row.type;

    if (!isLegacyNuggiesReason(type, row.reason)) {
      skipped++;
      continue;
    }

    let metadata = parseLegacyReason(type, row.reason) ?? undefined;

    if (type === "trade_out" || type === "trade_in") {
      const discordId = extractTradeDiscordId(type, row.reason, row.reference_id);
      if (discordId) {
        let name = nameCache.get(discordId);
        if (!name) {
          name = (await resolveDisplayName(discordId)) ?? discordId;
          nameCache.set(discordId, name);
        }
        metadata = { ...metadata, counterpartyName: name };
      }
    }

    const newReason = formatNuggiesReason({ type, amount, metadata });
    if (newReason === row.reason) {
      skipped++;
      continue;
    }

    await db.query("UPDATE nuggies_transactions SET reason = $1 WHERE id = $2", [newReason, row.id]);
    updated++;
  }

  await db.query(
    `INSERT INTO server_settings (key, value, label, description, is_secret)
     VALUES ($1, 'done', 'Nuggies reason backfill', 'One-shot ledger copy migration marker', FALSE)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [BACKFILL_KEY]
  );

  console.log(`[migrations] nuggies reason backfill: ${updated} updated, ${skipped} skipped`);
  return { updated, skipped };
}
