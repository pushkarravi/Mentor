import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../modules/conversations/repository.js";
import type { CareerReasoningEngine } from "../ai/reasoning/engine.js";
import { createHypothesisSchema, linkEvidenceSchema } from "./schemas.js";

/**
 * Hypothesis routes — Stage C.
 *
 * Hypothesis creation is explicit: the user provides a statement and
 * rationale. The route calls CareerReasoningEngine for evaluation,
 * never the provider directly. Evidence links are created explicitly,
 * never inferred from text similarity.
 */
export function hypothesisRoutes(
  app: FastifyInstance,
  repo: ConversationRepository,
  engine: CareerReasoningEngine,
  userId: string,
) {
  // ── List hypotheses ──────────────────────────────────────────────

  app.get("/api/hypotheses", async (_req, reply) => {
    const hypotheses = await repo.listHypotheses(userId);
    return reply.send(hypotheses);
  });

  // ── Get hypothesis detail with linked evidence ───────────────────

  app.get("/api/hypotheses/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const hyp = await repo.getHypothesis(userId, id);
    if (!hyp) {
      return reply.status(404).send({ error: "Hypothesis not found" });
    }

    const links = await repo.getHypothesisEvidenceLinks(userId, id);

    return reply.send({
      ...hyp,
      links: links.map((l) => ({
        id: l.link.id,
        evidenceId: l.link.evidenceId,
        linkType: l.link.linkType,
        evidence: {
          id: l.evidence.id,
          description: l.evidence.description,
          sourceType: l.evidence.sourceType,
          epistemicType: l.evidence.epistemicType,
        },
      })),
    });
  });

  // ── Create hypothesis (explicit, user-approved) ──────────────────

  app.post("/api/hypotheses", async (req, reply) => {
    const parsed = createHypothesisSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }

    const hyp = await repo.createHypothesis(userId, parsed.data);
    return reply.send(hyp);
  });

  // ── Link evidence to a hypothesis (explicit) ─────────────────────

  app.post("/api/hypotheses/:id/evidence", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = linkEvidenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }

    const hyp = await repo.getHypothesis(userId, id);
    if (!hyp) {
      return reply.status(404).send({ error: "Hypothesis not found" });
    }

    const evidence = await repo.getEvidence(userId, parsed.data.evidenceId);
    if (!evidence) {
      return reply.status(404).send({ error: "Evidence not found" });
    }

    const link = await repo.addHypothesisEvidenceLink(userId, {
      hypothesisId: id,
      evidenceId: parsed.data.evidenceId,
      linkType: parsed.data.linkType,
    });

    return reply.send(link);
  });

  // ── Evaluate hypothesis ──────────────────────────────────────────

  app.post("/api/hypotheses/:id/evaluate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const hyp = await repo.getHypothesis(userId, id);
    if (!hyp) {
      return reply.status(404).send({ error: "Hypothesis not found" });
    }

    // Retrieve the actual linked evidence — not caller-supplied counts.
    const links = await repo.getHypothesisEvidenceLinks(userId, id);

    const assessment = await engine.evaluateHypothesis(hyp, links);

    // Update the hypothesis's stored confidence and rationale.
    // Status is NOT changed — strong confidence does not auto-confirm.
    await repo.updateHypothesis(userId, id, {
      confidence: assessment.confidence,
      rationale: assessment.rationale,
    });

    return reply.send(assessment);
  });
}
