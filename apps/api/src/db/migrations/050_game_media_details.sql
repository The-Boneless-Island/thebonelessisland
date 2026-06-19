-- Widen the games catalog with the rich media + rating fields that the Steam
-- store appdetails JSON already returns (and that fetchSteamAppDetails already
-- pays for) but which the migration-045 enrichment threw away. The game detail
-- drawer is now the consumer: it can show a description, a screenshot strip, a
-- Metacritic badge, platform icons, and a controller-support chip.
--
-- screenshots is JSONB: an array of { thumb, full } objects, capped in code.
-- No new external calls — these come from the same response as name/price.
ALTER TABLE games ADD COLUMN IF NOT EXISTS short_description   TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS screenshots         JSONB;
ALTER TABLE games ADD COLUMN IF NOT EXISTS background_url      TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS metacritic_score    INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS metacritic_url      TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS platform_windows    BOOLEAN;
ALTER TABLE games ADD COLUMN IF NOT EXISTS platform_mac        BOOLEAN;
ALTER TABLE games ADD COLUMN IF NOT EXISTS platform_linux      BOOLEAN;
ALTER TABLE games ADD COLUMN IF NOT EXISTS controller_support  TEXT;
