import type {
  CareerContextData,
  MessageData,
  ConversationData,
  ClaimAnalysis,
  ReasoningLens,
} from "../../ai/types.js";
import type { ConversationRepository } from "./repository.js";

/**
 * In-memory implementation of ConversationRepository.
 * Used when no DATABASE_URL is configured. Data is lost on restart.
 * The interface is identical to the Prisma-backed version, so swapping
 * is a one-line change in the factory.
 */
export class InMemoryConversationRepository
  implements ConversationRepository
{
  private careerContexts = new Map<
    string,
    CareerContextData & { userId: string }
  >();
  private conversations = new Map<
    string,
    ConversationData & { userId: string }
  >();
  private messages: MessageData[] = [];
  private idCounter = 0;

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter.toString(36)}`;
  }

  async getCareerContext(userId: string): Promise<CareerContextData | null> {
    const ctx = this.careerContexts.get(userId);
    if (!ctx) return null;
    const { userId: _, ...data } = ctx;
    void _;
    return data;
  }

  async saveCareerContext(
    userId: string,
    data: CareerContextData,
  ): Promise<CareerContextData> {
    this.careerContexts.set(userId, { ...data, userId });
    return data;
  }

  async createConversation(
    userId: string,
    title?: string,
  ): Promise<ConversationData> {
    const id = this.nextId("conv");
    const conv: ConversationData & { userId: string } = {
      id,
      title,
      createdAt: new Date().toISOString(),
      messages: [],
      userId,
    };
    this.conversations.set(id, conv);
    return conv;
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationData | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv || conv.userId !== userId) return null;
    const msgs = this.messages.filter(
      (m) => m.conversationId === conversationId,
    );
    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      messages: msgs,
    };
  }

  async listConversations(userId: string): Promise<ConversationData[]> {
    const userConvs = [...this.conversations.values()].filter(
      (c) => c.userId === userId,
    );
    return userConvs.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      messages: this.messages.filter((m) => m.conversationId === c.id),
    }));
  }

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    reasoningLens?: ReasoningLens,
    claimAnalysis?: ClaimAnalysis,
  ): Promise<MessageData> {
    const msg: MessageData = {
      id: this.nextId("msg"),
      conversationId,
      role,
      content,
      reasoningLens,
      claimAnalysis,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(msg);
    return msg;
  }

  async listMessages(conversationId: string): Promise<MessageData[]> {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }
}
