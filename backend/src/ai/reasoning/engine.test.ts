import { describe, it, expect } from "vitest";
import {
  validateEpistemicPair,
  computeConfidence,
} from "../reasoning/engine.js";
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
