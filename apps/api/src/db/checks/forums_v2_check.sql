-- Forums v2 integrity check. Asserts live-data invariants (counter drift,
-- reaction set, upload ownership, poll integrity), then inserts throwaway
-- fixtures to prove schema constraints actually fire, and ROLLS BACK so the
-- database is untouched. Run post-deploy:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/src/db/checks/forums_v2_check.sql
--
-- Any failed assertion RAISEs EXCEPTION and aborts with a non-zero exit. A
-- clean run prints "FORUMS V2 CHECK PASSED". Requires migrations 057–061.

BEGIN;

-- ── A. Live-data invariants ─────────────────────────────────────────────────

DO $$
DECLARE n INT;
BEGIN
  -- A1. reply_count matches live non-OP, non-deleted posts for every thread.
  SELECT COUNT(*) INTO n FROM forum_threads t
  WHERE t.is_deleted = FALSE
    AND t.reply_count <> (
      SELECT COUNT(*) FROM forum_posts p
      WHERE p.thread_id = t.id AND p.is_op = FALSE AND p.is_deleted = FALSE
    );
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A1: % thread(s) with drifted reply_count', n; END IF;

  -- A2. Reaction set is exactly the five (post-057: no legacy ''like'' left).
  SELECT COUNT(*) INTO n FROM forum_post_reactions
  WHERE reaction NOT IN ('nug','heart','laugh','fire','salute');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A2: % reaction row(s) outside the fixed set', n; END IF;

  -- A3. Every claimed upload belongs to its post''s author.
  SELECT COUNT(*) INTO n FROM forum_uploads fu
  INNER JOIN forum_posts p ON p.id = fu.post_id
  WHERE fu.uploader_user_id <> p.author_user_id;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A3: % upload(s) claimed by a non-author post', n; END IF;

  -- A4. Resource threads always carry a link.
  SELECT COUNT(*) INTO n FROM forum_threads
  WHERE thread_type = 'resource' AND is_deleted = FALSE AND (link_url IS NULL OR link_url = '');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A4: % resource thread(s) without link_url', n; END IF;

  -- A5. FTS generated columns populated.
  SELECT COUNT(*) INTO n FROM forum_threads WHERE title_tsv IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A5: % thread(s) with NULL title_tsv', n; END IF;
  SELECT COUNT(*) INTO n FROM forum_posts WHERE body_tsv IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A5: % post(s) with NULL body_tsv', n; END IF;

  -- A6. Poll vote always points at an option of ITS OWN poll.
  SELECT COUNT(*) INTO n FROM forum_poll_votes v
  INNER JOIN forum_poll_options o ON o.id = v.option_id
  WHERE o.poll_id <> v.poll_id;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A6: % vote(s) pointing at another poll''s option', n; END IF;

  -- A7. Single-choice polls never hold more than one vote per user.
  SELECT COUNT(*) INTO n FROM (
    SELECT v.poll_id, v.user_id FROM forum_poll_votes v
    INNER JOIN forum_polls p ON p.id = v.poll_id
    WHERE p.multi = FALSE
    GROUP BY v.poll_id, v.user_id
    HAVING COUNT(*) > 1
  ) x;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A7: % single-choice poll user(s) with multiple votes', n; END IF;

  -- A8. Every poll has at least two options.
  SELECT COUNT(*) INTO n FROM forum_polls p
  WHERE (SELECT COUNT(*) FROM forum_poll_options o WHERE o.poll_id = p.id) < 2;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A8: % poll(s) with fewer than 2 options', n; END IF;

  -- A9. Notifications always reference content.
  SELECT COUNT(*) INTO n FROM forum_notifications WHERE thread_id IS NULL AND post_id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A9: % notification(s) with no target', n; END IF;

  -- A10. Link-preview cache rows have a known status.
  SELECT COUNT(*) INTO n FROM forum_link_previews WHERE status NOT IN ('ok','failed');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A10: % link preview(s) with unknown status', n; END IF;

  RAISE NOTICE 'A: live-data invariants OK';
END $$;

-- ── B. Constraint behavior on fixtures (high synthetic ids, rolled back) ────

INSERT INTO users (id, discord_user_id) VALUES (991000001, '991000000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO forum_categories (id, slug, name) VALUES (991001, 'forumschk-cat', 'FORUMSCHK')
ON CONFLICT (id) DO NOTHING;

INSERT INTO forum_threads (id, category_id, author_user_id, title, slug, thread_type, link_url)
VALUES (991002, 991001, 991000001, 'FORUMSCHK resource', 'forumschk', 'resource', 'https://example.com/tool')
ON CONFLICT (id) DO NOTHING;

INSERT INTO forum_polls (id, thread_id, question) VALUES (991003, 991002, 'FORUMSCHK?')
ON CONFLICT (id) DO NOTHING;
INSERT INTO forum_poll_options (id, poll_id, position, label) VALUES
  (991004, 991003, 0, 'A'), (991005, 991003, 1, 'B')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE ok BOOLEAN;
BEGIN
  -- B1. thread_type CHECK rejects unknown values.
  ok := FALSE;
  BEGIN
    INSERT INTO forum_threads (category_id, author_user_id, title, slug, thread_type)
    VALUES (991001, 991000001, 'bad type', 'bad-type', 'totally-bogus');
  EXCEPTION WHEN check_violation THEN ok := TRUE;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL B1: bogus thread_type was accepted'; END IF;

  -- B2. One poll per thread (UNIQUE thread_id).
  ok := FALSE;
  BEGIN
    INSERT INTO forum_polls (thread_id, question) VALUES (991002, 'second poll?');
  EXCEPTION WHEN unique_violation THEN ok := TRUE;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL B2: second poll on one thread was accepted'; END IF;

  -- B3. Reaction PK dedupes (same user/post/reaction twice).
  INSERT INTO forum_posts (id, thread_id, author_user_id, body, is_op)
  VALUES (991006, 991002, 991000001, 'FORUMSCHK op', TRUE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO forum_post_reactions (post_id, user_id, reaction) VALUES (991006, 991000001, 'nug');
  ok := FALSE;
  BEGIN
    INSERT INTO forum_post_reactions (post_id, user_id, reaction) VALUES (991006, 991000001, 'nug');
  EXCEPTION WHEN unique_violation THEN ok := TRUE;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL B3: duplicate reaction row was accepted'; END IF;

  -- B4. Poll vote PK dedupes.
  INSERT INTO forum_poll_votes (poll_id, option_id, user_id) VALUES (991003, 991004, 991000001);
  ok := FALSE;
  BEGIN
    INSERT INTO forum_poll_votes (poll_id, option_id, user_id) VALUES (991003, 991004, 991000001);
  EXCEPTION WHEN unique_violation THEN ok := TRUE;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL B4: duplicate poll vote was accepted'; END IF;

  -- B5. Notification type CHECK.
  ok := FALSE;
  BEGIN
    INSERT INTO forum_notifications (user_id, type, thread_id) VALUES (991000001, 'spam', 991002);
  EXCEPTION WHEN check_violation THEN ok := TRUE;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL B5: bogus notification type was accepted'; END IF;

  -- B6. FTS matches fixture content end-to-end.
  IF NOT EXISTS (
    SELECT 1 FROM forum_posts
    WHERE id = 991006 AND body_tsv @@ websearch_to_tsquery('english', 'FORUMSCHK')
  ) THEN RAISE EXCEPTION 'FAIL B6: fixture post not findable via FTS'; END IF;

  RAISE NOTICE 'B: constraint behavior OK';
  RAISE NOTICE 'FORUMS V2 CHECK PASSED';
END $$;

ROLLBACK;
