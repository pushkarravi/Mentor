import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../modules/conversations/repository.js";
import type { CareerReasoningEngine } from "../ai/reasoning/engine.js";
import { RecommendationError } from "../ai/reasoning/engine.js";
import { createExperimentSchema } from "./schemas.js";
import { recordOutcomeSchema } from "../ai/schemas.js";
import { OutcomeError, ReviewError } from "../ai/reasoning/engine.js";

/**
 * Experiment routes — Stages D, E, and F.
 *
 * Experiments are explicitly created by the user. The engine can
 * recommend a proposal via recommendExperiment(), but the user
 * decides whether to create it — no silent auto-creation.
 *
 * Stage E: outcome recording. The user records what happened and
 * classifies it. The engine creates an observed_outcome Evidence
 * record (for supports/contradicts) and marks the experiment
 * completed. No hypothesis reassessment here — that is Stage F.
 *
 * Stage F: outcome review. Closes the loop — links the outcome
 * Evidence to the hypothesis, re-evaluates using all linked evidence,
 * and returns the before/after delta.
 */
export function experimentRoutes(
  app: FastifyInstance,
  repo: ConversationRepository,
  engine: CareerReasoningEngine,
  userId: string,
) {
  // ── List all experiments ──────────────────────────────────────────

  app.get("/api/experiments", async (_req, reply) => {
    const experiments = await repo.listExperiments(userId);
    return reply.send(experiments);
  });

  // ── Get experiment detail ─────────────────────────────────────────

  app.get("/api/experiments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const exp = await repo.getExperiment(userId, id);
    if (!exp) {
      return reply.status(404).send({ error: "Experiment not found" });
    }
    return reply.send(exp);
  });

  // ── List experiments for a specific hypothesis ────────────────────

  app.get("/api/hypotheses/:id/experiments", async (req, reply) => {
    const { id } = req.params as { id: string };
    const hyp = await repo.getHypothesis(userId, id);
    if (!hyp) {
      return reply.status(404).send({ error: "Hypothesis not found" });
    }
    const experiments = await repo.listExperimentsByHypothesis(userId, id);
    return reply.send(experiments);
  });

  // ── Create experiment (explicit, user-approved) ───────────────────

  app.post("/api/experiments", async (req, reply) => {
    const parsed = createExperimentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }

    // Verify the hypothesis exists.
    const hyp = await repo.getHypothesis(userId, parsed.data.hypothesisId);
    if (!hyp) {
      return reply.status(404).send({ error: "Hypothesis not found" });
    }

    const exp = await repo.createExperiment(userId, parsed.data);
    return reply.send(exp);
  });

  // ── Recommend an experiment for a hypothesis ──────────────────────

  app.post("/api/hypotheses/:id/recommend-experiment", async (req, reply) => {
    const { id } = req.params as { id: string };
    const hyp = await repo.getHypothesis(userId, id);
    if (!hyp) {
      return reply.status(404).send({ error: "Hypothesis not found" });
    }

    // Retrieve current assessment data for context.
    const links = await repo.getHypothesisEvidenceLinks(userId, id);

    // Run evaluation to get current assessment (but do NOT persist
    // the assessment here — this endpoint only recommends).
    const assessment = await engine.evaluateHypothesis(hyp, links);

    // Get any existing experiments for this hypothesis.
    const existing = await repo.listExperimentsByHypothesis(userId, id);

    try {
      const proposal = await engine.recommendExperiment(
        hyp,
        assessment,
        existing,
      );
      return reply.send(proposal);
    } catch (e) {
      if (e instanceof RecommendationError) {
        return reply.status(502).send({ error: e.message });
      }
      throw e;
    }
  });

  // ── Record experiment outcome (Stage E) ──────────────────────────

  app.post("/api/experiments/:id/outcome", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = recordOutcomeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.issues,
      });
    }

    const exp = await repo.getExperiment(userId, id);
    if (!exp) {
      return reply.status(404).send({ error: "Experiment not found" });
    }

    try {
      const result = await engine.recordExperimentOutcome(
        exp,
        parsed.data.outcomeText,
        parsed.data.observedFact ?? null,
        parsed.data.classification,
        repo,
        userId,
      );
      return reply.send(result);
    } catch (e) {
      if (e instanceof OutcomeError) {
        return reply.status(409).send({ error: e.message });
      }
      throw e;
    }
  });

  // ── Review experiment outcome (Stage F) ───────────────────────────

  app.post("/api/experiments/:id/review", async (req, reply) => {
    const { id } = req.params as { id: string };
    const exp = await repo.getExperiment(userId, id);
    if (!exp) {
      return reply.status(404).send({ error: "Experiment not found" });
    }

    try {
      const result = await engine.reviewExperimentOutcome(
        exp,
        repo,
        userId,
      );
      return reply.send(result);
    } catch (e) {
      if (e instanceof ReviewError) {
        return reply.status(409).send({ error: e.message });
      }
      throw e;
    }
  });
}
