import OpenAI from "openai";
import { AICompleteOpts, AIMessage, AIProvider, AIResult } from "../provider.js";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
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

    if (usage) {
      console.log(
        `[ai:usage] openai/${this.model} in=${usage.prompt_tokens}tok out=${usage.completion_tokens}tok`
      );
    }

    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens
    };
  }
}
