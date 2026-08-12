import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../modules/conversations/repository.js";
import type { CareerReasoningEngine } from "../ai/reasoning/engine.js";
import { confirmCandidateSchema } from "./schemas.js";

/**
 * Memory routes — candidate confirmation, rejection, and listing.
 *
 * Confirmation is a single atomic repository call. The route does not
 * orchestrate individual Evidence/Memory/pending writes.
 */
export function memoryRoutes(
  app: FastifyInstance,
  repo: ConversationRepository,
  _engine: CareerReasoningEngine,
  userId: string,
) {
  // ── List pending candidates ──────────────────────────────────────

  app.get("/api/candidates", async (_req, reply) => {
    const candidates = await repo.listPendingCandidates(userId);
    return reply.send(candidates);
  });

  // ── Confirm or reject a candidate ────────────────────────────────

  app.post("/api/candidates/:id/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = confirmCandidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }

    const candidate = await repo.getPendingCandidate(userId, id);
    if (!candidate) {
      return reply.status(404).send({ error: "Candidate not found" });
    }

    const { action, edits } = parsed.data;

    // REJECT: delete the candidate. Nothing is persisted.
    if (action === "reject") {
      await repo.deletePendingCandidate(userId, id);
      return reply.send({ rejected: true, id });
    }

    // CONFIRM: single atomic repository operation.
    const result = await repo.confirmPendingCandidate(userId, id, edits);
    if (!result.ok) {
      return reply.status(422).send({
        error: "Confirmation failed",
        reason: result.reason,
      });
    }

    return reply.send({
      confirmed: true,
      id,
      evidenceId: result.evidence.id,
      memoryRecord: result.memoryRecord,
    });
  });

  // ── List confirmed evidence ──────────────────────────────────────

  app.get("/api/evidence", async (_req, reply) => {
    const evidence = await repo.listEvidence(userId);
    return reply.send(evidence);
  });

  // ── List confirmed memory records ────────────────────────────────

  app.get("/api/memory", async (_req, reply) => {
    const records = await repo.listMemoryRecords(userId);
    return reply.send(records);
  });
}
