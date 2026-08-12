/**
 * Shared repository contract tests.
 *
 * This suite runs against any ConversationRepository implementation.
 * Both InMemoryConversationRepository and SupabaseConversationRepository
 * must pass these tests.
 *
 * Usage:
 *   repositoryContractTests(() => new InMemoryConversationRepository())
 *   repositoryContractTests(() => new SupabaseConversationRepository(...))
 */
import { it, expect, beforeEach } from "vitest";
import type { ConversationRepository } from "./repository.js";

export function repositoryContractTests(
  createRepo: () => ConversationRepository,
  setup?: { beforeEach?: (repo: ConversationRepository) => Promise<void> },
) {
  const USER_ID = "test-user-contract";

  let repo: ConversationRepository;

  beforeEach(async () => {
    repo = createRepo();
    if (setup?.beforeEach) {
      await setup.beforeEach(repo);
    }
  });

  // ── Career context ──────────────────────────────────────────────

  it("saves and reads career context", async () => {
    const ctx = {
      currentRole: "Senior Engineer",
      yearsExperience: 8,
      targetOutcome: "Become a Staff Engineer",
      whyNotYet: "Need more architecture experience",
    };
    await repo.saveCareerContext(USER_ID, ctx);
    const read = await repo.getCareerContext(USER_ID);
    expect(read).not.toBeNull();
    expect(read!.currentRole).toBe("Senior Engineer");
    expect(read!.yearsExperience).toBe(8);
    expect(read!.targetOutcome).toBe("Become a Staff Engineer");
    expect(read!.whyNotYet).toBe("Need more architecture experience");
  });

  it("returns null when no career context exists", async () => {
    const read = await repo.getCareerContext(USER_ID);
    expect(read).toBeNull();
  });

  it("updates career context on re-save", async () => {
    await repo.saveCareerContext(USER_ID, {
      currentRole: "Engineer",
      yearsExperience: 5,
      targetOutcome: "Promotion",
      whyNotYet: "Skills",
    });
    await repo.saveCareerContext(USER_ID, {
      currentRole: "Senior Engineer",
      yearsExperience: 6,
      targetOutcome: "Staff",
      whyNotYet: "Architecture",
    });
    const read = await repo.getCareerContext(USER_ID);
    expect(read!.currentRole).toBe("Senior Engineer");
    expect(read!.yearsExperience).toBe(6);
  });

  // ── Conversations ───────────────────────────────────────────────

  it("creates and retrieves a conversation", async () => {
    const conv = await repo.createConversation(USER_ID, "Test Chat");
    expect(conv.id).toBeTruthy();
    expect(conv.title).toBe("Test Chat");
    const retrieved = await repo.getConversation(USER_ID, conv.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(conv.id);
  });

  it("lists conversations for a user", async () => {
    await repo.createConversation(USER_ID, "Chat 1");
    await repo.createConversation(USER_ID, "Chat 2");
    const list = await repo.listConversations(USER_ID);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("returns null for a non-existent conversation", async () => {
    const retrieved = await repo.getConversation(USER_ID, "nonexistent");
    expect(retrieved).toBeNull();
  });

  // ── Messages ────────────────────────────────────────────────────

  it("adds and lists messages in a conversation", async () => {
    const conv = await repo.createConversation(USER_ID);
    await repo.addMessage(conv.id, "user", "Hello");
    await repo.addMessage(conv.id, "assistant", "Hi there", "coach");
    const msgs = await repo.listMessages(conv.id);
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].reasoningLens).toBe("coach");
  });

  it("includes messages in conversation retrieval", async () => {
    const conv = await repo.createConversation(USER_ID);
    await repo.addMessage(conv.id, "user", "Test message");
    const retrieved = await repo.getConversation(USER_ID, conv.id);
    expect(retrieved!.messages.length).toBe(1);
    expect(retrieved!.messages[0].content).toBe("Test message");
  });

  // ── Pending candidates ──────────────────────────────────────────

  it("adds and lists pending candidates", async () => {
    const candidates = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "I led a team of 5",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Leadership evidence",
        isMock: false,
      },
    ]);
    expect(candidates.length).toBe(1);
    expect(candidates[0].id).toBeTruthy();

    const list = await repo.listPendingCandidates(USER_ID);
    expect(list.length).toBe(1);
    expect(list[0].extractedStatement).toBe("I led a team of 5");
  });

  it("gets a single pending candidate", async () => {
    const [cand] = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "Test candidate",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Test",
        isMock: false,
      },
    ]);
    const fetched = await repo.getPendingCandidate(USER_ID, cand.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(cand.id);
  });

  it("updates a pending candidate and marks as edited", async () => {
    const [cand] = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "Original",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Test",
        isMock: false,
      },
    ]);
    const updated = await repo.updatePendingCandidate(USER_ID, cand.id, {
      extractedStatement: "Updated statement",
      epistemicType: "interpretation",
    });
    expect(updated).not.toBeNull();
    expect(updated!.extractedStatement).toBe("Updated statement");
    expect(updated!.epistemicType).toBe("interpretation");
    expect(updated!.editedBeforeConfirm).toBe(true);
  });

  it("deletes a pending candidate", async () => {
    const [cand] = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "To delete",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Test",
        isMock: false,
      },
    ]);
    await repo.deletePendingCandidate(USER_ID, cand.id);
    const fetched = await repo.getPendingCandidate(USER_ID, cand.id);
    expect(fetched).toBeNull();
  });

  // ── Atomic candidate confirmation ───────────────────────────────

  it("confirms a pending candidate atomically (creates evidence + memory, removes candidate)", async () => {
    const [cand] = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "I was promoted to Senior Engineer",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Career milestone",
        isMock: false,
      },
    ]);

    const result = await repo.confirmPendingCandidate(USER_ID, cand.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.id).toBeTruthy();
      expect(result.evidence.sourceType).toBe("user_report");
      expect(result.evidence.epistemicType).toBe("fact");
      expect(result.memoryRecord.id).toBeTruthy();
      expect(result.memoryRecord.entityId).toBe(result.evidence.id);
      expect(result.memoryRecord.confirmed).toBe(true);
    }

    // Candidate should be removed
    const fetched = await repo.getPendingCandidate(USER_ID, cand.id);
    expect(fetched).toBeNull();

    // Evidence should be in the evidence list
    const evidence = await repo.listEvidence(USER_ID);
    expect(evidence.length).toBe(1);
    expect(evidence[0].description).toBe("I was promoted to Senior Engineer");

    // Memory record should be in the memory list
    const memories = await repo.listMemoryRecords(USER_ID);
    expect(memories.length).toBe(1);
  });

  it("rejects mock candidates at the persistence boundary", async () => {
    const [cand] = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "[Mock] Test",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Test",
        isMock: true,
      },
    ]);
    const result = await repo.confirmPendingCandidate(USER_ID, cand.id);
    expect(result.ok).toBe(false);
  });

  it("rejects ai_inference + fact epistemic pair at confirmation", async () => {
    const [cand] = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "AI thinks I'm ready",
        epistemicType: "fact",
        sourceType: "ai_inference",
        reasonToSave: "Test",
        isMock: false,
      },
    ]);
    const result = await repo.confirmPendingCandidate(USER_ID, cand.id);
    expect(result.ok).toBe(false);
  });

  // ── Evidence ────────────────────────────────────────────────────

  it("creates and retrieves evidence", async () => {
    const ev = await repo.addEvidence(USER_ID, {
      sourceType: "user_report",
      epistemicType: "fact",
      description: "I shipped a major project",
    });
    expect(ev.id).toBeTruthy();
    const fetched = await repo.getEvidence(USER_ID, ev.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.description).toBe("I shipped a major project");
  });

  it("lists evidence for a user", async () => {
    await repo.addEvidence(USER_ID, {
      sourceType: "user_report",
      epistemicType: "fact",
      description: "Evidence 1",
    });
    await repo.addEvidence(USER_ID, {
      sourceType: "user_report",
      epistemicType: "interpretation",
      description: "Evidence 2",
    });
    const list = await repo.listEvidence(USER_ID);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  // ── Hypotheses ──────────────────────────────────────────────────

  it("creates a hypothesis with tentative confidence and active status", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "I am ready for a Staff role",
      creationRationale: "Based on 8 years of experience",
    });
    expect(hyp.id).toBeTruthy();
    expect(hyp.confidence).toBe("tentative");
    expect(hyp.status).toBe("active");
    expect(hyp.creationRationale).toBe("Based on 8 years of experience");
    expect(hyp.lastAssessmentRationale).toBeNull();
  });

  it("retrieves and lists hypotheses", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test hypothesis",
      creationRationale: "Test rationale",
    });
    const fetched = await repo.getHypothesis(USER_ID, hyp.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.statement).toBe("Test hypothesis");

    const list = await repo.listHypotheses(USER_ID);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it("updates hypothesis confidence and assessment rationale", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const updated = await repo.updateHypothesis(USER_ID, hyp.id, {
      confidence: "moderate",
      lastAssessmentRationale: "Two supporting evidence items found",
    });
    expect(updated).not.toBeNull();
    expect(updated!.confidence).toBe("moderate");
    expect(updated!.lastAssessmentRationale).toBe("Two supporting evidence items found");
    // creationRationale must never be overwritten
    expect(updated!.creationRationale).toBe("Test");
  });

  // ── Evidence→Hypothesis links ───────────────────────────────────

  it("creates evidence-hypothesis links and retrieves them with evidence", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test hypothesis",
      creationRationale: "Test",
    });
    const ev = await repo.addEvidence(USER_ID, {
      sourceType: "user_report",
      epistemicType: "fact",
      description: "Supporting evidence",
    });
    await repo.addHypothesisEvidenceLink(USER_ID, {
      hypothesisId: hyp.id,
      evidenceId: ev.id,
      linkType: "supports",
    });

    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    expect(links.length).toBe(1);
    expect(links[0].link.linkType).toBe("supports");
    expect(links[0].evidence.description).toBe("Supporting evidence");
  });

  it("upserts evidence-hypothesis links (same pair updates linkType)", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const ev = await repo.addEvidence(USER_ID, {
      sourceType: "user_report",
      epistemicType: "fact",
      description: "Test evidence",
    });
    await repo.addHypothesisEvidenceLink(USER_ID, {
      hypothesisId: hyp.id,
      evidenceId: ev.id,
      linkType: "supports",
    });
    await repo.addHypothesisEvidenceLink(USER_ID, {
      hypothesisId: hyp.id,
      evidenceId: ev.id,
      linkType: "contradicts",
    });
    const links = await repo.getHypothesisEvidenceLinks(USER_ID, hyp.id);
    expect(links.length).toBe(1);
    expect(links[0].link.linkType).toBe("contradicts");
  });

  // ── Experiments ─────────────────────────────────────────────────

  it("creates an experiment tied to a hypothesis", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Ask for stretch assignment",
      supportingSignal: "Manager says yes",
      contradictingSignal: "Manager says no",
      inconclusiveSignal: "Manager says maybe later",
      rationale: "To test if my manager supports my growth",
      reviewDate: "2026-09-01",
    });
    expect(exp.id).toBeTruthy();
    expect(exp.status).toBe("proposed");
    expect(exp.outcome).toBeNull();
    expect(exp.outcomeClassification).toBeNull();
    expect(exp.reviewedAt).toBeNull();
  });

  it("lists experiments by hypothesis", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Experiment 1",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });
    const list = await repo.listExperimentsByHypothesis(USER_ID, hyp.id);
    expect(list.length).toBe(1);
  });

  // ── Outcome recording (Stage E) ─────────────────────────────────

  it("records a supports outcome atomically with observed_outcome evidence", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test experiment",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });

    const result = await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "My manager gave me a stretch assignment",
      outcomeClassification: "supports",
      observedFact: "I was assigned to lead the platform redesign",
    });

    expect(result).not.toBeNull();
    expect(result!.experiment.outcome).toBe("My manager gave me a stretch assignment");
    expect(result!.experiment.outcomeClassification).toBe("supports");
    expect(result!.experiment.status).toBe("completed");
    expect(result!.evidence).not.toBeNull();
    expect(result!.evidence!.sourceType).toBe("observed_outcome");
    expect(result!.evidence!.epistemicType).toBe("fact");
    expect(result!.evidence!.description).toBe("I was assigned to lead the platform redesign");
    expect(result!.experiment.outcomeEvidenceId).toBe(result!.evidence!.id);
  });

  it("records a contradicts outcome atomically", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });

    const result = await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Manager said no",
      outcomeClassification: "contradicts",
      observedFact: "Manager declined my request for a stretch assignment",
    });

    expect(result).not.toBeNull();
    expect(result!.experiment.outcomeClassification).toBe("contradicts");
    expect(result!.evidence).not.toBeNull();
    expect(result!.evidence!.sourceType).toBe("observed_outcome");
  });

  it("records an inconclusive outcome without creating evidence", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });

    const result = await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "The meeting was cancelled",
      outcomeClassification: "inconclusive",
      observedFact: null,
    });

    expect(result).not.toBeNull();
    expect(result!.experiment.outcomeClassification).toBe("inconclusive");
    expect(result!.evidence).toBeNull();
    expect(result!.experiment.outcomeEvidenceId).toBeNull();
  });

  it("prevents recording an outcome on an experiment that already has one", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });

    await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "First outcome",
      outcomeClassification: "supports",
      observedFact: "First fact",
    });

    const second = await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Second outcome",
      outcomeClassification: "contradicts",
      observedFact: "Second fact",
    });

    expect(second).toBeNull();
  });

  // ── Stage F: Experiment outcome review ──────────────────────────

  it("applies a supports review atomically (creates link, updates hypothesis)", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "I am ready for Staff",
      creationRationale: "Based on experience",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Ask for stretch assignment",
      supportingSignal: "Manager says yes",
      contradictingSignal: "Manager says no",
      inconclusiveSignal: "Maybe later",
      rationale: "Test management support",
    });
    await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Manager said yes",
      outcomeClassification: "supports",
      observedFact: "I was assigned to lead the redesign",
    });

    const result = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
      newConfidence: "moderate",
      newAssessmentRationale: "One supporting observed outcome",
    });

    expect(result).not.toBeNull();
    expect(result!.link).not.toBeNull();
    expect(result!.link!.linkType).toBe("supports");
    expect(result!.link!.hypothesisId).toBe(hyp.id);
    expect(result!.hypothesis.confidence).toBe("moderate");
    expect(result!.hypothesis.lastAssessmentRationale).toBe("One supporting observed outcome");
    expect(result!.experiment.reviewedAt).not.toBeNull();
  });

  it("applies a contradicts review atomically", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });
    await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Manager said no",
      outcomeClassification: "contradicts",
      observedFact: "Request was declined",
    });

    const result = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
      newConfidence: "tentative",
      newAssessmentRationale: "One contradicting observed outcome",
    });

    expect(result).not.toBeNull();
    expect(result!.link!.linkType).toBe("contradicts");
  });

  it("applies an inconclusive review without creating a link", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });
    await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Meeting cancelled",
      outcomeClassification: "inconclusive",
      observedFact: null,
    });

    const result = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
      newConfidence: "tentative",
      newAssessmentRationale: "Inconclusive - no change",
    });

    expect(result).not.toBeNull();
    expect(result!.link).toBeNull();
    expect(result!.experiment.reviewedAt).not.toBeNull();
  });

  it("prevents reviewing an experiment twice (idempotency)", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });
    await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Yes",
      outcomeClassification: "supports",
      observedFact: "Fact",
    });

    await repo.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
      newConfidence: "moderate",
      newAssessmentRationale: "First review",
    });

    const second = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
      newConfidence: "strong",
      newAssessmentRationale: "Should not be applied",
    });

    expect(second).toBeNull();
  });

  it("does not overwrite creationRationale during review", async () => {
    const hyp = await repo.createHypothesis(USER_ID, {
      statement: "Test hypothesis",
      creationRationale: "Original creation rationale",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });
    await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Yes",
      outcomeClassification: "supports",
      observedFact: "Fact",
    });

    const result = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
      newConfidence: "moderate",
      newAssessmentRationale: "New assessment rationale",
    });

    expect(result!.hypothesis.creationRationale).toBe("Original creation rationale");
    expect(result!.hypothesis.lastAssessmentRationale).toBe("New assessment rationale");
  });

  it("derives hypothesisId from the stored experiment, not the caller", async () => {
    const hyp1 = await repo.createHypothesis(USER_ID, {
      statement: "Hypothesis A",
      creationRationale: "Test",
    });
    const hyp2 = await repo.createHypothesis(USER_ID, {
      statement: "Hypothesis B",
      creationRationale: "Test",
    });
    const exp = await repo.createExperiment(USER_ID, {
      hypothesisId: hyp1.id,
      description: "Test",
      supportingSignal: "Yes",
      contradictingSignal: "No",
      inconclusiveSignal: "Maybe",
      rationale: "Test",
    });
    await repo.recordExperimentOutcomeAtomic(USER_ID, exp.id, {
      outcome: "Yes",
      outcomeClassification: "supports",
      observedFact: "Fact",
    });

    const result = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, exp.id, {
      newConfidence: "moderate",
      newAssessmentRationale: "Test",
    });

    // Link must go to hyp1 (the experiment's hypothesis), not hyp2
    expect(result!.link!.hypothesisId).toBe(hyp1.id);
    expect(result!.link!.hypothesisId).not.toBe(hyp2.id);
  });
}
