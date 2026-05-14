-- Fix incorrect YouTube channel IDs seeded in migration 037 / curatedSources.ts.
-- Original IDs were placeholders; real IDs scraped from each channel's canonical
-- @handle page. Also clears last_error so the admin UI badges reset on next test.

UPDATE news_source_registry
   SET identifier = 'UCZ7AeeVbyslLM_8-nVy2B8Q', last_error = NULL, updated_at = NOW()
 WHERE kind = 'youtube' AND slug = 'yt-skillup';

UPDATE news_source_registry
   SET identifier = 'UCK9_x1DImhU-eolIay5rb2Q', last_error = NULL, updated_at = NOW()
 WHERE kind = 'youtube' AND slug = 'yt-acg';

UPDATE news_source_registry
   SET identifier = 'UCbu2SsF-Or3Rsn3NxqODImw', last_error = NULL, updated_at = NOW()
 WHERE kind = 'youtube' AND slug = 'yt-gamespot';

UPDATE news_source_registry
   SET identifier = 'UCciKycgzURdymx-GRSY2_dA', last_error = NULL, updated_at = NOW()
 WHERE kind = 'youtube' AND slug = 'yt-eurogamer';
