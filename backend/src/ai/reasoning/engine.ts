import type { AIProvider } from "../providers/provider.js";
import type {
  CareerContextData,
  ClaimAnalysis,
  ChatMessage,
  ConfidenceCategory,
  EpistemicType,
  EvidenceSummary,
  EvidenceData,
  HypothesisAssessment,
  HypothesisData,
  HypothesisEvidenceLink,
  ExperimentProposal,
  ExperimentData,
  ExperimentOutcomeResult,
  OutcomeClassification,
  MessageData,
  ReasoningLens,
  SourceType,
} from "../types.js";
import type { ConversationRepository } from "../../modules/conversations/repository.js";
import {
  claimAnalysisResponseSchema,
  extractionResponseSchema,
  experimentProposalResponseSchema,
} from "../schemas.js";
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
 *
 * Evidence weighting caveat: observed_outcome currently influences the
 * threshold for "strong" (it is a prerequisite). This does NOT mean a
 * single observed outcome automatically outweighs arbitrary contradicting
 * evidence — the count-based inequality (supporting > 2x contradicting)
 * must also hold. The engine does not yet have a mature source-quality
 * weighting model; the rationale builder notes when observed outcomes
 * are present alongside interpretive contradictions, but this is a
 * narrative observation, not a computed weight.
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

    // Mock candidates are generated ONLY when the provider is synthetic
    // (i.e. MockProvider). A real provider returning invalid output results
    // in no candidates — we never substitute mock career data for a real
    // provider failure.
    if (candidates.length === 0 && this.provider.metadata.isSynthetic) {
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

  /**
   * evaluateHypothesis — assesses a hypothesis by retrieving the actual
   * linked evidence (not caller-supplied counts), computing qualitative
   * confidence, identifying untested assumptions, and producing a
   * rationale that references the evidence content.
   *
   * Key constraints:
   * - Confidence is qualitative (tentative/moderate/strong), never numeric.
   * - Strong confidence does NOT automatically set status to "confirmed".
   * - Observed outcomes influence the threshold for "strong" confidence
   *   but do not automatically outweigh arbitrary contradicting evidence.
   * - Contradicting evidence weakens the assessment.
   * - No evidence → tentative.
   * - Untested assumptions are returned as an explicit string list, not
   *   a hard-coded zero. An empty list means the engine found no
   *   plausible untested assumptions given the current evidence.
   * - The assessment rationale is stored separately from the user's
   *   original creationRationale — evaluation never overwrites the latter.
   */
  async evaluateHypothesis(
    hypothesis: HypothesisData,
    links: Array<{ link: HypothesisEvidenceLink; evidence: EvidenceData }>,
  ): Promise<HypothesisAssessment> {
    const supporting = links.filter((l) => l.link.linkType === "supports");
    const contradicting = links.filter(
      (l) => l.link.linkType === "contradicts",
    );

    const hasObservedOutcomeSupport = supporting.some(
      (l) => l.evidence.sourceType === "observed_outcome",
    );

    const confidence = computeConfidence({
      supporting: supporting.length,
      contradicting: contradicting.length,
      untestedAssumptions: [],
      hasObservedOutcomeSupport,
    });

    const untestedAssumptions = this.identifyUntestedAssumptions(
      hypothesis,
      supporting,
      contradicting,
    );

    const rationale = this.buildEvaluationRationale(
      hypothesis,
      supporting,
      contradicting,
      confidence,
      hasObservedOutcomeSupport,
      untestedAssumptions,
    );

    return {
      hypothesisId: hypothesis.id,
      confidence,
      evidence: {
        supporting: supporting.length,
        contradicting: contradicting.length,
        untestedAssumptions,
      },
      rationale,
    };
  }

  /**
   * Provisional M0 gap-detection heuristic. Checks the linked evidence
   * for common structural gaps (no observed outcomes, balanced conflict,
   * no evidence at all) and returns an explicit list of untested
   * assumptions.
   *
   * This is NOT model-based assumption analysis — it is a deterministic
   * rule set that runs identically regardless of provider. A future
   * version may use the AIProvider to reason about domain-specific
   * untested assumptions, but that code does not exist yet. Do not
   * claim otherwise.
   *
   * Returns an explicit list — never a hard-coded zero. An empty list
   * means the heuristic found no plausible untested assumptions given
   * the current evidence, not that assumptions are impossible.
   */
  private identifyUntestedAssumptions(
    _hypothesis: HypothesisData,
    supporting: Array<{ link: HypothesisEvidenceLink; evidence: EvidenceData }>,
    contradicting: Array<{ link: HypothesisEvidenceLink; evidence: EvidenceData }>,
  ): string[] {
    const assumptions: string[] = [];

    // If there is no supporting evidence, the hypothesis itself is
    // an untested assumption.
    if (supporting.length === 0 && contradicting.length === 0) {
      assumptions.push(
        "The hypothesis has not yet been tested against any evidence.",
      );
      return assumptions;
    }

    // If all supporting evidence is user_report or ai_inference (no
    // observed outcomes), the assumption that the pattern is real
    // (not just perception) remains untested.
    const hasObservedOutcome = supporting.some(
      (l) => l.evidence.sourceType === "observed_outcome",
    );
    if (supporting.length > 0 && !hasObservedOutcome) {
      assumptions.push(
        "All supporting evidence is self-reported or inferred — " +
          "no observed outcomes have been recorded to independently " +
          "confirm the pattern.",
      );
    }

    // If there is contradicting evidence but no supporting evidence,
    // the hypothesis may be unfounded.
    if (supporting.length === 0 && contradicting.length > 0) {
      assumptions.push(
        "All linked evidence contradicts the hypothesis — " +
          "the hypothesis may be unfounded.",
      );
    }

    // If there is both supporting and contradicting evidence with
    // similar counts, the resolution of the conflict is untested.
    if (
      supporting.length > 0 &&
      contradicting.length > 0 &&
      Math.abs(supporting.length - contradicting.length) <= 1
    ) {
      assumptions.push(
        "Supporting and contradicting evidence are nearly balanced — " +
          "the conflict has not been resolved by a decisive observation.",
      );
    }

    return assumptions;
  }

  /**
   * Builds a human-readable rationale for a hypothesis assessment.
   * References the actual evidence content and source types, explains
   * why the confidence category was assigned, and notes the weight of
   * observed outcomes vs. interpretations.
   *
   * This rationale is stored as lastAssessmentRationale — it does NOT
   * overwrite the user's creationRationale.
   */
  private buildEvaluationRationale(
    hypothesis: HypothesisData,
    supporting: Array<{ link: HypothesisEvidenceLink; evidence: EvidenceData }>,
    contradicting: Array<{ link: HypothesisEvidenceLink; evidence: EvidenceData }>,
    confidence: ConfidenceCategory,
    hasObservedOutcomeSupport: boolean,
    untestedAssumptions: string[],
  ): string {
    const parts: string[] = [];

    parts.push(`Hypothesis: "${hypothesis.statement}"`);

    if (supporting.length === 0 && contradicting.length === 0) {
      parts.push(
        "No evidence has been linked to this hypothesis yet. " +
          "Confidence is tentative — the hypothesis is untested.",
      );
      if (untestedAssumptions.length > 0) {
        parts.push(`Untested assumptions: ${untestedAssumptions.join(" ")}`);
      }
      return parts.join(" ");
    }

    if (supporting.length > 0) {
      const supportItems = supporting.map(
        (l) =>
          `"${l.evidence.description}" (${l.evidence.sourceType}/${l.evidence.epistemicType})`,
      );
      parts.push(
        `Supporting evidence (${supporting.length}): ${supportItems.join("; ")}.`,
      );
    }

    if (contradicting.length > 0) {
      const contraItems = contradicting.map(
        (l) =>
          `"${l.evidence.description}" (${l.evidence.sourceType}/${l.evidence.epistemicType})`,
      );
      parts.push(
        `Contradicting evidence (${contradicting.length}): ${contraItems.join("; ")}.`,
      );
    }

    switch (confidence) {
      case "tentative":
        if (
          contradicting.length > 0 &&
          supporting.length <= contradicting.length
        ) {
          parts.push(
            "Confidence is tentative because contradicting evidence meets or exceeds supporting evidence.",
          );
        } else if (supporting.length < 2) {
          parts.push(
            "Confidence is tentative — fewer than two supporting items have been linked.",
          );
        } else {
          parts.push("Confidence is tentative.");
        }
        break;
      case "moderate":
        parts.push(
          "Confidence is moderate — at least two supporting items and supporting exceeds contradicting, " +
            "but the evidence base is not yet strong enough for high confidence.",
        );
        break;
      case "strong":
        parts.push(
          "Confidence is strong — at least three supporting items including an observed outcome, " +
            "and supporting evidence significantly outweighs contradicting evidence. " +
            "Strong confidence does not mean confirmed — the hypothesis remains testable.",
        );
        break;
    }

    // Note observed outcome presence — this is a narrative observation,
    // not a computed weight. The engine does not claim that one observed
    // outcome automatically outweighs arbitrary contradicting evidence.
    if (hasObservedOutcomeSupport && contradicting.length > 0) {
      const contraAreInterpretations = contradicting.every(
        (l) =>
          l.evidence.sourceType !== "observed_outcome" &&
          l.evidence.epistemicType === "interpretation",
      );
      if (contraAreInterpretations) {
        parts.push(
          "Note: supporting evidence includes observed outcomes while contradicting " +
            "evidence is interpretive. The current heuristic treats this favorably " +
            "but does not have a mature source-quality weighting model.",
        );
      }
    }

    if (untestedAssumptions.length > 0) {
      parts.push(`Untested assumptions: ${untestedAssumptions.join(" ")}`);
    }

    return parts.join(" ");
  }

// ── Stage E: Experiment outcome recording ──────────────────────────────

  /**
   * recordExperimentOutcome — records what actually happened when the
   * user carried out an experiment. The flow is:
   *
   * 1. The user provides raw outcome text and an explicit classification
   *    (supports / contradicts / inconclusive).
   * 2. For supports or contradicts, an observed_outcome Evidence record
   *    is created with epistemic_type: "fact" — an observed outcome is
   *    the only source type that can carry fact-grade epistemic status
   *    (Invariant #2). The evidence description preserves the user's
   *    raw outcome text.
   * 3. For inconclusive, no Evidence record is created — an inconclusive
   *    experiment does not produce new evidence.
   * 4. The experiment is marked completed with the outcome text,
   *    classification, and timestamp.
   * 5. STOP. No hypothesis reassessment happens here — that is Stage F.
   *
   * Key constraints:
   * - The classification is user-supplied, not auto-inferred. M0 does
   *   not auto-classify outcomes.
   * - observed_outcome + fact is the one valid exception to the
   *   ai_inference→fact prohibition (validateEpistemicPair allows it
   *   because sourceType is observed_outcome, not ai_inference).
   * - The raw outcome text is preserved verbatim in the Evidence
   *    description — no paraphrasing or summarization.
   * - The experiment must exist and must not already have a recorded
   *    outcome. Re-recording is not supported in M0.
   */
  async recordExperimentOutcome(
    experiment: ExperimentData,
    outcomeText: string,
    classification: OutcomeClassification,
    repo: ConversationRepository,
    userId: string,
  ): Promise<ExperimentOutcomeResult> {
    // Reject double-recording.
    if (experiment.outcome !== null) {
      throw new OutcomeError(
        "An outcome has already been recorded for this experiment. " +
          "M0 does not support re-recording outcomes.",
      );
    }

    // For supports/contradicts, create an observed_outcome Evidence
    // record. The raw outcome text is preserved verbatim.
    let evidence: EvidenceData | null = null;

    if (classification === "supports" || classification === "contradicts") {
      evidence = await repo.addEvidence(userId, {
        sourceType: "observed_outcome",
        epistemicType: "fact",
        description: outcomeText,
      });
    }

    // Mark the experiment completed with the outcome and classification.
    const updated = await repo.recordExperimentOutcome(
      userId,
      experiment.id,
      {
        outcome: outcomeText,
        outcomeClassification: classification,
        evidenceId: evidence?.id ?? null,
      },
    );

    if (!updated) {
      throw new OutcomeError(
        "Failed to record the experiment outcome — the experiment " +
          "could not be updated.",
      );
    }

    return {
      experiment: updated,
      classification,
      evidence,
    };
  }

  // ── Stage D: Experiment recommendation ──────────────────────────────

  /**
   * recommendExperiment — proposes an experiment to gather information
   * about a hypothesis. The proposal defines three outcome signals:
   * supporting, contradicting, and inconclusive. The goal is
   * information, not confirmation (Invariant #11).
   *
   * Key constraints:
   * - The experiment must be falsifiable — it needs outcome signals
   *   that could plausibly NOT occur (Invariant #11).
   * - The rationale must explain why this experiment matters: why,
   *   with whom, toward what objective (Invariant #4).
   * - The proposal is a recommendation only — the user decides whether
   *   to create the experiment. No silent creation.
   * - The hypothesisId in the returned proposal is ALWAYS set from the
   *   authoritative hypothesis argument, never from model output.
   * - The review date must be a valid ISO date approximately 1-6 weeks
   *   in the future. Model-supplied dates that fail validation are
   *   rejected — no silent fallback.
   * - With a real AIProvider, the engine asks the model and validates
   *   the output with safeParse. If the model produces no valid
   *   proposal, a controlled error is thrown — never a deterministic
   *   substitute for real-provider output.
   * - With a synthetic provider (Mock), a deterministic template-based
   *   proposal is used instead.
   */
  async recommendExperiment(
    hypothesis: HypothesisData,
    assessment: HypothesisAssessment | null,
    existingExperiments: ExperimentData[] | null,
  ): Promise<ExperimentProposal> {
    // If the provider is synthetic (Mock), use a deterministic fallback.
    if (this.provider.metadata.isSynthetic) {
      return this.deterministicExperimentProposal(
        hypothesis,
        assessment,
        existingExperiments,
      );
    }

    // With a real provider, ask the model to propose an experiment.
    const systemPrompt =
      "You are a career reasoning engine. Given a career hypothesis, its " +
      "current evidence assessment, and any existing experiments, propose " +
      "a single experiment to gather information about the hypothesis. " +
      "The experiment must define three observable outcome signals: " +
      "supportingSignal (would strengthen the hypothesis), " +
      "contradictingSignal (would weaken the hypothesis), and " +
      "inconclusiveSignal (circumstances under which the experiment did " +
      "not meaningfully test the hypothesis). " +
      "The goal is information, not confirmation. " +
      "Explain why this experiment matters and what objective it serves. " +
      "The reviewDate must be an ISO date 1-6 weeks from now. " +
      "Respond as JSON: { \"description\": string, " +
      "\"supportingSignal\": string, \"contradictingSignal\": string, " +
      "\"inconclusiveSignal\": string, \"reviewDate\": ISO date, " +
      "\"rationale\": string }. Do NOT include hypothesisId — the engine " +
      "sets it from the authoritative hypothesis.";

    const evidenceSummary = assessment
      ? `Supporting: ${assessment.evidence.supporting}, ` +
        `Contradicting: ${assessment.evidence.contradicting}, ` +
        `Confidence: ${assessment.confidence}. ` +
        `Untested assumptions: ${assessment.evidence.untestedAssumptions.join("; ") || "none identified"}.`
      : "No assessment available — the hypothesis has not been evaluated yet.";

    const existingSummary =
      existingExperiments && existingExperiments.length > 0
        ? `Existing experiments: ${existingExperiments
            .map((e) => `"${e.description}" (status: ${e.status})`)
            .join("; ")}.`
        : "No existing experiments.";

    const userPrompt =
      `Hypothesis: "${hypothesis.statement}"\n` +
      `Creation rationale: ${hypothesis.creationRationale}\n` +
      `Current assessment: ${evidenceSummary}\n` +
      `${existingSummary}\n\n` +
      `Propose one experiment. Respond as JSON only.`;

    const result = await this.provider.chat({
      messages: [
        { role: "user", content: userPrompt },
      ],
      system: systemPrompt,
    });

    // ── Validated provider output parsing ────────────────────────────
    // Follow the same pattern used elsewhere: inspect structured if
    // present, try JSON parsing of content, validate with safeParse.
    // Never substitute a deterministic proposal for malformed
    // real-provider output — return a controlled error instead.

    let raw: Record<string, unknown> | null = null;

    // 1. Check result.structured if the provider populated it.
    if (result.structured && typeof result.structured === "object") {
      raw = result.structured as Record<string, unknown>;
    }

    // 2. Try JSON parsing of content.
    if (!raw && result.content) {
      try {
        const parsed = JSON.parse(result.content);
        if (parsed && typeof parsed === "object") {
          raw = parsed as Record<string, unknown>;
        }
      } catch {
        // Not valid JSON — fall through to error.
      }
    }

    // 3. No parseable output — controlled error.
    if (!raw) {
      throw new RecommendationError(
        "The reasoning provider did not return a parseable experiment " +
          "proposal. No experiment was created.",
      );
    }

    // 4. Validate with the AI-domain Zod schema using safeParse.
    const parsed = experimentProposalResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new RecommendationError(
        "The reasoning provider returned a malformed experiment proposal " +
          "that failed validation. No experiment was created.",
      );
    }

    // 5. Do not trust model-supplied hypothesis identity. The model
    //    was instructed not to include hypothesisId, but if it did,
    //    and it doesn't match the authoritative hypothesis, reject it.
    const modelHypId = (raw as Record<string, unknown>).hypothesisId;
    if (
      typeof modelHypId === "string" &&
      modelHypId !== hypothesis.id
    ) {
      throw new RecommendationError(
        "The reasoning provider returned a proposal for a different " +
          "hypothesis than requested. This is a provider error — no " +
          "experiment was created.",
      );
    }

    // 6. The review date was already validated by the Zod schema
    //    (reviewDateSchema is shared with the API layer — one domain
    //    rule, not duplicated logic).

    // 7. Set hypothesisId from the authoritative hypothesis argument.
    return {
      hypothesisId: hypothesis.id,
      description: parsed.data.description,
      supportingSignal: parsed.data.supportingSignal,
      contradictingSignal: parsed.data.contradictingSignal,
      inconclusiveSignal: parsed.data.inconclusiveSignal,
      reviewDate: parsed.data.reviewDate,
      rationale: parsed.data.rationale,
    };
  }

  /**
   * Deterministic fallback for experiment proposal when using a
   * synthetic provider. Produces a template-based proposal that
   * is clearly marked as deterministic — not a real AI recommendation.
   *
   * The proposal defines three genuinely different outcome signals:
   * supporting, contradicting, and inconclusive. It references the
   * hypothesis statement and any untested assumptions from the
   * assessment. The review date is validated to be ~2 weeks in the
   * future.
   */
  private deterministicExperimentProposal(
    hypothesis: HypothesisData,
    assessment: HypothesisAssessment | null,
    existingExperiments: ExperimentData[] | null,
  ): ExperimentProposal {
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() + 14);
    const reviewDateStr = reviewDate.toISOString().split("T")[0]!;

    // If there are existing experiments, note them in the rationale.
    const existingNote =
      existingExperiments && existingExperiments.length > 0
        ? ` Note: ${existingExperiments.length} existing experiment(s) ` +
          `already target this hypothesis — ensure this proposal ` +
          `complements rather than duplicates them.`
        : "";

    // Use untested assumptions from the assessment if available.
    const untestedNote =
      assessment && assessment.evidence.untestedAssumptions.length > 0
        ? ` This experiment targets the untested assumption: ` +
          `"${assessment.evidence.untestedAssumptions[0]}"`
        : " This experiment provides an initial test of the hypothesis.";

    const description =
      `Observe whether the pattern described in the hypothesis ` +
      `occurs in a specific, time-bounded situation over the next ` +
      `two weeks. Document concrete instances with dates and context.`;

    const supportingSignal =
      `I observe at least one concrete, dated instance where ` +
      `"${hypothesis.statement}" is clearly true — for example, ` +
      `a specific meeting or decision where I was explicitly excluded.`;

    const contradictingSignal =
      `I am explicitly included in at least one strategic meeting ` +
      `or decision that the hypothesis predicted I would be excluded ` +
      `from, and this inclusion appears deliberate rather than accidental.`;

    const inconclusiveSignal =
      `No relevant opportunities arise during the review period — ` +
      `no strategic meetings occur, or circumstances change (e.g., ` +
      `organizational restructuring) so the experiment cannot ` +
      `meaningfully test the hypothesis.`;

    const rationale =
      `[Deterministic proposal] This experiment matters because the ` +
      `hypothesis "${hypothesis.statement}" currently has ` +
      (assessment
        ? `confidence "${assessment.confidence}" with ` +
          `${assessment.evidence.supporting} supporting and ` +
          `${assessment.evidence.contradicting} contradicting evidence.`
        : `no assessment yet.`) +
      untestedNote +
      ` The outcome signals are observable and falsifiable — ` +
      `the supporting and contradicting signals are genuinely ` +
      `different, and the inconclusive signal recognizes when the ` +
      `experiment did not meaningfully test the hypothesis.` +
      existingNote;

    return {
      hypothesisId: hypothesis.id,
      description,
      supportingSignal,
      contradictingSignal,
      inconclusiveSignal,
      reviewDate: reviewDateStr,
      rationale,
    };
  }
}

// ── Stage D helpers ───────────────────────────────────────────────────

/**
 * Controlled error for experiment recommendation failures. Thrown
 * when a real provider produces no valid proposal. The caller
 * (route handler) surfaces this as a user-visible error — never
 * as a silent deterministic fallback.
 */
export class RecommendationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecommendationError";
  }
}

/**
 * Controlled error for experiment outcome recording failures. Thrown
 * when an outcome has already been recorded or the experiment cannot
 * be updated. The route handler surfaces this as a user-visible error.
 */
export class OutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeError";
  }
}


