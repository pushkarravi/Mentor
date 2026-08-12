import { describe, it, expect } from "vitest";
import {
  CareerReasoningEngine,
  validateEpistemicPair,
  computeConfidence,
} from "../reasoning/engine.js";
import type { AIProvider, ProviderMetadata } from "../providers/provider.js";
import type { ChatResult } from "../types.js";
import type { SourceType, EpistemicType } from "../types.js";

describe("Epistemic enforcement rules", () => {
  it("rejects ai_inference + fact (Invariant #1, #12)", () => {
    const result = validateEpistemicPair("ai_inference", "fact");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("AI inference");
    expect(result.reason).toContain("fact");
  });

  it("allows ai_inference + interpretation", () => {
    const result = validateEpistemicPair("ai_inference", "interpretation");
    expect(result.valid).toBe(true);
  });

  it("allows ai_inference + hypothesis", () => {
    const result = validateEpistemicPair("ai_inference", "hypothesis");
    expect(result.valid).toBe(true);
  });

  it("allows observed_outcome + fact (Invariant #2)", () => {
    const result = validateEpistemicPair("observed_outcome", "fact");
    expect(result.valid).toBe(true);
  });

  it("allows user_report + fact (user observed something directly)", () => {
    const result = validateEpistemicPair("user_report", "fact");
    expect(result.valid).toBe(true);
  });

  it("allows user_report + interpretation", () => {
    const result = validateEpistemicPair("user_report", "interpretation");
    expect(result.valid).toBe(true);
  });

  it("allows all epistemic types for imported_document", () => {
    const types: EpistemicType[] = [
      "fact",
      "interpretation",
      "hypothesis",
      "emotion",
      "action",
    ];
    for (const t of types) {
      const result = validateEpistemicPair("imported_document", t);
      expect(result.valid).toBe(true);
    }
  });

  it("rejects all non-fact source types paired with fact if source is ai_inference only", () => {
    // Only ai_inference + fact is rejected; other sources + fact are allowed
    const sources: SourceType[] = [
      "user_report",
      "observed_outcome",
      "imported_document",
    ];
    for (const s of sources) {
      const result = validateEpistemicPair(s, "fact");
      expect(result.valid).toBe(true);
    }
  });
});

describe("Qualitative confidence computation (no fake precision)", () => {
  it("returns tentative when there is no supporting evidence", () => {
    expect(
      computeConfidence({
        supporting: 0,
        contradicting: 0,
        untestedAssumptions: 2,
        hasObservedOutcomeSupport: false,
      }),
    ).toBe("tentative");
  });

  it("returns tentative when contradicting >= supporting", () => {
    expect(
      computeConfidence({
        supporting: 1,
        contradicting: 1,
        untestedAssumptions: 0,
        hasObservedOutcomeSupport: false,
      }),
    ).toBe("tentative");
  });

  it("returns moderate when supporting >= 2 and supporting > contradicting", () => {
    expect(
      computeConfidence({
        supporting: 2,
        contradicting: 1,
        untestedAssumptions: 1,
        hasObservedOutcomeSupport: false,
      }),
    ).toBe("moderate");
  });

  it("returns strong only when supporting >= 3, has observed outcome, and supporting > 2x contradicting", () => {
    expect(
      computeConfidence({
        supporting: 3,
        contradicting: 1,
        untestedAssumptions: 0,
        hasObservedOutcomeSupport: true,
      }),
    ).toBe("strong");
  });

  it("does not return strong without observed_outcome support", () => {
    expect(
      computeConfidence({
        supporting: 5,
        contradicting: 0,
        untestedAssumptions: 0,
        hasObservedOutcomeSupport: false,
      }),
    ).toBe("moderate");
  });

  it("does not return strong when contradicting is too high relative to supporting", () => {
    expect(
      computeConfidence({
        supporting: 3,
        contradicting: 2,
        untestedAssumptions: 0,
        hasObservedOutcomeSupport: true,
      }),
    ).toBe("moderate");
  });

  it("returns a qualitative category, never a number or percentage", () => {
    const result = computeConfidence({
      supporting: 10,
      contradicting: 0,
      untestedAssumptions: 0,
      hasObservedOutcomeSupport: true,
    });
    expect(["tentative", "moderate", "strong"]).toContain(result);
    expect(typeof result).toBe("string");
  });
});

// ── Arbitrary provider test ──────────────────────────────────────────
// Proves the engine works with any provider that satisfies the AIProvider
// interface, without importing or depending on a concrete provider class.

class StubRealProvider implements AIProvider {
  readonly metadata: ProviderMetadata = { isSynthetic: false };

  private responses: Map<string, ChatResult>;

  constructor(responses: Map<string, ChatResult>) {
    this.responses = responses;
  }

  async chat(input: {
    messages: ChatMessage[];
    system: string;
  }): Promise<ChatResult> {
    if (this.responses.size === 1) {
      for (const [, result] of this.responses) return result;
    }
    if (input.system.includes("extraction")) {
      return (
        this.responses.get("extraction") ?? { content: "", structured: null }
      );
    }
    return this.responses.get("chat") ?? { content: "", structured: null };
  }
}

describe("CareerReasoningEngine with arbitrary provider", () => {
  it("responds and extracts candidates using a custom AIProvider implementation", async () => {
    const claimAnalysisResponse = {
      components: [
        { type: "fact" as const, text: "I was not promoted" },
        { type: "interpretation" as const, text: "My manager does not value me" },
      ],
      summary: "A fact and an interpretation about career progress",
    };

    const extractionResponse = {
      candidates: [
        {
          entityType: "evidence" as const,
          extractedStatement: "I was not promoted in the last cycle",
          epistemicType: "fact" as const,
          sourceType: "user_report" as const,
          reasonToSave: "Promotion history for career context",
        },
      ],
    };

    const provider = new StubRealProvider(
      new Map([
        [
          "chat",
          {
            content: JSON.stringify(claimAnalysisResponse),
            structured: null,
          },
        ],
        [
          "extraction",
          {
            content: JSON.stringify(extractionResponse),
            structured: null,
          },
        ],
      ]),
    );

    const engine = new CareerReasoningEngine(provider);
    const careerContext = {
      currentRole: "Senior Engineer",
      yearsExperience: 8,
      targetOutcome: "Staff Engineer",
      whyNotYet: "Haven't demonstrated org-level impact",
    };

    // Step 1: analyze the claim (uses the "chat" response).
    const claimAnalysis = await engine.analyzeClaim(
      "I was not promoted and my manager doesn't value me",
      { careerContext },
    );

    expect(claimAnalysis).toBeDefined();
    expect(claimAnalysis.components).toHaveLength(2);
    expect(claimAnalysis.components[0].type).toBe("fact");

    // Step 2: respond using the claim analysis (reuses the single "chat" response).
    const response = await engine.respond(
      "I was not promoted and my manager doesn't value me",
      "coach",
      claimAnalysis,
      { careerContext },
    );

    expect(response).toBeDefined();
    expect(typeof response).toBe("string");

    // Step 3: extract memory candidates (uses the "extraction" response).
    const candidates = await engine.extractMemoryCandidates(
      "I was not promoted and my manager doesn't value me",
      claimAnalysis,
      { careerContext },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].extractedStatement).toBe(
      "I was not promoted in the last cycle",
    );
    expect(candidates[0].sourceType).toBe("user_report");
  });

  it("does not generate mock candidates when a non-synthetic provider returns unparseable output", async () => {
    const provider = new StubRealProvider(
      new Map([
        ["chat", { content: "not json", structured: null }],
        ["extraction", { content: "also not json", structured: null }],
      ]),
    );

    const engine = new CareerReasoningEngine(provider);
    const claimAnalysis: import("../types.js").ClaimAnalysis = {
      components: [{ type: "fact", text: "Test" }],
      summary: "Test",
    };

    const candidates = await engine.extractMemoryCandidates("test", claimAnalysis, {});

    // A real (non-synthetic) provider returning garbage produces no candidates.
    // Mock career data is never substituted for a real provider failure.
    expect(candidates).toHaveLength(0);
  });
});
