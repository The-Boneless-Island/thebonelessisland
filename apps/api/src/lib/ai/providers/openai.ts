import OpenAI from "openai";
import { resolveGatewayConfig } from "../gateway.js";
import { AICompleteOpts, AIMessage, AIProvider, AIResult } from "../provider.js";
import { recordAiCost } from "../usageTally.js";

// Published per-million-token prices ($USD). Cached input is billed at 50%.
const OPENAI_PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini":  { in: 0.15, out: 0.60 },
  "gpt-4o":       { in: 2.50, out: 10.00 },
  "gpt-4.1-mini": { in: 0.40, out: 1.60 },
  "gpt-4.1":      { in: 2.00, out: 8.00 },
  "o4-mini":      { in: 1.10, out: 4.40 }
};

function estimateOpenAICostUsd(
  model: string,
  usage: { input: number; output: number; cached: number }
): number {
  const price = OPENAI_PRICING[model];
  if (!price) return 0;
  const billedInput = (usage.input - usage.cached) * price.in;
  const cachedInput = usage.cached * price.in * 0.5;
  const output = usage.output * price.out;
  return (billedInput + cachedInput + output) / 1_000_000;
}

// OpenAI auto-caches identical prompt prefixes >= 1024 tokens — no opt-in,
// no client-side knobs. Cached tokens are billed at 50% of the input rate.
// The hit count comes back on `usage.prompt_tokens_details.cached_tokens`.

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    const gateway = resolveGatewayConfig("openai");
    this.client = new OpenAI({
      apiKey,
      ...(gateway ? { baseURL: gateway.baseURL } : {}),
      ...(gateway && Object.keys(gateway.headers).length > 0
        ? { defaultHeaders: gateway.headers }
        : {})
    });
    this.model = model;
  }

  async complete(messages: AIMessage[], opts?: AICompleteOpts): Promise<AIResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts?.maxTokens ?? 1024,
      ...(typeof opts?.temperature === "number" ? { temperature: opts.temperature } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    });

    const text = response.choices[0]?.message?.content ?? "";
    const usage = response.usage;
    const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;

    if (usage) {
      const cost = estimateOpenAICostUsd(this.model, {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        cached: cachedTokens
      });
      recordAiCost("openai", this.model, cost);
      console.log(
        `[ai:usage] openai/${this.model} in=${usage.prompt_tokens}tok out=${usage.completion_tokens}tok cache_hit=${cachedTokens}tok est=$${cost.toFixed(4)}`
      );
    }

    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      cachedTokens
    };
  }
}
