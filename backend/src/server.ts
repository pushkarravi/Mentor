import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env.js";
import { createProvider } from "./ai/providers/factory.js";
import { CareerReasoningEngine } from "./ai/reasoning/engine.js";
import { InMemoryConversationRepository } from "./modules/conversations/in-memory.js";
import { conversationRoutes } from "./api/conversations.js";

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

  // Repository — in-memory when no DATABASE_URL, Prisma-backed otherwise
  const repo = new InMemoryConversationRepository();

  // M0: localhost-only, single user. No auth.
  // Auth is a future trigger — see AGENTS.md.
  const userId = "m0-local-user";

  // Register routes
  conversationRoutes(app, repo, engine, userId);

  // Health check
  app.get("/api/health", async () => ({
    status: "ok",
    provider: env.aiProvider,
    database: env.useInMemoryDb ? "in-memory" : "prisma",
  }));

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    console.log(
      `Mentor backend running on port ${env.port} ` +
        `(provider: ${env.aiProvider}, db: ${env.useInMemoryDb ? "in-memory" : "prisma"})`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
