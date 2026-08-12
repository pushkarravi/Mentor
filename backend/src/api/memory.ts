import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../modules/conversations/repository.js";
import type { CareerReasoningEngine } from "../ai/reasoning/engine.js";
import { confirmCandidateSchema } from "./schemas.js";
import { validateEpistemicPair } from "../ai/reasoning/engine.js";

/**
 * Memory routes — candidate confirmation, rejection, and listing.
 *
 * The confirm flow enforces epistemic rules at the persistence boundary:
 * even if an edit produces an ai_inference + fact pair, the server rejects
 * it before writing to the database. This is a code-level enforcement,
 * not a prompt-level discouragement.
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

    // CONFIRM: apply edits if provided, then validate at the persistence boundary.
    let final = candidate;
    if (edits) {
      const updated = await repo.updatePendingCandidate(userId, id, edits);
      if (!updated) {
        return reply.status(404).send({ error: "Candidate not found after edit" });
      }
      final = updated;
    }

    // Persistence-boundary epistemic enforcement: reject ai_inference + fact
    // even if the user edited the candidate to produce this pair.
    const check = validateEpistemicPair(final.sourceType, final.epistemicType);
    if (!check.valid) {
      return reply.status(422).send({
        error: "Epistemic validation failed",
        reason: check.reason,
      });
    }

    // Persist as Evidence (for entityType "evidence") or as a Memory record
    // (for other entity types). In M0, all confirmed candidates also get a
    // Memory record for audit trail.
    let evidenceId: string | null = null;

    if (final.entityType === "evidence") {
      const evidence = await repo.addEvidence(userId, {
        sourceType: final.sourceType,
        epistemicType: final.epistemicType,
        description: final.extractedStatement,
      });
      evidenceId = evidence.id;
    }

    const memoryRecord = await repo.addMemoryRecord(userId, {
      entityType: final.entityType,
      entityId: evidenceId,
      extractedStatement: final.extractedStatement,
      epistemicType: final.epistemicType,
      sourceType: final.sourceType,
      sourceMessageId: final.sourceMessageId ?? null,
      editedBeforeConfirm: final.editedBeforeConfirm,
    });

    // Remove the pending candidate — it's now confirmed or rejected.
    await repo.deletePendingCandidate(userId, id);

    return reply.send({
      confirmed: true,
      id,
      evidenceId,
      memoryRecord,
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
