import { PrismaClient } from "@prisma/client";
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
  HypothesisStatus,
  ConfidenceCategory,
  LinkType,
  ExperimentData,
  OutcomeClassification,
} from "../../ai/types.js";
import { validateEpistemicPair } from "../../ai/reasoning/engine.js";
import type { ConversationRepository } from "./repository.js";

/**
 * Prisma-backed implementation of ConversationRepository.
 *
 * Uses @prisma/client with prisma.$transaction for the three
 * integrity-critical atomic operations:
 *   - confirmPendingCandidate
 *   - recordExperimentOutcomeAtomic
 *   - applyExperimentOutcomeReviewAtomic
 *
 * All queries are scoped by userId. HypothesisEvidence does not
 * have its own userId column — ownership is derived through the
 * Hypothesis/Evidence relations. The userId on the returned
 * HypothesisEvidenceLink is populated from the linked Hypothesis.
 */
export class PrismaConversationRepository
  implements ConversationRepository
{
  private prisma: PrismaClient;

  constructor(databaseUrl?: string) {
    this.prisma = new PrismaClient(
      databaseUrl
        ? { datasources: { db: { url: databaseUrl } } }
        : undefined,
    );
  }

  // ── Career context ──────────────────────────────────────────────

  async getCareerContext(userId: string): Promise<CareerContextData | null> {
    const ctx = await this.prisma.careerContext.findFirst({
      where: { userId },
    });
    if (!ctx) return null;
    return {
      currentRole: ctx.currentRole,
      yearsExperience: ctx.yearsExperience,
      targetOutcome: ctx.targetOutcome,
      whyNotYet: ctx.whyNotYet,
    };
  }

  async saveCareerContext(
    userId: string,
    data: CareerContextData,
  ): Promise<CareerContextData> {
    const existing = await this.prisma.careerContext.findFirst({
      where: { userId },
    });
    if (existing) {
      await this.prisma.careerContext.update({
        where: { id: existing.id },
        data: {
          currentRole: data.currentRole,
          yearsExperience: data.yearsExperience,
          targetOutcome: data.targetOutcome,
          whyNotYet: data.whyNotYet,
        },
      });
    } else {
      await this.prisma.careerContext.create({
        data: {
          userId,
          currentRole: data.currentRole,
          yearsExperience: data.yearsExperience,
          targetOutcome: data.targetOutcome,
          whyNotYet: data.whyNotYet,
        },
      });
    }
    return data;
  }

  // ── Conversations ───────────────────────────────────────────────

  async createConversation(
    userId: string,
    title?: string,
  ): Promise<ConversationData> {
    const conv = await this.prisma.conversation.create({
      data: { userId, title: title ?? null },
    });
    return {
      id: conv.id,
      title: conv.title ?? undefined,
      createdAt: conv.createdAt.toISOString(),
      messages: [],
    };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationData | null> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conv) return null;
    return {
      id: conv.id,
      title: conv.title ?? undefined,
      createdAt: conv.createdAt.toISOString(),
      messages: conv.messages.map((m) => this.mapMessage(m)),
    };
  }

  async listConversations(userId: string): Promise<ConversationData[]> {
    const convs = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    return convs.map((c) => ({
      id: c.id,
      title: c.title ?? undefined,
      createdAt: c.createdAt.toISOString(),
      messages: c.messages.map((m) => this.mapMessage(m)),
    }));
  }

  // ── Messages ────────────────────────────────────────────────────

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    reasoningLens?: ReasoningLens,
    claimAnalysis?: ClaimAnalysis,
  ): Promise<MessageData> {
    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        reasoningLens: reasoningLens ?? null,
        // Prisma's Json field type doesn't accept typed objects without index signatures
        claimAnalysis: (claimAnalysis ?? undefined) as never,
      },
    });
    return this.mapMessage(msg);
  }

  async listMessages(conversationId: string): Promise<MessageData[]> {
    const msgs = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    return msgs.map((m) => this.mapMessage(m));
  }

  // ── Pending candidates ──────────────────────────────────────────

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
    await this.prisma.pendingCandidate.createMany({
      data: candidates.map((c) => ({
        userId,
        entityType: c.entityType,
        extractedStatement: c.extractedStatement,
        epistemicType: c.epistemicType,
        sourceType: c.sourceType,
        reasonToSave: c.reasonToSave,
        linkedEntityId: c.linkedEntityId ?? null,
        sourceMessageId: c.sourceMessageId ?? null,
        isMock: c.isMock,
        editedBeforeConfirm: false,
      })),
    });
    // Fetch all pending candidates for this user to get the inserted rows
    const all = await this.prisma.pendingCandidate.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    // Return only the most recently created ones matching the count
    return all.slice(-candidates.length).map((r) =>
      this.mapPendingCandidate(r, userId),
    );
  }

  async getPendingCandidate(
    userId: string,
    candidateId: string,
  ): Promise<PendingCandidate | null> {
    const pc = await this.prisma.pendingCandidate.findFirst({
      where: { id: candidateId, userId },
    });
    if (!pc) return null;
    return this.mapPendingCandidate(pc, userId);
  }

  async listPendingCandidates(userId: string): Promise<PendingCandidate[]> {
    const list = await this.prisma.pendingCandidate.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((r) => this.mapPendingCandidate(r, userId));
  }

  async deletePendingCandidate(
    userId: string,
    candidateId: string,
  ): Promise<void> {
    await this.prisma.pendingCandidate.deleteMany({
      where: { id: candidateId, userId },
    });
  }

  async updatePendingCandidate(
    userId: string,
    candidateId: string,
    edits: {
      extractedStatement?: string;
      epistemicType?: EpistemicType;
    },
  ): Promise<PendingCandidate | null> {
    const update: Record<string, unknown> = { editedBeforeConfirm: true };
    if (edits.extractedStatement !== undefined) {
      update.extractedStatement = edits.extractedStatement;
    }
    if (edits.epistemicType !== undefined) {
      update.epistemicType = edits.epistemicType;
    }
    await this.prisma.pendingCandidate.updateMany({
      where: { id: candidateId, userId },
      data: update,
    });
    return this.getPendingCandidate(userId, candidateId);
  }

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
    // Fetch the candidate (with any edits applied)
    let pc = await this.getPendingCandidate(userId, candidateId);
    if (!pc) {
      return { ok: false, reason: "Candidate not found" };
    }
    if (pc.isMock) {
      return {
        ok: false,
        reason: "Mock candidates cannot be confirmed as real career evidence.",
      };
    }

    if (edits) {
      const updated = await this.updatePendingCandidate(userId, candidateId, edits);
      if (!updated) {
        return { ok: false, reason: "Candidate not found after edit" };
      }
      pc = updated;
    }

    const check = validateEpistemicPair(pc.sourceType, pc.epistemicType);
    if (!check.valid) {
      return { ok: false, reason: check.reason ?? "Epistemic validation failed" };
    }

    // Atomic: create Evidence + Memory + delete candidate in one transaction
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const evidence = await tx.evidence.create({
          data: {
            userId,
            sourceType: pc.sourceType,
            epistemicType: pc.epistemicType,
            description: pc.extractedStatement,
          },
        });

        const memory = await tx.memory.create({
          data: {
            userId,
            entityType: pc.entityType,
            entityId: evidence.id,
            extractedStatement: pc.extractedStatement,
            epistemicType: pc.epistemicType,
            sourceType: pc.sourceType,
            sourceMessageId: pc.sourceMessageId ?? null,
            confirmed: true,
            editedBeforeConfirm: pc.editedBeforeConfirm,
            confirmedAt: new Date(),
          },
        });

        await tx.pendingCandidate.deleteMany({
          where: { id: candidateId, userId },
        });

        return { evidence, memory };
      });

      return {
        ok: true,
        evidence: this.mapEvidence(result.evidence),
        memoryRecord: this.mapMemory(result.memory),
      };
    } catch (e) {
      return {
        ok: false,
        reason: `Transaction failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // ── Confirmed evidence ──────────────────────────────────────────

  async addEvidence(
    userId: string,
    data: {
      sourceType: SourceType;
      epistemicType: EpistemicType;
      description: string;
      personId?: string | null;
    },
  ): Promise<EvidenceData> {
    const ev = await this.prisma.evidence.create({
      data: {
        userId,
        sourceType: data.sourceType,
        epistemicType: data.epistemicType,
        description: data.description,
        personId: data.personId ?? null,
      },
    });
    return this.mapEvidence(ev);
  }

  async listEvidence(userId: string): Promise<EvidenceData[]> {
    const list = await this.prisma.evidence.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((r) => this.mapEvidence(r));
  }

  async getEvidence(
    userId: string,
    evidenceId: string,
  ): Promise<EvidenceData | null> {
    const ev = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, userId },
    });
    if (!ev) return null;
    return this.mapEvidence(ev);
  }

  // ── Confirmed memory records ────────────────────────────────────

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
    const mem = await this.prisma.memory.create({
      data: {
        userId,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        extractedStatement: data.extractedStatement,
        epistemicType: data.epistemicType,
        sourceType: data.sourceType,
        sourceMessageId: data.sourceMessageId ?? null,
        confirmed: true,
        editedBeforeConfirm: data.editedBeforeConfirm,
        confirmedAt: new Date(),
      },
    });
    return this.mapMemory(mem);
  }

  async listMemoryRecords(userId: string): Promise<MemoryRecordData[]> {
    const list = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((r) => this.mapMemory(r));
  }

  // ── Career Hypotheses ───────────────────────────────────────────

  async createHypothesis(
    userId: string,
    data: {
      statement: string;
      creationRationale: string;
    },
  ): Promise<HypothesisData> {
    const hyp = await this.prisma.careerHypothesis.create({
      data: {
        userId,
        statement: data.statement,
        creationRationale: data.creationRationale,
      },
    });
    return this.mapHypothesis(hyp);
  }

  async getHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<HypothesisData | null> {
    const hyp = await this.prisma.careerHypothesis.findFirst({
      where: { id: hypothesisId, userId },
    });
    if (!hyp) return null;
    return this.mapHypothesis(hyp);
  }

  async listHypotheses(userId: string): Promise<HypothesisData[]> {
    const list = await this.prisma.careerHypothesis.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((r) => this.mapHypothesis(r));
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
    const update: Record<string, unknown> = {};
    if (data.confidence !== undefined) update.confidence = data.confidence;
    if (data.status !== undefined) update.status = data.status;
    if (data.lastAssessmentRationale !== undefined) {
      update.lastAssessmentRationale = data.lastAssessmentRationale;
    }
    if (Object.keys(update).length === 0) {
      return this.getHypothesis(userId, hypothesisId);
    }
    await this.prisma.careerHypothesis.updateMany({
      where: { id: hypothesisId, userId },
      data: update,
    });
    return this.getHypothesis(userId, hypothesisId);
  }

  async addHypothesisEvidenceLink(
    userId: string,
    data: {
      hypothesisId: string;
      evidenceId: string;
      linkType: LinkType;
    },
  ): Promise<HypothesisEvidenceLink> {
    // Both sides of a cross-entity relationship must belong to the
    // supplied user. HypothesisEvidence deliberately has no userId
    // column, so ownership is enforced through its parent records.
    const [hypothesis, evidence] = await Promise.all([
      this.prisma.careerHypothesis.findFirst({
        where: { id: data.hypothesisId, userId },
      }),
      this.prisma.evidence.findFirst({
        where: { id: data.evidenceId, userId },
      }),
    ]);

    if (!hypothesis) {
      throw new Error("Hypothesis not found for this user");
    }
    if (!evidence) {
      throw new Error("Evidence not found for this user");
    }

    // Upsert: if the pair already exists, update the linkType
    const existing = await this.prisma.hypothesisEvidence.findUnique({
      where: {
        hypothesisId_evidenceId: {
          hypothesisId: data.hypothesisId,
          evidenceId: data.evidenceId,
        },
      },
    });

    if (existing) {
      const updated = await this.prisma.hypothesisEvidence.update({
        where: { id: existing.id },
        data: { linkType: data.linkType },
      });
      return {
        id: updated.id,
        userId,
        hypothesisId: updated.hypothesisId,
        evidenceId: updated.evidenceId,
        linkType: updated.linkType,
        createdAt: updated.createdAt.toISOString(),
      };
    }

    const link = await this.prisma.hypothesisEvidence.create({
      data: {
        hypothesisId: data.hypothesisId,
        evidenceId: data.evidenceId,
        linkType: data.linkType,
      },
    });
    return {
      id: link.id,
      userId,
      hypothesisId: link.hypothesisId,
      evidenceId: link.evidenceId,
      linkType: link.linkType,
      createdAt: link.createdAt.toISOString(),
    };
  }

  async getHypothesisEvidenceLinks(
    userId: string,
    hypothesisId: string,
  ): Promise<Array<{ link: HypothesisEvidenceLink; evidence: EvidenceData }>> {
    // Query through the hypothesis to enforce ownership
    const links = await this.prisma.hypothesisEvidence.findMany({
      where: {
        hypothesisId,
        hypothesis: { userId },
        // Defensive ownership filter: corrupted cross-user links must
        // never be surfaced as legitimate evidence for this hypothesis.
        evidence: { userId },
      },
      include: {
        evidence: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return links.map((r) => ({
      link: {
        id: r.id,
        userId,
        hypothesisId: r.hypothesisId,
        evidenceId: r.evidenceId,
        linkType: r.linkType,
        createdAt: r.createdAt.toISOString(),
      },
      evidence: this.mapEvidence(r.evidence),
    }));
  }

  // ── Career Experiments ──────────────────────────────────────────

  async createExperiment(
    userId: string,
    data: {
      hypothesisId: string;
      description: string;
      supportingSignal: string;
      contradictingSignal: string;
      inconclusiveSignal: string;
      rationale: string;
      reviewDate?: string | null;
    },
  ): Promise<ExperimentData> {
    // A caller must not create an experiment for another user's
    // hypothesis merely by knowing its ID.
    const hypothesis = await this.prisma.careerHypothesis.findFirst({
      where: { id: data.hypothesisId, userId },
    });
    if (!hypothesis) {
      throw new Error("Hypothesis not found for this user");
    }

    const exp = await this.prisma.careerExperiment.create({
      data: {
        userId,
        hypothesisId: data.hypothesisId,
        description: data.description,
        supportingSignal: data.supportingSignal,
        contradictingSignal: data.contradictingSignal,
        inconclusiveSignal: data.inconclusiveSignal,
        rationale: data.rationale,
        reviewDate: data.reviewDate ? new Date(data.reviewDate) : null,
      },
    });
    return this.mapExperiment(exp);
  }

  async getExperiment(
    userId: string,
    experimentId: string,
  ): Promise<ExperimentData | null> {
    const exp = await this.prisma.careerExperiment.findFirst({
      where: { id: experimentId, userId },
    });
    if (!exp) return null;
    return this.mapExperiment(exp);
  }

  async listExperiments(userId: string): Promise<ExperimentData[]> {
    const list = await this.prisma.careerExperiment.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((r) => this.mapExperiment(r));
  }

  async listExperimentsByHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<ExperimentData[]> {
    const list = await this.prisma.careerExperiment.findMany({
      where: { userId, hypothesisId },
      orderBy: { createdAt: "asc" },
    });
    return list.map((r) => this.mapExperiment(r));
  }

  async recordExperimentOutcomeAtomic(
    userId: string,
    experimentId: string,
    data: {
      outcome: string;
      outcomeClassification: OutcomeClassification;
      observedFact: string | null;
    },
  ): Promise<{ experiment: ExperimentData; evidence: EvidenceData | null } | null> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Validate: experiment exists, has no outcome, belongs to user
        const exp = await tx.careerExperiment.findFirst({
          where: { id: experimentId, userId },
        });
        if (!exp || exp.outcome !== null) return null;

        let evidenceId: string | null = null;

        // For supports/contradicts, create observed_outcome Evidence
        if (
          (data.outcomeClassification === "supports" ||
            data.outcomeClassification === "contradicts") &&
          data.observedFact
        ) {
          const ev = await tx.evidence.create({
            data: {
              userId,
              sourceType: "observed_outcome",
              epistemicType: "fact",
              description: data.observedFact,
            },
          });
          evidenceId = ev.id;
        }

        // Update the experiment
        const updated = await tx.careerExperiment.update({
          where: { id: experimentId },
          data: {
            outcome: data.outcome,
            outcomeClassification: data.outcomeClassification,
            outcomeEvidenceId: evidenceId,
            outcomeRecordedAt: new Date(),
            status: "completed",
          },
        });

        // Fetch the evidence if created
        let evidence: EvidenceData | null = null;
        if (evidenceId) {
          const ev = await tx.evidence.findUnique({
            where: { id: evidenceId },
          });
          if (ev) evidence = this.mapEvidence(ev);
        }

        return {
          experiment: this.mapExperiment(updated),
          evidence,
        };
      });

      return result;
    } catch {
      return null;
    }
  }

  async applyExperimentOutcomeReviewAtomic(
    userId: string,
    experimentId: string,
    data: {
      newConfidence: ConfidenceCategory;
      newAssessmentRationale: string;
    },
  ): Promise<{
    experiment: ExperimentData;
    hypothesis: HypothesisData;
    link: HypothesisEvidenceLink | null;
  } | null> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch experiment — must have outcome, must not be reviewed
        const exp = await tx.careerExperiment.findFirst({
          where: { id: experimentId, userId },
        });
        if (!exp || exp.outcome === null || exp.reviewedAt !== null) return null;

        // Derive hypothesisId from the stored experiment
        const hypothesisId = exp.hypothesisId;

        const hyp = await tx.careerHypothesis.findFirst({
          where: { id: hypothesisId, userId },
        });
        if (!hyp) return null;

        const classification = exp.outcomeClassification;

        // Derive linkType and evidenceId from the experiment's classification
        let linkType: "supports" | "contradicts" | null = null;
        let evidenceId: string | null = null;

        if (classification === "supports") {
          linkType = "supports";
          evidenceId = exp.outcomeEvidenceId;
        } else if (classification === "contradicts") {
          linkType = "contradicts";
          evidenceId = exp.outcomeEvidenceId;
        }

        // Corrupted-state validation
        if (linkType !== null) {
          if (evidenceId === null) return null;
          const outcomeEvidence = await tx.evidence.findFirst({
            where: { id: evidenceId, userId },
          });
          if (!outcomeEvidence) return null;
          if (
            outcomeEvidence.sourceType !== "observed_outcome" ||
            outcomeEvidence.epistemicType !== "fact"
          ) {
            return null;
          }
        }

        // Create the Evidence→Hypothesis link if applicable
        let link: HypothesisEvidenceLink | null = null;
        if (linkType !== null && evidenceId !== null) {
          // Upsert: if pair exists, update linkType
          const existing = await tx.hypothesisEvidence.findUnique({
            where: {
              hypothesisId_evidenceId: { hypothesisId, evidenceId },
            },
          });
          if (existing) {
            const updated = await tx.hypothesisEvidence.update({
              where: { id: existing.id },
              data: { linkType },
            });
            link = {
              id: updated.id,
              userId,
              hypothesisId: updated.hypothesisId,
              evidenceId: updated.evidenceId,
              linkType: updated.linkType,
              createdAt: updated.createdAt.toISOString(),
            };
          } else {
            const created = await tx.hypothesisEvidence.create({
              data: { hypothesisId, evidenceId, linkType },
            });
            link = {
              id: created.id,
              userId,
              hypothesisId: created.hypothesisId,
              evidenceId: created.evidenceId,
              linkType: created.linkType,
              createdAt: created.createdAt.toISOString(),
            };
          }
        }

        // Update hypothesis — creationRationale is NEVER overwritten
        const updatedHyp = await tx.careerHypothesis.update({
          where: { id: hypothesisId },
          data: {
            confidence: data.newConfidence,
            lastAssessmentRationale: data.newAssessmentRationale,
          },
        });

        // Mark the experiment as reviewed
        const updatedExp = await tx.careerExperiment.update({
          where: { id: experimentId },
          data: { reviewedAt: new Date() },
        });

        return {
          experiment: this.mapExperiment(updatedExp),
          hypothesis: this.mapHypothesis(updatedHyp),
          link,
        };
      });

      return result;
    } catch {
      return null;
    }
  }

  // ── Mapping helpers ─────────────────────────────────────────────

  private mapMessage(m: {
    id: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    reasoningLens: ReasoningLens | null;
    claimAnalysis: unknown;
    createdAt: Date;
  }): MessageData {
    return {
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      reasoningLens: m.reasoningLens ?? undefined,
      claimAnalysis: (m.claimAnalysis as ClaimAnalysis) ?? undefined,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private mapPendingCandidate(
    r: {
      id: string;
      entityType: string;
      extractedStatement: string;
      epistemicType: EpistemicType;
      sourceType: SourceType;
      reasonToSave: string;
      linkedEntityId: string | null;
      sourceMessageId: string | null;
      isMock: boolean;
      editedBeforeConfirm: boolean;
      createdAt: Date;
    },
    userId: string,
  ): PendingCandidate {
    return {
      id: r.id,
      userId,
      entityType: r.entityType as "evidence",
      extractedStatement: r.extractedStatement,
      epistemicType: r.epistemicType,
      sourceType: r.sourceType,
      reasonToSave: r.reasonToSave,
      linkedEntityId: r.linkedEntityId ?? undefined,
      sourceMessageId: r.sourceMessageId ?? undefined,
      isMock: r.isMock,
      editedBeforeConfirm: r.editedBeforeConfirm,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private mapEvidence(r: {
    id: string;
    userId: string;
    sourceType: SourceType;
    epistemicType: EpistemicType;
    description: string;
    personId: string | null;
    occurredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): EvidenceData {
    return {
      id: r.id,
      userId: r.userId,
      sourceType: r.sourceType,
      epistemicType: r.epistemicType,
      description: r.description,
      personId: r.personId,
      occurredAt: r.occurredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private mapMemory(r: {
    id: string;
    userId: string;
    entityType: string;
    entityId: string | null;
    extractedStatement: string;
    epistemicType: EpistemicType;
    sourceType: SourceType;
    sourceMessageId: string | null;
    confirmed: boolean;
    editedBeforeConfirm: boolean;
    createdAt: Date;
    confirmedAt: Date | null;
  }): MemoryRecordData {
    return {
      id: r.id,
      userId: r.userId,
      entityType: r.entityType as "evidence",
      entityId: r.entityId,
      extractedStatement: r.extractedStatement,
      epistemicType: r.epistemicType,
      sourceType: r.sourceType,
      sourceMessageId: r.sourceMessageId,
      confirmed: r.confirmed,
      editedBeforeConfirm: r.editedBeforeConfirm,
      createdAt: r.createdAt.toISOString(),
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
    };
  }

  private mapHypothesis(r: {
    id: string;
    userId: string;
    statement: string;
    confidence: ConfidenceCategory;
    status: HypothesisStatus;
    creationRationale: string;
    lastAssessmentRationale: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): HypothesisData {
    return {
      id: r.id,
      userId: r.userId,
      statement: r.statement,
      confidence: r.confidence,
      status: r.status,
      creationRationale: r.creationRationale,
      lastAssessmentRationale: r.lastAssessmentRationale,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private mapExperiment(r: {
    id: string;
    userId: string;
    hypothesisId: string;
    description: string;
    supportingSignal: string;
    contradictingSignal: string;
    inconclusiveSignal: string;
    rationale: string;
    reviewDate: Date | null;
    status: string;
    outcome: string | null;
    outcomeClassification: OutcomeClassification | null;
    outcomeEvidenceId: string | null;
    outcomeRecordedAt: Date | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ExperimentData {
    return {
      id: r.id,
      userId: r.userId,
      hypothesisId: r.hypothesisId,
      description: r.description,
      supportingSignal: r.supportingSignal,
      contradictingSignal: r.contradictingSignal,
      inconclusiveSignal: r.inconclusiveSignal,
      rationale: r.rationale,
      reviewDate: r.reviewDate?.toISOString() ?? null,
      status: r.status as ExperimentData["status"],
      outcome: r.outcome,
      outcomeClassification: r.outcomeClassification,
      outcomeEvidenceId: r.outcomeEvidenceId,
      outcomeRecordedAt: r.outcomeRecordedAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
