// API types matching the backend Zod schemas.
// These are the shapes the frontend expects from the backend.

export type ReasoningLens = "coach" | "challenger" | "decision_advisor";

export type ClaimComponentType =
  | "fact"
  | "interpretation"
  | "assumption"
  | "emotion"
  | "hypothesis"
  | "action";

export interface CareerContext {
  currentRole: string;
  yearsExperience: number;
  targetOutcome: string;
  whyNotYet: string;
}

export interface ClaimComponent {
  type: ClaimComponentType;
  text: string;
}

export interface ClaimAnalysis {
  components: ClaimComponent[];
  summary: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  reasoningLens?: ReasoningLens | null;
  claimAnalysis?: ClaimAnalysis | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title?: string | null;
  createdAt: string;
  messages: Message[];
}

export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage: Message;
  claimAnalysis: ClaimAnalysis;
  candidates: PendingCandidate[];
}

// ── Memory candidates (Stage B) ────────────────────────────────────────

export type EntityType = "evidence";
export type SourceType = "user_report" | "imported_document" | "ai_inference" | "observed_outcome";

export interface PendingCandidate {
  id: string;
  entityType: EntityType;
  extractedStatement: string;
  epistemicType: ClaimComponentType;
  sourceType: SourceType;
  reasonToSave: string;
  linkedEntityId?: string;
  sourceMessageId?: string;
  isMock: boolean;
  editedBeforeConfirm: boolean;
  createdAt: string;
}

export interface ConfirmCandidateResponse {
  confirmed: boolean;
  id: string;
  evidenceId?: string | null;
  memoryRecord?: {
    id: string;
    entityType: string;
    extractedStatement: string;
    epistemicType: string;
    sourceType: string;
    editedBeforeConfirm: boolean;
    confirmed: boolean;
  };
}

export interface RejectCandidateResponse {
  rejected: boolean;
  id: string;
}

// ── Evidence (Stage B confirmed) ──────────────────────────────────────

export interface Evidence {
  id: string;
  sourceType: SourceType;
  epistemicType: ClaimComponentType;
  description: string;
  createdAt: string;
}

// ── Career Hypotheses (Stage C) ───────────────────────────────────────

export type ConfidenceCategory = "tentative" | "moderate" | "strong";

export type HypothesisStatus =
  | "active"
  | "tested_supports"
  | "tested_contradicts"
  | "superseded"
  | "confirmed";

export type LinkType = "supports" | "contradicts";

export interface Hypothesis {
  id: string;
  statement: string;
  confidence: ConfidenceCategory;
  status: HypothesisStatus;
  creationRationale: string;
  lastAssessmentRationale: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HypothesisEvidenceLinkItem {
  id: string;
  evidenceId: string;
  linkType: LinkType;
  evidence: {
    id: string;
    description: string;
    sourceType: string;
    epistemicType: string;
  };
}

export interface HypothesisDetail extends Hypothesis {
  links: HypothesisEvidenceLinkItem[];
}

export interface HypothesisAssessment {
  hypothesisId: string;
  confidence: ConfidenceCategory;
  evidence: {
    supporting: number;
    contradicting: number;
    untestedAssumptions: string[];
  };
  rationale: string;
}

// ── Career Experiments (Stage D) ───────────────────────────────────────

export type ExperimentStatus = "proposed" | "active" | "completed" | "abandoned";

export interface Experiment {
  id: string;
  hypothesisId: string;
  description: string;
  supportingSignal: string;
  contradictingSignal: string;
  inconclusiveSignal: string;
  rationale: string;
  reviewDate: string | null;
  status: ExperimentStatus;
  outcome: string | null;
  outcomeRecordedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentProposal {
  hypothesisId: string;
  description: string;
  supportingSignal: string;
  contradictingSignal: string;
  inconclusiveSignal: string;
  reviewDate: string;
  rationale: string;
}
