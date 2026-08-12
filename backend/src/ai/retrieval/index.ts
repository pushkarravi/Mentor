import type {
  CareerContextData,
  ClaimAnalysis,
  MessageData,
  ReasoningLens,
} from "../types.js";
import {
  coachSystemPrompt,
  challengerSystemPrompt,
  decisionAdvisorSystemPrompt,
} from "../prompts/index.js";

/**
 * Retrieval module — assembles context for the reasoning engine.
 * In M0 this is structured filtering (career context, open hypotheses,
 * recent evidence, conversation history). Vector retrieval is M4.
 */

export interface RetrievedContext {
  careerContext: string;
  openHypotheses: string;
  recentEvidence: string;
  conversationHistory: string;
}

export function formatCareerContext(
  ctx: CareerContextData | null,
): string {
  if (!ctx) return "";
  return [
    `Current role: ${ctx.currentRole}`,
    `Years of experience: ${ctx.yearsExperience}`,
    `Target outcome: ${ctx.targetOutcome}`,
    `Why not yet (user's own theory — interpretation, not fact): ${ctx.whyNotYet}`,
  ].join("\n");
}

export function formatHypotheses(hypotheses: {
  id: string;
  statement: string;
  confidence: string;
  status: string;
}[]): string {
  if (hypotheses.length === 0) return "";
  return hypotheses
    .map(
      (h) =>
        `- [${h.confidence}] ${h.statement} (status: ${h.status})`,
    )
    .join("\n");
}

export function formatEvidence(evidence: {
  id: string;
  description: string;
  sourceType: string;
  epistemicType: string;
}[]): string {
  if (evidence.length === 0) return "";
  return evidence
    .map(
      (e) =>
        `- [${e.sourceType}/${e.epistemicType}] ${e.description}`,
    )
    .join("\n");
}

export function formatConversationHistory(
  messages: MessageData[],
): string {
  if (messages.length === 0) return "";
  return messages
    .map(
      (m) =>
        `${m.role === "user" ? "User" : "Mentor"}: ${m.content}`,
    )
    .join("\n\n");
}

export function formatClaimAnalysis(
  analysis: ClaimAnalysis | null,
): string {
  if (!analysis) return "";
  const lines = analysis.components.map(
    (c) => `- ${c.type.toUpperCase()}: ${c.text}`,
  );
  return `${analysis.summary}\n${lines.join("\n")}`;
}

export function assembleSystemPrompt(
  lens: ReasoningLens,
  retrieved: RetrievedContext,
  claimAnalysis: ClaimAnalysis | null,
): string {
  const context = {
    careerContext: retrieved.careerContext || undefined,
    openHypotheses: retrieved.openHypotheses || undefined,
    recentEvidence: retrieved.recentEvidence || undefined,
    conversationHistory: retrieved.conversationHistory || undefined,
    claimAnalysis: formatClaimAnalysis(claimAnalysis) || undefined,
  };

  switch (lens) {
    case "challenger":
      return challengerSystemPrompt(context);
    case "decision_advisor":
      return decisionAdvisorSystemPrompt(context);
    case "coach":
    default:
      return coachSystemPrompt(context);
  }
}
