import type {
  CareerContextData,
  MessageData,
  ConversationData,
  ClaimAnalysis,
  ReasoningLens,
  EvidenceData,
  MemoryRecordData,
  PendingCandidate,
  SourceType,
  EpistemicType,
} from "../../ai/types.js";

/**
 * Repository interface for career context, conversations, messages,
 * evidence, memory, and pending candidates.
 * The in-memory implementation lets Stage A/B work without a Postgres
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

  // Pending candidates (proposed but not yet confirmed/rejected)
  addPendingCandidates(
    userId: string,
    candidates: Array<{
      entityType: "evidence" | "hypothesis" | "person";
      extractedStatement: string;
      epistemicType: EpistemicType;
      sourceType: SourceType;
      reasonToSave: string;
      linkedEntityId?: string;
      sourceMessageId?: string;
      isMock: boolean;
    }>,
  ): Promise<PendingCandidate[]>;
  getPendingCandidate(
    userId: string,
    candidateId: string,
  ): Promise<PendingCandidate | null>;
  listPendingCandidates(userId: string): Promise<PendingCandidate[]>;
  deletePendingCandidate(userId: string, candidateId: string): Promise<void>;
  updatePendingCandidate(
    userId: string,
    candidateId: string,
    edits: {
      extractedStatement?: string;
      epistemicType?: EpistemicType;
      sourceType?: SourceType;
    },
  ): Promise<PendingCandidate | null>;

  // Confirmed evidence
  addEvidence(
    userId: string,
    data: {
      sourceType: SourceType;
      epistemicType: EpistemicType;
      description: string;
      personId?: string | null;
    },
  ): Promise<EvidenceData>;
  listEvidence(userId: string): Promise<EvidenceData[]>;

  // Confirmed memory records
  addMemoryRecord(
    userId: string,
    data: {
      entityType: string;
      entityId?: string | null;
      extractedStatement: string;
      epistemicType: EpistemicType;
      sourceType: SourceType;
      sourceMessageId?: string | null;
      editedBeforeConfirm: boolean;
    },
  ): Promise<MemoryRecordData>;
  listMemoryRecords(userId: string): Promise<MemoryRecordData[]>;
}
