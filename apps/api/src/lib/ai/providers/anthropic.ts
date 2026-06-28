import Anthropic from "@anthropic-ai/sdk";
import { resolveGatewayConfig } from "../gateway.js";
import { AICompleteOpts, AIMessage, AIProvider, AIResult } from "../provider.js";
import { recordAiCost } from "../usageTally.js";

// Prompt caching is a prefix match — any byte change anywhere in the cached
// prefix invalidates everything after it. The minimum cacheable prefix is
// model-dependent and silently no-ops when below the threshold:
//   Opus 4.7 / 4.6 / 4.5, Haiku 4.5 → 4096 tokens
//   Sonnet 4.6                       → 2048 tokens
//   Sonnet 4.5 / 4.1 / 4 / 3.7       → 1024 tokens
// We place two breakpoints at most: one on the system block (caches tools +
// system together) and one on the trailing assistant message of any prior
// conversation history (caches the conversation prefix for multi-turn).

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    const gateway = resolveGatewayConfig("anthropic");
    this.client = new Anthropic({
      apiKey,
      ...(gateway ? { baseURL: gateway.baseURL } : {}),
      ...(gateway && Object.keys(gateway.headers).length > 0
        ? { defaultHeaders: gateway.headers }
        : {})
    });
    this.model = model;
  }

  async complete(messages: AIMessage[], opts?: AICompleteOpts): Promise<AIResult> {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const systemBlock: Anthropic.TextBlockParam | undefined = systemMessage
      ? {
          type: "text",
          text: systemMessage.content,
          cache_control: { type: "ephemeral" }
        }
      : undefined;

    // Multi-turn cache breakpoint: when the trailing user turn is preceded by
    // an assistant turn (i.e. we have a prior exchange), put cache_control on
    // that assistant message. Each subsequent turn re-uses the conversation
    // prefix up to and including that block. One-shot calls fall through —
    // only the system block carries cache_control.
    const lastIsUser =
      chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === "user";
    const priorAssistantIdx = lastIsUser ? findLastAssistantIndex(chatMessages, chatMessages.length - 2) : -1;

    const mappedMessages: Anthropic.MessageParam[] = chatMessages.map((m, idx) => {
      if (idx === priorAssistantIdx) {
        return {
          role: "assistant",
          content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }]
        };
      }
      return {
        role: m.role as "user" | "assistant",
        content: m.content
      };
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts?.maxTokens ?? 1024,
      ...(typeof opts?.temperature === "number" ? { temperature: opts.temperature } : {}),
      ...(systemBlock ? { system: [systemBlock] } : {}),
      messages: mappedMessages
    });

    const block = response.content[0];
    const text = block.type === "text" ? block.text : "";
    const usage = response.usage as Anthropic.Usage & {
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };

    logUsage("anthropic", this.model, {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0
    });

    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cachedTokens: usage.cache_read_input_tokens ?? 0
    };
  }
}

function findLastAssistantIndex(messages: AIMessage[], maxIdx: number): number {
  for (let i = maxIdx; i >= 0; i--) {
    if (messages[i].role === "assistant") return i;
  }
  return -1;
}

// Published per-million-token prices ($USD). Cache-read is 10% of base input;
// cache-write is 1.25× base input. Output is base output. Numbers may drift —
// treat this as a cost-estimate signal, not a ground-truth invoice.
const ANTHROPIC_PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5":  { in: 1.0,  out: 5.0 },
  "claude-sonnet-4-6": { in: 3.0,  out: 15.0 },
  "claude-opus-4-7":   { in: 15.0, out: 75.0 },
  "claude-opus-4-6":   { in: 15.0, out: 75.0 }
};

function estimateAnthropicCostUsd(
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
): number {
  const price = ANTHROPIC_PRICING[model];
  if (!price) return 0;
  // Anthropic's `input_tokens`, `cache_read_input_tokens`, and
  // `cache_creation_input_tokens` are mutually exclusive counters — do NOT
  // subtract cache_read from input. Earlier version did, which underreported
  // cost by ~15%.
  const inputDollars = (usage.input * price.in) / 1_000_000;
  const cacheReadDollars = (usage.cacheRead * price.in * 0.1) / 1_000_000;
  const cacheWriteDollars = (usage.cacheWrite * price.in * 1.25) / 1_000_000;
  const outputDollars = (usage.output * price.out) / 1_000_000;
  return inputDollars + cacheReadDollars + cacheWriteDollars + outputDollars;
}

function logUsage(
  provider: string,
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
) {
  const cost = estimateAnthropicCostUsd(model, usage);
  recordAiCost(provider, model, cost);
  console.log(
    `[ai:usage] ${provider}/${model} in=${usage.input}tok out=${usage.output}tok cache_hit=${usage.cacheRead}tok cache_write=${usage.cacheWrite}tok est=$${cost.toFixed(4)}`
  );
}
