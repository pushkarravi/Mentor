import type {
  ChatMessage,
  ChatResult,
  ToolDefinition,
} from "../types.js";

/**
 * ProviderMetadata describes behavioral capabilities of an AIProvider.
 * The reasoning engine uses this to make decisions about fallback
 * behavior without knowing the concrete provider class.
 */
export interface ProviderMetadata {
  /**
   * Whether this provider produces synthetic/placeholder output rather
   * than genuine model reasoning. The engine uses this to decide
   * whether to generate mock candidates for plumbing tests. A synthetic
   * provider returning unparseable output is expected; a real provider
   * returning unparseable output is a failure that should not be
   * masked with mock data.
   */
  isSynthetic: boolean;
}

/**
 * AIProvider answers "how do I talk to a model?"
 * Nothing about career reasoning belongs here.
 * Only CareerReasoningEngine (and its supporting modules) ever calls this.
 */
export interface AIProvider {
  /** Behavioral metadata — accessed via property, not instanceof. */
  readonly metadata: ProviderMetadata;

  chat(input: {
    messages: ChatMessage[];
    system: string;
    tools?: ToolDefinition[];
  }): Promise<ChatResult>;
}
