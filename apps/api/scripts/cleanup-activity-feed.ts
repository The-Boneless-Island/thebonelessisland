import { db } from "../src/db/client.js";

(async () => {
  // 1. Purge steam.synced events — automatic background sync, not feed-worthy.
  const purged = await db.query(
    "DELETE FROM activity_events WHERE event_type = 'steam.synced' RETURNING id"
  );
  console.log("Purged steam.synced events:", purged.rowCount);

  // 2. Backfill achievement.unlocked for users who already hold earned-tier
  //    items but never got a feed event. Insert one event per (user, item)
  //    using the inventory's purchased_at (= grant time) as created_at.
  const achBackfill = await db.query(
    `
      INSERT INTO activity_events (event_type, actor_user_id, payload, created_at)
      SELECT
        'achievement.unlocked',
        i.user_id,
        jsonb_build_object(
          'key', LOWER(REPLACE(s.name, ' ', '_')),
          'name', s.name,
          'itemType', s.item_type,
          'emoji', COALESCE(s.item_data->>'emoji', '✨')
        ),
        i.purchased_at
      FROM nuggies_inventory i
      INNER JOIN nuggies_shop_items s ON s.id = i.item_id
      WHERE s.acquisition = 'earned'
        AND NOT EXISTS (
          SELECT 1 FROM activity_events ae
          WHERE ae.event_type = 'achievement.unlocked'
            AND ae.actor_user_id = i.user_id
            AND ae.payload->>'name' = s.name
        )
      RETURNING id
    `
  );
  console.log("Backfilled achievement.unlocked events:", achBackfill.rowCount);

  // 3. Backfill milestone.reached for users whose current balance already
  //    crosses one or more tier thresholds. Uses NOW() as created_at since
  //    we don't track when each threshold was first crossed historically.
  const tiers = [
    { threshold: 100,    label: "DRIFTWOOD",    emblem: "🪵" },
    { threshold: 500,    label: "BRONZE CONCH", emblem: "🐚" },
    { threshold: 1000,   label: "SILVER TIDE",  emblem: "🌊" },
    { threshold: 5000,   label: "GOLD COAST",   emblem: "🏖️" },
    { threshold: 10000,  label: "KRAKENSLAYER", emblem: "🦑" },
  ];
  let milestoneInserted = 0;
  for (const tier of tiers) {
    const r = await db.query(
      `
        INSERT INTO activity_events (event_type, actor_user_id, payload, created_at)
        SELECT
          'milestone.reached',
          nb.user_id,
          jsonb_build_object(
            'label', $1::text,
            'threshold', $2::int,
            'emoji', $3::text
          ),
          NOW()
        FROM nuggies_balances nb
        INNER JOIN users u ON u.id = nb.user_id
        WHERE nb.balance >= $2::int
          AND u.nuggies_opted_out = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM activity_events ae
            WHERE ae.event_type = 'milestone.reached'
              AND ae.actor_user_id = nb.user_id
              AND ae.payload->>'label' = $1::text
          )
        RETURNING id
      `,
      [tier.label, tier.threshold, tier.emblem]
    );
    milestoneInserted += r.rowCount ?? 0;
  }
  console.log("Backfilled milestone.reached events:", milestoneInserted);

  await db.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
