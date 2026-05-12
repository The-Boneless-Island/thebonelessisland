import { db } from "../src/db/client.js";

(async () => {
  const before = await db.query<{
    daily_tx: number;
    first_blood_owned: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM nuggies_transactions WHERE type='daily')::int AS daily_tx,
      (SELECT COUNT(*) FROM nuggies_inventory i
        INNER JOIN nuggies_shop_items s ON s.id = i.item_id
        WHERE s.acquisition='earned' AND s.name='FIRST BLOOD')::int AS first_blood_owned
  `);
  console.log("BEFORE:", before.rows[0]);

  const tx = await db.query(
    "DELETE FROM nuggies_transactions WHERE type='daily' RETURNING id"
  );
  const inv = await db.query(`
    DELETE FROM nuggies_inventory
    WHERE item_id IN (SELECT id FROM nuggies_shop_items WHERE acquisition='earned' AND name='FIRST BLOOD')
    RETURNING user_id
  `);

  console.log("DELETED daily transactions:", tx.rowCount);
  console.log("DELETED first_blood inventory rows:", inv.rowCount);

  const after = await db.query<{
    daily_tx: number;
    first_blood_owned: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM nuggies_transactions WHERE type='daily')::int AS daily_tx,
      (SELECT COUNT(*) FROM nuggies_inventory i
        INNER JOIN nuggies_shop_items s ON s.id = i.item_id
        WHERE s.acquisition='earned' AND s.name='FIRST BLOOD')::int AS first_blood_owned
  `);
  console.log("AFTER:", after.rows[0]);

  await db.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
