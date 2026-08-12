import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../modules/conversations/repository.js";
import type { CareerReasoningEngine } from "../ai/reasoning/engine.js";
import {
  saveCareerContextSchema,
  createConversationSchema,
  sendMessageSchema,
} from "./schemas.js";

/**
 * Conversation routes — one file per resource per AGENTS.md conventions.
 * Routes call CareerReasoningEngine methods; they never call AIProvider
 * or assemble prompts directly.
 */
export function conversationRoutes(
  app: FastifyInstance,
  repo: ConversationRepository,
  engine: CareerReasoningEngine,
  userId: string,
  env: { AI_PROVIDER: string },
) {
  // ── Career context ────────────────────────────────────────────────

  app.get("/api/context", async (_req, reply) => {
    const ctx = await repo.getCareerContext(userId);
    return reply.send(ctx);
  });

  app.post("/api/context", async (req, reply) => {
    const parsed = saveCareerContextSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }
    const ctx = await repo.saveCareerContext(userId, parsed.data);
    return reply.send(ctx);
  });

  // ── Conversations ─────────────────────────────────────────────────

  app.post("/api/conversations", async (req, reply) => {
    const parsed = createConversationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }
    const conv = await repo.createConversation(userId, parsed.data.title);
    return reply.send({
      id: conv.id,
      title: conv.title ?? null,
      createdAt: conv.createdAt,
      messages: [],
    });
  });

  app.get("/api/conversations", async (_req, reply) => {
    const convs = await repo.listConversations(userId);
    return reply.send(convs);
  });

  app.get("/api/conversations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = await repo.getConversation(userId, id);
    if (!conv) {
      return reply.status(404).send({ error: "Conversation not found" });
    }
    return reply.send(conv);
  });

  // ── Send message ──────────────────────────────────────────────────

  app.post("/api/conversations/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }

    const conv = await repo.getConversation(userId, id);
    if (!conv) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    const { content, lens } = parsed.data;

    // 1. Persist the user message
    const userMessage = await repo.addMessage(id, "user", content);

    // 2. Analyze the claim (epistemic decomposition)
    const careerCtx = await repo.getCareerContext(userId);
    const claimAnalysis = await engine.analyzeClaim(content, {
      careerContext: careerCtx,
      conversationHistory: conv.messages,
    });

    // 3. Generate the coaching response through the reasoning engine
    const responseText = await engine.respond(content, lens, claimAnalysis, {
      careerContext: careerCtx,
      conversationHistory: conv.messages,
    });

    // 4. Persist the assistant message
    const assistantMessage = await repo.addMessage(
      id,
      "assistant",
      responseText,
      lens,
      claimAnalysis,
    );

    // 5. Extract memory candidates (Stage B)
    //    Nothing is persisted here — candidates are stored as pending
    //    and require explicit user confirmation.
    const candidates = await engine.extractMemoryCandidates(
      content,
      claimAnalysis,
      {
        careerContext: careerCtx,
        conversationHistory: conv.messages,
        sourceMessageId: userMessage.id,
      },
    );

    const isMock = env.AI_PROVIDER === "mock";
    const pendingCandidates = await repo.addPendingCandidates(
      userId,
      candidates.map((c) => ({
        entityType: c.entityType,
        extractedStatement: c.extractedStatement,
        epistemicType: c.epistemicType,
        sourceType: c.sourceType,
        reasonToSave: c.reasonToSave,
        linkedEntityId: c.linkedEntityId,
        sourceMessageId: userMessage.id,
        isMock,
      })),
    );

    return reply.send({
      userMessage,
      assistantMessage,
      claimAnalysis,
      candidates: pendingCandidates,
    });
  });
}
