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
  ExperimentData,
  ExperimentProposal,
  EpistemicType,
  SourceType,
} from "../types.js";

const USER_ID = "test-user";

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

// ── Experiment creation ──────────────────────────────────────────────

describe("Stage D: Experiment creation", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  it("creates an experiment with proposed status and null outcome", async () => {
    const hyp = await createHypothesis(repo);
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Track meeting invitations for 2 weeks",
      successSignal: "I am invited to at least one strategy meeting",
      reviewDate: "2025-12-01",
    });

    expect(exp.id).toBeDefined();
    expect(exp.status).toBe("proposed");
    expect(exp.outcome).toBeNull();
    expect(exp.outcomeRecordedAt).toBeNull();
    expect(exp.hypothesisId).toBe(hyp.id);
    expect(exp.description).toContain("Track meeting");
    expect(exp.successSignal).toContain("invited");
  });

  it("creating an experiment does not mutate the parent hypothesis", async () => {
    const hyp = await createHypothesis(repo, {
      statement: "Test hypothesis",
      creationRationale: "Original reason",
    });

    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test experiment",
      successSignal: "Some signal",
    });

    const retrieved = await repo.getHypothesis(USER_ID, hyp.id);
    expect(retrieved!.statement).toBe("Test hypothesis");
    expect(retrieved!.creationRationale).toBe("Original reason");
    expect(retrieved!.status).toBe("active");
  });

  it("experiment creation is explicit — recommendExperiment does not persist", async () => {
    const provider = new StubProvider(
      {
        content: '{"components":[{"type":"fact","text":"t"}],"summary":"t"}',
        structured: null,
      },
      true, // isSynthetic = true → uses deterministic fallback
    );
    const engine = new CareerReasoningEngine(provider);
    const hyp = await createHypothesis(repo);

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);
    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    // The proposal is returned but NOT persisted.
    expect(proposal).toBeDefined();
    expect(proposal.hypothesisId).toBe(hyp.id);

    const allExps = await repo.listExperiments(USER_ID);
    expect(allExps).toHaveLength(0);
  });

  it("listExperimentsByHypothesis returns only experiments for that hypothesis", async () => {
    const hyp1 = await createHypothesis(repo, {
      statement: "Hypothesis 1",
    });
    const hyp2 = await createHypothesis(repo, {
      statement: "Hypothesis 2",
    });

    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp1.id,
      description: "Exp for hyp1",
      successSignal: "Signal 1",
    });
    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp2.id,
      description: "Exp for hyp2",
      successSignal: "Signal 2",
    });
    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp1.id,
      description: "Another exp for hyp1",
      successSignal: "Signal 3",
    });

    const hyp1Exps = await repo.listExperimentsByHypothesis(
      USER_ID,
      hyp1.id,
    );
    const hyp2Exps = await repo.listExperimentsByHypothesis(
      USER_ID,
      hyp2.id,
    );

    expect(hyp1Exps).toHaveLength(2);
    expect(hyp2Exps).toHaveLength(1);
    expect(hyp1Exps.every((e) => e.hypothesisId === hyp1.id)).toBe(true);
  });
});

// ── recommendExperiment() with synthetic provider ────────────────────

describe("Stage D: recommendExperiment() — synthetic provider", () => {
  let repo: InMemoryConversationRepository;
  let engine: CareerReasoningEngine;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
    const provider = new StubProvider(
      {
        content: '{"components":[{"type":"fact","text":"t"}],"summary":"t"}',
        structured: null,
      },
      true, // isSynthetic = true
    );
    engine = new CareerReasoningEngine(provider);
  });

  it("returns a proposal with all required fields", async () => {
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    expect(proposal.hypothesisId).toBe(hyp.id);
    expect(proposal.description).toBeTruthy();
    expect(proposal.successSignal).toBeTruthy();
    expect(proposal.reviewDate).toBeTruthy();
    expect(proposal.rationale).toBeTruthy();
  });

  it("proposal success signal references the hypothesis statement", async () => {
    const hyp = await createHypothesis(repo, {
      statement: "I am being excluded from key decisions",
    });
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    // The success signal must be falsifiable — it must reference the
    // hypothesis in a way that could plausibly NOT occur.
    expect(proposal.successSignal).toContain("I am being excluded");
  });

  it("proposal rationale explains why the experiment matters", async () => {
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    // The rationale must explain why — not just what.
    // Invariant #4: explain why, with whom, toward what objective.
    expect(proposal.rationale).toContain("matters");
    // The success signal must be described as falsifiable.
    expect(proposal.rationale).toContain("falsifiable");
  });

  it("proposal notes existing experiments when present", async () => {
    const hyp = await createHypothesis(repo);

    // Create an existing experiment first.
    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "First experiment",
      successSignal: "First signal",
    });

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    expect(proposal.rationale).toContain("existing experiment");
  });

  it("proposal review date is approximately 2 weeks in the future", async () => {
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    const reviewDate = new Date(proposal.reviewDate);
    const now = new Date();
    const diffDays = Math.round(
      (reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Should be approximately 14 days (allow ±2 for timezone).
    expect(diffDays).toBeGreaterThanOrEqual(12);
    expect(diffDays).toBeLessThanOrEqual(16);
  });

  it("deterministic proposal is clearly marked", async () => {
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    // The deterministic fallback must be clearly marked so users
    // know this is not a real AI recommendation.
    expect(proposal.rationale).toContain("[Deterministic");
  });
});

// ── recommendExperiment() — falsifiability ───────────────────────────

describe("Stage D: Experiment falsifiability (Invariant #11)", () => {
  let repo: InMemoryConversationRepository;
  let engine: CareerReasoningEngine;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
    const provider = new StubProvider(
      {
        content: '{"components":[{"type":"fact","text":"t"}],"summary":"t"}',
        structured: null,
      },
      true,
    );
    engine = new CareerReasoningEngine(provider);
  });

  it("every proposal has a success signal that could plausibly not occur", async () => {
    const hyp = await createHypothesis(repo, {
      statement: "My manager is excluding me from strategic decisions",
    });

    // Link some supporting evidence.
    for (let i = 0; i < 3; i++) {
      const e = await createEvidence(repo, {
        description: `Not invited to meeting ${i + 1}`,
        sourceType: "user_report",
      });
      await repo.addHypothesisEvidenceLink(USER_ID, {
        hypothesisId: hyp.id,
        evidenceId: e.id,
        linkType: "supports",
      });
    }

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    // The success signal must be something that could not happen —
    // it must reference the hypothesis and be an observation, not
    // a guaranteed outcome.
    expect(proposal.successSignal.length).toBeGreaterThan(10);
    expect(proposal.successSignal).toContain("confirm");
    expect(proposal.successSignal).toContain("disconfirm");
  });
});

// ── No outcome recording in Stage D ──────────────────────────────────

describe("Stage D: No outcome recording (Stage E not started)", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  it("newly created experiments have null outcome and outcomeRecordedAt", async () => {
    const hyp = await createHypothesis(repo);
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test experiment",
      successSignal: "Test signal",
    });

    expect(exp.outcome).toBeNull();
    expect(exp.outcomeRecordedAt).toBeNull();
  });

  it("ExperimentData type includes outcome fields for forward compatibility", () => {
    const exp: ExperimentData = {
      id: "test",
      userId: "test",
      hypothesisId: "hyp1",
      description: "Test",
      successSignal: "Signal",
      reviewDate: null,
      status: "proposed",
      outcome: null,
      outcomeRecordedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // The fields exist but are null — Stage E will populate them.
    expect(exp.outcome).toBeNull();
    expect(exp.outcomeRecordedAt).toBeNull();
  });
});

// ── Experiment proposal type shape ───────────────────────────────────

describe("Stage D: ExperimentProposal type", () => {
  it("has all required fields", () => {
    const proposal: ExperimentProposal = {
      hypothesisId: "hyp1",
      description: "Test experiment",
      successSignal: "Observable outcome",
      reviewDate: "2025-12-01",
      rationale: "Why this matters",
    };

    expect(proposal.hypothesisId).toBe("hyp1");
    expect(proposal.description).toBeTruthy();
    expect(proposal.successSignal).toBeTruthy();
    expect(proposal.reviewDate).toBeTruthy();
    expect(proposal.rationale).toBeTruthy();
  });
});
