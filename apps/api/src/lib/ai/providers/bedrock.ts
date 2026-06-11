import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { AICompleteOpts, AIMessage, AIProvider, AIResult } from "../provider.js";
import { recordAiCost } from "../usageTally.js";

// One code path drives BOTH Anthropic Claude and Amazon Nova models through the
// Bedrock Converse API — the only thing that differs is the modelId. Auth is the
// AWS credential chain (the EC2 instance role), so there is no API key here.
// System messages go in the top-level `system` field, NOT inline in `messages`.

export class BedrockProvider implements AIProvider {
  readonly name = "bedrock";
  private client: BedrockRuntimeClient;
  private model: string;

  constructor(region: string, model: string) {
    this.client = new BedrockRuntimeClient({ region });
    this.model = model;
  }

  async complete(messages: AIMessage[], opts?: AICompleteOpts): Promise<AIResult> {
    // Converse keeps system prose out of the turn list. Join multiple system
    // messages with newlines into a single system text block.
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");

    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: [{ text: m.content }]
      }));

    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.model,
        system: systemText ? [{ text: systemText }] : undefined,
        messages: chatMessages,
        inferenceConfig: {
          maxTokens: opts?.maxTokens ?? 1024,
          ...(typeof opts?.temperature === "number" ? { temperature: opts.temperature } : {})
        }
      })
    );

    const text = (res.output?.message?.content ?? [])
      .map((c) => c.text)
      .filter(Boolean)
      .join("");
    const inputTokens = res.usage?.inputTokens ?? 0;
    const outputTokens = res.usage?.outputTokens ?? 0;

    const cost = estimateBedrockCostUsd(this.model, { input: inputTokens, output: outputTokens });
    recordAiCost("bedrock", this.model, cost);
    console.log(
      `[ai:usage] bedrock/${this.model} in=${inputTokens}tok out=${outputTokens}tok est=$${cost.toFixed(4)}`
    );

    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens,
      outputTokens,
      cachedTokens: 0
    };
  }
}

// Per-million-token prices ($USD) keyed by Bedrock model id. This is a
// cost-estimate signal, not a ground-truth invoice. Claude Haiku numbers are
// published; Nova numbers are approximate and should be verified in the
// Bedrock console.
const BEDROCK_PRICING: Record<string, { in: number; out: number }> = {
  "anthropic.claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "amazon.nova-micro-v1:0": { in: 0.035, out: 0.14 } /* approx — verify in Bedrock console */,
  "amazon.nova-lite-v1:0": { in: 0.06, out: 0.24 } /* approx — verify in Bedrock console */,
  "amazon.nova-pro-v1:0": { in: 0.8, out: 3.2 } /* approx — verify in Bedrock console */
};

function estimateBedrockCostUsd(model: string, usage: { input: number; output: number }): number {
  const price = BEDROCK_PRICING[model];
  if (!price) return 0;
  return (usage.input * price.in + usage.output * price.out) / 1_000_000;
}
