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
  untestedAssumptions: number;
}

export interface HypothesisAssessment {
  hypothesisId: string;
  confidence: ConfidenceCategory;
  evidence: EvidenceSummary;
  rationale: string;
}

// ── Experiment proposal (output of recommendExperiment) ────────────────

export interface ExperimentProposal {
  hypothesisId: string;
  description: string;
  successSignal: string;
  reviewDate: string; // ISO date
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
