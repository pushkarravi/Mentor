import type {
  AIProvider,
} from "../providers/provider.js";
import type {
  CareerContextData,
  ClaimAnalysis,
  ChatMessage,
  ConfidenceCategory,
  EpistemicType,
  EvidenceSummary,
  ExperimentProposal,
  HypothesisAssessment,
  MemoryCandidate,
  MessageData,
  ReasoningLens,
  SourceType,
} from "../types.js";
import {
  assembleSystemPrompt,
  formatCareerContext,
  formatConversationHistory,
  formatEvidence,
  formatHypotheses,
  type RetrievedContext,
} from "../retrieval/index.js";

/**
 * Epistemic enforcement rules — these are Product Invariants enforced
 * in code, not just in prompt text.
 *
 * Rule 1: An ai_inference-sourced record can never be written as
 *         epistemic_type: fact (Invariant #1, #12).
 * Rule 2: Only observed_outcome can upgrade evidence toward fact-grade
 *         (Invariant #2).
 */
export function validateEpistemicPair(
  sourceType: SourceType,
  epistemicType: EpistemicType,
): { valid: boolean; reason?: string } {
  if (sourceType === "ai_inference" && epistemicType === "fact") {
    return {
      valid: false,
      reason:
        "An AI inference can never be persisted as a confirmed fact. " +
        "It must be at most an interpretation or hypothesis.",
    };
  }
  return { valid: true };
}

/**
 * Compute a qualitative confidence category from evidence counts.
 * No fake precision — tentative/moderate/strong only.
 *
 * The thresholds are deliberately conservative:
 * - tentative: fewer than 2 supporting items, or any contradicting
 *   evidence that hasn't been offset
 * - moderate: at least 2 supporting, supporting > contradicting
 * - strong: at least 3 supporting, supporting > 2x contradicting, and
 *   at least one observed_outcome among the supporting evidence
 */
export function computeConfidence(
  evidence: EvidenceSummary & {
    hasObservedOutcomeSupport: boolean;
  },
): ConfidenceCategory {
  const { supporting, contradicting, hasObservedOutcomeSupport } = evidence;

  if (supporting === 0) return "tentative";
  if (contradicting > 0 && supporting <= contradicting) return "tentative";
  if (supporting >= 3 && hasObservedOutcomeSupport && supporting > 2 * contradicting) {
    return "strong";
  }
  if (supporting >= 2 && supporting > contradicting) return "moderate";
  return "tentative";
}

/**
 * CareerReasoningEngine — the application-level reasoning layer.
 *
 * Sits between the API layer and the retrieval/memory/prompts machinery:
 *   UI/API → CareerReasoningEngine → retrieval/memory/prompts → AIProvider
 *
 * Route handlers call these methods; they never assemble prompts or
 * call AIProvider directly. This is where Product Invariants get enforced
 * in code.
 */
export class CareerReasoningEngine {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * analyzeClaim — decomposes a user message into
   * fact/interpretation/assumption/emotion/hypothesis/action components
   * before any response is generated. This is a distinct step, not an
   * implicit side effect of prompting.
   *
   * With a real AI provider, this calls the model with a structured
   * prompt asking for the decomposition. With MockProvider, it returns
   * a structurally correct placeholder.
   */
  async analyzeClaim(
    userMessage: string,
    context: {
      careerContext?: CareerContextData | null;
      conversationHistory?: MessageData[];
    },
  ): Promise<ClaimAnalysis> {
    const systemPrompt = `You are an epistemic analysis engine. Your job is to decompose a user's statement into its constituent epistemic components.

For the user's message, identify each of these categories that are present:
- FACT: observable, verifiable events ("I was not invited to meeting X")
- INTERPRETATION: the user's reading of why something happened ("my manager is excluding me")
- ASSUMPTION: unstated beliefs the user is operating under ("full detail = responsible")
- EMOTION: feelings expressed ("it stung," "I'm frustrated")
- HYPOTHESIS: testable claims about underlying causes ("leadership sees me as tactical")
- ACTION: something the user is considering doing

Return a JSON object with this exact shape:
{
  "components": [
    { "type": "fact" | "interpretation" | "assumption" | "emotion" | "hypothesis" | "action", "text": "the specific text" }
  ],
  "summary": "one-sentence overview of what the user is really saying"
}

Be precise. Quote or closely paraphrase the user's own words. Do not invent components that aren't present.`;

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: userMessage,
      },
    ];

    if (context.careerContext) {
      messages.unshift({
        role: "system",
        content: `Career context: ${formatCareerContext(context.careerContext)}`,
      });
    }

    const result = await this.provider.chat({
      messages,
      system: systemPrompt,
    });

    // If the provider returned structured data, use it
    if (result.structured && "components" in result.structured) {
      const s = result.structured as {
        components: Array<{ type: EpistemicType; text: string }>;
        summary: string;
      };
      return {
        components: s.components,
        summary: s.summary,
      };
    }

    // Try to parse JSON from content
    try {
      const parsed = JSON.parse(result.content) as {
        components: Array<{ type: EpistemicType; text: string }>;
        summary: string;
      };
      if (parsed.components && parsed.summary) {
        return parsed;
      }
    } catch {
      // Not JSON — fall through to placeholder
    }

    // MockProvider / fallback: structurally correct placeholder
    return {
      components: [
        {
          type: "fact",
          text: `[Mock] Observed situation extracted from: "${userMessage.slice(0, 80)}"`,
        },
        {
          type: "interpretation",
          text: "[Mock] The user's reading of why this is happening.",
        },
        {
          type: "emotion",
          text: "[Mock] Emotional response to the situation.",
        },
        {
          type: "hypothesis",
          text: "[Mock] A testable hypothesis about the underlying cause.",
        },
      ],
      summary:
        "[MockProvider] Placeholder claim analysis — no genuine reasoning has occurred.",
    };
  }

  /**
   * respond — generates a coaching response using the selected reasoning
   * lens, grounded in the claim analysis and retrieved context.
   *
   * This is not in the documented M0 method set explicitly, but it is the
   * core conversation step: it assembles the system prompt from the
   * reasoning lens + retrieved context + claim analysis, calls AIProvider,
   * and returns the response. The epistemic separation from analyzeClaim
   * feeds directly into this.
   */
  async respond(
    userMessage: string,
    lens: ReasoningLens,
    claimAnalysis: ClaimAnalysis,
    context: {
      careerContext?: CareerContextData | null;
      openHypotheses?: {
        id: string;
        statement: string;
        confidence: string;
        status: string;
      }[];
      recentEvidence?: {
        id: string;
        description: string;
        sourceType: string;
        epistemicType: string;
      }[];
      conversationHistory?: MessageData[];
    },
  ): Promise<string> {
    const retrieved: RetrievedContext = {
      careerContext: formatCareerContext(context.careerContext ?? null),
      openHypotheses: formatHypotheses(context.openHypotheses ?? []),
      recentEvidence: formatEvidence(context.recentEvidence ?? []),
      conversationHistory: formatConversationHistory(
        context.conversationHistory ?? [],
      ),
    };

    const system = assembleSystemPrompt(lens, retrieved, claimAnalysis);

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: userMessage,
      },
    ];

    const result = await this.provider.chat({ messages, system });
    return result.content;
  }

  // ── M0 methods (full implementations in later stages) ──────────────

  /**
   * evaluateHypothesis — assesses a hypothesis using supporting evidence,
   * contradicting evidence, and untested assumptions. Produces a
   * qualitative confidence category with evidence counts.
   *
   * Full implementation in Stage C.
   */
  async evaluateHypothesis(
    _hypothesisId: string,
  ): Promise<HypothesisAssessment> {
    throw new Error("evaluateHypothesis is implemented in Stage C");
  }

  /**
   * recommendExperiment — proposes a testable experiment linked to a
   * hypothesis, with a success signal and review point.
   *
   * Full implementation in Stage D.
   */
  async recommendExperiment(
    _hypothesisId: string,
  ): Promise<ExperimentProposal> {
    throw new Error("recommendExperiment is implemented in Stage D");
  }

  /**
   * reviewExperimentOutcome — re-evaluates a hypothesis when an experiment
   * outcome is recorded, updating the confidence category based on new
   * evidence.
   *
   * Full implementation in Stage F.
   */
  async reviewExperimentOutcome(
    _experimentId: string,
    _outcome: string,
  ): Promise<HypothesisAssessment> {
    throw new Error("reviewExperimentOutcome is implemented in Stage F");
  }

  /**
   * extractMemoryCandidates — proposes candidate structured records from
   * a conversation turn. Each candidate carries full epistemic/source
   * typing and a reason-to-save. Nothing is persisted without user
   * confirmation.
   *
   * Full implementation in Stage B.
   */
  async extractMemoryCandidates(
    _messages: MessageData[],
    _claimAnalysis: ClaimAnalysis,
  ): Promise<MemoryCandidate[]> {
    throw new Error("extractMemoryCandidates is implemented in Stage B");
  }
}
