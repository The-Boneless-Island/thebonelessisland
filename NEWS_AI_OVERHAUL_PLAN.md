# News AI Overhaul — Cost, Quality & Foundation Plan

**Status:** Planning (Opus). Build phase next (Sonnet).
**Owner:** matt
**Created:** 2026-06-28

## Goal

Cut news-AI spend from ~$10/day (~$300/mo projected) toward the ~$10/mo target, raise
article quality, and leave the curation pipeline on a clean, provider-flexible foundation.
No active users yet — we are free to make breaking changes (wipe data, swap providers).

## Root causes (from code review)

1. **No cost ceiling.** Ledger records spend ([usageTally.ts](apps/api/src/lib/ai/usageTally.ts)) but nothing halts curation.
2. **Validation-failure re-curation loop.** `curateUncuratedGeneralNews` resets *all* recent
   failures to uncurated every call, no give-up ([generalNewsIngestion.ts:2015](apps/api/src/lib/generalNewsIngestion.ts:2015)). Thin Reddit/RSS posts that can't meet the 250-char article bar churn forever.
3. **Reddit firehose held to a news-article standard.** RSS gives no score signal; weak pre-filter
   ([newsPreFilter.ts:30](apps/api/src/lib/news/newsPreFilter.ts:30)) passes nearly everything to the costly curator.
4. **Expensive per-call overhead, no caching.** ~7k-token system prompt re-sent per batch; 40-item
   merge context re-fetched per batch ([:1848](apps/api/src/lib/generalNewsIngestion.ts:1848)); Bedrock has no prompt caching.
5. **Structural overgrowth.** Two parallel pipelines (scheduled ingest + autopilot) and duplicated
   curation code; three overlapping dedup layers (embeddings, Nova fingerprint pass, curator prompt).

## Decisions locked

- **Curation model:** Gemini 2.5 Flash. Chat/Nuggie + any "light" task: Gemini 2.5 Flash-Lite.
- **Embeddings:** OpenAI `text-embedding-3-large`, full **3072 dims**. Wipe existing vectors, re-embed.
  Keep articles/summaries (still valid) — only embeddings are stale.
- **Routing:** all AI (curation, chat, embeddings) through **Cloudflare AI Gateway** (BYOK, keep our
  own provider billing — do NOT enable Unified Billing / its 5% fee). Free tier confirmed: no token
  markup, caching, analytics/cost dashboard, logging (100k logs), rate limiting, fallback, **spend limits**.
- **Reddit:** Plan A — enrichment only. Reddit posts embed + attach as sources to existing stories;
  never spawn their own AI-curated card. No Haiku/Gemini call for Reddit.
- **Scope:** all three phases below.

## Target architecture

```
Schedulers ──> enqueue ──> Pipeline queue (serial, locked)
                                │
                ┌───────────────┴───────────────┐
            INGEST (one path)              CURATE (one function)
   fetch → upsert(+prefilter stamp)     pull keepable pool → batch
        → embed → absorb siblings          → Gemini curate (+validate, give-up)
        → enqueue CURATE                    → persist → images for live cards only
                                            → spend-cap check (soft)

All model calls → Cloudflare AI Gateway → {OpenAI | Google} (our keys, our billing)
Embeddings: OpenAI 3-large @3072 → pgvector (halfvec+hnsw OR vector seq-scan)
Autopilot / recurate: ENQUEUE ingest/curate; never reimplement them.
```

---

## Phase 0 — Gateway + settings (manual, no deploy)

Do first; unblocks everything and gives immediate cost visibility.

1. Create a Cloudflare AI Gateway in the account. Add OpenAI + Google provider keys (BYOK).
   Keep our own provider billing — **do not** turn on Unified Billing (5% fee).
2. Enable: caching, analytics, and a **Spend Limit** (~$10/mo hard ceiling at the edge).
3. Gateway created: id `boneless-news`, account `3764b4b090876b4293200d6b5d5e3e8c`.
   Auth token created + stored by owner (secret; sent as `cf-aig-authorization: Bearer …`).
   Base URLs:
   - OpenAI (embeddings): `https://gateway.ai.cloudflare.com/v1/3764b4b090876b4293200d6b5d5e3e8c/boneless-news/openai`
   - Gemini (curation/chat): `https://gateway.ai.cloudflare.com/v1/3764b4b090876b4293200d6b5d5e3e8c/boneless-news/google-ai-studio`
   - Unified OpenAI-compat (optional): `.../boneless-news/compat` (model = `provider/model`)
   Key mode: **pass-through** (provider keys stay in app DB settings; add base URL + cf-aig token). BYOK deferred.
   Logs on (100k). Caching OFF (unique prompts; revisit later). Retries OFF (app owns retries).
   TODO in dashboard: enable **Spend Limit** $10/mo, monthly, gateway scope.
4. Settings flip (admin → AI): `ai_provider=gemini`, `ai_model=gemini-2.5-flash`.
5. pgvector version is **auto-detected in the migration** (no manual check needed) — see 1d.

---

## Phase 1 — Stop the bleed + embeddings foundation

### 1a. Reddit → enrichment only (Plan A)
- In the ingest path, tag `source_type='reddit'` rows so they go embed → absorb only; if a Reddit
  post matches no existing curated story (cosine < threshold), park it (no card, no LLM).
- Remove Reddit from the standalone-curation fallthrough and from image scraping.
- Optional polish: surface attached Reddit threads as extra source links / a "community buzz" count
  on the parent card.
- Files: [generalNewsIngestion.ts](apps/api/src/lib/generalNewsIngestion.ts) (curation gate), [embeddings.ts](apps/api/src/lib/news/embeddings.ts) (absorb path), [reddit.ts](apps/api/src/lib/news/providers/reddit.ts).

### 1b. Kill the re-curation loop
- Add a give-up guard: once `ai_retry_count >= N` (e.g. 3), mark the row permanently parked
  (`pre_filter_reason='curation_giveup'`, `ai_curated_at=NOW()`), and stop the unconditional reset at
  [generalNewsIngestion.ts:2015](apps/api/src/lib/generalNewsIngestion.ts:2015) from re-queuing already-exhausted rows.

### 1c. Spend cap (defense in depth)
- **Edge (Phase 0):** Cloudflare Spend Limit = hard monthly ceiling.
- **App (soft):** before each curation batch, check month-to-date `ai_cost_ledger`; past threshold,
  skip curation gracefully (feed keeps serving; new cards pause). Avoids hard-reject mid-batch.

### 1d. Embeddings → OpenAI 3-large @ 3072 (wipe + re-embed)
- **Migration (new, e.g. 0XX):** mirror [072](apps/api/src/db/migrations/072_bedrock_embeddings_curation_health.sql):
  `DROP INDEX general_news_embedding_idx; ALTER TABLE … DROP COLUMN embedding;`
  then **auto-detect** capability inside the DO block — `IF EXISTS (SELECT 1 FROM pg_type WHERE typname='halfvec')`
  → `halfvec(3072)` + hnsw `halfvec_cosine_ops`; ELSE → `vector(3072)` (no ANN index, seq scan).
  No manual pgvector version check; works on dev + prod identically.
- `EMBEDDING_DIM = 3072`; embed with `dimensions: 3072` (3-large native).
- **EmbeddingProvider interface** (mirror `AIProvider`): implementations for OpenAI (3-large/3-small),
  Gemini, Titan; selected by setting; dimension-aware. Pulls the ad-hoc `resolveEmbeddingBackend`
  branches ([embeddings.ts:56](apps/api/src/lib/news/embeddings.ts:56)) behind one clean interface.
- Re-embed: run the existing backfill over hot rows (cheap/fast at our size).
- Re-tune `SIMILARITY_THRESHOLD` (currently 0.85) — 3-large is more discriminative; verify dedup
  precision after switch.
- Note: switching embedding *model* later requires a re-embed (vectors are model-specific). Curation/
  chat providers remain freely swappable.

---

## Phase 2 — Collapse the structure (the real foundation)

### 2a. One ingest + one curate
- Ingest does fetch → upsert → embed → absorb, then **enqueues** a curate job. Delete the inline
  curation loop in `ingestAndCurateGeneralNews`. `curateUncuratedGeneralNews` becomes the single
  curation implementation.
- Autopilot + recurate **enqueue** ingest/curate; they stop reimplementing the pipeline
  ([newsAutopilot.ts](apps/api/src/lib/news/newsAutopilot.ts) `executeAutopilotPass`).

### 2b. Drop the Nova pre-cluster pass
- Delete `assignStoryFingerprints` ([generalNewsIngestion.ts:313](apps/api/src/lib/generalNewsIngestion.ts:313)) — embeddings handle cross-pass clustering,
  the curator prompt handles in-batch + fingerprints. Removes an AI call and a failure mode.

### 2c. Generalize task routing off Bedrock
- Replace the Bedrock-only `resolveModelForTask` ([ai/index.ts:46](apps/api/src/lib/ai/index.ts:46)) with a provider-agnostic
  `task → {provider, model}` resolver + settings (defaults: curation→`gemini-2.5-flash`,
  light/chat→`gemini-2.5-flash-lite`). Pull `curationBatchSize`/`curationMaxTokens` bedrock branches
  behind the provider/interface (or simplify now that we're on Gemini).
- Add base-URL support to the OpenAI/Gemini/Anthropic provider clients so all calls route through the
  Cloudflare gateway endpoints.

### 2d. Fix ordering
- **Images:** resolve once, **post-curation**, only for surviving primary cards. Remove the early
  `resolveMissingImages` on all new rows ([:1800](apps/api/src/lib/generalNewsIngestion.ts:1800)) and consolidate the 3 image paths.
- **Pre-filter at upsert:** stamp `pre_filter_reason` on insert so the curation pool query only pulls
  keepable rows (no wasted pool slots, [:1834](apps/api/src/lib/generalNewsIngestion.ts:1834)).

---

## Phase 3 — Tune

- **Retire-stale:** consolidate the 3 triggers (ingest >500, autopilot >100, retention 45d) into one policy.
- **Health thresholds:** re-tune so a few validation failures don't permanently trip "degraded" →
  autopilot churn ([newsCurationHealth.ts:170](apps/api/src/lib/news/newsCurationHealth.ts:170)).
- **Fallback cards:** reconsider `buildFallbackCurationResult` ([:1261](apps/api/src/lib/generalNewsIngestion.ts:1261)) — with Gemini's reliability,
  prefer skipping over minting generic filler (or mark fallbacks distinctly).
- **Per-run context:** build `buildCrewContext` + `fetchRecentPrimaries` once per run, pass down
  (stop per-batch / per-call rebuilds; merge candidates 40→15).
- Verify the gateway cost dashboard reflects all spend; finalize spend-limit value.

---

## Migrations summary

1. Embedding column swap to `halfvec(3072)`/`vector(3072)` (+ index) — wipe + re-embed.
2. Settings: generalized task-routing keys, embedding-provider key, app spend-cap threshold.
3. (Optional) new `pre_filter_reason` values; `ai_retry_count` give-up handling — no schema change if
   columns already exist.

## Testing & rollout posture

- **No local dev DB.** Migrations + re-embed validate on **prod at deploy** (branch-protected main →
  auto-deploy → SSM migration runner). Migration is idempotent + defensive. The embedding wipe is
  destructive but **regenerable** (re-embed backfill); articles/summaries/cards untouched; no users = low
  blast radius.
- **Admin/dashboard changes are batched by the owner AFTER the build merges/deploys** — provider flip
  (`ai_provider=gemini`), gateway base URLs + cf-aig token in settings, Cloudflare spend limit. Nothing is
  flipped incrementally, so the whole change set goes live together. Build *order* is for engineering
  coherence, not savings timing (savings land only when it all merges).
- Code (TS build/lint) validated in the worktree; pipeline behavior verified post-deploy via admin
  dashboard + gateway Analytics.

## Build status (Sonnet built; Opus reviewed each)

1. ✅ **Embedding subsystem** — `EmbeddingProvider` interface, OpenAI `text-embedding-3-large` @3072,
   migration `080` (auto-detect halfvec), `EMBEDDING_DIM=3072`, halfvec/vector dual-path cast.
2. ✅ **Provider/gateway** — base-URL + `cf-aig-authorization` on all provider clients (opt-in via
   `ai_gateway_enabled`), provider-agnostic task routing, migration `081`.
3. ✅ **Reddit enrichment-only + loop give-up + soft spend cap**, migration `082`. (Opus caught + fixed a
   give-up bug: exhausted rows now zero score + null summary so they can't leak into the live feed.)
4. ✅ **Structural collapse** — one ingest delegates to one curate (deadlock-safe via `skipLock`), Nova
   pre-cluster pass deleted, pre-filter moved to upsert, pre-curation image scrape removed.

Migrations added: `080`, `081`, `082`. All workspaces typecheck clean.

### Phase 3 — DEFERRED to post-deploy (intentional)

Tuning is better informed by real prod numbers on Gemini than guessed blind:
- **Health thresholds** (`validationFailures > 10 → degraded`) — right value depends on Gemini's actual
  validation-failure rate. Re-tune after observing prod.
- **Fallback-card policy** (skip vs mint) — depends on whether Gemini even triggers fallbacks (more
  reliable than Haiku). Decide after observing prod.
- **Marginal cleanups** (retire-stale consolidation, merge-candidate 40→N, per-run context caching) — no
  cost impact, low priority; revisit if needed.
- **Known minor tradeoff from 2a:** `fetchRecentPrimaries` now fetches once per pass (not per batch), so
  a duplicate story split across batches *within one pass* could miss a merge. Embedding-absorb at ingest
  catches most; bump back to per-batch only if dup cards appear.

## Risks / open items

- **pgvector version** gates halfvec+hnsw vs plain seq-scan. Check in Phase 0.
- **Gemini summary quality** — eyeball a sample of cards after switch; re-curate with Gemini is optional
  (costs tokens; Haiku summaries remain valid otherwise).
- **Nuggie chat** moves to Gemini Flash-Lite — sanity-check tone/behavior.
- **Gateway = added hop / dependency** — acceptable pre-users; gives caching + cost visibility + edge cap.
- Embedding model is now load-bearing for Reddit Plan A — must be live before/with 1a.

## Verification

- After Phase 0: gateway dashboard shows live spend per model; a test curation call appears.
- After Phase 1: Reddit posts produce 0 standalone cards; loop give-up logs appear; daily spend drops
  sharply; ledger month-to-date respected by soft cap.
- After Phase 2: one ingest + one curate in logs; no Nova fingerprint calls; images only on live cards.
- After Phase 3: "degraded" no longer self-trips; no fallback filler; gateway spend tracks to target.
