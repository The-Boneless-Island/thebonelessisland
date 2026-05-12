import Anthropic from "@anthropic-ai/sdk";
import { AICompleteOpts, AIMessage, AIProvider, AIResult } from "../provider.js";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(messages: AIMessage[], opts?: AICompleteOpts): Promise<AIResult> {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    // Mark the system prompt for prompt caching.
    // Anthropic caches blocks >= 1024 tokens (Sonnet/Opus) or >= 2048 tokens (Haiku).
    // Below the threshold it's a no-op — no error, no extra cost.
    const systemBlock: Anthropic.TextBlockParam | undefined = systemMessage
      ? {
          type: "text",
          text: systemMessage.content,
          cache_control: { type: "ephemeral" }
        }
      : undefined;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts?.maxTokens ?? 1024,
      ...(typeof opts?.temperature === "number" ? { temperature: opts.temperature } : {}),
      ...(systemBlock ? { system: [systemBlock] } : {}),
      messages: chatMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }))
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

function logUsage(
  provider: string,
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
) {
  const saved = usage.cacheRead > 0 ? ` cache_hit=${usage.cacheRead}tok` : "";
  const written = usage.cacheWrite > 0 ? ` cache_write=${usage.cacheWrite}tok` : "";
  console.log(
    `[ai:usage] ${provider}/${model} in=${usage.input}tok out=${usage.output}tok${saved}${written}`
  );
}
