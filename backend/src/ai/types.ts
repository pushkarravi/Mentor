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
  type: EpistemicType;
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

export interface MemoryCandidate {
  entityType: "evidence" | "hypothesis" | "person";
  extractedStatement: string;
  epistemicType: EpistemicType;
  sourceType: SourceType;
  reasonToSave: string;
  linkedEntityId?: string;
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
