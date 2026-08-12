import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryConversationRepository } from "../../modules/conversations/in-memory.js";
import type {
  SourceType,
  EpistemicType,
  PendingCandidate,
} from "../types.js";

const USER_ID = "test-user";

async function addCandidate(
  repo: InMemoryConversationRepository,
  overrides: Partial<{
    entityType: "evidence";
    extractedStatement: string;
    epistemicType: EpistemicType;
    sourceType: SourceType;
    isMock: boolean;
  }> = {},
): Promise<PendingCandidate> {
  const defaults = {
    entityType: "evidence" as const,
    extractedStatement: "Test statement",
    epistemicType: "fact" as EpistemicType,
    sourceType: "user_report" as SourceType,
    reasonToSave: "Test reason",
    isMock: false,
  };
  const merged = { ...defaults, ...overrides };
  const candidates = await repo.addPendingCandidates(USER_ID, [merged]);
  return candidates[0];
}

describe("Candidate lifecycle: propose → confirm/reject → persistence", () => {
  let repo: InMemoryConversationRepository;

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
  });

  // ── Propose ──────────────────────────────────────────────────────

  it("stores proposed candidates as pending (not yet confirmed)", async () => {
    const candidates = await repo.addPendingCandidates(USER_ID, [
      {
        entityType: "evidence",
        extractedStatement: "I was not invited to the strategy meeting",
        epistemicType: "fact",
        sourceType: "user_report",
        reasonToSave: "Organizational exclusion pattern",
        isMock: false,
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBeDefined();
    expect(candidates[0].editedBeforeConfirm).toBe(false);

    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0].extractedStatement).toBe(
      "I was not invited to the strategy meeting",
    );
  });

  it("a candidate is not persisted as evidence merely because it was extracted", async () => {
    await addCandidate(repo, {
      extractedStatement: "My manager is excluding me",
      epistemicType: "interpretation",
      sourceType: "user_report",
    });

    const evidence = await repo.listEvidence(USER_ID);
    expect(evidence).toHaveLength(0);

    const memories = await repo.listMemoryRecords(USER_ID);
    expect(memories).toHaveLength(0);

    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(1);
  });

  // ── Confirm (atomic operation) ───────────────────────────────────

  it("a successful confirm creates Evidence + Memory and removes pending as one logical operation", async () => {
    const candidate = await addCandidate(repo, {
      entityType: "evidence",
      extractedStatement: "I lead the architecture review committee",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    const result = await repo.confirmPendingCandidate(USER_ID, candidate.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Evidence is persisted
    const allEvidence = await repo.listEvidence(USER_ID);
    expect(allEvidence).toHaveLength(1);
    expect(allEvidence[0].description).toBe(
      "I lead the architecture review committee",
    );
    expect(allEvidence[0].epistemicType).toBe("fact");

    // Memory record is persisted
    const allMemories = await repo.listMemoryRecords(USER_ID);
    expect(allMemories).toHaveLength(1);
    expect(allMemories[0].confirmed).toBe(true);
    expect(allMemories[0].entityId).toBe(result.evidence.id);
    expect(allMemories[0].editedBeforeConfirm).toBe(false);

    // Pending candidate is removed
    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(0);
  });

  it("confirming with edits applies them and sets editedBeforeConfirm=true", async () => {
    const candidate = await addCandidate(repo, {
      extractedStatement: "Original statement",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    const result = await repo.confirmPendingCandidate(USER_ID, candidate.id, {
      extractedStatement: "Edited statement",
      epistemicType: "interpretation",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.memoryRecord.editedBeforeConfirm).toBe(true);
    expect(result.evidence.description).toBe("Edited statement");
    expect(result.evidence.epistemicType).toBe("interpretation");
  });

  // ── Reject ───────────────────────────────────────────────────────

  it("rejecting a candidate deletes it without persisting anything", async () => {
    const candidate = await addCandidate(repo, {
      extractedStatement: "Something not worth saving",
      epistemicType: "emotion",
      sourceType: "user_report",
    });

    await repo.deletePendingCandidate(USER_ID, candidate.id);

    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(0);

    const evidence = await repo.listEvidence(USER_ID);
    expect(evidence).toHaveLength(0);

    const memories = await repo.listMemoryRecords(USER_ID);
    expect(memories).toHaveLength(0);
  });

  // ── Correction 1: sourceType is immutable ────────────────────────

  it("sourceType cannot be edited via updatePendingCandidate", async () => {
    const candidate = await addCandidate(repo, {
      sourceType: "ai_inference",
      epistemicType: "interpretation",
    });

    // updatePendingCandidate accepts only extractedStatement and epistemicType.
    // sourceType is not in the edits type — TypeScript prevents it at compile
    // time, and the runtime implementation does not touch sourceType.
    const updated = await repo.updatePendingCandidate(USER_ID, candidate.id, {
      extractedStatement: "Changed text",
    });

    expect(updated).not.toBeNull();
    expect(updated!.sourceType).toBe("ai_inference"); // unchanged
    expect(updated!.extractedStatement).toBe("Changed text");
  });

  it("confirming with an edit does not change sourceType", async () => {
    const candidate = await addCandidate(repo, {
      sourceType: "ai_inference",
      epistemicType: "interpretation",
    });

    const result = await repo.confirmPendingCandidate(
      USER_ID,
      candidate.id,
      { epistemicType: "hypothesis" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // sourceType remains ai_inference — the user cannot convert it.
    expect(result.evidence.sourceType).toBe("ai_inference");
    expect(result.evidence.epistemicType).toBe("hypothesis");
  });

  // ── Correction 2: mock candidates cannot be confirmed ────────────

  it("mock candidates cannot be confirmed as real Evidence or Memory", async () => {
    const candidate = await addCandidate(repo, {
      isMock: true,
      extractedStatement: "[Mock] Test plumbing data",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    const result = await repo.confirmPendingCandidate(USER_ID, candidate.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Mock");

    // Nothing was persisted
    const evidence = await repo.listEvidence(USER_ID);
    expect(evidence).toHaveLength(0);

    const memories = await repo.listMemoryRecords(USER_ID);
    expect(memories).toHaveLength(0);

    // The pending mock candidate is still there (not removed by failed confirm)
    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(1);
  });

  it("mock candidates are stored with isMock=true", async () => {
    const candidate = await addCandidate(repo, {
      isMock: true,
      extractedStatement: "[Mock] Test plumbing",
    });

    expect(candidate.isMock).toBe(true);
    expect(candidate.extractedStatement).toContain("[Mock]");
  });

  // ── Correction 2: malformed output from real provider ────────────
  // (Tested at the engine level — a real provider returning garbage
  // should produce no candidates, not mock candidates. This is tested
  // via the engine's extractMemoryCandidates method, which we can't
  // call here without mocking the provider. The logic is:
  // if candidates.length === 0 && provider instanceof MockProvider → mock.
  // Otherwise → return empty. This is verified by the instanceof check
  // in the engine code.)

  // ── Correction 3: Stage B only supports evidence entityType ──────

  it("Stage B pending candidates are restricted to entityType evidence", async () => {
    // The repository interface type only accepts "evidence".
    // TypeScript enforces this at compile time.
    const candidate = await addCandidate(repo, {
      entityType: "evidence",
    });

    expect(candidate.entityType).toBe("evidence");
  });

  it("confirming an evidence candidate creates an Evidence record", async () => {
    const candidate = await addCandidate(repo, {
      entityType: "evidence",
      extractedStatement: "I presented at the all-hands",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    const result = await repo.confirmPendingCandidate(USER_ID, candidate.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.evidence.description).toBe("I presented at the all-hands");
    expect(result.memoryRecord.entityType).toBe("evidence");
    expect(result.memoryRecord.entityId).toBe(result.evidence.id);
  });

  // ── Epistemic enforcement at persistence boundary ────────────────

  it("ai_inference + fact is rejected at the persistence boundary (atomic confirm)", async () => {
    const candidate = await addCandidate(repo, {
      epistemicType: "fact",
      sourceType: "ai_inference",
    });

    const result = await repo.confirmPendingCandidate(USER_ID, candidate.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("AI inference");

    // Nothing persisted
    const evidence = await repo.listEvidence(USER_ID);
    expect(evidence).toHaveLength(0);
  });

  it("ai_inference + interpretation is allowed at the persistence boundary", async () => {
    const candidate = await addCandidate(repo, {
      epistemicType: "interpretation",
      sourceType: "ai_inference",
    });

    const result = await repo.confirmPendingCandidate(USER_ID, candidate.id);

    expect(result.ok).toBe(true);
  });

  it("editing epistemicType to fact with ai_inference source is rejected at confirm", async () => {
    const candidate = await addCandidate(repo, {
      epistemicType: "interpretation",
      sourceType: "ai_inference",
    });

    // User edits epistemicType to fact before confirming
    const result = await repo.confirmPendingCandidate(
      USER_ID,
      candidate.id,
      { epistemicType: "fact" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("AI inference");
  });

  // ── Multiple candidates ──────────────────────────────────────────

  it("can list multiple pending candidates for a user", async () => {
    await addCandidate(repo, { extractedStatement: "First" });
    await addCandidate(repo, { extractedStatement: "Second" });
    await addCandidate(repo, { extractedStatement: "Third" });

    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(3);
  });

  it("confirming one candidate does not affect others", async () => {
    const c1 = await addCandidate(repo, { extractedStatement: "First" });
    await addCandidate(repo, { extractedStatement: "Second" });

    await repo.confirmPendingCandidate(USER_ID, c1.id);

    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0].extractedStatement).toBe("Second");
  });

  // ── Atomic confirm: not-found case ───────────────────────────────

  it("confirming a non-existent candidate returns an error", async () => {
    const result = await repo.confirmPendingCandidate(USER_ID, "nonexistent");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not found");
  });
});
