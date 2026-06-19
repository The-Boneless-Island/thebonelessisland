-- Server-side session store (connect-pg-simple). Replaces the previous
-- stateless cookie-session: sessions are now rows, so they can be revoked
-- instantly (member ban / leaving the guild) and survive secret rotation.
--
-- The table/column names (session, sid, sess, expire) are fixed by
-- connect-pg-simple — DO NOT rename. We keep `userId` (the Discord id) and
-- `createdAt` inside the `sess` JSON, which lets the revocation sweep target a
-- specific member: DELETE FROM "session" WHERE sess->>'userId' = $1.
--
-- One-time effect at deploy: old cookie-session cookies become meaningless
-- (different name + format), so every member re-logs in once via Discord.

CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
    ALTER TABLE "session"
      ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
