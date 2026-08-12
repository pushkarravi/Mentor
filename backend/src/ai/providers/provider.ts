import type {
  ChatMessage,
  ChatResult,
  ToolDefinition,
} from "../types.js";

/**
 * AIProvider answers "how do I talk to a model?"
 * Nothing about career reasoning belongs here.
 * Only CareerReasoningEngine (and its supporting modules) ever calls this.
 */
export interface AIProvider {
  chat(input: {
    messages: ChatMessage[];
    system: string;
    tools?: ToolDefinition[];
  }): Promise<ChatResult>;
}
