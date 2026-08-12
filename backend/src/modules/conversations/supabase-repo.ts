import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  OutcomeClassification,
} from "../../ai/types.js";
import { validateEpistemicPair } from "../../ai/reasoning/engine.js";
import type { ConversationRepository } from "./repository.js";
import { generateId } from "./sql-bridge.js";

/**
 * Supabase-backed implementation of ConversationRepository.
 *
 * Uses the Supabase JS client (PostgREST API) for all database
 * operations. Implements the exact same ConversationRepository
 * interface as InMemoryConversationRepository.
 *
 * All queries are scoped by userId. Three atomic methods
 * (confirmPendingCandidate, recordExperimentOutcomeAtomic,
 * applyExperimentOutcomeReviewAtomic) perform their steps in
 * sequence — PostgREST does not support multi-statement
 * transactions, so atomicity is best-effort. In a future Prisma
 * migration with direct Postgres access, these would use
 * prisma.$transaction for true atomicity.
 */
export class SupabaseConversationRepository
  implements ConversationRepository
{
  private client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  // ── Career context ──────────────────────────────────────────────

  async getCareerContext(userId: string): Promise<CareerContextData | null> {
    const { data, error } = await this.client
      .from("CareerContext")
      .select("currentRole, yearsExperience, targetOutcome, whyNotYet")
      .eq("userId", userId)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return {
      currentRole: data.currentRole,
      yearsExperience: data.yearsExperience,
      targetOutcome: data.targetOutcome,
      whyNotYet: data.whyNotYet,
    };
  }

  async saveCareerContext(
    userId: string,
    data: CareerContextData,
  ): Promise<CareerContextData> {
    // Upsert: if a context exists for this user, update it.
    const existing = await this.client
      .from("CareerContext")
      .select("id")
      .eq("userId", userId)
      .maybeSingle();

    if (existing.data) {
      await this.client
        .from("CareerContext")
        .update({
          currentRole: data.currentRole,
          yearsExperience: data.yearsExperience,
          targetOutcome: data.targetOutcome,
          whyNotYet: data.whyNotYet,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", existing.data.id);
    } else {
      await this.client.from("CareerContext").insert({
        id: generateId("ctx"),
        userId,
        currentRole: data.currentRole,
        yearsExperience: data.yearsExperience,
        targetOutcome: data.targetOutcome,
        whyNotYet: data.whyNotYet,
        whyNotYetEpistemic: "interpretation",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return data;
  }

  // ── Conversations ───────────────────────────────────────────────

  async createConversation(
    userId: string,
    title?: string,
  ): Promise<ConversationData> {
    const id = generateId("conv");
    const { error } = await this.client.from("Conversation").insert({
      id,
      userId,
      title: title ?? null,
      createdAt: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to create conversation: ${error.message}`);
    return {
      id,
      title,
      createdAt: new Date().toISOString(),
      messages: [],
    };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationData | null> {
    const { data, error } = await this.client
      .from("Conversation")
      .select("id, title, createdAt")
      .eq("id", conversationId)
      .eq("userId", userId)
      .maybeSingle();

    if (error || !data) return null;
    const msgs = await this.listMessages(conversationId);
    return {
      id: data.id,
      title: data.title ?? undefined,
      createdAt: this.toIso(data.createdAt),
      messages: msgs,
    };
  }

  async listConversations(userId: string): Promise<ConversationData[]> {
    const { data, error } = await this.client
      .from("Conversation")
      .select("id, title, createdAt")
      .eq("userId", userId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    const result: ConversationData[] = [];
    for (const c of data) {
      const msgs = await this.listMessages(c.id);
      result.push({
        id: c.id,
        title: c.title ?? undefined,
        createdAt: this.toIso(c.createdAt),
        messages: msgs,
      });
    }
    return result;
  }

  // ── Messages ────────────────────────────────────────────────────

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    reasoningLens?: ReasoningLens,
    claimAnalysis?: ClaimAnalysis,
  ): Promise<MessageData> {
    const id = generateId("msg");
    const { error } = await this.client.from("Message").insert({
      id,
      conversationId,
      role,
      content,
      reasoningLens: reasoningLens ?? null,
      claimAnalysis: claimAnalysis ?? null,
      createdAt: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to add message: ${error.message}`);
    return {
      id,
      conversationId,
      role,
      content,
      reasoningLens,
      claimAnalysis,
      createdAt: new Date().toISOString(),
    };
  }

  async listMessages(conversationId: string): Promise<MessageData[]> {
    const { data, error } = await this.client
      .from("Message")
      .select("id, conversationId, role, content, reasoningLens, claimAnalysis, createdAt")
      .eq("conversationId", conversationId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      role: r.role,
      content: r.content,
      reasoningLens: r.reasoningLens ?? undefined,
      claimAnalysis: r.claimAnalysis ?? undefined,
      createdAt: this.toIso(r.createdAt),
    }));
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
    const result: PendingCandidate[] = [];
    for (const c of candidates) {
      const id = generateId("cand");
      const { error } = await this.client.from("PendingCandidate").insert({
        id,
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
        createdAt: new Date().toISOString(),
      });
      if (error) throw new Error(`Failed to add pending candidate: ${error.message}`);
      result.push({
        id,
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
      });
    }
    return result;
  }

  async getPendingCandidate(
    userId: string,
    candidateId: string,
  ): Promise<PendingCandidate | null> {
    const { data, error } = await this.client
      .from("PendingCandidate")
      .select("*")
      .eq("id", candidateId)
      .eq("userId", userId)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapPendingCandidate(data, userId);
  }

  async listPendingCandidates(userId: string): Promise<PendingCandidate[]> {
    const { data, error } = await this.client
      .from("PendingCandidate")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => this.mapPendingCandidate(r, userId));
  }

  async deletePendingCandidate(
    userId: string,
    candidateId: string,
  ): Promise<void> {
    await this.client
      .from("PendingCandidate")
      .delete()
      .eq("id", candidateId)
      .eq("userId", userId);
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

    await this.client
      .from("PendingCandidate")
      .update(update)
      .eq("id", candidateId)
      .eq("userId", userId);

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

    // Create Evidence
    const evidenceId = generateId("ev");
    const now = new Date().toISOString();
    const { error: evError } = await this.client.from("Evidence").insert({
      id: evidenceId,
      userId,
      sourceType: pc.sourceType,
      epistemicType: pc.epistemicType,
      description: pc.extractedStatement,
      personId: null,
      occurredAt: null,
      createdAt: now,
      updatedAt: now,
    });
    if (evError) {
      return { ok: false, reason: `Failed to create evidence: ${evError.message}` };
    }

    // Create Memory audit record
    const memoryId = generateId("mem");
    const { error: memError } = await this.client.from("Memory").insert({
      id: memoryId,
      userId,
      entityType: pc.entityType,
      entityId: evidenceId,
      extractedStatement: pc.extractedStatement,
      epistemicType: pc.epistemicType,
      sourceType: pc.sourceType,
      sourceMessageId: pc.sourceMessageId ?? null,
      confirmed: true,
      editedBeforeConfirm: pc.editedBeforeConfirm,
      confirmedAt: now,
      createdAt: now,
    });
    if (memError) {
      // Best-effort cleanup of orphaned evidence
      await this.client.from("Evidence").delete().eq("id", evidenceId);
      return { ok: false, reason: `Failed to create memory record: ${memError.message}` };
    }

    // Remove the pending candidate
    await this.deletePendingCandidate(userId, candidateId);

    return {
      ok: true,
      evidence: {
        id: evidenceId,
        userId,
        sourceType: pc.sourceType,
        epistemicType: pc.epistemicType,
        description: pc.extractedStatement,
        personId: null,
        occurredAt: null,
        createdAt: now,
        updatedAt: now,
      },
      memoryRecord: {
        id: memoryId,
        userId,
        entityType: pc.entityType,
        entityId: evidenceId,
        extractedStatement: pc.extractedStatement,
        epistemicType: pc.epistemicType,
        sourceType: pc.sourceType,
        sourceMessageId: pc.sourceMessageId ?? null,
        confirmed: true,
        editedBeforeConfirm: pc.editedBeforeConfirm,
        createdAt: now,
        confirmedAt: now,
      },
    };
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
    const id = generateId("ev");
    const now = new Date().toISOString();
    const { error } = await this.client.from("Evidence").insert({
      id,
      userId,
      sourceType: data.sourceType,
      epistemicType: data.epistemicType,
      description: data.description,
      personId: data.personId ?? null,
      occurredAt: null,
      createdAt: now,
      updatedAt: now,
    });
    if (error) throw new Error(`Failed to add evidence: ${error.message}`);
    return {
      id,
      userId,
      sourceType: data.sourceType,
      epistemicType: data.epistemicType,
      description: data.description,
      personId: data.personId ?? null,
      occurredAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listEvidence(userId: string): Promise<EvidenceData[]> {
    const { data, error } = await this.client
      .from("Evidence")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => this.mapEvidence(r));
  }

  async getEvidence(
    userId: string,
    evidenceId: string,
  ): Promise<EvidenceData | null> {
    const { data, error } = await this.client
      .from("Evidence")
      .select("*")
      .eq("id", evidenceId)
      .eq("userId", userId)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapEvidence(data);
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
    const id = generateId("mem");
    const now = new Date().toISOString();
    const { error } = await this.client.from("Memory").insert({
      id,
      userId,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      extractedStatement: data.extractedStatement,
      epistemicType: data.epistemicType,
      sourceType: data.sourceType,
      sourceMessageId: data.sourceMessageId ?? null,
      confirmed: true,
      editedBeforeConfirm: data.editedBeforeConfirm,
      confirmedAt: now,
      createdAt: now,
    });
    if (error) throw new Error(`Failed to add memory record: ${error.message}`);
    return {
      id,
      userId,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      extractedStatement: data.extractedStatement,
      epistemicType: data.epistemicType,
      sourceType: data.sourceType,
      sourceMessageId: data.sourceMessageId ?? null,
      confirmed: true,
      editedBeforeConfirm: data.editedBeforeConfirm,
      createdAt: now,
      confirmedAt: now,
    };
  }

  async listMemoryRecords(userId: string): Promise<MemoryRecordData[]> {
    const { data, error } = await this.client
      .from("Memory")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      userId: r.userId,
      entityType: r.entityType as "evidence",
      entityId: r.entityId,
      extractedStatement: r.extractedStatement,
      epistemicType: r.epistemicType as EpistemicType,
      sourceType: r.sourceType as SourceType,
      sourceMessageId: r.sourceMessageId,
      confirmed: r.confirmed,
      editedBeforeConfirm: r.editedBeforeConfirm,
      createdAt: this.toIso(r.createdAt),
      confirmedAt: r.confirmedAt ? this.toIso(r.confirmedAt) : null,
    }));
  }

  // ── Career Hypotheses ───────────────────────────────────────────

  async createHypothesis(
    userId: string,
    data: {
      statement: string;
      creationRationale: string;
    },
  ): Promise<HypothesisData> {
    const id = generateId("hyp");
    const now = new Date().toISOString();
    const { error } = await this.client.from("CareerHypothesis").insert({
      id,
      userId,
      statement: data.statement,
      confidence: "tentative",
      status: "active",
      creationRationale: data.creationRationale,
      lastAssessmentRationale: null,
      createdAt: now,
      updatedAt: now,
    });
    if (error) throw new Error(`Failed to create hypothesis: ${error.message}`);
    return {
      id,
      userId,
      statement: data.statement,
      confidence: "tentative",
      status: "active",
      creationRationale: data.creationRationale,
      lastAssessmentRationale: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<HypothesisData | null> {
    const { data, error } = await this.client
      .from("CareerHypothesis")
      .select("*")
      .eq("id", hypothesisId)
      .eq("userId", userId)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapHypothesis(data);
  }

  async listHypotheses(userId: string): Promise<HypothesisData[]> {
    const { data, error } = await this.client
      .from("CareerHypothesis")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => this.mapHypothesis(r));
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
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (data.confidence !== undefined) update.confidence = data.confidence;
    if (data.status !== undefined) update.status = data.status;
    if (data.lastAssessmentRationale !== undefined) {
      update.lastAssessmentRationale = data.lastAssessmentRationale;
    }

    await this.client
      .from("CareerHypothesis")
      .update(update)
      .eq("id", hypothesisId)
      .eq("userId", userId);

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
    // Check for existing link (upsert behavior matching in-memory)
    const { data: existing } = await this.client
      .from("HypothesisEvidence")
      .select("*")
      .eq("hypothesisId", data.hypothesisId)
      .eq("evidenceId", data.evidenceId)
      .eq("userId", userId)
      .maybeSingle();

    if (existing) {
      await this.client
        .from("HypothesisEvidence")
        .update({ linkType: data.linkType })
        .eq("id", existing.id);
      return {
        id: existing.id,
        userId,
        hypothesisId: data.hypothesisId,
        evidenceId: data.evidenceId,
        linkType: data.linkType,
        createdAt: this.toIso(existing.createdAt),
      };
    }

    const id = generateId("link");
    const { error } = await this.client.from("HypothesisEvidence").insert({
      id,
      userId,
      hypothesisId: data.hypothesisId,
      evidenceId: data.evidenceId,
      linkType: data.linkType,
      createdAt: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to create evidence link: ${error.message}`);
    return {
      id,
      userId,
      hypothesisId: data.hypothesisId,
      evidenceId: data.evidenceId,
      linkType: data.linkType,
      createdAt: new Date().toISOString(),
    };
  }

  async getHypothesisEvidenceLinks(
    userId: string,
    hypothesisId: string,
  ): Promise<Array<{ link: HypothesisEvidenceLink; evidence: EvidenceData }>> {
    const { data, error } = await this.client
      .from("HypothesisEvidence")
      .select(`
        id, userId, hypothesisId, evidenceId, linkType, createdAt,
        Evidence!inner (id, userId, sourceType, epistemicType, description, personId, occurredAt, createdAt, updatedAt)
      `)
      .eq("hypothesisId", hypothesisId)
      .eq("userId", userId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => {
      const ev = (r as Record<string, unknown>).Evidence as Record<string, unknown>;
      return {
        link: {
          id: r.id as string,
          userId: r.userId as string,
          hypothesisId: r.hypothesisId as string,
          evidenceId: r.evidenceId as string,
          linkType: r.linkType as LinkType,
          createdAt: this.toIso(r.createdAt),
        },
        evidence: this.mapEvidence(ev),
      };
    });
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
    const id = generateId("exp");
    const now = new Date().toISOString();
    const { error } = await this.client.from("CareerExperiment").insert({
      id,
      userId,
      hypothesisId: data.hypothesisId,
      description: data.description,
      supportingSignal: data.supportingSignal,
      contradictingSignal: data.contradictingSignal,
      inconclusiveSignal: data.inconclusiveSignal,
      rationale: data.rationale,
      reviewDate: data.reviewDate ?? null,
      status: "proposed",
      outcome: null,
      outcomeClassification: null,
      outcomeEvidenceId: null,
      outcomeRecordedAt: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    if (error) throw new Error(`Failed to create experiment: ${error.message}`);
    return {
      id,
      userId,
      hypothesisId: data.hypothesisId,
      description: data.description,
      supportingSignal: data.supportingSignal,
      contradictingSignal: data.contradictingSignal,
      inconclusiveSignal: data.inconclusiveSignal,
      rationale: data.rationale,
      reviewDate: data.reviewDate ?? null,
      status: "proposed",
      outcome: null,
      outcomeClassification: null,
      outcomeEvidenceId: null,
      outcomeRecordedAt: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getExperiment(
    userId: string,
    experimentId: string,
  ): Promise<ExperimentData | null> {
    const { data, error } = await this.client
      .from("CareerExperiment")
      .select("*")
      .eq("id", experimentId)
      .eq("userId", userId)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapExperiment(data);
  }

  async listExperiments(userId: string): Promise<ExperimentData[]> {
    const { data, error } = await this.client
      .from("CareerExperiment")
      .select("*")
      .eq("userId", userId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => this.mapExperiment(r));
  }

  async listExperimentsByHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<ExperimentData[]> {
    const { data, error } = await this.client
      .from("CareerExperiment")
      .select("*")
      .eq("userId", userId)
      .eq("hypothesisId", hypothesisId)
      .order("createdAt", { ascending: true });

    if (error || !data) return [];
    return data.map((r) => this.mapExperiment(r));
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
    const exp = await this.getExperiment(userId, experimentId);
    if (!exp || exp.outcome !== null) return null;

    let evidence: EvidenceData | null = null;

    if (
      (data.outcomeClassification === "supports" ||
        data.outcomeClassification === "contradicts") &&
      data.observedFact
    ) {
      evidence = await this.addEvidence(userId, {
        sourceType: "observed_outcome",
        epistemicType: "fact",
        description: data.observedFact,
      });
    }

    const { error } = await this.client
      .from("CareerExperiment")
      .update({
        outcome: data.outcome,
        outcomeClassification: data.outcomeClassification,
        outcomeEvidenceId: evidence?.id ?? null,
        outcomeRecordedAt: new Date().toISOString(),
        status: "completed",
        updatedAt: new Date().toISOString(),
      })
      .eq("id", experimentId)
      .eq("userId", userId);

    if (error) {
      // Best-effort cleanup of orphaned evidence
      if (evidence) {
        await this.client.from("Evidence").delete().eq("id", evidence.id);
      }
      return null;
    }

    const updated = await this.getExperiment(userId, experimentId);
    if (!updated) return null;
    return { experiment: updated, evidence };
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
    const exp = await this.getExperiment(userId, experimentId);
    if (!exp || exp.outcome === null || exp.reviewedAt !== null) return null;

    const hypothesisId = exp.hypothesisId;
    const hyp = await this.getHypothesis(userId, hypothesisId);
    if (!hyp) return null;

    const classification = exp.outcomeClassification;

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
      const outcomeEvidence = await this.getEvidence(userId, evidenceId);
      if (!outcomeEvidence) return null;
      if (
        outcomeEvidence.sourceType !== "observed_outcome" ||
        outcomeEvidence.epistemicType !== "fact"
      ) {
        return null;
      }
    }

    let link: HypothesisEvidenceLink | null = null;
    if (linkType !== null && evidenceId !== null) {
      link = await this.addHypothesisEvidenceLink(userId, {
        hypothesisId,
        evidenceId,
        linkType,
      });
    }

    // Update hypothesis — creationRationale is NEVER overwritten
    await this.client
      .from("CareerHypothesis")
      .update({
        confidence: data.newConfidence,
        lastAssessmentRationale: data.newAssessmentRationale,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", hypothesisId)
      .eq("userId", userId);

    // Mark experiment as reviewed
    await this.client
      .from("CareerExperiment")
      .update({
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq("id", experimentId)
      .eq("userId", userId);

    const updatedExp = await this.getExperiment(userId, experimentId);
    const updatedHyp = await this.getHypothesis(userId, hypothesisId);
    if (!updatedExp || !updatedHyp) return null;

    return { experiment: updatedExp, hypothesis: updatedHyp, link };
  }

  // ── Mapping helpers ─────────────────────────────────────────────

  private toIso(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }

  private mapPendingCandidate(
    r: Record<string, unknown>,
    userId: string,
  ): PendingCandidate {
    return {
      id: r.id as string,
      userId,
      entityType: r.entityType as "evidence",
      extractedStatement: r.extractedStatement as string,
      epistemicType: r.epistemicType as EpistemicType,
      sourceType: r.sourceType as SourceType,
      reasonToSave: r.reasonToSave as string,
      linkedEntityId: (r.linkedEntityId as string) ?? undefined,
      sourceMessageId: (r.sourceMessageId as string) ?? undefined,
      isMock: r.isMock as boolean,
      editedBeforeConfirm: r.editedBeforeConfirm as boolean,
      createdAt: this.toIso(r.createdAt),
    };
  }

  private mapEvidence(r: Record<string, unknown>): EvidenceData {
    return {
      id: r.id as string,
      userId: r.userId as string,
      sourceType: r.sourceType as SourceType,
      epistemicType: r.epistemicType as EpistemicType,
      description: r.description as string,
      personId: (r.personId as string) ?? null,
      occurredAt: r.occurredAt ? this.toIso(r.occurredAt) : null,
      createdAt: this.toIso(r.createdAt),
      updatedAt: this.toIso(r.updatedAt),
    };
  }

  private mapHypothesis(r: Record<string, unknown>): HypothesisData {
    return {
      id: r.id as string,
      userId: r.userId as string,
      statement: r.statement as string,
      confidence: r.confidence as ConfidenceCategory,
      status: r.status as HypothesisStatus,
      creationRationale: r.creationRationale as string,
      lastAssessmentRationale: (r.lastAssessmentRationale as string) ?? null,
      createdAt: this.toIso(r.createdAt),
      updatedAt: this.toIso(r.updatedAt),
    };
  }

  private mapExperiment(r: Record<string, unknown>): ExperimentData {
    return {
      id: r.id as string,
      userId: r.userId as string,
      hypothesisId: r.hypothesisId as string,
      description: r.description as string,
      supportingSignal: r.supportingSignal as string,
      contradictingSignal: r.contradictingSignal as string,
      inconclusiveSignal: r.inconclusiveSignal as string,
      rationale: r.rationale as string,
      reviewDate: r.reviewDate ? this.toIso(r.reviewDate) : null,
      status: r.status as ExperimentData["status"],
      outcome: (r.outcome as string) ?? null,
      outcomeClassification: (r.outcomeClassification as OutcomeClassification) ?? null,
      outcomeEvidenceId: (r.outcomeEvidenceId as string) ?? null,
      outcomeRecordedAt: r.outcomeRecordedAt ? this.toIso(r.outcomeRecordedAt) : null,
      reviewedAt: r.reviewedAt ? this.toIso(r.reviewedAt) : null,
      createdAt: this.toIso(r.createdAt),
      updatedAt: this.toIso(r.updatedAt),
    };
  }
}
