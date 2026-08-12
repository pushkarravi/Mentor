import { describe, it, expect, beforeEach } from "vitest";
import { validateEpistemicPair } from "../reasoning/engine.js";
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
    entityType: "evidence" | "hypothesis" | "person";
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

    // Evidence list should be empty — nothing confirmed yet
    const evidence = await repo.listEvidence(USER_ID);
    expect(evidence).toHaveLength(0);

    // Memory records should also be empty
    const memories = await repo.listMemoryRecords(USER_ID);
    expect(memories).toHaveLength(0);

    // But pending candidates should have the proposal
    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(1);
  });

  // ── Confirm ──────────────────────────────────────────────────────

  it("confirming a candidate persists it as evidence + memory record and removes it from pending", async () => {
    const candidate = await addCandidate(repo, {
      entityType: "evidence",
      extractedStatement: "I lead the architecture review committee",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    // Simulate the confirm route logic
    const check = validateEpistemicPair(
      candidate.sourceType,
      candidate.epistemicType,
    );
    expect(check.valid).toBe(true);

    const evidence = await repo.addEvidence(USER_ID, {
      sourceType: candidate.sourceType,
      epistemicType: candidate.epistemicType,
      description: candidate.extractedStatement,
    });

    const memory = await repo.addMemoryRecord(USER_ID, {
      entityType: candidate.entityType,
      entityId: evidence.id,
      extractedStatement: candidate.extractedStatement,
      epistemicType: candidate.epistemicType,
      sourceType: candidate.sourceType,
      editedBeforeConfirm: candidate.editedBeforeConfirm,
    });
    expect(memory.confirmed).toBe(true);

    await repo.deletePendingCandidate(USER_ID, candidate.id);

    // Evidence is now persisted
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
    expect(allMemories[0].entityId).toBe(evidence.id);

    // Pending candidate is removed
    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(0);
  });

  // ── Edit then confirm ────────────────────────────────────────────

  it("editing a candidate before confirm sets editedBeforeConfirm to true", async () => {
    const candidate = await addCandidate(repo, {
      extractedStatement: "Original statement",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    expect(candidate.editedBeforeConfirm).toBe(false);

    const updated = await repo.updatePendingCandidate(USER_ID, candidate.id, {
      extractedStatement: "Edited statement",
    });

    expect(updated).not.toBeNull();
    expect(updated!.extractedStatement).toBe("Edited statement");
    expect(updated!.editedBeforeConfirm).toBe(true);
  });

  it("editing epistemicType before confirm sets editedBeforeConfirm", async () => {
    const candidate = await addCandidate(repo, {
      epistemicType: "fact",
      sourceType: "user_report",
    });

    const updated = await repo.updatePendingCandidate(USER_ID, candidate.id, {
      epistemicType: "interpretation",
    });

    expect(updated!.epistemicType).toBe("interpretation");
    expect(updated!.editedBeforeConfirm).toBe(true);
  });

  it("confirming an edited candidate persists with editedBeforeConfirm=true", async () => {
    const candidate = await addCandidate(repo, {
      extractedStatement: "Original",
      epistemicType: "fact",
      sourceType: "user_report",
    });

    await repo.updatePendingCandidate(USER_ID, candidate.id, {
      extractedStatement: "Edited version",
    });

    const updated = await repo.getPendingCandidate(USER_ID, candidate.id);
    expect(updated!.editedBeforeConfirm).toBe(true);

    const memory = await repo.addMemoryRecord(USER_ID, {
      entityType: "evidence",
      extractedStatement: updated!.extractedStatement,
      epistemicType: updated!.epistemicType,
      sourceType: updated!.sourceType,
      editedBeforeConfirm: updated!.editedBeforeConfirm,
    });

    expect(memory.editedBeforeConfirm).toBe(true);
    expect(memory.extractedStatement).toBe("Edited version");
  });

  it("edits are validated again at the persistence boundary", async () => {
    const candidate = await addCandidate(repo, {
      epistemicType: "interpretation",
      sourceType: "ai_inference",
    });

    // User edits to try to make it a fact
    const updated = await repo.updatePendingCandidate(USER_ID, candidate.id, {
      epistemicType: "fact",
    });

    // The edit itself succeeds (it's just an edit)
    expect(updated!.epistemicType).toBe("fact");

    // But at the persistence boundary, the epistemic check rejects it
    const check = validateEpistemicPair(updated!.sourceType, updated!.epistemicType);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain("AI inference");
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

  // ── Epistemic enforcement at persistence boundary ────────────────

  it("ai_inference + fact is rejected at the persistence boundary", async () => {
    const candidate = await addCandidate(repo, {
      epistemicType: "fact",
      sourceType: "ai_inference",
    });

    // Even though the candidate was stored as pending, the confirm
    // route would reject it at the persistence boundary.
    const check = validateEpistemicPair(
      candidate.sourceType,
      candidate.epistemicType,
    );
    expect(check.valid).toBe(false);
  });

  it("ai_inference + interpretation is allowed at the persistence boundary", async () => {
    const candidate = await addCandidate(repo, {
      epistemicType: "interpretation",
      sourceType: "ai_inference",
    });

    const check = validateEpistemicPair(
      candidate.sourceType,
      candidate.epistemicType,
    );
    expect(check.valid).toBe(true);
  });

  // ── Mock candidate marking ───────────────────────────────────────

  it("mock candidates are stored with isMock=true", async () => {
    const candidate = await addCandidate(repo, {
      isMock: true,
      extractedStatement: "[Mock] Test plumbing",
    });

    expect(candidate.isMock).toBe(true);
    expect(candidate.extractedStatement).toContain("[Mock]");
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

    // Confirm c1
    await repo.addEvidence(USER_ID, {
      sourceType: c1.sourceType,
      epistemicType: c1.epistemicType,
      description: c1.extractedStatement,
    });
    await repo.deletePendingCandidate(USER_ID, c1.id);

    // c2 should still be pending
    const pending = await repo.listPendingCandidates(USER_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0].extractedStatement).toBe("Second");
  });
});
