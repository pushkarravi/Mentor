import { describe, it, expect, beforeEach } from "vitest";
import { CareerReasoningEngine } from "../reasoning/engine.js";
import { InMemoryConversationRepository } from "../../modules/conversations/in-memory.js";
import type {
  AIProvider,
  ProviderMetadata,
} from "../providers/provider.js";
import type {
  ChatResult,
  EvidenceData,
  HypothesisData,
  HypothesisEvidenceLink,
  EpistemicType,
  SourceType,
} from "../types.js";

const USER_ID = "test-user";

// ── Helpers ──────────────────────────────────────────────────────────

/** A minimal stub provider for engine tests — no concrete provider import. */
class StubProvider implements AIProvider {
  readonly metadata: ProviderMetadata;
  private result: ChatResult;

  constructor(result: ChatResult, isSynthetic = false) {
    this.result = result;
    this.metadata = { isSynthetic };
  }

  async chat(): Promise<ChatResult> {
    return this.result;
  }
}

async function createEvidence(
  repo: InMemoryConversationRepository,
  overrides: Partial<{
    sourceType: SourceType;
    epistemicType: EpistemicType;
    description: string;
  }> = {},
): Promise<EvidenceData> {
  const defaults = {
    sourceType: "user_report" as SourceType,
    epistemicType: "fact" as EpistemicType,
    description: "Test evidence",
  };
  return repo.addEvidence(USER_ID, { ...defaults, ...overrides });
}

async function createHypothesis(
  repo: InMemoryConversationRepository,
  overrides: Partial<{ statement: string; creationRationale: string }> = {},
): Promise<HypothesisData> {
  const defaults = {
    statement: "My manager is excluding me from strategic decisions",
    creationRationale: "Pattern of missed invitations to strategy meetings",
  };
  return repo.createHypothesis(USER_ID, { ...defaults, ...overrides });
}

async function linkEvidence(
  repo: InMemoryConversationRepository,
  hypothesisId: string,
  evidenceId: string,
  linkType: "supports" | "contradicts",
): Promise<HypothesisEvidenceLink> {
  return repo.addHypothesisEvidenceLink(USER_ID, {
    hypothesisId,
    evidenceId,
    linkType,
  });
}

// ── Hypothesis creation ──────────────────────────────────────────────

describe("Stage C: Hypothesis creation", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  it("creates a hypothesis with tentative confidence and active status", async () => {
    const hyp = await createHypothesis(repo);

    expect(hyp.id).toBeDefined();
    expect(hyp.confidence).toBe("tentative");
    expect(hyp.status).toBe("active");
    expect(hyp.statement).toContain("excluding");
    expect(hyp.createdAt).toBeDefined();
    expect(hyp.updatedAt).toBeDefined();
  });

  it("stores creationRationale separately from lastAssessmentRationale", async () => {
    const hyp = await createHypothesis(repo, {
      statement: "Test hypothesis",
      creationRationale: "My original reason for believing this",
    });

    expect(hyp.creationRationale).toBe("My original reason for believing this");
    expect(hyp.lastAssessmentRationale).toBeNull();
  });

  it("creating a hypothesis does not mutate existing Evidence records", async () => {
    const evidence = await createEvidence(repo, {
      description: "I was not invited to the Q3 strategy meeting",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    const originalDescription = evidence.description;
    const originalEpistemicType = evidence.epistemicType;
    const originalSourceType = evidence.sourceType;

    await createHypothesis(repo, {
      statement: "My manager is excluding me",
      creationRationale: "Based on missed meeting invitations",
    });

    const retrieved = await repo.getEvidence(USER_ID, evidence.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.description).toBe(originalDescription);
    expect(retrieved!.epistemicType).toBe(originalEpistemicType);
    expect(retrieved!.sourceType).toBe(originalSourceType);
  });

  it("hypothesis creation is explicit — no silent creation from AI suggestions", async () => {
    const pending = await repo.listHypotheses(USER_ID);
    expect(pending).toHaveLength(0);

    await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "Some extracted statement",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Test",
        isMock: false,
      },
    ]);

    const stillEmpty = await repo.listHypotheses(USER_ID);
    expect(stillEmpty).toHaveLength(0);
  });
});

// ── Evidence linking ─────────────────────────────────────────────────

describe("Stage C: Evidence linking", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  it("supporting and contradicting links are stored explicitly", async () => {
    const hyp = await createHypothesis(repo);
    const supporting = await createEvidence(repo, {
      description: "I was not invited to the strategy meeting",
    });
    const contradicting = await createEvidence(repo, {
      description: "I was invited to the Q2 strategy meeting",
    });

    await linkEvidence(repo, hyp.id, supporting.id, "supports");
    await linkEvidence(repo, hyp.id, contradicting.id, "contradicts");

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    expect(links).toHaveLength(2);

    const supportLink = links.find((l) => l.link.linkType === "supports");
    expect(supportLink).toBeDefined();
    expect(supportLink!.evidence.description).toBe(
      "I was not invited to the strategy meeting",
    );

    const contraLink = links.find((l) => l.link.linkType === "contradicts");
    expect(contraLink).toBeDefined();
    expect(contraLink!.evidence.description).toBe(
      "I was invited to the Q2 strategy meeting",
    );
  });

  it("one evidence item can support multiple hypotheses", async () => {
    const evidence = await createEvidence(repo, {
      description: "I was not invited to the strategy meeting",
    });

    const hyp1 = await createHypothesis(repo, {
      statement: "My manager is excluding me",
    });
    const hyp2 = await createHypothesis(repo, {
      statement: "I am being sidelined for promotion",
    });

    await linkEvidence(repo, hyp1.id, evidence.id, "supports");
    await linkEvidence(repo, hyp2.id, evidence.id, "supports");

    const links1 = await repo.getHypothesisEvidenceLinks(USER_ID, hyp1.id);
    const links2 = await repo.getHypothesisEvidenceLinks(USER_ID, hyp2.id);

    expect(links1).toHaveLength(1);
    expect(links1[0].evidence.id).toBe(evidence.id);
    expect(links1[0].link.linkType).toBe("supports");

    expect(links2).toHaveLength(1);
    expect(links2[0].evidence.id).toBe(evidence.id);
    expect(links2[0].link.linkType).toBe("supports");
  });

  it("one evidence item can contradict a different hypothesis", async () => {
    const evidence = await createEvidence(repo, {
      description: "I received a promotion to Staff Engineer",
    });

    const hyp1 = await createHypothesis(repo, {
      statement: "My career is stagnating",
    });
    const hyp2 = await createHypothesis(repo, {
      statement: "I am being recognized for my impact",
    });

    await linkEvidence(repo, hyp1.id, evidence.id, "contradicts");
    await linkEvidence(repo, hyp2.id, evidence.id, "supports");

    const links1 = await repo.getHypothesisEvidenceLinks(USER_ID, hyp1.id);
    const links2 = await repo.getHypothesisEvidenceLinks(USER_ID, hyp2.id);

    expect(links1[0].link.linkType).toBe("contradicts");
    expect(links2[0].link.linkType).toBe("supports");
    expect(links1[0].evidence.id).toBe(evidence.id);
    expect(links2[0].evidence.id).toBe(evidence.id);
  });
});

// ── Hypothesis evaluation ────────────────────────────────────────────

describe("Stage C: evaluateHypothesis()", () => {
  let repo: InMemoryConversationRepository;
  let engine: CareerReasoningEngine;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
    const provider = new StubProvider({
      content: '{"components":[{"type":"fact","text":"test"}],"summary":"test"}',
      structured: null,
    });
    engine = new CareerReasoningEngine(provider);
  });

  it("uses linked evidence from the repository, not caller-supplied counts", async () => {
    const hyp = await createHypothesis(repo);
    await createEvidence(repo, { description: "Support 1" });
    await createEvidence(repo, { description: "Support 2" });

    const allEvidence = await repo.listEvidence(USER_ID);
    await linkEvidence(repo, hyp.id, allEvidence[0].id, "supports");
    await linkEvidence(repo, hyp.id, allEvidence[1].id, "supports");

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(assessment.evidence.supporting).toBe(2);
    expect(assessment.evidence.contradicting).toBe(0);
    expect(assessment.confidence).toBe("moderate");
    expect(assessment.rationale).toContain("Support 1");
    expect(assessment.rationale).toContain("Support 2");
  });

  it("no evidence → tentative", async () => {
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);

    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(assessment.evidence.supporting).toBe(0);
    expect(assessment.evidence.contradicting).toBe(0);
    expect(assessment.confidence).toBe("tentative");
    expect(assessment.rationale).toContain("No evidence");
  });

  it("contradicting evidence can weaken assessment", async () => {
    const hyp = await createHypothesis(repo);

    for (let i = 0; i < 3; i++) {
      const e = await createEvidence(repo, {
        description: `Support ${i + 1}`,
        sourceType: "observed_outcome",
      });
      await linkEvidence(repo, hyp.id, e.id, "supports");
    }
    for (let i = 0; i < 4; i++) {
      const e = await createEvidence(repo, {
        description: `Contradiction ${i + 1}`,
      });
      await linkEvidence(repo, hyp.id, e.id, "contradicts");
    }

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(assessment.evidence.supporting).toBe(3);
    expect(assessment.evidence.contradicting).toBe(4);
    expect(assessment.confidence).toBe("tentative");
    expect(assessment.rationale).toContain("contradicting");
  });

  it("observed outcomes influence the threshold for strong confidence", async () => {
    const hyp = await createHypothesis(repo);

    // 5 supporting observed outcomes vs 2 contradicting user interpretations.
    // computeConfidence requires supporting > 2 * contradicting for "strong"
    // (5 > 4), plus hasObservedOutcomeSupport = true.
    for (let i = 0; i < 5; i++) {
      const e = await createEvidence(repo, {
        description: `Observed support ${i + 1}`,
        sourceType: "observed_outcome",
        epistemicType: "fact",
      });
      await linkEvidence(repo, hyp.id, e.id, "supports");
    }
    for (let i = 0; i < 2; i++) {
      const e = await createEvidence(repo, {
        description: `Interpretation contra ${i + 1}`,
        sourceType: "user_report",
        epistemicType: "interpretation",
      });
      await linkEvidence(repo, hyp.id, e.id, "contradicts");
    }

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(assessment.confidence).toBe("strong");
    // The rationale should note observed outcomes are present, but
    // should NOT claim they automatically outweigh the contradicting
    // evidence — it should note the lack of a mature weighting model.
    expect(assessment.rationale).toContain("observed outcome");
  });

  it("strong confidence does not automatically set status to confirmed", async () => {
    const hyp = await createHypothesis(repo);

    // 4 supporting observed outcomes, 0 contradicting → strong
    for (let i = 0; i < 4; i++) {
      const e = await createEvidence(repo, {
        description: `Observed support ${i + 1}`,
        sourceType: "observed_outcome",
      });
      await linkEvidence(repo, hyp.id, e.id, "supports");
    }

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(assessment.confidence).toBe("strong");

    // The hypothesis status must remain "active" — strong confidence
    // does NOT auto-confirm.
    const retrieved = await repo.getHypothesis(USER_ID, hyp.id);
    expect(retrieved!.status).toBe("active");

    expect(assessment.rationale).toContain("does not mean confirmed");
    expect(assessment.rationale).toContain("testable");
  });

  it("rationale references actual evidence descriptions, not just counts", async () => {
    const hyp = await createHypothesis(repo, {
      statement: "I am being excluded from strategic decisions",
    });

    const support = await createEvidence(repo, {
      description: "Not invited to Q3 strategy meeting",
    });
    const contra = await createEvidence(repo, {
      description: "Invited to Q2 strategy meeting",
    });

    await linkEvidence(repo, hyp.id, support.id, "supports");
    await linkEvidence(repo, hyp.id, contra.id, "contradicts");

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(assessment.rationale).toContain(
      "Not invited to Q3 strategy meeting",
    );
    expect(assessment.rationale).toContain("Invited to Q2 strategy meeting");
    expect(assessment.rationale).toContain("I am being excluded");
  });

  // ── Correction: creationRationale preservation ────────────────────

  it("evaluation does not overwrite creationRationale", async () => {
    const originalReason = "I noticed I wasn't invited to three strategy meetings in a row";
    const hyp = await createHypothesis(repo, {
      statement: "My manager is excluding me from strategic decisions",
      creationRationale: originalReason,
    });

    // Link enough evidence to trigger an evaluation with a non-trivial rationale.
    for (let i = 0; i < 3; i++) {
      const e = await createEvidence(repo, {
        description: `Observed support ${i + 1}`,
        sourceType: "observed_outcome",
      });
      await linkEvidence(repo, hyp.id, e.id, "supports");
    }

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    // Simulate the route's update call — only lastAssessmentRationale is set.
    await repo.updateHypothesis(USER_ID, hyp.id, {
      confidence: assessment.confidence,
      lastAssessmentRationale: assessment.rationale,
    });

    const retrieved = await repo.getHypothesis(USER_ID, hyp.id);

    // The creation rationale must be unchanged.
    expect(retrieved!.creationRationale).toBe(originalReason);
    // The assessment rationale must be the evaluation output, not the
    // creation rationale.
    expect(retrieved!.lastAssessmentRationale).toBe(assessment.rationale);
    expect(retrieved!.lastAssessmentRationale).not.toBe(originalReason);
  });

  it("assessment rationale is stored separately from creation rationale", async () => {
    const hyp = await createHypothesis(repo, {
      statement: "Test",
      creationRationale: "Creation reason",
    });

    expect(hyp.creationRationale).toBe("Creation reason");
    expect(hyp.lastAssessmentRationale).toBeNull();

    // After evaluation + update, both fields coexist.
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    await repo.updateHypothesis(USER_ID, hyp.id, {
      confidence: assessment.confidence,
      lastAssessmentRationale: assessment.rationale,
    });

    const retrieved = await repo.getHypothesis(USER_ID, hyp.id);
    expect(retrieved!.creationRationale).toBe("Creation reason");
    expect(retrieved!.lastAssessmentRationale).not.toBeNull();
    expect(retrieved!.lastAssessmentRationale).not.toBe("Creation reason");
  });

  // ── Correction: untested assumptions are explicit ──────────────────

  it("untestedAssumptions is an explicit string array, not a hard-coded number", async () => {
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    // Must be an array of strings, not the number 0.
    expect(Array.isArray(assessment.evidence.untestedAssumptions)).toBe(true);
    // With no evidence, there should be at least one untested assumption
    // (the hypothesis itself is untested).
    expect(assessment.evidence.untestedAssumptions.length).toBeGreaterThan(0);
    expect(typeof assessment.evidence.untestedAssumptions[0]).toBe("string");
  });

  it("untested assumptions identifies lack of observed outcomes", async () => {
    const hyp = await createHypothesis(repo);

    // Link only user_report evidence (no observed outcomes).
    const e = await createEvidence(repo, {
      description: "I feel excluded",
      sourceType: "user_report",
      epistemicType: "interpretation",
    });
    await linkEvidence(repo, hyp.id, e.id, "supports");

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    const untestedText = assessment.evidence.untestedAssumptions.join(" ");
    expect(untestedText).toContain("observed outcomes");
  });

  it("untested assumptions is an empty list when evidence is well-covered", async () => {
    const hyp = await createHypothesis(repo);

    // 4 supporting observed outcomes, 0 contradicting → strong
    // No untested assumptions expected: has observed outcomes,
    // no contradicting, not balanced.
    for (let i = 0; i < 4; i++) {
      const e = await createEvidence(repo, {
        description: `Observed support ${i + 1}`,
        sourceType: "observed_outcome",
      });
      await linkEvidence(repo, hyp.id, e.id, "supports");
    }

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(assessment.evidence.untestedAssumptions).toHaveLength(0);
  });

  it("does not claim observed outcomes automatically outweigh arbitrary contradicting evidence", async () => {
    const hyp = await createHypothesis(repo);

    // 3 supporting observed outcomes vs 3 contradicting interpretations.
    // supporting (3) is NOT > 2 * contradicting (6), so confidence
    // should NOT be "strong" — even though observed outcomes are present.
    for (let i = 0; i < 3; i++) {
      const e = await createEvidence(repo, {
        description: `Observed support ${i + 1}`,
        sourceType: "observed_outcome",
        epistemicType: "fact",
      });
      await linkEvidence(repo, hyp.id, e.id, "supports");
    }
    for (let i = 0; i < 3; i++) {
      const e = await createEvidence(repo, {
        description: `Interpretation contra ${i + 1}`,
        sourceType: "user_report",
        epistemicType: "interpretation",
      });
      await linkEvidence(repo, hyp.id, e.id, "contradicts");
    }

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    // 3 supporting, 3 contradicting → tentative (supporting <= contradicting)
    expect(assessment.confidence).toBe("tentative");
    // The rationale should NOT claim observed outcomes "carry more weight"
    // in a way that overrides the count-based assessment.
    expect(assessment.rationale).not.toContain("carry more weight");
  });
});

// ── No numeric confidence in API/domain types ────────────────────────

describe("Stage C: No numeric confidence", () => {
  it("HypothesisData.confidence is a string union, never a number", () => {
    const hyp: HypothesisData = {
      id: "test",
      userId: "test",
      statement: "Test",
      confidence: "moderate",
      status: "active",
      creationRationale: "Test reason",
      lastAssessmentRationale: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(typeof hyp.confidence).toBe("string");
    expect(["tentative", "moderate", "strong"]).toContain(hyp.confidence);
  });

  it("HypothesisAssessment.confidence is a string union, never a number", async () => {
    const repo = new InMemoryConversationRepository();
    const provider = new StubProvider({
      content: '{"components":[{"type":"fact","text":"t"}],"summary":"t"}',
      structured: null,
    });
    const engine = new CareerReasoningEngine(provider);

    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    expect(typeof assessment.confidence).toBe("string");
    expect(["tentative", "moderate", "strong"]).toContain(
      assessment.confidence,
    );
  });
});
