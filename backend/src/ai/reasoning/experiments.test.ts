import { describe, it, expect, beforeEach } from "vitest";
import {
  CareerReasoningEngine,
  RecommendationError,
  OutcomeError,
} from "../reasoning/engine.js";
import { reviewDateSchema } from "../schemas.js";
import type { ExperimentData } from "../types.js";
import { InMemoryConversationRepository } from "../../modules/conversations/in-memory.js";
import { createExperimentSchema } from "../../api/schemas.js";
import type {
  AIProvider,
  ProviderMetadata,
} from "../providers/provider.js";
import type {
  ChatResult,
  HypothesisData,
  ExperimentData,
  ExperimentProposal,
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

/** Build a valid real-provider experiment proposal JSON response. */
function validProposalJson(hypothesisId?: string, reviewDate?: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const obj: Record<string, string> = {
    description: "Track meeting invitations for 2 weeks",
    supportingSignal: "I am explicitly excluded from a strategy meeting",
    contradictingSignal: "I am invited to a strategy meeting",
    inconclusiveSignal: "No strategy meetings occur during the period",
    reviewDate: reviewDate ?? d.toISOString().split("T")[0]!,
    rationale: "This tests whether the exclusion pattern is deliberate",
  };
  if (hypothesisId) obj.hypothesisId = hypothesisId;
  return JSON.stringify(obj);
}

// ── Experiment creation ──────────────────────────────────────────────

describe("Stage D: Experiment creation", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  it("creates an experiment with proposed status, three signals, rationale, and null outcome", async () => {
    const hyp = await createHypothesis(repo);
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Track meeting invitations for 2 weeks",
      supportingSignal: "I am explicitly excluded from a strategy meeting",
      contradictingSignal: "I am invited to a strategy meeting",
      inconclusiveSignal: "No strategy meetings occur during the period",
      rationale: "This tests whether the exclusion pattern is deliberate",
      reviewDate: "2025-12-01",
    });

    expect(exp.id).toBeDefined();
    expect(exp.status).toBe("proposed");
    expect(exp.outcome).toBeNull();
    expect(exp.outcomeRecordedAt).toBeNull();
    expect(exp.hypothesisId).toBe(hyp.id);
    expect(exp.supportingSignal).toContain("excluded");
    expect(exp.contradictingSignal).toContain("invited");
    expect(exp.inconclusiveSignal).toContain("No strategy");
    expect(exp.rationale).toContain("deliberate");
  });

  it("creating an experiment does not mutate the parent hypothesis", async () => {
    const hyp = await createHypothesis(repo, {
      statement: "Test hypothesis",
      creationRationale: "Original reason",
    });

    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test experiment",
      supportingSignal: "Supporting obs",
      contradictingSignal: "Contradicting obs",
      inconclusiveSignal: "Inconclusive case",
      rationale: "Why it matters",
    });

    const retrieved = await repo.getHypothesis(USER_ID, hyp.id);
    expect(retrieved!.statement).toBe("Test hypothesis");
    expect(retrieved!.creationRationale).toBe("Original reason");
    expect(retrieved!.status).toBe("active");
  });

  it("recommendExperiment does not persist anything until explicit user creation", async () => {
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

  it("accepted proposal preserves its rationale on creation", async () => {
    const provider = new StubProvider(
      {
        content: '{"components":[{"type":"fact","text":"t"}],"summary":"t"}',
        structured: null,
      },
      true,
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

    // User accepts the proposal — create with the proposal's rationale.
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: proposal.hypothesisId,
      description: proposal.description,
      supportingSignal: proposal.supportingSignal,
      contradictingSignal: proposal.contradictingSignal,
      inconclusiveSignal: proposal.inconclusiveSignal,
      rationale: proposal.rationale,
      reviewDate: proposal.reviewDate,
    });

    expect(exp.rationale).toBe(proposal.rationale);
    expect(exp.rationale).toContain("[Deterministic");
  });

  it("manually created experiment requires a rationale", async () => {
    const hyp = await createHypothesis(repo);
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Manual experiment",
      supportingSignal: "Supporting",
      contradictingSignal: "Contradicting",
      inconclusiveSignal: "Inconclusive",
      rationale: "I want to test this because it affects my career path",
    });

    expect(exp.rationale).toBe("I want to test this because it affects my career path");
  });

  it("listExperimentsByHypothesis returns only experiments for that hypothesis", async () => {
    const hyp1 = await createHypothesis(repo, { statement: "H1" });
    const hyp2 = await createHypothesis(repo, { statement: "H2" });

    const mk = (hid: string, d: string) =>
      repo.createExperiment(USER_ID, {
        hypothesisId: hid,
        description: d,
        supportingSignal: "S",
        contradictingSignal: "C",
        inconclusiveSignal: "I",
        rationale: "R",
      });

    await mk(hyp1.id, "Exp for hyp1");
    await mk(hyp2.id, "Exp for hyp2");
    await mk(hyp1.id, "Another exp for hyp1");

    const hyp1Exps = await repo.listExperimentsByHypothesis(USER_ID, hyp1.id);
    const hyp2Exps = await repo.listExperimentsByHypothesis(USER_ID, hyp2.id);

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
      true,
    );
    engine = new CareerReasoningEngine(provider);
  });

  it("returns a proposal with all required fields including three signals", async () => {
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
    expect(proposal.supportingSignal).toBeTruthy();
    expect(proposal.contradictingSignal).toBeTruthy();
    expect(proposal.inconclusiveSignal).toBeTruthy();
    expect(proposal.reviewDate).toBeTruthy();
    expect(proposal.rationale).toBeTruthy();
  });

  it("proposal contains genuinely different supporting and contradicting signals", async () => {
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      existing,
    );

    // The supporting and contradicting signals must not be the same
    // text, and they must describe genuinely different outcomes.
    expect(proposal.supportingSignal).not.toBe(proposal.contradictingSignal);
    // Supporting should describe exclusion, contradicting should
    // describe inclusion — opposite outcomes.
    expect(proposal.supportingSignal.toLowerCase()).toContain("excluded");
    expect(proposal.contradictingSignal.toLowerCase()).toContain("included");
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

    expect(proposal.rationale).toContain("matters");
    expect(proposal.rationale).toContain("falsifiable");
  });

  it("proposal notes existing experiments when present", async () => {
    const hyp = await createHypothesis(repo);

    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "First experiment",
      supportingSignal: "S",
      contradictingSignal: "C",
      inconclusiveSignal: "I",
      rationale: "R",
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

    expect(proposal.rationale).toContain("[Deterministic");
  });
});

// ── recommendExperiment() — real provider hardening ──────────────────

describe("Stage D: recommendExperiment() — real provider hardening", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  it("malformed real-provider output returns a controlled error, not deterministic content", async () => {
    const provider = new StubProvider(
      {
        content: "This is not JSON at all.",
        structured: null,
      },
      false, // isSynthetic = false → real provider path
    );
    const engine = new CareerReasoningEngine(provider);
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    await expect(
      engine.recommendExperiment(hyp, assessment, existing),
    ).rejects.toThrow(RecommendationError);
  });

  it("real-provider output missing required fields returns a controlled error", async () => {
    const provider = new StubProvider(
      {
        content: JSON.stringify({ description: "Missing other fields" }),
        structured: null,
      },
      false,
    );
    const engine = new CareerReasoningEngine(provider);
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);
    const existing = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);

    await expect(
      engine.recommendExperiment(hyp, assessment, existing),
    ).rejects.toThrow(RecommendationError);
  });

  it("valid real-provider output produces a proposal with three signals", async () => {
    const provider = new StubProvider(
      {
        content: validProposalJson(),
        structured: null,
      },
      false,
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

    expect(proposal.hypothesisId).toBe(hyp.id);
    expect(proposal.supportingSignal).toContain("excluded");
    expect(proposal.contradictingSignal).toContain("invited");
    expect(proposal.inconclusiveSignal).toContain("No strategy");
  });

  it("structured output is used when content is empty", async () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const provider = new StubProvider(
      {
        content: "",
        structured: {
          description: "Structured experiment",
          supportingSignal: "Struct support",
          contradictingSignal: "Struct contradict",
          inconclusiveSignal: "Struct inconclusive",
          reviewDate: d.toISOString().split("T")[0]!,
          rationale: "Struct rationale",
        },
      },
      false,
    );
    const engine = new CareerReasoningEngine(provider);
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      null,
    );

    expect(proposal.description).toBe("Structured experiment");
    expect(proposal.supportingSignal).toBe("Struct support");
  });
});

// ── Hypothesis identity protection ───────────────────────────────────

describe("Stage D: Hypothesis identity protection (Correction #4)", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  it("mismatched provider hypothesisId cannot change the authoritative hypothesis", async () => {
    const provider = new StubProvider(
      {
        content: validProposalJson("wrong-hypothesis-id"),
        structured: null,
      },
      false,
    );
    const engine = new CareerReasoningEngine(provider);
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    await expect(
      engine.recommendExperiment(hyp, assessment, null),
    ).rejects.toThrow(RecommendationError);
  });

  it("correct hypothesisId from model is accepted and overridden by authoritative id", async () => {
    const hyp = await createHypothesis(repo);
    const provider = new StubProvider(
      {
        content: validProposalJson(hyp.id),
        structured: null,
      },
      false,
    );
    const engine = new CareerReasoningEngine(provider);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    const proposal = await engine.recommendExperiment(
      hyp,
      assessment,
      null,
    );

    // hypothesisId is always set from the authoritative argument.
    expect(proposal.hypothesisId).toBe(hyp.id);
  });
});

// ── Review date validation — shared domain schema ───────────────────

describe("Stage D: Review date validation — shared domain schema", () => {
  const validBase = {
    hypothesisId: "hyp1",
    description: "Test",
    supportingSignal: "S",
    contradictingSignal: "C",
    inconclusiveSignal: "I",
    rationale: "R",
  };

  it("reviewDateSchema accepts a date 2 weeks in the future", () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const result = reviewDateSchema.safeParse(d.toISOString().split("T")[0]!);
    expect(result.success).toBe(true);
  });

  it("reviewDateSchema rejects an invalid date string", () => {
    const result = reviewDateSchema.safeParse("not-a-date");
    expect(result.success).toBe(false);
  });

  it("reviewDateSchema rejects a past date", () => {
    const result = reviewDateSchema.safeParse("2020-01-01");
    expect(result.success).toBe(false);
  });

  it("reviewDateSchema rejects a non-ISO parseable date string like 'August 30, 2026'", () => {
    const result = reviewDateSchema.safeParse("August 30, 2026");
    expect(result.success).toBe(false);
  });

  it("reviewDateSchema rejects a datetime string (YYYY-MM-DDTHH:mm:ssZ)", () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const result = reviewDateSchema.safeParse(d.toISOString());
    expect(result.success).toBe(false);
  });

  it("reviewDateSchema rejects an invalid calendar date (Feb 31)", () => {
    const result = reviewDateSchema.safeParse("2026-02-31");
    expect(result.success).toBe(false);
  });

  it("reviewDateSchema rejects a date less than 1 week in the future", () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const result = reviewDateSchema.safeParse(d.toISOString().split("T")[0]!);
    expect(result.success).toBe(false);
  });

  it("reviewDateSchema rejects a date more than 6 weeks in the future", () => {
    const d = new Date();
    d.setDate(d.getDate() + 50);
    const result = reviewDateSchema.safeParse(d.toISOString().split("T")[0]!);
    expect(result.success).toBe(false);
  });

  // ── Manual creation via API schema ─────────────────────────────

  it("manual creation accepts a valid future review date", () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const result = createExperimentSchema.safeParse({
      ...validBase,
      reviewDate: d.toISOString().split("T")[0]!,
    });
    expect(result.success).toBe(true);
  });

  it("manual creation rejects a malformed review date", () => {
    const result = createExperimentSchema.safeParse({
      ...validBase,
      reviewDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("manual creation rejects a past review date", () => {
    const result = createExperimentSchema.safeParse({
      ...validBase,
      reviewDate: "2020-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("manual creation rejects a date less than 1 week in the future", () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const result = createExperimentSchema.safeParse({
      ...validBase,
      reviewDate: d.toISOString().split("T")[0]!,
    });
    expect(result.success).toBe(false);
  });

  it("manual creation rejects a date more than 6 weeks in the future", () => {
    const d = new Date();
    d.setDate(d.getDate() + 50);
    const result = createExperimentSchema.safeParse({
      ...validBase,
      reviewDate: d.toISOString().split("T")[0]!,
    });
    expect(result.success).toBe(false);
  });

  it("manual creation rejects a missing review date", () => {
    const result = createExperimentSchema.safeParse(validBase);
    expect(result.success).toBe(false);
  });

  it("manual creation rejects a non-ISO parseable date string", () => {
    const result = createExperimentSchema.safeParse({
      ...validBase,
      reviewDate: "August 30, 2026",
    });
    expect(result.success).toBe(false);
  });

  it("manual creation rejects a datetime string", () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    const result = createExperimentSchema.safeParse({
      ...validBase,
      reviewDate: d.toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("real-provider proposal with past review date is rejected", async () => {
    const repo = new InMemoryConversationRepository();
    const provider = new StubProvider(
      {
        content: validProposalJson(undefined, "2020-01-01"),
        structured: null,
      },
      false,
    );
    const engine = new CareerReasoningEngine(provider);
    const hyp = await createHypothesis(repo);
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    const assessment = await engine.evaluateHypothesis(hyp, links);

    await expect(
      engine.recommendExperiment(hyp, assessment, null),
    ).rejects.toThrow(RecommendationError);
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
      supportingSignal: "S",
      contradictingSignal: "C",
      inconclusiveSignal: "I",
      rationale: "R",
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
      supportingSignal: "S",
      contradictingSignal: "C",
      inconclusiveSignal: "I",
      rationale: "R",
      reviewDate: null,
      status: "proposed",
      outcome: null,
      outcomeRecordedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(exp.outcome).toBeNull();
    expect(exp.outcomeRecordedAt).toBeNull();
  });
});

// ── Experiment proposal type shape ───────────────────────────────────

describe("Stage D: ExperimentProposal type", () => {
  it("has all required fields including three signals", () => {
    const proposal: ExperimentProposal = {
      hypothesisId: "hyp1",
      description: "Test experiment",
      supportingSignal: "Supporting observation",
      contradictingSignal: "Contradicting observation",
      inconclusiveSignal: "Inconclusive circumstance",
      reviewDate: "2025-12-01",
      rationale: "Why this matters",
    };

    expect(proposal.hypothesisId).toBe("hyp1");
    expect(proposal.supportingSignal).toBeTruthy();
    expect(proposal.contradictingSignal).toBeTruthy();
    expect(proposal.inconclusiveSignal).toBeTruthy();
    expect(proposal.rationale).toBeTruthy();
  });
});

// ── Stage E: Experiment outcome recording ──────────────────────────────

describe("Stage E: recordExperimentOutcome()", () => {
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

  async function createExperiment(
    repo: InMemoryConversationRepository,
  ): Promise<ExperimentData> {
    const hyp = await createHypothesis(repo);
    return repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Track meeting invitations for 2 weeks",
      supportingSignal: "I am explicitly excluded from a strategy meeting",
      contradictingSignal: "I am invited to a strategy meeting",
      inconclusiveSignal: "No strategy meetings occur during the period",
      rationale: "This tests whether the exclusion pattern is deliberate",
    });
  }

  it("records a supporting outcome, creates observed_outcome evidence, marks experiment completed", async () => {
    const exp = await createExperiment(repo);
    const result = await engine.recordExperimentOutcome(
      exp,
      "I was excluded from the Q3 strategy meeting on Aug 15",
      "supports",
      repo,
      USER_ID,
    );

    expect(result.classification).toBe("supports");
    expect(result.experiment.outcome).toBe(
      "I was excluded from the Q3 strategy meeting on Aug 15",
    );
    expect(result.experiment.outcomeClassification).toBe("supports");
    expect(result.experiment.status).toBe("completed");
    expect(result.experiment.outcomeRecordedAt).not.toBeNull();

    // observed_outcome evidence is created for supports
    expect(result.evidence).not.toBeNull();
    expect(result.evidence!.sourceType).toBe("observed_outcome");
    expect(result.evidence!.epistemicType).toBe("fact");
    expect(result.evidence!.description).toBe(
      "I was excluded from the Q3 strategy meeting on Aug 15",
    );
    expect(result.experiment.outcomeEvidenceId).toBe(result.evidence!.id);
  });

  it("records a contradicting outcome, creates observed_outcome evidence", async () => {
    const exp = await createExperiment(repo);
    const result = await engine.recordExperimentOutcome(
      exp,
      "I was invited to present at the strategy meeting",
      "contradicts",
      repo,
      USER_ID,
    );

    expect(result.classification).toBe("contradicts");
    expect(result.experiment.status).toBe("completed");
    expect(result.evidence).not.toBeNull();
    expect(result.evidence!.sourceType).toBe("observed_outcome");
    expect(result.evidence!.epistemicType).toBe("fact");
    expect(result.experiment.outcomeEvidenceId).toBe(result.evidence!.id);
  });

  it("records an inconclusive outcome without creating evidence", async () => {
    const exp = await createExperiment(repo);
    const result = await engine.recordExperimentOutcome(
      exp,
      "No strategy meetings were held during the 2-week period",
      "inconclusive",
      repo,
      USER_ID,
    );

    expect(result.classification).toBe("inconclusive");
    expect(result.experiment.status).toBe("completed");
    expect(result.experiment.outcome).toBe(
      "No strategy meetings were held during the 2-week period",
    );
    // No evidence created for inconclusive outcomes
    expect(result.evidence).toBeNull();
    expect(result.experiment.outcomeEvidenceId).toBeNull();
  });

  it("preserves the raw outcome text verbatim in the evidence description", async () => {
    const exp = await createExperiment(repo);
    const rawText =
      "On Aug 12, I was NOT invited to the strategy meeting. " +
      "My colleague Jane was invited instead. This felt deliberate.";
    const result = await engine.recordExperimentOutcome(
      exp,
      rawText,
      "supports",
      repo,
      USER_ID,
    );

    expect(result.experiment.outcome).toBe(rawText);
    expect(result.evidence!.description).toBe(rawText);
  });

  it("rejects double-recording an outcome on the same experiment", async () => {
    const exp = await createExperiment(repo);
    await engine.recordExperimentOutcome(
      exp,
      "First outcome",
      "supports",
      repo,
      USER_ID,
    );

    // Attempt to record again
    await expect(
      engine.recordExperimentOutcome(
        exp,
        "Second outcome",
        "contradicts",
        repo,
        USER_ID,
      ),
    ).rejects.toThrow(OutcomeError);
  });

  it("does not reassess the hypothesis (Stage E stops before reassessment)", async () => {
    const hyp = await createHypothesis(repo);
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test experiment",
      supportingSignal: "Supporting obs",
      contradictingSignal: "Contradicting obs",
      inconclusiveSignal: "Inconclusive case",
      rationale: "Why it matters",
    });

    await engine.recordExperimentOutcome(
      exp,
      "Supporting outcome observed",
      "supports",
      repo,
      USER_ID,
    );

    // The hypothesis status and confidence should NOT have changed.
    // Stage E records the outcome and stops. Stage F does reassessment.
    const retrieved = await repo.getHypothesis(USER_ID, hyp.id);
    expect(retrieved!.status).toBe("active");
    // No new evidence links should have been created by Stage E
    // (the evidence exists but is not yet linked to the hypothesis).
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    expect(links).toHaveLength(0);
  });

  it("observed_outcome evidence has epistemic_type fact (not inference)", async () => {
    const exp = await createExperiment(repo);
    const result = await engine.recordExperimentOutcome(
      exp,
      "Observed: excluded from meeting",
      "supports",
      repo,
      USER_ID,
    );

    // Invariant #2: observed_outcome is the one source type that
    // can carry fact-grade epistemic status.
    expect(result.evidence!.epistemicType).toBe("fact");
    expect(result.evidence!.sourceType).toBe("observed_outcome");
  });
});
