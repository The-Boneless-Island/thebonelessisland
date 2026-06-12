# Forums v2 — Full-Featured Community Forums — Implementation Plan

> **STATUS — BUILT & VERIFIED 2026-06-12.** Phases A–G implemented (branch `claude/confident-mendel-34a474`, uncommitted). Verification: 61/61 migrations apply on a fresh Postgres; `forums_v2_check.sql` passes (incl. §13 poll assertions); 47/47 security probes pass (markdown XSS vectors inert, SSRF block matrix, EXIF strip, MIME-spoof reject); adversarial review fixes applied (mention/email regex, poll-vote lock/delete gating). web/api/bot typecheck + web build green. REMAINING (needs Matt): two-account browser smoke, live Discord webhook test, EXPLAIN on live data, optional Forums.tsx per-view split (~3.2k lines).
> Process: **10-80-10**. The first 10% is this document (Fable: research, decisions, contracts). The middle 80% is the build (Opus: phases A–F below, in order). The final 10% is verification (Fable: the checklist in §10, run after the build, before merge).
> Opus: do **not** re-litigate anything in the Locked Decisions table. If a real ambiguity blocks you, add it to §11 "Open questions" and pick the most conservative interpretation rather than stalling.

## 1. Goal

Turn the forums from a functional-but-bare message board into the crew's living room: the place where members post **memories** (screenshots, photos, stories from 6 years of the server), **recommendations** (games, hardware, anything), and **resources** (links to tools other members should know about) — and where a first-time visitor immediately understands what the forum is for and how to join in.

Three workstreams, interleaved across the phases:

1. **Feature depth** — adopt the features from large Discourse forums (Level1Techs, LTT) that make sense for a small, high-trust crew; skip the ones that only matter at scale.
2. **UI overhaul** — cleaner thread/feed UI, a guided composer, and a redesigned landing page that doubles as new-user onboarding. Permission granted to break from the current Forums layout where a better idea exists; stay inside the island theme (CSS vars, themed primitives, IslandSceneShell).
3. **Findability** — members should be able to get to *exactly the kind of post they want* (a memory, a tool, a rec) in one click.

## 2. What exists today (do not rebuild)

Backend `apps/api/src/routes/forums.ts` (~1,260 lines), schema in migrations `022_forums.sql` + `055_forum_thread_game.sql`, frontend `apps/web/src/pages/Forums.tsx` (~1,500 lines), admin moderation in `apps/web/src/pages/admin/people.tsx`.

Already implemented and staying: categories (CRUD, lock, accent, position), threads (pin/lock/soft-delete, view + reply counts, last-reply tracking), flat replies, single "like" reaction (schema already supports arbitrary reaction text — exploit this, don't migrate it), reports + resolution, bans (permanent/expiring), mod log, per-action cooldowns via `server_settings`, nuggies rewards (5/thread, 1/reply), activity events (`forum_thread_created`, `forum_reply_created`), optional **game tag** (`forum_threads.app_id`, validated against `games`, rendered as a capsule chip), title-ILIKE search, sort modes (latest/top/unanswered/mine), stats endpoint, a localStorage 3-step onboarding card.

Infra facts that constrain design:

- **Web app has zero runtime deps beyond React 19.** No markdown lib, no router lib, no UI kit. Everything hand-rolled. Keep it that way on the web side.
- **API**: Express 5, pg, zod, express-rate-limit. No upload handling, no notification system anywhere in the codebase.
- **Hosting**: single AWS Graviton (arm64) box via docker-compose behind Cloudflare. No websockets planned — notifications poll. Disk is local and persistent — uploads can live on a volume.
- Last migration is `056_crew_trending_snapshots.sql`. **This plan owns 057–060.**

## 3. Feature research — Discourse (L1T / LTT) → what we take

| Discourse feature | Verdict | Why |
|---|---|---|
| Markdown + composer preview | **Adopt** (Phase A) | Plaintext posts are the single biggest "this feels bare" factor. |
| Quote-reply | **Adopt** (Phase A) | Flat reply lists need quoting to stay readable. |
| Emoji reactions (plugin) | **Adopt** (Phase A) | Schema already supports it; pick a small crew-flavored set. |
| Oneboxes (link unfurls) | **Adapt** (Phase B) | Only for the Resource post type's primary URL, not every link in every body — keeps fetch surface small. |
| Topic templates / per-category composer prompts | **Adapt** (Phase B) | Becomes **post types** with guided composers — stronger than templates for our 3 use cases. |
| Tags | **Skip → backlog** | Game tag already covers the main facet; free tags add moderation surface a 15-person crew doesn't need. |
| Uploads / image attachments | **Adopt** (Phase C) | Memories are photo-first. Non-negotiable for the stated use case. |
| Full-text search | **Adopt** (Phase D) | Postgres FTS, no new infra. |
| Suggested/related topics | **Adopt** (Phase D) | Cheap (same category or same game), good for rediscovering old memories. |
| Watching/tracking + unread badges | **Adopt** (Phase E) | The #1 retention mechanic on every Discourse forum. |
| @mentions + notifications | **Adopt** (Phase E) | In-app bell, polled. |
| Email digests | **Skip** | Discord is the crew's push channel — announce new threads there instead (Phase B). |
| Trust levels | **Skip** | Everyone already trusts everyone; roles (parent/member) exist. |
| Badges | **Skip → backlog** | Fold into the existing site Achievements pillar later, not a forum-local system. |
| Solved / best answer | **Skip → backlog** | Q&A is not the primary use case. |
| Polls | **Skip — needs Matt's explicit OK** | Game-night voting was deliberately removed; forum polls are adjacent enough that they must not sneak back in via this plan. |
| Edit history | **Skip → backlog** | `edited_at` flag is enough for a high-trust crew. |
| Infinite scroll | **Skip** | Load-more pagination already works; not worth the scroll-restoration complexity. |

## 4. Locked decisions

| Question | Decision |
|---|---|
| Migration numbers | **057** post types + link previews, **058** uploads, **059** FTS, **060** subscriptions/reads/notifications. Nothing else takes these numbers. |
| Markdown | **Hand-rolled safe-subset renderer in the web app** that emits React elements — never `dangerouslySetInnerHTML`. Supported: bold, italic, strikethrough, inline code, fenced code blocks, links, blockquotes, ordered/unordered lists, images, `---` rule. No raw HTML — render it as literal text. Bodies stay stored as markdown source; no server-side HTML. |
| Link protocols | Links render as `<a>` only for `http(s):`; anything else renders as plain text. Images render only for `https:` URLs or same-origin upload paths. |
| Post types | Fixed enum, exactly four: `discussion` (default), `memory`, `recommendation`, `resource`. Column on `forum_threads`, not a new table. All existing threads backfill to `discussion`. Types are orthogonal to categories — both remain. |
| Resource URL | `forum_threads.link_url` (nullable) — required for `resource`, optional for `recommendation`, absent otherwise. One primary URL per thread; more links can live in the body. |
| Link unfurl | Server-side, at thread-create time only, results cached in `forum_link_previews`. Hard SSRF guards (§9). Failure to unfurl never fails thread creation. |
| Uploads | API deps: **multer@^2** (multipart) + **sharp@^0.34** (arm64-safe). Every accepted image is **re-encoded** via sharp to WebP (quality 82, max edge 2048) + a 480px thumbnail — this strips EXIF/GPS and neutralizes MIME-spoofing in one move. Originals are discarded. Accept jpeg/png/webp/gif (gif: first frame only, animated gifs re-encoded to animated webp if sharp supports it cheaply, otherwise static); reject everything else by sniffed magic bytes, not extension. 8 MB request cap, max 10 images per post, per-user upload rate limit (20/hour) via express-rate-limit. Stored on disk volume `data/uploads/forums/<yyyy>/<mm>/<uuid>.webp`, served by Express static behind Cloudflare cache. |
| Reactions | Reaction set fixed at five: `nug` (👍), `heart` (❤️), `laugh` (😂), `fire` (🔥), `salute` (🫡). Existing `'like'` rows are migrated to `nug` in 057. One reaction per user per post **per type** (existing unique constraint already allows this). |
| Mentions | `@<discord_username>` (the unique no-spaces username, not display name). Composer autocomplete from the member list (crew is small — load all). Parsed server-side on post create/edit; notifies mentioned users. |
| Notifications | In-app only, **polled** (reuse whatever polling cadence the navbar already uses for other data; otherwise 60s). Types: `mention`, `reply` (to a subscribed thread). No reaction notifications — noise. |
| Subscriptions | Auto-subscribe on thread create and on reply (no preference toggle in v2 — backlog). Manual subscribe/unsubscribe button on the thread. |
| Unread | `forum_thread_reads(user_id, thread_id, last_read_post_id, updated_at)` upserted on thread view. Feed rows show an unread dot when `last_reply_at` is newer; thread view shows a "new since your last visit" divider and the thread auto-scrolls to it. |
| Search | Postgres FTS, `english` config, generated stored tsvector columns: thread title weight A, post body weight B. GIN indexes. `ts_headline` snippets in results. The existing ILIKE endpoint is upgraded in place (same path, richer response). |
| Discord announce | New-thread announcements via a Discord **webhook URL** stored in `server_settings` (`forums_discord_webhook_url`, empty = off). Posted as Nuggie (name + avatar set on the webhook payload). Threads only, never replies. Fire-and-forget; failure never fails the request. |
| Polls | **Out of scope.** Do not build. Needs Matt's explicit confirmation given the deliberate removal of game-night voting. |
| Web deps | **Zero new web dependencies.** API gains exactly multer + sharp. |
| Naming | The pillar stays "Forums" in nav/routes. Playful copy lives in headings/subtitles only. |

## 5. Data model — migrations (full sketches; Opus refines, doesn't redesign)

### 057_forum_post_types.sql

```sql
ALTER TABLE forum_threads
  ADD COLUMN thread_type TEXT NOT NULL DEFAULT 'discussion'
    CHECK (thread_type IN ('discussion','memory','recommendation','resource')),
  ADD COLUMN link_url TEXT;

CREATE INDEX idx_forum_threads_type ON forum_threads (thread_type) WHERE is_deleted = FALSE;

CREATE TABLE forum_link_previews (
  url           TEXT PRIMARY KEY,
  title         TEXT,
  description   TEXT,
  image_url     TEXT,
  site_name     TEXT,
  status        TEXT NOT NULL DEFAULT 'ok',   -- ok | failed
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE forum_post_reactions SET reaction = 'nug' WHERE reaction = 'like';

INSERT INTO server_settings (key, value) VALUES
  ('forums_discord_webhook_url', ''),
  ('forums_upload_max_mb', '8'),
  ('forums_upload_per_hour', '20')
ON CONFLICT (key) DO NOTHING;
```

### 058_forum_uploads.sql

```sql
CREATE TABLE forum_uploads (
  id              BIGSERIAL PRIMARY KEY,
  uploader_user_id BIGINT NOT NULL REFERENCES users(id),
  post_id         BIGINT REFERENCES forum_posts(id) ON DELETE SET NULL, -- null until attached
  file_path       TEXT NOT NULL,        -- relative: forums/2026/06/<uuid>.webp
  thumb_path      TEXT NOT NULL,
  width           INT NOT NULL,
  height          INT NOT NULL,
  bytes           INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_forum_uploads_post ON forum_uploads (post_id);
CREATE INDEX idx_forum_uploads_uploader ON forum_uploads (uploader_user_id, created_at);
```

Upload flow: client uploads first (gets back `{id, url, thumbUrl}`), inserts `![](url)` into the body or attaches to the memory gallery; thread/post create request carries `uploadIds: number[]`, server claims them (`post_id = new post`, verifying uploader matches author). A nightly-ish cleanup is **not** required for v2 — an orphan with `post_id IS NULL` older than 24h can be swept by the existing maintenance pattern if one exists, otherwise note as backlog.

### 059_forum_fts.sql

```sql
ALTER TABLE forum_threads ADD COLUMN title_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,''))) STORED;
ALTER TABLE forum_posts ADD COLUMN body_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(body,''))) STORED;
CREATE INDEX idx_forum_threads_tsv ON forum_threads USING GIN (title_tsv);
CREATE INDEX idx_forum_posts_tsv  ON forum_posts  USING GIN (body_tsv);
```

### 060_forum_engagement.sql

```sql
CREATE TABLE forum_thread_subscriptions (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id  BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE forum_thread_reads (
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id         BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  last_read_post_id BIGINT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE forum_notifications (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('mention','reply')),
  actor_user_id BIGINT REFERENCES users(id),
  thread_id     BIGINT REFERENCES forum_threads(id) ON DELETE CASCADE,
  post_id       BIGINT REFERENCES forum_posts(id) ON DELETE CASCADE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_forum_notifications_user ON forum_notifications (user_id, read_at, created_at DESC);
```

## 6. API contract (new/changed endpoints — paths and shapes are locked)

All new write endpoints must apply the existing **ban check** and **cooldown/rate-limit** patterns, exactly like the current create-thread/reply handlers.

| Endpoint | Change |
|---|---|
| `POST /forums/categories/:slug/threads` | Accepts `threadType`, `linkUrl?`, `uploadIds?: number[]`. Validates: `resource` requires `linkUrl` (http/https, ≤2048 chars); `linkUrl` only allowed for `resource`/`recommendation`. Triggers unfurl (async, fire-and-forget) + Discord webhook announce. |
| `POST /forums/threads/:id/posts` | Accepts `uploadIds?`. Parses mentions; creates notifications + auto-subscribe; notifies thread subscribers (excluding the author). |
| `GET /forums/threads` (feed) | New filter `type=discussion\|memory\|recommendation\|resource`; response rows gain `threadType`, `linkUrl`, `linkPreview?` (`{title, siteName, imageUrl}`), `coverImage?` (first upload thumb of OP, for memory cards), `unread?: boolean` (authed). |
| `GET /forums/threads/:id` | Gains `threadType`, `linkUrl`, `linkPreview?`, `subscribed: boolean`, `firstUnreadPostId?`; posts gain `reactions: {nug: n, heart: n, ...}`, `myReactions: string[]`, `attachments: [{url, thumbUrl, width, height}]`. Upserts `forum_thread_reads`. |
| `POST /forums/posts/:id/react` | Body gains `reaction` (one of the five). Toggle semantics per (user, post, reaction). |
| `POST /forums/uploads` | NEW. Multipart, auth required, ban check, rate limited. Returns `{id, url, thumbUrl, width, height}`. |
| `POST /forums/threads/:id/subscribe` / `DELETE .../subscribe` | NEW. |
| `GET /forums/notifications` | NEW. `{items: [...], unreadCount}` — last 50. |
| `POST /forums/notifications/read` | NEW. Body `{ids?: number[]}`; absent = mark all. |
| `GET /forums/search?q=` | Upgraded in place: FTS over titles + bodies, returns `{threads: [{...thread, snippet}]}`, snippet via `ts_headline`. Keep min-2-chars rule. |
| `GET /forums/stats` | `mine` gains `reactionsGiven`; response gains `typeCounts: {memory: n, resource: n, ...}` for the landing checklist + type rail. |
| `GET /forums/resources` | NEW. Paginated resource+recommendation threads (the "Resource shelf" / library view): thread, linkUrl, preview, reply count. |

Frontend types extend the existing `Forum*` family in `apps/web/src/types.ts` — same naming style (`ForumThreadType`, `ForumNotification`, `ForumUpload`, `ForumLinkPreview`).

## 7. Frontend spec

### 7.1 Landing page (`ForumHome`) — redesigned, onboarding-first

Break from the current stack-of-cards layout. New structure (desktop; right rail folds under the feed on mobile):

1. **Hero / orientation strip.** For visitors with zero forum activity (server-derived, not localStorage): an expanded panel — mascot art, one-paragraph "what this place is", and **three big type cards** (Memories / Recommendations / Resources) that each explain the post type and deep-link into the composer with that type pre-selected. Below them, a **getting-started checklist** driven by real data from `/forums/stats`: ① Read the intro (dismiss) ② Leave a reaction ③ Reply to a thread ④ Post your first thread. Checked items render as done; completing all four collapses the hero to the compact version permanently (server data does the work; localStorage only remembers the intro-read tick). For active members: a compact one-line hero — greeting, live stats, and a prominent **"Share something"** button.
2. **Type rail + controls.** Horizontal filter: `All · 💬 Discussions · 📸 Memories · ⭐ Recs · 🧰 Resources` (with counts from `typeCounts`), then the existing sort tabs (Latest/Top/Unanswered/Mine) and search box. Type + sort + category chips all compose into the feed query.
3. **Feed.** Card style varies by type: memory rows show the cover thumbnail; resource rows show domain + unfurled title; rec rows show the game capsule (existing GameChip) or the link preview; discussions stay text rows. Unread dot on the left edge for authed users.
4. **Right rail** (in this order): **Memory wall** — 6 most recent memory-thread thumbnails as a tight photo grid, each linking to its thread; **Resource shelf** — 5 most recent resources (favicon-less: site name + title); **Top contributors** (existing card); **Browse categories** (existing collapsible, demoted to last).

### 7.2 Guided composer (`ComposeView`) — full-page, two steps

- **Step 1 — "What are you sharing?"**: four large type cards (icon, name, one-liner: *"A memory — screenshots, photos, stories from our adventures"* etc.). Skippable: arriving from a type-specific CTA pre-selects and jumps to step 2.
- **Step 2 — per-type form**: all types get title + markdown body + category picker (defaults to last-used) + the existing optional game picker. Additions by type: **memory** → image drop-zone front and center (upload-first UX, images render as a gallery on the thread); **resource** → required URL field with live unfurl preview ("this is how it'll look"); **recommendation** → optional URL field, hint text nudging game picker or link.
- **Markdown toolbar** (B, I, code, quote, list, link, image) + **write/preview toggle** using the same renderer as display. Keep the existing draft persistence, extend it to thread drafts (currently replies only).

### 7.3 Thread view polish

- Sticky compact header on scroll: title + type chip + reply button.
- **Quote** button per post: prefills the reply composer with `> quoted text\n\n` (selection-aware if trivial, whole-post otherwise).
- **Reaction bar** per post: five emoji with counts, own-reactions highlighted.
- **Unread divider** ("— new since your last visit —") + auto-scroll to it.
- **Attachments gallery** on posts that have uploads (grid of thumbs, click to open full image in a lightbox-style overlay — hand-rolled, simple).
- **Related threads** footer: up to 5 — same game tag first, then same category, latest-first, excluding self.
- Subscribe/unsubscribe toggle in the header.

### 7.4 Notification bell

In the site navbar (global, not forums-local): bell icon + unread count badge, dropdown with the last ~15 notifications ("**Dax** mentioned you in *LAN party photos*"), click → thread (deep-linking to the post anchor), "mark all read". Polls `GET /forums/notifications` on the navbar's existing refresh cadence (or 60s).

### 7.5 Visual language

Stay on theme: CSS variables, themed primitives, island palette. Each post type gets a stable accent + emoji used consistently (composer cards, type rail, feed chips, thread header). Mascot/empty-state art follows the existing pattern (mascot empty states already exist elsewhere — reuse the component approach).

## 8. The 80 — build phases for Opus (in order; each lands green and independently)

Run as separate sessions (or A+B together). After each phase: `typecheck` web+api+bot, web build, migration applies cleanly on dev DB (docker exec psql; tracker drift was fixed 2026-06-11 — use the project's migration runner).

### Phase A — Rich text + reactions + quoting (no migration)
Markdown renderer (`apps/web/src/lib/markdown.tsx` — pure function: source → React nodes, with the §4 safety rules), composer toolbar + preview, quote-reply, five-emoji reaction bar (backend: extend react endpoint to accept `reaction`; data migration for `like`→`nug` happens in 057, so Phase A treats `like` and `nug` as synonyms in reads until 057 lands — simpler: ship the 057 migration *in Phase B* and have Phase A's API accept the five names while mapping `nug`→`like` storage; Opus picks whichever is less code **but must note which**), post permalinks (`#post-<id>` anchors + copy-link button).
**Accept:** old plaintext posts render unchanged (markdown renderer must be graceful on plain text); XSS vectors from §10 all render inert; reactions toggle per type; quote inserts correctly.

### Phase B — Post types + resource unfurl + Discord announce (migration 057)
Type column + backfill, composer step-1 type picker + per-type forms (minus image zone), feed `type` filter + type-aware feed rows (minus cover images), `forum_link_previews` + SSRF-guarded unfurler (`apps/api/src/lib/linkPreview.ts`, §9 rules), resource rows render unfurl data, Discord webhook announce on thread create, `GET /forums/resources`.
**Accept:** create one thread of each type end-to-end; resource without URL rejected; unfurl failure still creates the thread; webhook fires (manual test with a real webhook URL) and never blocks/fails creation; existing threads all show as discussions.

### Phase C — Image uploads + memory experience (migration 058; deps multer+sharp)
Upload endpoint with the full §4 pipeline (sniff → re-encode → thumb), static serving, composer drop-zone + upload-first flow + `uploadIds` claiming, attachment gallery + lightbox on posts, memory feed cards with cover thumbs, memory wall data available from feed query.
**Accept:** EXIF verifiably stripped (upload a GPS-tagged JPEG, download result, inspect); spoofed extension rejected; 9 MB file rejected with clean error; delete post orphans its uploads (post_id stays, post soft-deleted → gallery hidden); memory card shows cover.

### Phase D — Search + discovery (migration 059)
FTS upgrade of `/forums/search` with snippets, search UI (grouped results, highlighted snippets — render `ts_headline` marks safely: have Postgres emit a custom delimiter and convert to `<mark>` client-side via the safe renderer, never raw HTML), related-threads footer, resource shelf + memory wall right-rail blocks (consumes Phase B/C data).
**Accept:** body-text-only match found; snippet highlights term; search of `<script>` is inert; related threads exclude self and deleted.

### Phase E — Subscriptions, unread, notifications, mentions (migration 060)
Subscription endpoints + auto-subscribe, read tracking + unread dots + divider + auto-scroll, notifications table + bell + polling + mark-read, mention autocomplete + server-side parse + mention notifications. Notify subscribers on reply (excluding author and the mentioned — no double notification: mention wins).
**Accept:** A replies to B's thread → B gets one `reply` notification; A mentions B in C's thread → B gets one `mention` (not also a reply); banned/deleted content never notifies; unread divider lands on the right post; bell count clears.

### Phase F — Landing page + onboarding + thread polish (no migration)
Full §7.1 landing rebuild, getting-started checklist on real stats, guided composer final form (type cards + per-type polish), sticky thread header, final visual pass (type accents everywhere, empty states with mascots, mobile layout for the rail).
**Accept:** brand-new user (fresh account, zero activity) sees the expanded hero + checklist; each checklist item flips from real actions; veteran sees compact hero; every §7.1 section renders with real data; mobile (~380px) usable.

## 9. Security invariants (Opus implements, Fable verifies)

1. **Markdown**: React-element output only; no `dangerouslySetInnerHTML` anywhere in forums code; `javascript:`/`data:` URLs neutered; raw HTML in source renders as text.
2. **Unfurler SSRF**: http/https only; resolve DNS and reject private/reserved ranges (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7) **re-checked on every redirect hop** (max 3); 5s timeout; read at most 512 KB; only parse `text/html`; store failures as `status='failed'` and never retry more than once per day per URL.
3. **Uploads**: magic-byte sniffing; sharp re-encode mandatory (no passthrough path); generated filename is a server-side UUID — client filename never touches the filesystem; serve uploads with `Content-Type: image/webp` fixed and `X-Content-Type-Options: nosniff`.
4. **Authz**: every new write endpoint enforces session + forum-ban + (where applicable) thread-lock/category-lock, mirroring existing handlers; upload claiming verifies `uploader_user_id = author`; notification reads are owner-scoped.
5. **Rate limits**: uploads 20/h/user; unfurls implicitly bounded by thread cooldown; notifications endpoints read-only cheap.
6. **Webhook**: URL comes only from `server_settings` (parent-admin editable), never from user input.

## 10. The final 10 — Fable's verification checklist (run post-build)

**Build & migrations**
- [ ] `typecheck` clean: web, api, bot. Web `build` clean.
- [ ] Migrations 057–060 apply in order on a fresh DB **and** on the live dev DB (docker exec psql, non-default password).
- [ ] Migration tracker consistent (no drift recurrence).
- [ ] `like` reactions fully migrated to `nug`; no orphan reaction types.

**Self-check SQL** — write `apps/api/src/db/checks/forums_v2_check.sql` (pattern: `steam_privacy_check.sql`; assertions, rolled back): reply_count matches live post counts; no reaction outside the five; no upload claimed by a post with a different author; no notification pointing at deleted+notified content; no `resource` thread with NULL `link_url`; tsv columns populated.

**Security probes (manual, against dev)**
- [ ] Post bodies: `<script>alert(1)</script>`, `[x](javascript:alert(1))`, `![x](data:text/html,...)`, `<img src=x onerror=...>`, raw HTML table — all inert/literal.
- [ ] Search query `<script>` + snippet output inert.
- [ ] Unfurl: `http://169.254.169.254/`, `http://localhost:3001/`, a 301-to-private redirect — all rejected; a normal site unfurls.
- [ ] Upload: `.png` renamed `.jpg` (ok — sniffed), a `.html` renamed `.png` (rejected), 9 MB file (rejected), GPS-tagged JPEG → downloaded result has no EXIF.
- [ ] Authz: edit/delete another member's post (403), banned test user blocked on upload + react + subscribe + post, locked thread blocks reply for non-parent, claim someone else's uploadId (rejected).

**Functional smoke (dev, two browsers/accounts)**
- [ ] Create each of the 4 types; each renders correctly in feed, thread, and (memory/resource) right-rail blocks.
- [ ] Quote, mention with autocomplete, all five reactions, permalink anchor.
- [ ] User B mention/reply notification flows exactly per Phase E acceptance.
- [ ] Unread: B posts → A's feed dot → A opens thread → divider at right post → dot clears.
- [ ] Search finds body-only text with highlighted snippet.
- [ ] Fresh user sees onboarding hero; all 4 checklist items flip via real actions; hero collapses.
- [ ] Discord webhook posts a new thread as Nuggie (then empty the setting if not wanted yet).
- [ ] Mobile width ~380px: landing, thread, composer all usable.

**Perf sanity**
- [ ] `EXPLAIN ANALYZE` feed query with type filter + FTS search query — index scans, no seq scan on forum_posts.
- [ ] Forums.tsx split check: if the page file exceeds ~2,500 lines after F, extract per-view files (follow the Admin.tsx-split precedent) — flag, don't necessarily block.

## 11. Open questions for Matt (none block the build)

1. **Polls** — confirm in or out for a future phase (excluded here per the voting-removal precedent).
2. Discord webhook target channel — which channel ID/webhook, and announce *all* threads or only memories/resources?
3. Orphan-upload sweep — fold into existing maintenance job or leave as backlog?

## 12. Backlog (explicitly not in v2)

User-defined tags · bookmarks · solved/best-answer · forum badges via the Achievements pillar · per-user notification preferences + watch-category · edit history · polls (pending #1) · animated-gif fidelity · upload sweep job · user-card hover popovers · "summarize thread" via Nuggie (fun future AI tie-in; respect the AI cost model if ever attempted).

## 13. Phase G addendum — decided 2026-06-12 (Matt)

The three §11 open questions are now resolved and **built** (branch `claude/confident-mendel-34a474`):

1. **Polls — IN.** Optional poll attached to a thread. Migration **061** (`forum_polls` / `forum_poll_options` / `forum_poll_votes`, one poll per thread, 2–10 options, single- or multi-choice, optional `closes_at`). `POST /forums/polls/:id/vote` (replace-semantics: delete the user's votes then insert the chosen set; single-choice caps to one). Composer poll builder (question + dynamic options + multi toggle); thread renders a `PollCard` with vote bars + your-vote highlight + voter count + closed/closes state. This is a generic forum poll, distinct from the deleted game-night voting ([[feedback-voting-removed]]).
2. **Per-post Discord announce — IN.** Webhook stays a single admin-set `server_settings` value, but announcing is now **member opt-in per thread**: `createThread` accepts `announce: boolean`, the webhook only fires when `announce === true`. Composer shows a "📣 Also announce this to the Discord" checkbox, surfaced only when `GET /forums/categories` reports `announceAvailable` (a webhook is configured). Default off.
3. **Orphan-upload sweep — IN.** `sweepOrphanUploads()` deletes `forum_uploads` rows with `post_id IS NULL` older than 24h plus their files; wired into the `server.ts` boot cycle (boot+45s, then every 6h).

Verification (§10) must additionally: apply migration **061**; cover polls in `forums_v2_check.sql` (no vote pointing at an option of another poll; single-choice polls never hold >1 vote per user; no `closes_at`-past vote accepted); confirm announce fires ONLY when the per-post flag is set AND a webhook exists; confirm the sweep removes a 25h-old unattached upload (row + files) but never a claimed one.
