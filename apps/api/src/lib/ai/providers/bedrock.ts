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

    // Amazon Nova 2 models run reasoning by DEFAULT. Every call this app makes is
    // short structured output with a small maxTokens budget (blurbs ~80, chat
    // ~256, the admin test just 10) — with reasoning on, the model spends that
    // budget thinking and the answer comes back empty/truncated. Turn it off for
    // Nova so the budget goes to the actual response. Claude has no such field.
    const isNova = this.model.toLowerCase().includes("nova");

    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.model,
        system: systemText ? [{ text: systemText }] : undefined,
        messages: chatMessages,
        inferenceConfig: {
          maxTokens: opts?.maxTokens ?? 1024,
          ...(typeof opts?.temperature === "number" ? { temperature: opts.temperature } : {})
        },
        ...(isNova ? { additionalModelRequestFields: { reasoningConfig: { type: "disabled" } } } : {})
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

// Per-million-token prices ($USD) for the cost-estimate signal (not a
// ground-truth invoice). Matched by model FAMILY substring so it works for the
// real ids — bare (anthropic.claude-haiku-4-5), dated, and cross-region
// inference-profile forms (e.g. global.anthropic.claude-haiku-4-5-20251001-v1:0,
// global.amazon.nova-2-lite-v1:0). Claude Haiku numbers are published; Nova
// numbers are approximate — verify in the Bedrock console.
function estimateBedrockCostUsd(model: string, usage: { input: number; output: number }): number {
  const m = model.toLowerCase();
  let price: { in: number; out: number } | null = null;
  if (m.includes("claude-haiku")) price = { in: 1.0, out: 5.0 };
  else if (m.includes("nova-micro")) price = { in: 0.035, out: 0.14 } /* approx */;
  else if (m.includes("nova-lite")) price = { in: 0.06, out: 0.24 } /* approx; covers nova-2-lite */;
  else if (m.includes("nova-pro")) price = { in: 0.8, out: 3.2 } /* approx */;
  if (!price) return 0;
  return (usage.input * price.in + usage.output * price.out) / 1_000_000;
}
