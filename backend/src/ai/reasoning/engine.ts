import type { AIProvider } from "../providers/provider.js";
import type {
  CareerContextData,
  ClaimAnalysis,
  ChatMessage,
  ConfidenceCategory,
  EpistemicType,
  EvidenceSummary,
  MessageData,
  ReasoningLens,
  SourceType,
} from "../types.js";
import {
  claimAnalysisResponseSchema,
  extractionResponseSchema,
} from "../../api/schemas.js";
import {
  assembleSystemPrompt,
  formatCareerContext,
  formatClaimAnalysis,
  formatConversationHistory,
  formatEvidence,
  formatHypotheses,
  type RetrievedContext,
} from "../retrieval/index.js";
import { extractionSystemPrompt } from "../prompts/index.js";
import type { MemoryCandidate } from "../types.js";
import { MockProvider } from "../providers/mock.js";

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
 * NOTE: This is an intentionally provisional M0 heuristic based primarily
 * on evidence counts (supporting vs. contradicting), not a mature
 * evidentiary-strength model. It does not weight evidence by source type,
 * recency, or specificity. A more sophisticated model that considers
 * evidence quality — not just quantity — should replace this before the
 * product claims to reason carefully about confidence.
 *
 * Current thresholds (deliberately conservative):
 * - tentative: fewer than 2 supporting items, or contradicting >= supporting
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

    // Validate model output against the claim-analysis Zod schema.
    // Try structured data first, then JSON-parsed content.
    const candidates: unknown[] = [];
    if (result.structured) {
      candidates.push(result.structured);
    }
    try {
      candidates.push(JSON.parse(result.content));
    } catch {
      // content is not JSON — that's fine, try the next candidate
    }

    for (const candidate of candidates) {
      const parsed = claimAnalysisResponseSchema.safeParse(candidate);
      if (parsed.success) {
        return {
          components: parsed.data.components.map((c) => ({
            type: c.type,
            text: c.text,
          })),
          summary: parsed.data.summary,
        };
      }
    }

    // MockProvider or unparseable output: structurally correct placeholder.
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

  /**
   * extractMemoryCandidates — proposes candidate Evidence/Memory records
   * from a conversation turn. Each candidate carries full epistemic/source
   * typing and a reason-to-save.
   *
   * Nothing is persisted here. Candidates are returned to the caller for
   * the confirm/edit/reject flow. The epistemic enforcement rule
   * (ai_inference cannot be fact) is checked at extraction time so invalid
   * candidates are filtered before they reach the user.
   *
   * Mock candidates are generated ONLY when the configured provider is
   * MockProvider. If a real provider returns invalid/unparseable output,
   * no candidates are returned — mock career data is never substituted
   * for a real provider failure.
   */
  async extractMemoryCandidates(
    userMessage: string,
    claimAnalysis: ClaimAnalysis,
    context: {
      careerContext?: CareerContextData | null;
      conversationHistory?: MessageData[];
      sourceMessageId?: string;
    },
  ): Promise<MemoryCandidate[]> {
    const system = extractionSystemPrompt({
      careerContext: formatCareerContext(context.careerContext ?? null),
      claimAnalysis: formatClaimAnalysis(claimAnalysis),
      conversationHistory: formatConversationHistory(
        context.conversationHistory ?? [],
      ),
    });

    const messages: ChatMessage[] = [
      { role: "user", content: userMessage },
    ];

    const result = await this.provider.chat({ messages, system });

    // Validate model output against the extraction Zod schema.
    const candidates: MemoryCandidate[] = [];
    const rawCandidates: unknown[] = [];

    if (result.structured) {
      rawCandidates.push(result.structured);
    }
    try {
      rawCandidates.push(JSON.parse(result.content));
    } catch {
      // not JSON
    }

    for (const raw of rawCandidates) {
      const parsed = extractionResponseSchema.safeParse(raw);
      if (parsed.success) {
        for (const c of parsed.data.candidates) {
          const check = validateEpistemicPair(c.sourceType, c.epistemicType);
          if (check.valid) {
            candidates.push({
              entityType: c.entityType,
              extractedStatement: c.extractedStatement,
              epistemicType: c.epistemicType,
              sourceType: c.sourceType,
              reasonToSave: c.reasonToSave,
              linkedEntityId: c.linkedEntityId,
            });
          }
        }
        break;
      }
    }

    // Mock candidates are generated ONLY when the provider is MockProvider.
    // A real provider returning invalid output results in no candidates —
    // we never substitute mock career data for a real provider failure.
    if (candidates.length === 0 && this.provider instanceof MockProvider) {
      return this.generateMockCandidates(userMessage);
    }

    return candidates;
  }

  /**
   * Generates deterministic mock candidates for plumbing tests.
   * Each candidate is prefixed with [Mock] so it is never treated
   * as real career evidence.
   */
  private generateMockCandidates(userMessage: string): MemoryCandidate[] {
    return [
      {
        entityType: "evidence",
        extractedStatement: `[Mock] Evidence extracted from: "${userMessage.slice(0, 60)}"`,
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "[Mock] Testing the candidate pipeline plumbing.",
      },
      {
        entityType: "evidence",
        extractedStatement: "[Mock] The user's interpretation of the situation.",
        epistemicType: "interpretation",
        sourceType: "ai_inference",
        reasonToSave: "[Mock] Testing ai_inference candidate flow.",
      },
    ];
  }
}
