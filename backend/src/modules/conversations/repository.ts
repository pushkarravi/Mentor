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
      entityType: "evidence";
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

  /**
   * Edits a pending candidate before confirmation. sourceType is
   * intentionally not editable — it represents provenance.
   */
  updatePendingCandidate(
    userId: string,
    candidateId: string,
    edits: {
      extractedStatement?: string;
      epistemicType?: EpistemicType;
    },
  ): Promise<PendingCandidate | null>;

  /**
   * Atomic confirmation: validates epistemic pair, creates Evidence,
   * creates Memory audit record, removes pending candidate — all as
   * one logical operation. The Prisma-backed implementation must use
   * a database transaction.
   *
   * Returns the created Evidence + Memory, or an error result if
   * validation fails.
   */
  confirmPendingCandidate(
    userId: string,
    candidateId: string,
    edits?: {
      extractedStatement?: string;
      epistemicType?: EpistemicType;
    },
  ): Promise<
    | { ok: true; evidence: EvidenceData; memoryRecord: MemoryRecordData }
    | { ok: false; reason: string }
  >;

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
  getEvidence(userId: string, evidenceId: string): Promise<EvidenceData | null>;

  // Confirmed memory records
  addMemoryRecord(
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
  ): Promise<MemoryRecordData>;
  listMemoryRecords(userId: string): Promise<MemoryRecordData[]>;

  // ── Career Hypotheses (Stage C) ───────────────────────────────────

  /**
   * Creates a hypothesis. The caller provides the statement and
   * rationale — this is an explicit user-approved action, not a
   * silent side effect of AI suggestion.
   *
   * Initial confidence is always "tentative" and status is "active".
   * These change only through evaluation and explicit user action.
   */
  createHypothesis(
    userId: string,
    data: {
      statement: string;
      creationRationale: string;
    },
  ): Promise<HypothesisData>;

  getHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<HypothesisData | null>;

  listHypotheses(userId: string): Promise<HypothesisData[]>;

  updateHypothesis(
    userId: string,
    hypothesisId: string,
    data: {
      confidence?: ConfidenceCategory;
      status?: HypothesisStatus;
      lastAssessmentRationale?: string;
    },
  ): Promise<HypothesisData | null>;

  /**
   * Creates an explicit link between an Evidence record and a
   * Hypothesis. One Evidence may support one hypothesis and
n   * contradict another — links are per-pair.
   */
  addHypothesisEvidenceLink(
    userId: string,
    data: {
      hypothesisId: string;
      evidenceId: string;
      linkType: LinkType;
    },
  ): Promise<HypothesisEvidenceLink>;

  /**
   * Retrieves all evidence links for a hypothesis, with the full
   * Evidence record for each link. Used by evaluateHypothesis() to
   * reason over actual evidence, not stored counts.
   */
  getHypothesisEvidenceLinks(
    userId: string,
    hypothesisId: string,
  ): Promise<Array<{
    link: HypothesisEvidenceLink;
    evidence: EvidenceData;
  }>>;

  // ── Career Experiments (Stage D) ───────────────────────────────────

  /**
   * Creates an experiment tied to a hypothesis. The caller provides
   * the description, success signal, and optional review date — this
   * is an explicit user-approved action, not a silent side effect of
   * AI recommendation.
   *
   * Initial status is "proposed". Outcome fields remain null —
   * outcome recording is Stage E.
   */
  createExperiment(
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
  ): Promise<ExperimentData>;

  getExperiment(
    userId: string,
    experimentId: string,
  ): Promise<ExperimentData | null>;

  listExperiments(userId: string): Promise<ExperimentData[]>;

  listExperimentsByHypothesis(
    userId: string,
    hypothesisId: string,
  ): Promise<ExperimentData[]>;

  /**
   * Atomically records an outcome on an experiment. This is the
   * single persistence boundary for Stage E — the engine must not
   * orchestrate separate addEvidence + update calls that could
   * leave orphaned Evidence if the experiment update fails.
   *
   * For supports/contradicts:
   *   validate experiment has no outcome → create observed_outcome
   *   Evidence (from observedFact) → update experiment with raw
   *   outcome/classification/evidenceId → commit.
   *
   * For inconclusive:
   *   validate experiment has no outcome → update experiment only
   *   → commit. No Evidence is created.
   *
   * A future Prisma implementation MUST perform this using
   * $transaction. The in-memory implementation performs the steps
   * synchronously (no partial failure possible).
   *
   * Returns the updated experiment and the created Evidence (or
   * null for inconclusive), or null if the experiment was not found
   * or already has a recorded outcome.
   */
  recordExperimentOutcomeAtomic(
    userId: string,
    experimentId: string,
    data: {
      outcome: string;
      outcomeClassification: OutcomeClassification;
      observedFact: string | null;
    },
  ): Promise<{
    experiment: ExperimentData;
    evidence: EvidenceData | null;
  } | null>;

  /**
   * Atomically applies the Stage F review: creates the
   * Evidence→Hypothesis link (if applicable), updates the hypothesis
   * confidence + assessment rationale, and marks the experiment as
   * reviewed. Single persistence boundary — no partial state.
   *
   * ALL relationship-sensitive values are derived from the stored
   * Experiment itself — the caller cannot supply hypothesisId,
   * evidenceId, or linkType. This prevents the caller from linking
   * the outcome Evidence to the wrong hypothesis or creating a link
   * whose direction contradicts the experiment's classification.
   *
   * Internal validation (within the transaction boundary):
   * - hypothesisId is always experiment.hypothesisId
   * - For supports: evidenceId is experiment.outcomeEvidenceId,
   *   linkType is "supports"
   * - For contradicts: evidenceId is experiment.outcomeEvidenceId,
   *   linkType is "contradicts"
   * - For inconclusive: evidenceId is null, linkType is null, no
   *   link is created, no hypothesis update is persisted
   * - The outcome Evidence (if linked) must be sourceType
   *   "observed_outcome" and epistemicType "fact" — otherwise the
   *   transaction is rejected as corrupted state
   *
   * Returns null if the experiment is not found, has no recorded
   * outcome, or has already been reviewed (idempotency guard).
   *
   * A future Prisma implementation MUST use $transaction.
   */
  applyExperimentOutcomeReviewAtomic(
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
  } | null>;
}
