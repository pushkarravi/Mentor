import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env.js";
import { createProvider } from "./ai/providers/factory.js";
import { CareerReasoningEngine } from "./ai/reasoning/engine.js";
import { createRepository } from "./modules/conversations/factory.js";
import { conversationRoutes } from "./api/conversations.js";
import { memoryRoutes } from "./api/memory.js";
import { hypothesisRoutes } from "./api/hypotheses.js";
import { experimentRoutes } from "./api/experiments.js";

/**
 * Fastify server entry point.
 *
 * Architecture: UI/API → CareerReasoningEngine → retrieval/memory/prompts → AIProvider
 * Routes call CareerReasoningEngine methods, never AIProvider directly.
 */
async function main() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  // Select AI provider from env (mock or perplexity)
  const provider = createProvider({
    AI_PROVIDER: env.aiProvider,
    PERPLEXITY_API_KEY: env.perplexityApiKey,
  });

  // Reasoning engine — the layer between routes and the AI provider
  const engine = new CareerReasoningEngine(provider);

  // Repository — Prisma-backed when DATABASE_URL is available,
  // in-memory otherwise. Selection is in the factory, not here.
  const repo = createRepository({
    provider: env.repositoryProvider,
    databaseUrl: env.databaseUrl,
  });

  // M0: localhost-only, single user. No auth.
  // Auth is a future trigger — see AGENTS.md.
  const userId = "m0-local-user";

  // Register routes
  conversationRoutes(app, repo, engine, userId, { AI_PROVIDER: env.aiProvider });
  memoryRoutes(app, repo, engine, userId);
  hypothesisRoutes(app, repo, engine, userId);
  experimentRoutes(app, repo, engine, userId);

  // Health check
  app.get("/api/health", async () => ({
    status: "ok",
    provider: env.aiProvider,
    database: env.databaseUrl ? "prisma" : "in-memory",
  }));

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    console.log(
      `Mentor backend running on port ${env.port} ` +
        `(provider: ${env.aiProvider}, db: ${env.databaseUrl ? "prisma" : "in-memory"})`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
