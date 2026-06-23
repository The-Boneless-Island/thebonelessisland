import { db } from "../db/client.js";

// CheapShark store id for Steam. The deals endpoint returns one entry per
// store carrying the game; we only care about the Steam storefront so the
// numbers line up with the rest of the catalog (Steam app ids, Steam prices).
const CHEAPSHARK_STEAM_STORE_ID = "1";
// Be polite to the free, keyless CheapShark API — same 200ms throttle used by
// the Steam sync loop in routes/steam.ts.
const CHEAPSHARK_THROTTLE_MS = 200;

type CheapSharkDeal = {
  storeID?: string;
  salePrice?: string;
  normalPrice?: string;
  savings?: string;
  isOnSale?: string;
};

type WishlistPrice = {
  currency: string;
  initialCents: number | null;
  finalCents: number | null;
  discountPct: number | null;
  isFree: boolean;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dollarsToCents(value: string | undefined): number | null {
  if (value === undefined) return null;
  const dollars = Number.parseFloat(value);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

// CheapShark prices are USD dollar strings; convert to integer cents and clamp
// the discount to a sane 0-100 integer percent.
function parseSteamDeal(deals: CheapSharkDeal[]): WishlistPrice | null {
  const steamDeal = deals.find((deal) => deal.storeID === CHEAPSHARK_STEAM_STORE_ID);
  if (!steamDeal) return null;

  const finalCents = dollarsToCents(steamDeal.salePrice);
  const initialCents = dollarsToCents(steamDeal.normalPrice);

  let discountPct: number | null = null;
  if (steamDeal.savings !== undefined) {
    const savings = Number.parseFloat(steamDeal.savings);
    if (Number.isFinite(savings)) {
      discountPct = Math.min(100, Math.max(0, Math.round(savings)));
    }
  }

  const isFree = finalCents === 0;

  return {
    currency: "USD",
    initialCents,
    finalCents,
    discountPct,
    isFree
  };
}

async function fetchSteamPrice(appId: number): Promise<WishlistPrice | null> {
  const url = `https://www.cheapshark.com/api/1.0/deals?steamAppID=${appId}&storeID=${CHEAPSHARK_STEAM_STORE_ID}`;
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) {
    return null;
  }
  const payload = (await response.json().catch(() => [])) as CheapSharkDeal[];
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  return parseSteamDeal(payload);
}

/**
 * Refresh Steam price columns on the games table for every app present in the
 * crew wishlist union (user_wishlists). Queries CheapShark for current pricing,
 * one app at a time with a polite throttle, and swallows per-app fetch errors so
 * a single bad app id never aborts the batch. Returns how many apps were checked
 * and how many rows were actually updated.
 */
export async function syncWishlistPrices(): Promise<{ checked: number; updated: number }> {
  // Privacy note: this reads the raw user_wishlists table, NOT the
  // shareable_user_wishlists view, by deliberate exemption from the "crew-facing
  // queries must read the shareable_* view" invariant. This is an internal
  // catalog-maintenance job — it selects bare app_ids only (never user_id) and
  // writes public price columns on the global `games` table, so it exposes nothing
  // about who wishlisted what. Switching to the view would only drop price refreshes
  // for games wishlisted solely by private/excluded members (leaving those catalog
  // rows stale) with zero privacy benefit.
  const { rows } = await db.query<{ app_id: number }>(
    `
      SELECT DISTINCT app_id
      FROM user_wishlists
      ORDER BY app_id
    `
  );

  let checked = 0;
  let updated = 0;

  for (const { app_id: appId } of rows) {
    checked += 1;

    let price: WishlistPrice | null = null;
    try {
      price = await fetchSteamPrice(appId);
    } catch {
      price = null;
    }

    if (price) {
      const result = await db.query(
        `
          UPDATE games
          SET price_currency = $2,
              price_initial_cents = $3,
              price_final_cents = $4,
              price_discount_pct = $5,
              is_free = $6,
              historical_low_cents = CASE
                WHEN $4::integer IS NOT NULL AND $4::integer > 0
                  THEN LEAST(COALESCE(historical_low_cents, $4::integer), $4::integer)
                ELSE historical_low_cents
              END,
              price_checked_at = NOW()
          WHERE app_id = $1
        `,
        [
          appId,
          price.currency,
          price.initialCents,
          price.finalCents,
          price.discountPct,
          price.isFree
        ]
      );
      updated += result.rowCount ?? 0;
    }

    await delay(CHEAPSHARK_THROTTLE_MS);
  }

  return { checked, updated };
}
