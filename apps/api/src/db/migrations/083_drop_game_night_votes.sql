-- Drop the dead game_night_votes table.
--
-- Game-night voting was deliberately removed long ago: the UI is gone and no
-- code path ever INSERTs into this table, so it has been write-dead. The last
-- reader (a fallback in the /game-nights recommender) was removed in the same
-- change set as this migration. Nothing FK-references the table, so the drop is
-- self-contained.
--
-- Do NOT re-introduce game-night voting without explicit confirmation
-- (see CLAUDE.md invariants / DESIGN_NOTES).
--
-- Safe to re-run — DROP ... IF EXISTS.

DROP TABLE IF EXISTS game_night_votes;
