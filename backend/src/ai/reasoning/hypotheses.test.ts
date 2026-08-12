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
  overrides: Partial<{ statement: string; rationale: string }> = {},
): Promise<HypothesisData> {
  const defaults = {
    statement: "My manager is excluding me from strategic decisions",
    rationale: "Pattern of missed invitations to strategy meetings",
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
      rationale: "Based on missed meeting invitations",
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

  it("observed outcomes carry more weight than user interpretations", async () => {
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
    expect(assessment.rationale).toContain("observed outcome");
    expect(assessment.rationale).toContain("more weight");
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
      rationale: "Test",
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
