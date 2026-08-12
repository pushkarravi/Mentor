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
}
