# Gaming News Redesign — Implementation Plan

Status: PLAN (Opus / 10% phase). Build phase = Sonnet.
Initiative: rework the AI-summarized Gaming News section (hero / cards / rows / reader)
to match the desired visual + summarization spec.
Scope owner: matt. Last updated: 2026-06-19.

---

## Build progress (resume here)

Done + committed on branch `claude/wizardly-shaw-0503dc` (typecheck-clean, 0 vulns):
- Vocabulary → STYLE_GUIDE.md (`ab53080`)
- Phase A — summary completeness + 1350-word cap + jargon + batch 6 / maxTokens 16384 + `summary_too_long` validation (`76a4db2`)
- Phase B — og:image scrape + pre-flight SSRF guard + migration 064 (`3be88c8`)
- Phase D + F — single Source Attribution pop-out; content-vote re-aim + ranking weight 0.2 + story-level placement (`f050c57`)
- Phase C — image-forward Hero (Ken Burns + sheen), CoverImage primitive, compact horizontal News Cards, News Row subtitle + fallback thumb, deriveExcerpt, 16:9 reader banner (`aca4665`)

**All 6 build phases (A–F) landed.** Next: Phase E (verify on deploy) + image backfill.
Visual tuning of the Hero/cards may follow from preview feedback (motion speed, hero height,
excerpt length are all single-constant tweaks). See §4 Phase E + follow-ups below.

Known follow-ups:
- **Image backfill** — `resolveMissingImages` only scrapes newly-ingested rows; existing imageless
  Reddit/RSS rows need a one-time backfill pass (mirror `embed-backfill`) or the new Hero has little to show.
- **Post-merge ops** — run migration 064, then admin recurate to regenerate summaries under the new prompt.
- **Deferred (§9)** — A4 prompt caching, probe-image-size dimension fallback, B5 hero-by-image-quality, dominant color.

---

## 0. Vocabulary (canonical terms)

Use these names in code, comments, commits, and discussion. Code symbols mostly
already match — minimal renaming.

| Concept | Official name | Code symbol today | Where |
|---|---|---|---|
| The feature/section (public) | **Gaming News** | `GamingNewsPage` / route `/games/news` | nav, page header |
| The data namespace (code) | `general_news` | table `general_news`, `generalNewsIngestion.ts` | API/DB |
| The landing list as a whole | **the Feed** | `GamingNewsFeed` | page body |
| Big featured card (1, top) | **Hero Card** | `NewsHeroCard` | top of feed |
| Small featured cards (3) | **News Card** | `NewsCard` | featured rail |
| Skinny rows below featured | **News Row** | `NewsListRow` | "more stories" list |
| Click-to-read expanded view | **the Reader** | `NewsArticleModal` | modal overlay |
| Article lead image | **cover image** | `imageUrl` / `image_url` | all tiers + Reader |
| Tiny publisher icon | **source favicon** | `SourceFavicon` | rows / Reader byline |
| Short summary (cards) | **subtitle** | `aiSubtitle` | Hero / News Card |
| Half-sentence teaser (cards) | **excerpt** | _derived from `aiSummary`_ (new helper) | Hero / News Card |
| Full summary (Reader) | **summary** | `aiSummary` | Reader body |
| Colored category chip | **label** | `aiLabel`, `LABEL_*` | all tiers |
| Genre/platform pills | **tags** | `aiTags`, `TagPill` | all tiers |
| "Why it matters" blurb | **rationale** | `aiWhyRecommended` | Reader |
| Spoiler-hidden block | **spoiler guard** | `SpoilerBlock`, `aiSpoilerWarning` | cards / Reader |
| Sources pop-out | **Source Attribution** | `aiSources` + `<details>` | Reader bottom |
| Up/down content vote | **content vote** (upvote/downvote) | `VoteControls`, `general_news_feedback` | all tiers |

Open naming flags (from earlier discussion, not yet decided — do NOT block build):
- Brand the AI curator as **Nuggie** (per brand split) → "Nuggie's summary"? Currently neutral.
- Nickname the feed **the Shore**? Keep "Gaming News" as official either way.
These only affect copy strings; defer.

---

## 1. Current state (grounding — what already exists)

Two **separate** news systems — do not confuse:
- `game_news` — Steam per-app news, curated by `apps/api/src/lib/newsCurator.ts`. NOT this.
- `general_news` — THIS feed. Ingested + curated by `apps/api/src/lib/generalNewsIngestion.ts`.

**AI pipeline (`generalNewsIngestion.ts`) already does ~80% of the spec:**
- Rewritten title (`aiTitle`), subtitle (`aiSubtitle`), 3–5 para summary (`aiSummary`),
  mandatory "Why This Matters to Boneless Island" (`aiWhyRecommended`), sources
  (`aiSources`), tags, label, spoiler flag, game title, story fingerprint.
- **Neutrality + the exact "sword vs gun" conflict rule already present**
  (system prompt line ~925: *"If the sources disagree, report the disagreement
  ('PC Gamer reports X; IGN reports Y') rather than picking one"*).
- Multi-source synthesis via TWO clustering paths:
  1. Cheap **embedding** match — `news/embeddings.ts`, cosine ≥0.85, 14-day window →
     `absorbAsSibling()` folds the new article's URL into the primary's `ai_sources`.
  2. **AI fingerprint merge** — in-batch + against recent primaries; re-synthesizes a
     richer summary covering all siblings (`persistCurationOutcome` merge branch).
- Validation + retry (`validateCuration`, up to 2 rounds), admin recurate job with
  cost tracking, validation-failures endpoint.

**API GET `/news/general` (`routes/generalNews.ts`):**
- Display-time fingerprint collapse (entity+week) so duplicate cards merge.
- **Sources already deduped server-side**: `array_agg(DISTINCT u)` merges primary
  `ai_sources` + sibling URLs (lines ~116–119). "Listed once" is mostly handled.
- Ranks by relevance + vote score; returns top 50. Frontend takes item[0] as hero.

**Frontend (`apps/web/src/pages/GamingNews.tsx`, ~1640 lines):**
- `NewsHeroCard` (~541), `NewsCard` (~708), `NewsListRow` (~914), `NewsArticleModal`
  (~1164), `VoteControls` (~1097), `FormattedSummary` (~1537, renders prose+bullets).
- `FEATURED_COUNT = 4` (1 hero + 3 cards), `LIST_INITIAL = 10`.

**Image ingestion (`lib/news/providers/`):**
- `rss.ts` → `extractImageUrl()` reads `media:thumbnail` / `media:content` / `enclosure`
  (often small or absent).
- `reddit.ts` → `imageUrl: null` (no images at all — biggest beneficiary of scraping).
- `gnews.ts`, `youtube.ts` → have images.

---

## 2. Desired state (from spec)

- **Hero Card**: very large, high-res cover image; subtle Ken Burns drift + faint sheen
  ("fighting-game splash" vibe); shows AI title, subtitle, a half-sentence excerpt,
  cover image, content vote, share.
- **News Card**: same primitives, condensed + subtler (give way to hero).
- **News Row**: same primitives, least visual flair.
- **Reader**: cover image, title, subtitle, full AI summary, content vote, rationale
  ("Why This Matters"), then **Source Attribution pop-out** at the bottom listing every
  source once with a direct link. **No standalone "Read full article" button.**
- **Voting**: general content upvote/downvote per member (one each) that **surfaces or
  sinks** a story in feed ranking — NOT a judgement of AI summary quality. On all tiers + Reader.
- **Summary quality**: aim for **completeness of information, not word count**; hard cap
  **1350 words**. Present all info from source articles; neutral (no favoritism);
  cross-source comparison + surface conflicts; plain language; explain jargon when used.
- **Source attribution**: pop-out, each source once, direct links.

---

## 3. Gap analysis (desired − current)

| # | Area | Gap | Severity |
|---|---|---|---|
| G1 | Hero visual | Image is a faint CSS background wash behind a text panel; not large/foreground/hi-res. No motion. | High |
| G2 | Excerpt | No excerpt concept — hero + cards dump the FULL `aiSummary`. Need a derived half-sentence. | High |
| G3 | Card/row imagery | Cards 68×50 thumb, rows 80×60 thumb — fine for rows, too small for cards per "same primitives, condensed". | Med |
| G4 | Summary length policy | Prompt targets ~350 words; `maxTokens: 8192` for a 12-article batch truncates long summaries. Conflicts with completeness + 1350-word cap. | High |
| G5 | Jargon explanation | Not requested in prompt. | Med |
| G6 | Reader sources | Two redundant blocks: always-visible "Sources" list + a pop-out showing only primary source + "Read full article". Spec = one pop-out, all sources, no CTA. | Med |
| G7 | Image acquisition | RSS/Reddit images small/missing; no og:image scrape; nothing feeds a hi-res hero. | High |
| G8 | Embedding-absorb leak | `absorbAsSibling()` adds only the URL — late cosine-absorbed siblings don't enrich the primary summary. Weakens "all sources synthesized". | Low/Med (decision) |
| G9 | Image robustness | No blur-up/skeleton, no aspect-ratio reservation, no onError fallback for 403/404 external images. | Med |

---

## 4. Workstreams (phased, ship incrementally)

Order chosen so each phase is independently shippable and visible. Aligns with the
"themed primitives first, incremental, don't over-scope" guidance.

### Phase A — Summary quality (backend prompt + token budget)
Files: `apps/api/src/lib/generalNewsIngestion.ts`
- A1. Edit the curation system prompt:
  - Replace "~350 words / 2–3 sentences" framing with **"completeness over brevity:
    include every unique fact, number, quote, date, and source from all clustered
    articles; do not pad; hard cap 1350 words."**
  - Add **plain-language + jargon rule**: "Write so a gamer outside this game's
    community understands. When you must use jargon (e.g. 'roguelite', 'GaaS', 'cope
    cage', 'AH'), explain it in a few words inline the first time."
  - Keep existing neutrality + conflict-surfacing rules (already correct).
- A2. Token budget: lower `CURATION_BATCH_SIZE` 12 → **6**, raise per-batch
  `maxTokens` 8192 → **16384**. (6 × ~1800-token worst case = 10.8k < 16.4k; typical far
  less.) Batches must stay ≥ max cluster size so a full sibling cluster synthesizes in
  one call — 6 covers observed clusters.
- A3. Add validation `summary_too_long` (> ~1400 words / ~9000 chars) → retry directive
  "trim to under 1350 words, drop least-important detail first." Extend `ValidationError`,
  `validateCuration`, retry reminder.
- A4. **(DEFERRED)** Anthropic prompt caching on the large static system prompt would
  offset the smaller-batch fixed-cost increase, but `lib/ai` is a 4-provider abstraction
  with a provider-agnostic `complete()` — adding `cache_control` is its own mini-project.
  Follow-up, not blocking Phase A.
- A5. Decide G8 (embedding-absorb): default = **accept link-only** (note limitation);
  optional follow-up = on absorb, reset primary `ai_curated_at` to re-synthesize with the
  sibling. See §9.

### Phase B — Cover image acquisition (backend + migration)
Files: new `apps/api/src/lib/news/ogImage.ts`; `generalNewsIngestion.ts` (ingest hook);
`apps/api/src/db/migrations/064_general_news_image_meta.sql`
- B1. Migration 064: add `image_source TEXT`, `image_resolved_at TIMESTAMPTZ`,
  `image_width INT`, `image_height INT` to `general_news`. (Dominant color deferred — see §9.)
- B2. `resolveHeroImage(url)` using **`open-graph-scraper`** + a **stdlib SSRF-safe undici
  dispatcher** (`net.BlockList` connect-time check). Fetch og:image → twitter:image →
  largest `<img>`. Timeout 8s, real User-Agent, scheme allowlist, size cap, fail-open.
  (Full snippet + SSRF checklist in §5.)
- B3. Quality gate: trust `og:image:width/height` meta first; only when missing, probe
  with **`probe-image-size`** (header bytes only). Store width/height. Treat ≥600×314 as
  hero-worthy, ≥1000 wide as "large".
- B4. Ingest hook: after `upsertGeneralNews`, for each new row where the feed image is
  absent or small, scrape once; store `image_url` + provenance + dims + `image_resolved_at`.
  Skip rows already resolved. Never block ingest. Reddit rows always scrape.
- B5. (Optional) Hero selection: when picking item[0] as hero, prefer a top-ranked item
  that has a large landscape image so the hero never renders a missing/tiny cover.

### Phase C — Frontend visual rebuild (hero / cards / rows)
Files: `apps/web/src/pages/GamingNews.tsx`; theme tokens if needed
- C1. Shared helper `deriveExcerpt(aiSummary, maxChars)`: strip markdown (bullets, `*`,
  links), take the first sentence/clause, cap to ~60–90 chars + "…". Use on hero + cards.
- C2. Shared `CoverImage` component: aspect-ratio box, themed gradient skeleton,
  `object-fit: cover`, `decoding="async"`, `loading` (eager hero / lazy others),
  `fetchpriority="high"` hero, robust `onError` → gradient fallback. (Snippet in §5.)
- C3. **Hero Card** rebuild: full-bleed `CoverImage` as the foreground; gradient scrim for
  legibility; Ken Burns + sheen layers (CSS, reduced-motion gated, §5); overlay title
  (bigger), subtitle, excerpt, label, tags, vote + share footer. Drop the faint-background
  pattern.
- C4. **News Card** rebuild: prominent `CoverImage` (top, ~16:9), title, subtitle, excerpt,
  tags, vote + share. Condensed vs hero; no motion.
- C5. **News Row**: keep dense single-line layout; add `aiSubtitle` (truncated one line);
  keep small cover, vote, share. (Excerpt on rows = open call, §9.)
- C6. `prefers-reduced-motion`: hero animations default paused, run only under
  `@media (prefers-reduced-motion: no-preference)`.

### Phase D — Reader source pop-out (frontend)
Files: `apps/web/src/pages/GamingNews.tsx` (`NewsArticleModal`)
- D1. Delete the always-visible "Sources" block (lines ~1369–1392).
- D2. Rework the `<details>` "Source Attribution" pop-out (~1394–1454): render the full
  `aiSources` list, each `prettyHost(url)` as a direct link, each once (already deduped by
  the GET query). Remove the "Read full article →" button (G6 / spec).
- D3. Enlarge the Reader cover image (currently `maxHeight: 200`); apply `CoverImage`.
- D4. Confirm Reader shows: cover, title, subtitle (add if missing), summary, vote,
  rationale, Source Attribution pop-out — in that order.
- D5. Vote control placement handled in Phase F (F3) — moves out of the AI Summary box.

### Phase F — Content voting re-aim (backend ranking + frontend semantics)
Files: `apps/api/src/routes/generalNews.ts`; `apps/web/src/pages/GamingNews.tsx`;
`apps/api/src/lib/generalNewsIngestion.ts`
- F1. Re-aim semantics: votes are general content up/down (surface/sink), NOT
  summary-quality. Update the `general_news_feedback` endpoint comment
  (`routes/generalNews.ts` ~453, "Rates the summary quality, not the story") and the
  `VoteControls` aria-labels/titles (~1106 "Rate AI summary as helpful") → "Upvote /
  Downvote this story".
- F2. Ranking: strengthen the vote term in GET `/news/general` ORDER BY (currently
  `+ (upvotes − downvotes*0.5) * 0.08`). Small crew = low vote counts, so each vote should
  move position meaningfully while AI relevance stays the floor for unvoted stories and
  recency breaks ties. Default: `score = aiRelevance + netVotes*W + recencyBonus`,
  W ≈ 0.15–0.25, tunable. (See §9.)
- F3. Reader placement: move `VoteControls` OUT of the "AI Summary" box header (~1331) to a
  story-level action bar (near title or footer) so it reads as "vote on the story", not
  "rate the summary".
- F4. Curation feedback loop: `buildCrewContext` tag-feedback ("Crew has upvoted/downvoted
  articles about: …") is now semantically correct as a content-preference signal — keep;
  update the comment from summary to content framing.
- F5. "Sink" behavior: rank-lower only by default; no hard hiding. Optional downvote-hide
  threshold deferred (risky for a small crew). (See §9.)

### Phase E — Verification (see §8)

---

## 5. Libraries / primitives to reuse (research findings, 2025–2026)

**og:image scraping — `open-graph-scraper@^6`** (built-in TS types, maintained 2025-11)
for parsing, with our OWN SSRF-safe undici dispatcher injected via `fetchOptions`.
Do NOT adopt the young SSRF npm libs; roll stdlib `net.BlockList`.

SSRF checklist (must-do): scheme allowlist http/https; block at CONNECT time (not
pre-flight) the ranges 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 (incl. metadata
169.254.169.254), ::1, fc00::/7, fe80::/10, 100.64/10, 0.0.0.0, ::ffff:0:0/96; re-check
each redirect hop; response size cap (~2MB); content-type check; 5–8s timeout, no retry;
strip URL credentials. Fail-open (keep feed image).

```ts
// apps/api/src/lib/news/ogImage.ts — sketch
import dns from "node:dns/promises";
import net from "node:net";
import ogs from "open-graph-scraper";
import { Agent } from "undici";

const block = new net.BlockList();
for (const [ip, n] of [["10.0.0.0",8],["172.16.0.0",12],["192.168.0.0",16],
  ["127.0.0.0",8],["169.254.0.0",16],["100.64.0.0",10]] as const)
  block.addSubnet(ip, n, "ipv4");
block.addAddress("0.0.0.0","ipv4");
block.addSubnet("::1",128,"ipv6"); block.addSubnet("fc00::",7,"ipv6");
block.addSubnet("fe80::",10,"ipv6"); block.addSubnet("::ffff:0:0",96,"ipv6");

const dispatcher = new Agent({
  connect: { lookup: (host, _o, cb) => dns.lookup(host,{all:true,verbatim:true})
    .then(a => { for (const x of a) if (block.check(x.address, x.family===6?"ipv6":"ipv4"))
        return cb(new Error("SSRF blocked"), "", 0);
      cb(null, a[0].address, a[0].family); }).catch(cb) },
  headersTimeout: 5000, bodyTimeout: 5000,
});

export async function resolveHeroImage(articleUrl: string): Promise<string | null> {
  let u: URL; try { u = new URL(articleUrl); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  try {
    const { error, result } = await ogs({ url: u.toString(), timeout: 8000,
      fetchOptions: { dispatcher, headers: {
        "user-agent": "BonelessIslandBot/1.0 (+https://bonelessisland.com)",
        accept: "text/html,application/xhtml+xml" } } });
    if (error || !result) return null;
    const img = result.ogImage?.[0]?.url ?? result.twitterImage?.[0]?.url ?? null;
    return img ? new URL(img, u).toString() : null;
  } catch { return null; } // fail-open
}
```

Dimension probe (fallback only): **`probe-image-size@^7`** (+ `@types/probe-image-size`),
streams header bytes; run image URL through the same `dispatcher`.

**Ken Burns + sheen — hand-roll CSS, no library.** No well-maintained dedicated React
lib exists; the popular shimmer tutorials animate `background-position` (paint every
frame — avoid). Animate `transform` + `opacity` only. Default paused; enable under
`prefers-reduced-motion: no-preference`. Keep sheen faint (white 0.06–0.12,
`mix-blend-mode: screen`), most of the loop idle.

```css
.hero-card { position: relative; overflow: hidden; border-radius: 16px;
  isolation: isolate; aspect-ratio: 16/9; }
.hero-card__img { position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; transform-origin:50% 50%;
  animation: kenburns 28s ease-in-out infinite alternate; animation-play-state: paused; }
.hero-card__sheen { position:absolute; inset:-50% 0; pointer-events:none;
  background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,.10) 50%, transparent 65%);
  mix-blend-mode: screen; transform: translateX(-120%) skewX(-18deg);
  animation: sheen 7s ease-in-out 4s infinite; animation-play-state: paused; }
.hero-card__scrim { position:absolute; inset:0; pointer-events:none;
  background: linear-gradient(to top, rgba(0,0,0,.70), rgba(0,0,0,.25) 40%, transparent 70%); }
.hero-card__content { position:relative; z-index:1; }
@keyframes kenburns { from{transform:scale(1) translate3d(0,0,0);}
  to{transform:scale(1.08) translate3d(-2%,-1.5%,0);} }
@keyframes sheen { 0%{transform:translateX(-120%) skewX(-18deg);}
  22%{transform:translateX(120%) skewX(-18deg);} 100%{transform:translateX(120%) skewX(-18deg);} }
@media (prefers-reduced-motion: no-preference) {
  .hero-card__img, .hero-card__sheen { animation-play-state: running; } }
```
Note: codebase uses inline styles + `<style>` tags — inject these keyframes via a
`<style>` block (same pattern as the existing `shimmer` keyframe at line ~529).

**External image loading — hotlink direct, NO proxy.** Single box shouldn't pay
bandwidth/CPU per reader, and a naive proxy is a disk-leak risk (cf. recent docker disk
fix). Lightest combo: `aspect-ratio` box + themed gradient skeleton + `decoding="async"`
everywhere; `loading="lazy"` cards, `fetchpriority="high"`+eager on the one hero; robust
`onError` → gradient. Skip `srcset` (single source URL). Skip hash LQIP/BlurHash (need
offline preprocessing; our URLs are runtime). Dominant-color blur-up only if we add it at
scrape time (needs `sharp`) — deferred.

```tsx
// onError fallback core
const [failed, setFailed] = useState(false);
const show = src && !failed;
// container has themed gradient background; <img onError={() => setFailed(true)} />
// key the list by article id/url (stable) to avoid remount-refetch + stale broken state
```

**Reader markdown** — reuse existing `FormattedSummary` (prose + bullet parser). No new dep.

---

## 6. Schema change (migration 064)

```sql
ALTER TABLE general_news
  ADD COLUMN image_source      TEXT,           -- 'feed' | 'og' | 'twitter' | 'img' | 'none'
  ADD COLUMN image_resolved_at TIMESTAMPTZ,    -- scrape-once guard
  ADD COLUMN image_width       INT,
  ADD COLUMN image_height      INT;
```
Migration tracker can drift silently (schema currently ~063) — verify applied count with
`docker exec ... psql` after adding. Deferred (Phase 2): `image_dominant_color TEXT`.

---

## 7. Cost & performance notes

- Smaller batches (6) = ~2× curation calls vs 12 → more fixed system-prompt cost;
  **prompt caching (A4) is the mitigation** and should land with A2.
- 1350-word cap is a ceiling, not a target; typical summaries ~400–700 words. Worst-case
  output per batch ~10.8k tokens < 16384 cap.
- og:image: exactly one extra fetch per NEW article, scrape-once, fail-open. No headless
  browser (too heavy for Graviton). Reddit benefits most.
- Images hotlinked directly (source CDN pays); themed fallback covers 403/404.
- Hero animations are compositor-only (transform/opacity); safe to run continuously; no
  IntersectionObserver needed for a single hero.

---

## 8. Verification — "actually reach desired state"

Backend:
- Admin **recurate** (`POST /news/general/recurate`, poll status) regenerates all
  summaries under the new prompt; watch cost + validation-failures endpoint.
- Spot-check summary word-count distribution (none > 1350; completeness present).
- Confirm a known multi-source story surfaces a conflict ("X reports… but Y reports…").
- Confirm `image_url`/dims populated for previously image-less rows (esp. Reddit).
- Unit/manual: SSRF guard rejects `http://169.254.169.254/...` and `http://127.0.0.1`.

Frontend (use `/run` + Claude Preview / screenshots):
- Hero renders large cover + Ken Burns + sheen; reduced-motion → static.
- Hero/cards show excerpt (half sentence), not full summary.
- Reader: cover, title, subtitle, full summary, vote, rationale, Source Attribution
  pop-out with all sources once, NO "Read full article" button.
- Broken-image URL → themed fallback, no layout shift (aspect-ratio reserved).
- Lighthouse: hero is LCP, not lazy-loaded.

Definition of done: each phase merged to `main` (auto-deploys), eyeballed on
bonelessisland.com, recurate run once after Phase A.

---

## 9. Open decisions / flags (resolve during build, non-blocking)

1. **Embedding-absorb (G8):** accept link-only siblings (cheap, default) vs re-synthesize
   primary on absorb (richer, costs an extra curation). Recommend: ship link-only, revisit.
2. **News Row excerpt:** spec says "same primitives" but "least flair". Recommend: rows
   show subtitle (one truncated line), NO excerpt, to keep density. Confirm.
3. **Dominant-color blur-up:** needs `sharp` (native dep) at scrape time. Recommend defer;
   themed gradient skeleton is enough now.
4. **Hero selection by image quality (B5):** prefer a top-ranked item with a large
   landscape image as hero? Recommend yes if cheap, else item[0].
5. **AI voice branding (Nuggie) / feed nickname (Shore):** copy-only; defer.
6. **Vote ranking weight (F2):** W ≈ 0.2 default; tune after observing real crew vote
   volume; consider light recency decay so fresh stories aren't buried by old upvoted ones.
7. **Downvote hiding (F5):** rank-lower only (default) vs hide below a strong negative
   threshold (e.g. net ≤ −5). Risky for a small crew — deferred.

---

## 10. File touch list (quick reference)

Backend:
- `apps/api/src/lib/generalNewsIngestion.ts` — prompt (A1), batch/tokens (A2), validation
  (A3), ingest scrape hook (B4), absorb decision (A5/G8).
- `apps/api/src/lib/ai/*` — prompt caching (A4).
- `apps/api/src/lib/news/ogImage.ts` — NEW (B2/B3).
- `apps/api/src/lib/news/providers/reddit.ts` — ensure scrape covers null images (B4).
- `apps/api/src/db/migrations/064_general_news_image_meta.sql` — NEW (B1).
- `apps/api/src/routes/generalNews.ts` — vote ranking weight (F2), feedback endpoint relabel (F1).

Frontend:
- `apps/web/src/pages/GamingNews.tsx` — `deriveExcerpt` (C1), `CoverImage` (C2),
  `NewsHeroCard` (C3), `NewsCard` (C4), `NewsListRow` (C5), reduced-motion (C6),
  `NewsArticleModal` sources rework (D1–D4), hero keyframes `<style>` block, content-vote
  semantics + placement (F1/F3).

Deps to add: `open-graph-scraper`, `probe-image-size`, `@types/probe-image-size`
(undici is already transitive via Node/other libs — confirm).
