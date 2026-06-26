import express from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { PROVIDERS } from "../lib/news/providers/index.js";
import type { NewsSourceRow, SourceKind } from "../lib/news/providers/index.js";

export const newsSourcesRouter = express.Router();
newsSourcesRouter.use(requireSession);
newsSourcesRouter.use(requireParentRole);

// ── Schemas ───────────────────────────────────────────────────────────────────

const VALID_KINDS = ["rss", "reddit", "youtube", "gnews"] as const;

const createSchema = z.object({
  kind: z.enum(VALID_KINDS),
  name: z.string().trim().min(1).max(120),
  identifier: z.string().trim().min(1).max(500),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    identifier: z.string().trim().min(1).max(500).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((d) => d.name !== undefined || d.identifier !== undefined || d.enabled !== undefined, {
    message: "at least one of name/identifier/enabled is required",
  });

// ── GET / ─────────────────────────────────────────────────────────────────────
// List every source. Admin UI groups client-side by kind.

newsSourcesRouter.get("/", async (_req, res) => {
  const r = await db.query<NewsSourceRow>(
    `SELECT id::text, kind, slug, name, identifier, enabled, is_preset, config,
            last_fetched_at, last_error, last_success_at, fail_streak,
            items_fetched_total, items_curated_total, validation_fail_total
       FROM news_source_registry
      ORDER BY kind, name`
  );
  res.json({ sources: r.rows });
});

// ── GET /services ─────────────────────────────────────────────────────────────
// Per-kind readiness — used by the admin to render the top-of-page status chips.

newsSourcesRouter.get("/services", (_req, res) => {
  const services = VALID_KINDS.map((kind) => {
    const provider = PROVIDERS[kind];
    const blocker = provider.readinessGate();
    return { kind, ready: blocker === null, blocker };
  });
  res.json({ services });
});

// ── POST / — add a custom (non-preset) source ─────────────────────────────────

newsSourcesRouter.post("/", async (req, res) => {
  const parsed = createSchema.parse(req.body);
  const slug = customSlug(parsed.kind, parsed.identifier);
  try {
    const r = await db.query<NewsSourceRow>(
      `INSERT INTO news_source_registry (kind, slug, name, identifier, enabled, is_preset)
       VALUES ($1, $2, $3, $4, TRUE, FALSE)
       RETURNING id::text, kind, slug, name, identifier, enabled, is_preset, config,
                 last_fetched_at, last_error`,
      [parsed.kind, slug, parsed.name, parsed.identifier]
    );
    res.status(201).json({ source: r.rows[0] });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      res.status(409).json({ error: "A source with this identifier already exists." });
      return;
    }
    throw err;
  }
});

// ── PATCH /:id ────────────────────────────────────────────────────────────────

newsSourcesRouter.patch("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = patchSchema.parse(req.body);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  if (parsed.name !== undefined) {
    values.push(parsed.name);
    setClauses.push(`name = $${values.length}`);
  }
  if (parsed.identifier !== undefined) {
    values.push(parsed.identifier);
    setClauses.push(`identifier = $${values.length}`);
  }
  if (parsed.enabled !== undefined) {
    values.push(parsed.enabled);
    setClauses.push(`enabled = $${values.length}`);
  }
  values.push(id);

  const r = await db.query<NewsSourceRow>(
    `UPDATE news_source_registry
        SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id::text, kind, slug, name, identifier, enabled, is_preset, config,
                last_fetched_at, last_error`,
    values
  );
  if (r.rowCount === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  res.json({ source: r.rows[0] });
});

// ── DELETE /:id — non-preset only ─────────────────────────────────────────────

newsSourcesRouter.delete("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db.query<{ is_preset: boolean }>(
    `SELECT is_preset FROM news_source_registry WHERE id = $1`,
    [id]
  );
  if (existing.rowCount === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  if (existing.rows[0].is_preset) {
    res.status(403).json({ error: "Curated presets can be disabled but not deleted." });
    return;
  }
  await db.query(`DELETE FROM news_source_registry WHERE id = $1`, [id]);
  res.json({ ok: true });
});

// ── POST /:id/test — preview without committing ───────────────────────────────

newsSourcesRouter.post("/:id/test", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const r = await db.query<NewsSourceRow>(
    `SELECT id::text, kind, slug, name, identifier, enabled, is_preset, config,
            last_fetched_at, last_error
       FROM news_source_registry
      WHERE id = $1`,
    [id]
  );
  if (r.rowCount === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  const source = r.rows[0];
  const provider = PROVIDERS[source.kind];
  if (!provider) {
    res.status(400).json({ error: `No provider registered for kind ${source.kind}` });
    return;
  }
  const blocker = provider.readinessGate();
  if (blocker) {
    res.status(400).json({ error: blocker });
    return;
  }
  try {
    const items = await provider.fetch(source, { crewTags: [], gameNames: [], limit: 5 });
    await db.query(
      `UPDATE news_source_registry SET last_error = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({
      count: items.length,
      preview: items.slice(0, 5).map((i) => ({
        title: i.title,
        url: i.url,
        publishedAt: i.publishedAt,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.query(
      `UPDATE news_source_registry SET last_error = $2, updated_at = NOW() WHERE id = $1`,
      [id, msg.slice(0, 500)]
    );
    res.status(502).json({ error: msg });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function customSlug(kind: SourceKind, identifier: string): string {
  const base = identifier
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${kind}-custom-${base || Date.now().toString(36)}`;
}
