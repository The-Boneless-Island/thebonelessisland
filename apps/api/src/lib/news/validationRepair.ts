import { getAIProvider } from "../ai/index.js";
import { getAISetting } from "../serverSettings.js";

type RepairableResult = {
  id: string;
  title?: string;
  summary?: string;
  whyMatters?: string;
  sources?: string[];
};

const REPAIRABLE_ERRORS = new Set([
  "missing_title",
  "missing_why_matters",
  "missing_sources",
  "summary_too_short"
]);

export function isRepairableValidation(errors: string[]): boolean {
  return errors.length > 0 && errors.every((e) => REPAIRABLE_ERRORS.has(e));
}

type RepairInput = {
  externalId: string;
  title: string;
  url: string;
  excerpt: string;
  partial: RepairableResult;
  errors: string[];
  batchUrls: Set<string>;
};

/**
 * One cheap schema-only repair pass for rows that failed structural validation.
 * Does not re-summarize — only fills missing required fields.
 */
export async function tryValidationRepair(input: RepairInput): Promise<RepairableResult | null> {
  if (!isRepairableValidation(input.errors)) return null;

  const ai = getAIProvider();
  const systemPrompt = `You repair incomplete JSON for a gaming news card. Fill ONLY the fields listed as missing. Do not rewrite the summary unless it is too short (<150 chars). Keep whyMatters to 1–2 concrete sentences about why a Discord gaming crew would care. Sources must be valid https URLs from the provided list or the article URL. Return ONLY JSON:

{
  "id": "<exact id>",
  "title": "<headline if missing>",
  "summary": "<only if too short>",
  "whyMatters": "<only if missing>",
  "sources": ["<url>", "..."]
}`;

  const userContent = JSON.stringify(
    {
      id: input.externalId,
      articleTitle: input.title,
      articleUrl: input.url,
      excerpt: input.excerpt.slice(0, 1200),
      allowedSourceUrls: [...input.batchUrls, input.url],
      missingFields: input.errors,
      partial: input.partial
    },
    null,
    2
  );

  try {
    const result = await ai.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      { maxTokens: 1200, temperature: 0 }
    );
    const text = result.text.trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < jsonStart) return null;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as RepairableResult;
    if (parsed.id !== input.externalId) parsed.id = input.externalId;
    console.log(
      `[generalNews] validation repair for ${input.externalId} via ${getAISetting("ai_provider") ?? "ai"}`
    );
    return parsed;
  } catch (err) {
    console.warn("[generalNews] validation repair failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type { RepairableResult };
