import { GoogleGenAI } from "@google/genai";
import { resolveGatewayConfig } from "../gateway.js";
import { AICompleteOpts, AIMessage, AIProvider, AIResult } from "../provider.js";
import { recordAiCost } from "../usageTally.js";

// Published per-million-token prices ($USD). Implicit cache is 25% discount.
const GEMINI_PRICING: Record<string, { in: number; out: number }> = {
  "gemini-2.5-flash":      { in: 0.30, out: 2.50 },
  "gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
  "gemini-2.5-pro":        { in: 1.25, out: 10.00 }
};

function estimateGeminiCostUsd(
  model: string,
  usage: { input: number; output: number; cached: number }
): number {
  const price = GEMINI_PRICING[model];
  if (!price) return 0;
  const billedInput = (usage.input - usage.cached) * price.in;
  const cachedInput = usage.cached * price.in * 0.25;
  const output = usage.output * price.out;
  return (billedInput + cachedInput + output) / 1_000_000;
}

// Gemini 2.5 models support implicit caching automatically when the prompt
// prefix exceeds the minimum size (1024 tok for Flash, 2048 tok for Pro).
// Cache hits are reported on usageMetadata.cachedContentTokenCount.

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    const gateway = resolveGatewayConfig("google-ai-studio");
    // @google/genai routes through the gateway via httpOptions.baseUrl.
    // The gateway slug is google-ai-studio; the SDK appends /v1/models/… itself.
    // Headers (cf-aig-authorization) go in httpOptions.headers.
    this.client = new GoogleGenAI({
      apiKey,
      ...(gateway
        ? {
            httpOptions: {
              baseUrl: gateway.baseURL,
              ...(Object.keys(gateway.headers).length > 0
                ? { headers: gateway.headers }
                : {})
            }
          }
        : {})
    });
    this.model = model;
  }

  async complete(messages: AIMessage[], opts?: AICompleteOpts): Promise<AIResult> {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const contents = chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        ...(systemMessage ? { systemInstruction: systemMessage.content } : {}),
        maxOutputTokens: opts?.maxTokens ?? 1024,
        ...(typeof opts?.temperature === "number" ? { temperature: opts.temperature } : {})
      }
    });

    const text = response.text ?? "";
    const usage = response.usageMetadata;
    const cachedTokens = usage?.cachedContentTokenCount ?? 0;
    const inputTokens = usage?.promptTokenCount;
    const outputTokens = usage?.candidatesTokenCount;

    if (usage) {
      const cost = estimateGeminiCostUsd(this.model, {
        input: inputTokens ?? 0,
        output: outputTokens ?? 0,
        cached: cachedTokens
      });
      recordAiCost("gemini", this.model, cost);
      console.log(
        `[ai:usage] gemini/${this.model} in=${inputTokens}tok out=${outputTokens}tok cache_hit=${cachedTokens}tok est=$${cost.toFixed(4)}`
      );
    }

    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens,
      outputTokens,
      cachedTokens
    };
  }
}
