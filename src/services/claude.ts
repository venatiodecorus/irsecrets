export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeResponse {
  id: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeServiceOptions {
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 1024;

export class ClaudeService {
  private systemPrompt: string | undefined;
  private model: string;
  private maxTokens: number;

  constructor(options?: ClaudeServiceOptions) {
    this.model = options?.model ?? DEFAULT_MODEL;
    this.maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  clearSystemPrompt(): void {
    this.systemPrompt = undefined;
  }

  async sendMessage(messages: ClaudeMessage[]): Promise<string> {
    const response = await this.sendMessageRaw(messages);
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock?.text ?? "";
  }

  async sendMessageRaw(messages: ClaudeMessage[]): Promise<ClaudeResponse> {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: this.systemPrompt,
        messages,
        model: this.model,
        maxTokens: this.maxTokens,
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error ?? `Claude API request failed: ${res.status}`);
    }

    return res.json();
  }
}
