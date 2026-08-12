import type { AIProvider } from "./provider.js";
import { MockProvider } from "./mock.js";
import { PerplexityProvider } from "./perplexity.js";

/**
 * Factory: selects an AIProvider based on the AI_PROVIDER env var.
 * Adding a provider = implementing the AIProvider interface + registering
 * it here. Nothing else in the app imports provider SDKs directly.
 */
export function createProvider(
  env: { AI_PROVIDER?: string; PERPLEXITY_API_KEY?: string },
): AIProvider {
  const providerName = env.AI_PROVIDER ?? "mock";

  switch (providerName) {
    case "perplexity": {
      const key = env.PERPLEXITY_API_KEY;
      if (!key) {
        console.warn(
          "AI_PROVIDER=perplexity but no PERPLEXITY_API_KEY set — falling back to MockProvider.",
        );
        return new MockProvider();
      }
      return new PerplexityProvider(key);
    }

    case "mock":
      return new MockProvider();

    default:
      console.warn(
        `Unknown AI_PROVIDER "${providerName}" — falling back to MockProvider.`,
      );
      return new MockProvider();
  }
}
