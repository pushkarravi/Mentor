import type { AIProvider } from "./provider.js";
import type {
  ChatMessage,
  ChatResult,
  ToolDefinition,
} from "../types.js";

/**
 * PerplexityProvider — talks to the Perplexity (Sonar) API.
 * Env: AI_PROVIDER=perplexity, PERPLEXITY_API_KEY=<key>
 *
 * Only CareerReasoningEngine ever calls this — never a route handler
 * or UI component.
 */
export class PerplexityProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "sonar-pro") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(input: {
    messages: ChatMessage[];
    system: string;
    tools?: ToolDefinition[];
  }): Promise<ChatResult> {
    const messages = [
      { role: "system" as const, content: input.system },
      ...input.messages,
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools;
    }

    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Perplexity API error (${res.status}): ${errText}`,
      );
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: { content: string };
      }>;
    };

    const content = data.choices[0]?.message?.content ?? "";

    return { content };
  }
}
