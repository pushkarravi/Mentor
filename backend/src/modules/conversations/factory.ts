/**
 * Repository factory — selects the persistence implementation
 * based on environment configuration.
 *
 * REPOSITORY_PROVIDER=memory   → InMemoryConversationRepository (tests, fast dev)
 * REPOSITORY_PROVIDER=prisma   → PrismaConversationRepository (real PostgreSQL via DATABASE_URL)
 *
 * If REPOSITORY_PROVIDER is not set, defaults to:
 * - prisma when DATABASE_URL is available
 * - memory otherwise
 *
 * Routes and CareerReasoningEngine never check this — they receive a
 * ConversationRepository and don't know which implementation is in use.
 */
import type { ConversationRepository } from "./repository.js";
import { InMemoryConversationRepository } from "./in-memory.js";
import { PrismaConversationRepository } from "./prisma.js";

export type RepositoryProvider = "memory" | "prisma";

export function createRepository(
  config: {
    provider?: string;
    databaseUrl?: string;
  },
): ConversationRepository {
  const provider = (config.provider ?? "auto") as RepositoryProvider | "auto";

  if (provider === "memory") {
    return new InMemoryConversationRepository();
  }

  if (provider === "prisma") {
    if (!config.databaseUrl) {
      throw new Error(
        "REPOSITORY_PROVIDER=prisma requires DATABASE_URL",
      );
    }
    return new PrismaConversationRepository(config.databaseUrl);
  }

  // Auto: prefer prisma when DATABASE_URL is available
  if (config.databaseUrl) {
    return new PrismaConversationRepository(config.databaseUrl);
  }

  return new InMemoryConversationRepository();
}
