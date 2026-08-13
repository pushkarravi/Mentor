/**
 * Prisma transaction and precondition integration tests.
 *
 * Important distinction:
 * - Repository precondition tests prove invalid/missing state is rejected
 *   before any durable write occurs.
 * - The explicit Prisma transaction test below proves PostgreSQL/Prisma
 *   rolls back a write when a later operation in the same transaction fails.
 *
 * M0 deliberately does not add production fault-injection hooks merely to
 * force failures between individual repository writes. The repository's
 * three integrity-critical methods are implemented with prisma.$transaction;
 * their full contract must still be executed locally with DATABASE_URL.
 *
 * These tests skip when DATABASE_URL is not configured.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaConversationRepository } from "./prisma.js";

const databaseUrl = process.env.DATABASE_URL;
const hasDatabase = !!databaseUrl;

describe.skipIf(!hasDatabase)(
  "PrismaConversationRepository — transaction and guard integration",
  () => {
    const USER_ID = "test-user-transaction";
    let prisma: PrismaClient;
    let repo: PrismaConversationRepository;

    beforeAll(() => {
      prisma = new PrismaClient(
        databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
      );
      repo = new PrismaConversationRepository(databaseUrl);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    beforeEach(async () => {
      await prisma.user.upsert({
        where: { id: USER_ID },
        update: {},
        create: { id: USER_ID, name: "Transaction Test User" },
      });

      await prisma.hypothesisEvidence.deleteMany({
        where: { hypothesis: { userId: USER_ID } },
      });
      await prisma.careerExperiment.deleteMany({ where: { userId: USER_ID } });
      await prisma.careerHypothesis.deleteMany({ where: { userId: USER_ID } });
      await prisma.memory.deleteMany({ where: { userId: USER_ID } });
      await prisma.evidence.deleteMany({ where: { userId: USER_ID } });
      await prisma.pendingCandidate.deleteMany({ where: { userId: USER_ID } });
    });

    it("Prisma rolls back an earlier Evidence write when a later transaction step fails", async () => {
      const before = await prisma.evidence.count({ where: { userId: USER_ID } });

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.evidence.create({
            data: {
              userId: USER_ID,
              sourceType: "user_report",
              epistemicType: "fact",
              description: "This row must be rolled back.",
            },
          });
          throw new Error("forced failure after write");
        }),
      ).rejects.toThrow("forced failure after write");

      const after = await prisma.evidence.count({ where: { userId: USER_ID } });
      expect(after).toBe(before);
    });

    it("recordExperimentOutcomeAtomic rejects a missing experiment without creating Evidence", async () => {
      const before = await prisma.evidence.count({ where: { userId: USER_ID } });

      const result = await repo.recordExperimentOutcomeAtomic(
        USER_ID,
        "missing-experiment",
        {
          outcome: "Nothing should be persisted.",
          outcomeClassification: "supports",
          observedFact: "This fact must never be inserted.",
        },
      );

      expect(result).toBeNull();
      const after = await prisma.evidence.count({ where: { userId: USER_ID } });
      expect(after).toBe(before);
    });

    it("applyExperimentOutcomeReviewAtomic rejects an already-reviewed experiment", async () => {
      const hypothesis = await repo.createHypothesis(USER_ID, {
        statement: "Test hypothesis",
        creationRationale: "Transaction guard test",
      });
      const experiment = await repo.createExperiment(USER_ID, {
        hypothesisId: hypothesis.id,
        description: "Test experiment",
        supportingSignal: "Support",
        contradictingSignal: "Contradict",
        inconclusiveSignal: "Inconclusive",
        rationale: "Test",
        reviewDate: null,
      });

      const outcome = await repo.recordExperimentOutcomeAtomic(USER_ID, experiment.id, {
        outcome: "Observed supporting result.",
        outcomeClassification: "supports",
        observedFact: "A supporting event occurred.",
      });
      expect(outcome).not.toBeNull();

      const first = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, experiment.id, {
        newConfidence: "tentative",
        newAssessmentRationale: "First review.",
      });
      expect(first).not.toBeNull();

      const linkCountBefore = await prisma.hypothesisEvidence.count({
        where: { hypothesisId: hypothesis.id },
      });

      const second = await repo.applyExperimentOutcomeReviewAtomic(USER_ID, experiment.id, {
        newConfidence: "strong",
        newAssessmentRationale: "Must not be applied.",
      });
      expect(second).toBeNull();

      const persistedHypothesis = await repo.getHypothesis(USER_ID, hypothesis.id);
      expect(persistedHypothesis?.confidence).toBe("tentative");
      expect(persistedHypothesis?.lastAssessmentRationale).toBe("First review.");

      const linkCountAfter = await prisma.hypothesisEvidence.count({
        where: { hypothesisId: hypothesis.id },
      });
      expect(linkCountAfter).toBe(linkCountBefore);
    });
  },
);
