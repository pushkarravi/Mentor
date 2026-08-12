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

export type EntityType = "evidence" | "hypothesis" | "person";
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
