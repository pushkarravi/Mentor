import { describe, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaConversationRepository } from "./prisma.js";
import { repositoryContractTests } from "./contract-tests.js";

const databaseUrl = process.env.DATABASE_URL;
const hasDatabase = !!databaseUrl;

describe.skipIf(!hasDatabase)(
  "PrismaConversationRepository — contract tests",
  () => {
    const USER_ID = "test-user-contract";
    let prisma: PrismaClient;

    beforeAll(() => {
      prisma = new PrismaClient(
        databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
      );
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    beforeEach(async () => {
      if (!prisma) return;

      // Upsert the test user (needed for FK constraints)
      await prisma.user.upsert({
        where: { id: USER_ID },
        update: {},
        create: { id: USER_ID, name: "Prisma Contract Test User" },
      });

      // Clean up all data for the test user, respecting FK order
      await prisma.hypothesisEvidence.deleteMany({
        where: { hypothesis: { userId: USER_ID } },
      });
      await prisma.careerExperiment.deleteMany({ where: { userId: USER_ID } });
      await prisma.careerHypothesis.deleteMany({ where: { userId: USER_ID } });
      await prisma.memory.deleteMany({ where: { userId: USER_ID } });
      await prisma.evidence.deleteMany({ where: { userId: USER_ID } });
      await prisma.message.deleteMany({
        where: { conversation: { userId: USER_ID } },
      });
      await prisma.conversation.deleteMany({ where: { userId: USER_ID } });
      await prisma.pendingCandidate.deleteMany({ where: { userId: USER_ID } });
      await prisma.careerContext.deleteMany({ where: { userId: USER_ID } });
    });

    repositoryContractTests(() => {
      if (!databaseUrl) {
        throw new Error("No DATABASE_URL — cannot run Prisma contract tests");
      }
      return new PrismaConversationRepository(databaseUrl);
    });
  },
);
