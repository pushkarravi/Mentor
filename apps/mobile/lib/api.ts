import type {
  CareerContext,
  Conversation,
  ReasoningLens,
  SendMessageResponse,
  PendingCandidate,
  ConfirmCandidateResponse,
  RejectCandidateResponse,
  Evidence,
  Hypothesis,
  HypothesisDetail,
  HypothesisAssessment,
  LinkType,
  Experiment,
  ExperimentProposal,
  OutcomeClassification,
  ExperimentOutcomeResult,
  ExperimentReviewResult,
} from "./types";

const API_BASE =
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL) ||
  "http://localhost:3001";

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // ── Career context ────────────────────────────────────────────────

  getContext: () => request<CareerContext | null>("/api/context"),

  saveContext: (data: CareerContext) =>
    request<CareerContext>("/api/context", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ── Conversations ──────────────────────────────────────────────────

  createConversation: (title?: string) =>
    request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

  listConversations: () =>
    request<Conversation[]>("/api/conversations"),

  getConversation: (id: string) =>
    request<Conversation>(`/api/conversations/${id}`),

  // ── Messages ───────────────────────────────────────────────────────

  sendMessage: (
    conversationId: string,
    content: string,
    lens: ReasoningLens = "coach",
  ) =>
    request<SendMessageResponse>(
      `/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content, lens }),
      },
    ),

  // ── Candidates (Stage B) ───────────────────────────────────────────

  listCandidates: () =>
    request<PendingCandidate[]>("/api/candidates"),

  confirmCandidate: (
    id: string,
    action: "confirm" | "reject",
    edits?: {
      extractedStatement?: string;
      epistemicType?: string;
    },
  ) =>
    request<ConfirmCandidateResponse | RejectCandidateResponse>(
      `/api/candidates/${id}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ action, edits }),
      },
    ),

  // ── Health ─────────────────────────────────────────────────────────

  health: () =>
    request<{ status: string; provider: string; database: string }>(
      "/api/health",
    ),

  // ── Evidence ────────────────────────────────────────────────────────

  listEvidence: () => request<Evidence[]>("/api/evidence"),

  // ── Hypotheses (Stage C) ────────────────────────────────────────────

  listHypotheses: () => request<Hypothesis[]>("/api/hypotheses"),

  getHypothesis: (id: string) =>
    request<HypothesisDetail>(`/api/hypotheses/${id}`),

  createHypothesis: (statement: string, creationRationale: string) =>
    request<Hypothesis>("/api/hypotheses", {
      method: "POST",
      body: JSON.stringify({ statement, creationRationale }),
    }),

  linkEvidence: (
    hypothesisId: string,
    evidenceId: string,
    linkType: LinkType,
  ) =>
    request<{ id: string; hypothesisId: string; evidenceId: string; linkType: LinkType }>(
      `/api/hypotheses/${hypothesisId}/evidence`,
      {
        method: "POST",
        body: JSON.stringify({ evidenceId, linkType }),
      },
    ),

  evaluateHypothesis: (id: string) =>
    request<HypothesisAssessment>(`/api/hypotheses/${id}/evaluate`, {
      method: "POST",
    }),

  // ── Experiments (Stage D) ──────────────────────────────────────────

  listExperiments: () => request<Experiment[]>("/api/experiments"),

  getExperiment: (id: string) => request<Experiment>(`/api/experiments/${id}`),

  listExperimentsByHypothesis: (hypothesisId: string) =>
    request<Experiment[]>(`/api/hypotheses/${hypothesisId}/experiments`),

  createExperiment: (
    hypothesisId: string,
    description: string,
    supportingSignal: string,
    contradictingSignal: string,
    inconclusiveSignal: string,
    rationale: string,
    reviewDate?: string | null,
  ) =>
    request<Experiment>("/api/experiments", {
      method: "POST",
      body: JSON.stringify({
        hypothesisId,
        description,
        supportingSignal,
        contradictingSignal,
        inconclusiveSignal,
        rationale,
        reviewDate: reviewDate ?? null,
      }),
    }),

  recommendExperiment: (hypothesisId: string) =>
    request<ExperimentProposal>(
      `/api/hypotheses/${hypothesisId}/recommend-experiment`,
      { method: "POST" },
    ),

  // ── Experiment Outcome (Stage E) ──────────────────────────────────

  recordOutcome: (
    experimentId: string,
    outcomeText: string,
    observedFact: string | null,
    classification: OutcomeClassification,
  ) =>
    request<ExperimentOutcomeResult>(
      `/api/experiments/${experimentId}/outcome`,
      {
        method: "POST",
        body: JSON.stringify({
          outcomeText,
          observedFact,
          classification,
        }),
      },
    ),

  // ── Experiment Review (Stage F) ───────────────────────────────────

  reviewExperiment: (experimentId: string) =>
    request<ExperimentReviewResult>(
      `/api/experiments/${experimentId}/review`,
      { method: "POST" },
    ),
};
