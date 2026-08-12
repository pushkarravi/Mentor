import type {
  CareerContextData,
  MessageData,
  ConversationData,
  ClaimAnalysis,
  ReasoningLens,
} from "../../ai/types.js";

/**
 * Repository interface for career context, conversations, and messages.
 * The in-memory implementation lets Stage A work without a Postgres
 * instance. When DATABASE_URL is available, a Prisma-backed implementation
 * replaces this with the same interface.
 */
export interface ConversationRepository {
  // Career context
  getCareerContext(userId: string): Promise<CareerContextData | null>;
  saveCareerContext(
    userId: string,
    data: CareerContextData,
  ): Promise<CareerContextData>;

  // Conversations
  createConversation(userId: string, title?: string): Promise<ConversationData>;
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationData | null>;
  listConversations(userId: string): Promise<ConversationData[]>;

  // Messages
  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    reasoningLens?: ReasoningLens,
    claimAnalysis?: ClaimAnalysis,
  ): Promise<MessageData>;
  listMessages(conversationId: string): Promise<MessageData[]>;
}
