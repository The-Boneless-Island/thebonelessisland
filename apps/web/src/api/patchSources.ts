import { apiFetch } from "./client.js";
import type {
  PatchSourceCandidate,
  PatchSourceGameGroup,
  PatchSourceTestResult
} from "../types.js";

export async function getPatchSourceCandidates(): Promise<PatchSourceCandidate[]> {
  const res = await apiFetch("/game-news-sources/candidates");
  if (!res.ok) throw new Error("Failed to load candidates");
  const data = (await res.json()) as { candidates: PatchSourceCandidate[] };
  return data.candidates;
}

export async function getPatchSources(): Promise<PatchSourceGameGroup[]> {
  const res = await apiFetch("/game-news-sources");
  if (!res.ok) throw new Error("Failed to load sources");
  const data = (await res.json()) as { games: PatchSourceGameGroup[] };
  return data.games;
}

export async function createPatchSource(input: {
  appId: number;
  sourceType: "rss" | "atom";
  sourceUrl: string;
  label: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const res = await apiFetch("/game-news-sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, error: (data as { error?: string } | null)?.error ?? "Failed to create source" };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function updatePatchSource(
  id: string,
  patch: { sourceUrl?: string; label?: string | null; enabled?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch(`/game-news-sources/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { ok: false, error: (data as { error?: string } | null)?.error ?? "Failed to update source" };
  }
  return { ok: true };
}

export async function deletePatchSource(id: string): Promise<{ ok: boolean }> {
  const res = await apiFetch(`/game-news-sources/${id}`, { method: "DELETE" });
  return { ok: res.ok };
}

export async function testPatchSourceUrl(sourceUrl: string): Promise<PatchSourceTestResult> {
  const res = await apiFetch("/game-news-sources/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceUrl })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { ok: false, error: (data as { error?: string } | null)?.error ?? "Test failed" };
  }
  return (await res.json()) as PatchSourceTestResult;
}
