-- Discord guild custom emoji cache, powering the forum reaction picker's
-- "Island" tab (WS6: emoji reactions beyond the fixed 5-key set).
--
-- Synced lazily from the Discord REST API (see forums.ts syncGuildEmojis) —
-- this table is a cache, not a source of truth. `available` flips to false
-- for emoji that disappear from a later sync rather than deleting the row,
-- so historical reactions using a since-removed custom emoji can still be
-- looked up.

CREATE TABLE IF NOT EXISTS guild_emojis (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  animated BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
