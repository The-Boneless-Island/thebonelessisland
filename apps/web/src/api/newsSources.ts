import { apiFetch } from "./client.js";

export type NewsSourceKind = "rss" | "reddit" | "youtube" | "gnews";

export type NewsSource = {
  id: string;
  kind: NewsSourceKind;
  slug: string;
  name: string;
  identifier: string;
  enabled: boolean;
  is_preset: boolean;
  config: Record<string, unknown>;
  last_fetched_at: string | null;
  last_error: string | null;
  last_success_at?: string | null;
  fail_streak?: number;
  items_fetched_total?: number;
  items_curated_total?: number;
  validation_fail_total?: number;
};

export type ServiceStatus = {
  kind: NewsSourceKind;
  ready: boolean;
  blocker: string | null;
};

export type SourcePreview = {
  count: number;
  preview: Array<{ title: string; url: string; publishedAt: string }>;
};

export async function listNewsSources(): Promise<NewsSource[]> {
  const res = await apiFetch("/news-sources");
  if (!res.ok) return [];
  const data = (await res.json()) as { sources?: NewsSource[] };
  return data.sources ?? [];
}

export async function listNewsServices(): Promise<ServiceStatus[]> {
  const res = await apiFetch("/news-sources/services");
  if (!res.ok) return [];
  const data = (await res.json()) as { services?: ServiceStatus[] };
  return data.services ?? [];
}

export async function createNewsSource(input: {
  kind: NewsSourceKind;
  name: string;
  identifier: string;
}): Promise<NewsSource> {
  const res = await apiFetch("/news-sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { source?: NewsSource; error?: string };
  if (!res.ok || !data.source) {
    throw new Error(data.error ?? `Failed to create source (${res.status})`);
  }
  return data.source;
}

export async function updateNewsSource(
  id: string,
  patch: { name?: string; identifier?: string; enabled?: boolean }
): Promise<NewsSource> {
  const res = await apiFetch(`/news-sources/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as { source?: NewsSource; error?: string };
  if (!res.ok || !data.source) {
    throw new Error(data.error ?? `Failed to update source (${res.status})`);
  }
  return data.source;
}

export async function deleteNewsSource(id: string): Promise<void> {
  const res = await apiFetch(`/news-sources/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Failed to delete source (${res.status})`);
  }
}

export async function testNewsSource(id: string): Promise<SourcePreview> {
  const res = await apiFetch(`/news-sources/${encodeURIComponent(id)}/test`, { method: "POST" });
  const data = (await res.json().catch(() => null)) as
    | { count?: number; preview?: SourcePreview["preview"]; error?: string }
    | null;
  if (!res.ok) {
    throw new Error(data?.error ?? `Test failed (${res.status})`);
  }
  return { count: data?.count ?? 0, preview: data?.preview ?? [] };
}
