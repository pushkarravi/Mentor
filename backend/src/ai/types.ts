// Core domain types shared across the AI layer and API layer.
// These mirror the Prisma schema enums but are plain TS types so the
// reasoning engine does not depend on Prisma directly.

export type SourceType =
  | "user_report"
  | "imported_document"
  | "ai_inference"
  | "observed_outcome";

export type EpistemicType =
  | "fact"
  | "interpretation"
  | "hypothesis"
  | "emotion"
  | "action";

/**
 * ClaimComponentType — the six epistemic categories used in claim analysis.
 * This is a superset of EpistemicType: it adds "assumption", which is
 * recognized during claim decomposition but is not a persistable
 * epistemic_type for Evidence/Memory records. Assumptions are surfaced
 * to the user as reasoning context but are not stored as standalone
 * evidence.
 */
export type ClaimComponentType =
  | "fact"
  | "interpretation"
  | "assumption"
  | "emotion"
  | "hypothesis"
  | "action";

export type ConfidenceCategory = "tentative" | "moderate" | "strong";

/**
 * Hypothesis status — distinct from confidence. A hypothesis can
 * remain active/testable even when confidence is strong. "confirmed"
 * is reserved for hypotheses that have been supported by observed
 * outcomes AND explicitly closed by the user, not auto-set by high
 * confidence.
 */
export type HypothesisStatus =
  | "active"
  | "tested_supports"
  | "tested_contradicts"
  | "superseded"
  | "confirmed";

/**
 * The direction of an explicit Evidence→Hypothesis link.
 * One Evidence record may support one hypothesis and contradict
 * another — links are per-pair, not per-evidence.
 */
export type LinkType = "supports" | "contradicts";

export type ExperimentStatus = "proposed" | "active" | "completed" | "abandoned";

export type ReasoningLens = "coach" | "challenger" | "decision_advisor";

// ── AI Provider types ──────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  content: string;
  // Structured JSON the model may return alongside prose (e.g. claim analysis)
  structured?: Record<string, unknown>;
}

// ── Claim analysis (output of analyzeClaim) ────────────────────────────

export interface ClaimComponent {
  type: ClaimComponentType;
  text: string;
}

export interface ClaimAnalysis {
  components: ClaimComponent[];
  summary: string;
}

// ── Hypothesis assessment (output of evaluateHypothesis) ───────────────

export interface EvidenceSummary {
  supporting: number;
  contradicting: number;
  /**
   * Transient list of untested assumption strings, recomputed on each
   * evaluation call. Not persisted to the database — only
   * lastAssessmentRationale (the narrative text) is stored. The
   * displayed count is derived from this array's length at call time.
   * An empty list means the heuristic found no plausible untested
   * assumptions given the current evidence, not that assumptions are
   * impossible.
   */
  untestedAssumptions: string[];
}

/**
 * HypothesisAssessment — the output of evaluateHypothesis().
 * Confidence is qualitative (tentative/moderate/strong), never
 * numeric. The rationale is based on the actual linked evidence,
 * not just counts.
 */
export interface HypothesisAssessment {
  hypothesisId: string;
  confidence: ConfidenceCategory;
  evidence: EvidenceSummary;
  rationale: string;
}

// ── Career Hypothesis (Stage C) ──────────────────────────────────────────

/**
 * HypothesisData — a career hypothesis created from confirmed evidence
 * or an explicit user-approved statement. AI-generated hypotheses
 * remain hypotheses, never facts (Invariant #1).
 *
 * status and confidence are separate dimensions: a hypothesis can
 * have strong confidence but remain active/testable.
 *
 * creationRationale is the user's original reason for creating the
 * hypothesis — immutable unless explicitly edited by the user.
 * lastAssessmentRationale is the engine's latest evaluation output,
 * based on linked evidence. These are stored separately so the
 * longitudinal model preserves "why I originally believed this"
 * distinct from "what the evidence currently says."
 */
export interface HypothesisData {
  id: string;
  userId: string;
  statement: string;
  /**
   * Qualitative confidence — tentative/moderate/strong. Never a
   * number or percentage (Invariant #13).
   */
  confidence: ConfidenceCategory;
  status: HypothesisStatus;
  /**
   * The user's original reason for creating this hypothesis.
   * Immutable unless explicitly edited by the user — never
   * overwritten by evaluation.
   */
  creationRationale: string;
  /**
   * The engine's latest assessment rationale, based on linked
   * evidence. Null until the first evaluation runs.
   */
  lastAssessmentRationale: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * HypothesisEvidenceLink — an explicit, user-approved link between
 * an Evidence record and a Hypothesis. One Evidence may support one
 * hypothesis and contradict another. Links are never inferred solely
 * from text similarity.
 */
export interface HypothesisEvidenceLink {
  id: string;
  userId: string;
  hypothesisId: string;
  evidenceId: string;
  linkType: LinkType;
  createdAt: string;
}

// ── Career Experiment (Stage D) ──────────────────────────────────────────

/**
 * ExperimentData — a test designed to gather information about a
 * career hypothesis. Each experiment defines three outcome signals:
 *
 * - supportingSignal: an observable outcome that would strengthen
 *   the hypothesis.
 * - contradictingSignal: an observable outcome that would weaken
 *   the hypothesis.
 * - inconclusiveSignal: circumstances under which the experiment
 *   did not meaningfully test the hypothesis.
 *
 * The goal of an experiment is information, not confirmation.
 * Stage E/F will use these signals to classify recorded outcomes
 * as supports / contradicts / inconclusive.
 *
 * Experiments are explicitly created by the user, not auto-created
 * from AI suggestions. The engine can recommend a proposal, but the
 * user decides whether to create it. The rationale — why the
 * experiment matters and what it tests — is persisted at creation
 * time, whether the experiment was accepted from a proposal or
 * created manually.
 *
 * Outcome recording and hypothesis reassessment are Stage E/F —
 * not implemented here. The `outcome` and `outcomeRecordedAt` fields
 * exist in the type for forward compatibility but remain null in
 * Stage D.
 */
export interface ExperimentData {
  id: string;
  userId: string;
  hypothesisId: string;
  description: string;
  supportingSignal: string;
  contradictingSignal: string;
  inconclusiveSignal: string;
  /** Why the experiment matters and what it tests. Persisted at creation. */
  rationale: string;
  /** ISO date string for when the user should review the outcome. */
  reviewDate: string | null;
  status: ExperimentStatus;
  /** Recorded outcome — populated in Stage E, null in Stage D. */
  outcome: string | null;
  outcomeRecordedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * ExperimentProposal — the output of recommendExperiment().
 * A proposed experiment with a description, three outcome signals
 * (supporting, contradicting, inconclusive), a review date, and a
 * rationale explaining why it matters and what it tests. The user
 * reviews this proposal and decides whether to create the experiment.
 */
export interface ExperimentProposal {
  hypothesisId: string;
  description: string;
  supportingSignal: string;
  contradictingSignal: string;
  inconclusiveSignal: string;
  reviewDate: string;
  rationale: string;
}

// ── Memory candidate (from extraction pipeline) ────────────────────────

/**
 * Stage B restricts candidate entityType to "evidence" only.
 * Hypothesis and person entity types will be added in Stage C / M1
 * when those entity types have real confirmation workflows.
 */
export interface MemoryCandidate {
  entityType: "evidence";
  extractedStatement: string;
  epistemicType: EpistemicType;
  sourceType: SourceType;
  reasonToSave: string;
  linkedEntityId?: string;
}

/**
 * PendingCandidate — a proposed memory/evidence record awaiting user
 * confirmation. Nothing is persisted as durable Evidence/Memory until
 * the user explicitly confirms. Rejected candidates are deleted.
 */
export interface PendingCandidate {
  id: string;
  userId: string;
  entityType: "evidence";
  extractedStatement: string;
  epistemicType: EpistemicType;
  sourceType: SourceType;
  reasonToSave: string;
  linkedEntityId?: string;
  sourceMessageId?: string;
  isMock: boolean;
  editedBeforeConfirm: boolean;
  createdAt: string;
}

/**
 * EvidenceData — the shape of a confirmed Evidence record.
 */
export interface EvidenceData {
  id: string;
  userId: string;
  sourceType: SourceType;
  epistemicType: EpistemicType;
  description: string;
  personId?: string | null;
  occurredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * MemoryRecordData — the shape of a confirmed Memory record.
 * entityType is "evidence" in Stage B; the union broadens in Stage C.
 */
export interface MemoryRecordData {
  id: string;
  userId: string;
  entityType: "evidence";
  entityId?: string | null;
  extractedStatement: string;
  epistemicType: EpistemicType;
  sourceType: SourceType;
  sourceMessageId?: string | null;
  confirmed: boolean;
  editedBeforeConfirm: boolean;
  createdAt: string;
  confirmedAt?: string | null;
}

// ── Career context ─────────────────────────────────────────────────────

export interface CareerContextData {
  currentRole: string;
  yearsExperience: number;
  targetOutcome: string;
  whyNotYet: string;
}

// ── Conversation / Message ─────────────────────────────────────────────

export interface MessageData {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  reasoningLens?: ReasoningLens;
  claimAnalysis?: ClaimAnalysis;
  createdAt: string;
}

export interface ConversationData {
  id: string;
  title?: string;
  createdAt: string;
  messages: MessageData[];
}
