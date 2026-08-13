/**
 * Cross-user ownership tests for PrismaConversationRepository.
 *
 * These are PostgreSQL integration tests and intentionally skip when
 * DATABASE_URL is not configured.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaConversationRepository } from "./prisma.js";

const databaseUrl = process.env.DATABASE_URL;
const hasDatabase = !!databaseUrl;

describe.skipIf(!hasDatabase)(
  "PrismaConversationRepository — ownership integrity",
  () => {
    const USER_A = "test-owner-a";
    const USER_B = "test-owner-b";
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
      for (const userId of [USER_A, USER_B]) {
        await prisma.user.upsert({
          where: { id: userId },
          update: {},
          create: { id: userId, name: userId },
        });
      }

      await prisma.hypothesisEvidence.deleteMany({
        where: {
          OR: [
            { hypothesis: { userId: USER_A } },
            { hypothesis: { userId: USER_B } },
          ],
        },
      });
      await prisma.careerExperiment.deleteMany({
        where: { userId: { in: [USER_A, USER_B] } },
      });
      await prisma.careerHypothesis.deleteMany({
        where: { userId: { in: [USER_A, USER_B] } },
      });
      await prisma.evidence.deleteMany({
        where: { userId: { in: [USER_A, USER_B] } },
      });
    });

    it("rejects linking one user's Evidence to another user's Hypothesis", async () => {
      const hypothesis = await repo.createHypothesis(USER_A, {
        statement: "Leadership sees me as a technical executor.",
        creationRationale: "Test ownership boundary.",
      });
      const otherUsersEvidence = await repo.addEvidence(USER_B, {
        sourceType: "user_report",
        epistemicType: "interpretation",
        description: "Evidence owned by user B.",
      });

      await expect(
        repo.addHypothesisEvidenceLink(USER_A, {
          hypothesisId: hypothesis.id,
          evidenceId: otherUsersEvidence.id,
          linkType: "supports",
        }),
      ).rejects.toThrow("Evidence not found for this user");

      expect(
        await prisma.hypothesisEvidence.count({
          where: {
            hypothesisId: hypothesis.id,
            evidenceId: otherUsersEvidence.id,
          },
        }),
      ).toBe(0);
    });

    it("rejects creating an Experiment against another user's Hypothesis", async () => {
      const otherUsersHypothesis = await repo.createHypothesis(USER_B, {
        statement: "This hypothesis belongs to user B.",
        creationRationale: "Test ownership boundary.",
      });

      await expect(
        repo.createExperiment(USER_A, {
          hypothesisId: otherUsersHypothesis.id,
          description: "Attempted cross-user experiment.",
          supportingSignal: "Supporting event.",
          contradictingSignal: "Contradicting event.",
          inconclusiveSignal: "No discriminating event.",
          rationale: "Must be rejected.",
          reviewDate: null,
        }),
      ).rejects.toThrow("Hypothesis not found for this user");

      expect(
        await prisma.careerExperiment.count({
          where: {
            userId: USER_A,
            hypothesisId: otherUsersHypothesis.id,
          },
        }),
      ).toBe(0);
    });
  },
);
