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
  HypothesisData,
  HypothesisEvidenceLink,
  ConfidenceCategory,
  HypothesisStatus,
  LinkType,
  ExperimentData,
} from "../../ai/types.js";
import { validateEpistemicPair } from "../../ai/reasoning/engine.js";
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

  // ── Pending candidates ───────────────────────────────────────────

  private pendingCandidates: PendingCandidate[] = [];

  async addPendingCandidates(
    userId: string,
    candidates: Array<{
      entityType: "evidence";
      extractedStatement: string;
      epistemicType: EpistemicType;
      sourceType: SourceType;
      reasonToSave: string;
      linkedEntityId?: string;
      sourceMessageId?: string;
      isMock: boolean;
    }>,
  ): Promise<PendingCandidate[]> {
    const result: PendingCandidate[] = [];
    for (const c of candidates) {
      const pc: PendingCandidate = {
        id: this.nextId("cand"),
        userId,
        entityType: c.entityType,
        extractedStatement: c.extractedStatement,
        epistemicType: c.epistemicType,
        sourceType: c.sourceType,
        reasonToSave: c.reasonToSave,
        linkedEntityId: c.linkedEntityId,
        sourceMessageId: c.sourceMessageId,
        isMock: c.isMock,
        editedBeforeConfirm: false,
        createdAt: new Date().toISOString(),
      };
      this.pendingCandidates.push(pc);
      result.push(pc);
    }
    return result;
  }

  async getPendingCandidate(
    userId: string,
    candidateId: string,
  ): Promise<PendingCandidate | null> {
    const pc = this.pendingCandidates.find(
      (c) => c.id === candidateId && c.userId === userId,
    );
    return pc ?? null;
  }

  async listPendingCandidates(userId: string): Promise<PendingCandidate[]> {
    return this.pendingCandidates.filter((c) => c.userId === userId);
  }

  async deletePendingCandidate(
    userId: string,
    candidateId: string,
  ): Promise<void> {
    this.pendingCandidates = this.pendingCandidates.filter(
      (c) => !(c.id === candidateId && c.userId === userId),
    );
  }

  async updatePendingCandidate(
    userId: string,
    candidateId: string,
    edits: {
      extractedStatement?: string;
      epistemicType?: EpistemicType;
    },
  ): Promise<PendingCandidate | null> {
    const pc = this.pendingCandidates.find(
      (c) => c.id === candidateId && c.userId === userId,
    );
    if (!pc) return null;

    let edited = false;
    if (edits.extractedStatement !== undefined && edits.extractedStatement !== pc.extractedStatement) {
      pc.extractedStatement = edits.extractedStatement;
      edited = true;
    }
    if (edits.epistemicType !== undefined && edits.epistemicType !== pc.epistemicType) {
      pc.epistemicType = edits.epistemicType;
      edited = true;
    }
    if (edited) {
      pc.editedBeforeConfirm = true;
    }
    return pc;
  }

  /**
   * Atomic confirm: validate → create Evidence → create Memory →
   * remove pending candidate. One logical operation.
   */
  async confirmPendingCandidate(
    userId: string,
    candidateId: string,
    edits?: {
      extractedStatement?: string;
      epistemicType?: EpistemicType;
    },
  ): Promise<
    | { ok: true; evidence: EvidenceData; memoryRecord: MemoryRecordData }
    | { ok: false; reason: string }
  > {
    const pc = this.pendingCandidates.find(
      (c) => c.id === candidateId && c.userId === userId,
    );
    if (!pc) {
      return { ok: false, reason: "Candidate not found" };
    }

    // Reject mock candidates at the persistence boundary.
    if (pc.isMock) {
      return {
        ok: false,
        reason: "Mock candidates cannot be confirmed as real career evidence.",
      };
    }

    // Apply edits if provided.
    let final = pc;
    if (edits) {
      const updated = await this.updatePendingCandidate(userId, candidateId, edits);
      if (!updated) {
        return { ok: false, reason: "Candidate not found after edit" };
      }
      final = updated;
    }

    // Persistence-boundary epistemic enforcement.
    const check = validateEpistemicPair(final.sourceType, final.epistemicType);
    if (!check.valid) {
      return { ok: false, reason: check.reason ?? "Epistemic validation failed" };
    }

    // Create Evidence.
    const evidence = await this.addEvidence(userId, {
      sourceType: final.sourceType,
      epistemicType: final.epistemicType,
      description: final.extractedStatement,
    });

    // Create Memory audit record.
    const memoryRecord = await this.addMemoryRecord(userId, {
      entityType: final.entityType,
      entityId: evidence.id,
      extractedStatement: final.extractedStatement,
      epistemicType: final.epistemicType,
      sourceType: final.sourceType,
      sourceMessageId: final.sourceMessageId ?? null,
      editedBeforeConfirm: final.editedBeforeConfirm,
    });

    // Remove the pending candidate.
    await this.deletePendingCandidate(userId, candidateId);

    return { ok: true, evidence, memoryRecord };
  }

  // ── Confirmed evidence ───────────────────────────────────────────

  private evidence: EvidenceData[] = [];

  async addEvidence(
    userId: string,
    data: {
      sourceType: SourceType;
      epistemicType: EpistemicType;
      description: string;
      personId?: string | null;
    },
  ): Promise<EvidenceData> {
    const ev: EvidenceData = {
      id: this.nextId("ev"),
      userId,
      sourceType: data.sourceType,
      epistemicType: data.epistemicType,
      description: data.description,
      personId: data.personId ?? null,
      occurredAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.evidence.push(ev);
    return ev;
  }

  async listEvidence(userId: string): Promise<EvidenceData[]> {
    return this.evidence.filter((e) => e.userId === userId);
  }

  async getEvidence(
    userId: string,
    evidenceId: string,
  ): Promise<EvidenceData | null> {
    const ev = this.evidence.find(
      (e) => e.id === evidenceId && e.userId === userId,
    );
    return ev ?? null;
  }

  // ── Confirmed memory records ─────────────────────────────────────

  private memoryRecords: MemoryRecordData[] = [];

  async addMemoryRecord(
    userId: string,
    data: {
      entityType: "evidence";
      entityId?: string | null;
      extractedStatement: string;
      epistemicType: EpistemicType;
      sourceType: SourceType;
      sourceMessageId?: string | null;
      editedBeforeConfirm: boolean;
    },
  ): Promise<MemoryRecordData> {
    const mr: MemoryRecordData = {
      id: this.nextId("mem"),
      userId,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      extractedStatement: data.extractedStatement,
      epistemicType: data.epistemicType,
      sourceType: data.sourceType,
      sourceMessageId: data.sourceMessageId ?? null,
      confirmed: true,
      editedBeforeConfirm: data.editedBeforeConfirm,
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };
    this.memoryRecords.push(mr);
    return mr;
  }

  async listMemoryRecords(userId: string): Promise<MemoryRecordData[]> {
    return this.memoryRecords.filter((m) => m.userId === userId);
  }

  // ── Career Hypotheses (Stage C) ───────────────────────────────────

  private hypotheses: HypothesisData[] = [];
  private hypothesisLinks: HypothesisEvidenceLink[] = [];

  async createHypothesis(
    userId: string,
    data: {
      statement: string;
      creationRationale: string;
    },
  ): Promise<HypothesisData> {
    const now = new Date().toISOString();
    const hyp: HypothesisData = {
      id: this.nextId("hyp"),
      userId,
      statement: data.statement,
      confidence: "tentative",
      status: "active",
      creationRationale: data.creationRationale,
      lastAssessmentRationale: null,
      createdAt: now,
      updatedAt: now,
    };
    this.hypotheses.push(hyp);
    return hyp;
  }

  async getHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<HypothesisData | null> {
    const hyp = this.hypotheses.find(
      (h) => h.id === hypothesisId && h.userId === userId,
    );
    return hyp ?? null;
  }

  async listHypotheses(userId: string): Promise<HypothesisData[]> {
    return this.hypotheses.filter((h) => h.userId === userId);
  }

  async updateHypothesis(
    userId: string,
    hypothesisId: string,
    data: {
      confidence?: ConfidenceCategory;
      status?: HypothesisStatus;
      lastAssessmentRationale?: string;
    },
  ): Promise<HypothesisData | null> {
    const hyp = this.hypotheses.find(
      (h) => h.id === hypothesisId && h.userId === userId,
    );
    if (!hyp) return null;
    if (data.confidence !== undefined) hyp.confidence = data.confidence;
    if (data.status !== undefined) hyp.status = data.status;
    if (data.lastAssessmentRationale !== undefined)
      hyp.lastAssessmentRationale = data.lastAssessmentRationale;
    hyp.updatedAt = new Date().toISOString();
    return hyp;
  }

  async addHypothesisEvidenceLink(
    userId: string,
    data: {
      hypothesisId: string;
      evidenceId: string;
      linkType: LinkType;
    },
  ): Promise<HypothesisEvidenceLink> {
    // Prevent duplicate links for the same evidence+hypothesis pair.
    const existing = this.hypothesisLinks.find(
      (l) =>
        l.userId === userId &&
        l.hypothesisId === data.hypothesisId &&
        l.evidenceId === data.evidenceId,
    );
    if (existing) {
      // Update the link type if it changed.
      existing.linkType = data.linkType;
      return existing;
    }

    const link: HypothesisEvidenceLink = {
      id: this.nextId("link"),
      userId,
      hypothesisId: data.hypothesisId,
      evidenceId: data.evidenceId,
      linkType: data.linkType,
      createdAt: new Date().toISOString(),
    };
    this.hypothesisLinks.push(link);
    return link;
  }

  async getHypothesisEvidenceLinks(
    userId: string,
    hypothesisId: string,
  ): Promise<Array<{
    link: HypothesisEvidenceLink;
    evidence: EvidenceData;
  }>> {
    const links = this.hypothesisLinks.filter(
      (l) => l.userId === userId && l.hypothesisId === hypothesisId,
    );
    return links.map((link) => {
      const evidence = this.evidence.find((e) => e.id === link.evidenceId)!;
      return { link, evidence };
    });
  }

  // ── Career Experiments (Stage D) ───────────────────────────────────

  private experiments: ExperimentData[] = [];

  async createExperiment(
    userId: string,
    data: {
      hypothesisId: string;
      description: string;
      successSignal: string;
      reviewDate?: string | null;
    },
  ): Promise<ExperimentData> {
    const now = new Date().toISOString();
    const exp: ExperimentData = {
      id: this.nextId("exp"),
      userId,
      hypothesisId: data.hypothesisId,
      description: data.description,
      successSignal: data.successSignal,
      reviewDate: data.reviewDate ?? null,
      status: "proposed",
      outcome: null,
      outcomeRecordedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.experiments.push(exp);
    return exp;
  }

  async getExperiment(
    userId: string,
    experimentId: string,
  ): Promise<ExperimentData | null> {
    const exp = this.experiments.find(
      (e) => e.id === experimentId && e.userId === userId,
    );
    return exp ?? null;
  }

  async listExperiments(userId: string): Promise<ExperimentData[]> {
    return this.experiments.filter((e) => e.userId === userId);
  }

  async listExperimentsByHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<ExperimentData[]> {
    return this.experiments.filter(
      (e) => e.userId === userId && e.hypothesisId === hypothesisId,
    );
  }
}
