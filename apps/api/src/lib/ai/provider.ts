export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResult {
  text: string;
  provider: string;
  model: string;
  /** Billed input tokens for this call (undefined if provider doesn't report it) */
  inputTokens?: number;
  /** Billed output tokens for this call */
  outputTokens?: number;
  /** Input tokens served from prompt cache (Anthropic only) */
  cachedTokens?: number;
}

export interface AICompleteOpts {
  maxTokens?: number;
  /** 0.0 = deterministic, 1.0 = creative. Default depends on provider. */
  temperature?: number;
}

export interface AIProvider {
  readonly name: string;
  complete(messages: AIMessage[], opts?: AICompleteOpts): Promise<AIResult>;
}

export class AIDisabledError extends Error {
  constructor() {
    super("AI features are disabled. Enable them in Admin → AI Settings.");
    this.name = "AIDisabledError";
  }
}

export class AINotConfiguredError extends Error {
  constructor(reason: string) {
    super(`AI provider not configured: ${reason}`);
    this.name = "AINotConfiguredError";
  }
}
