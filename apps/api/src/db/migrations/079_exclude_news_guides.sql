-- Exclude guide / how-to / walkthrough articles from the news feeds.
--
-- Guides are evergreen player-instruction content (how-to-unlock/beat/get,
-- walkthroughs, tier lists, best builds, all-collectible lists). They are looked
-- up on demand, not browsed as news, so they should never surface in the feed.
--
-- Going forward the AI curator flags these via `isGuide` and drops them. This
-- migration is a one-time cleanup of already-curated guide cards. It only HIDES
-- them (relevance 0) rather than deleting, so a false positive is recoverable by
-- re-curation, and the retention sweep scrubs the rows over time.
--
-- The title patterns are deliberately tight and verb-anchored so play-on-words
-- headlines survive: "How to crash a game studio in 1 release" does NOT match
-- ("crash" is not a guide verb), while "How to Unlock Takeo's Side Quest" does.
-- Idempotent: re-running re-matches the same rows and sets score 0 again.

-- General news (RSS / GNews / Reddit / YouTube). pre_filter_reason added in 073.
UPDATE general_news
   SET ai_relevance_score = 0,
       ai_summary = NULL,
       pre_filter_reason = 'guide_content'
 WHERE ai_curated_at IS NOT NULL
   AND ai_relevance_score > 0
   AND (
        title ~* '^[[:space:]]*how to (unlock|beat|defeat|get|find|complete|craft|farm|earn|kill|solve|obtain|acquire|cheese|skip|locate|level up|respec|romance|recruit|max out)'
     OR title ~* '(walkthrough|step[- ]by[- ]step|tier list|where to find|(beginner|boss|strategy|farming|crafting|leveling)s? guide)'
     OR title ~* 'all [^,]{1,40}(locations|collectibles|chests|recipes|codes|secrets|easter eggs)'
     OR title ~* 'best [^,]{1,40}(build|builds|loadout|loadouts|class|classes|setups?|settings|perks|weapons|decks?)'
   );

-- Steam game news (game_news has no pre_filter_reason column).
UPDATE game_news
   SET ai_relevance_score = 0,
       ai_summary = NULL
 WHERE ai_curated_at IS NOT NULL
   AND ai_relevance_score > 0
   AND (
        title ~* '^[[:space:]]*how to (unlock|beat|defeat|get|find|complete|craft|farm|earn|kill|solve|obtain|acquire|cheese|skip|locate|level up|respec|romance|recruit|max out)'
     OR title ~* '(walkthrough|step[- ]by[- ]step|tier list|where to find|(beginner|boss|strategy|farming|crafting|leveling)s? guide)'
     OR title ~* 'all [^,]{1,40}(locations|collectibles|chests|recipes|codes|secrets|easter eggs)'
     OR title ~* 'best [^,]{1,40}(build|builds|loadout|loadouts|class|classes|setups?|settings|perks|weapons|decks?)'
   );
