import type { AIProvider } from "./provider.js";
import type { ChatResult } from "../types.js";

/**
 * MockProvider returns structured placeholder responses for testing
 * application structure and end-to-end data flow.
 *
 * It CANNOT validate coaching quality. Golden Career Scenarios must
 * only be evaluated against a real AIProvider (e.g. PerplexityProvider).
 */
export class MockProvider implements AIProvider {
  async chat(input: {
    messages: { role: string; content: string }[];
    system: string;
  }): Promise<ChatResult> {
    const lastUserMessage = [...input.messages]
      .reverse()
      .find((m) => m.role === "user");

    const userText = lastUserMessage?.content ?? "";

    // Produce a placeholder claim analysis — structurally correct,
    // but not genuine reasoning. Includes "assumption" to exercise
    // the full six-category ClaimComponentType.
    const claimAnalysis = {
      components: [
        {
          type: "fact" as const,
          text: `[Mock] Observed situation extracted from: "${userText.slice(0, 80)}"`,
        },
        {
          type: "interpretation" as const,
          text: "[Mock] The user's reading of why this is happening.",
        },
        {
          type: "assumption" as const,
          text: "[Mock] An unstated belief the user is operating under.",
        },
        {
          type: "emotion" as const,
          text: "[Mock] Frustration or uncertainty about the situation.",
        },
        {
          type: "hypothesis" as const,
          text: "[Mock] A testable hypothesis about the underlying cause.",
        },
      ],
      summary:
        "[MockProvider] This is a placeholder response for testing data flow. Connect a real AI provider to evaluate reasoning quality.",
    };

    const content =
      "[Mock Provider]\n\nThis is a placeholder response for testing the application structure. " +
      "The claim analysis has been generated structurally, but no genuine reasoning has occurred.\n\n" +
      "To use real AI reasoning, set AI_PROVIDER=perplexity and provide PERPLEXITY_API_KEY in your .env file.";

    return { content, structured: claimAnalysis };
  }
}
