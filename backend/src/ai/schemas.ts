import { z } from "zod";

/**
 * AI-domain Zod schemas — used to validate model output.
 *
 * These schemas live in the AI layer (not the API layer) because they
 * validate the contract between the model and the reasoning engine.
 * The API layer may re-export them for HTTP input validation, but the
 * reasoning layer must not depend on the HTTP layer.
 */

// ── Epistemic enums (mirror Prisma schema) ──────────────────────────

export const sourceTypeSchema = z.enum([
  "user_report",
  "imported_document",
  "ai_inference",
  "observed_outcome",
]);

export const epistemicTypeSchema = z.enum([
  "fact",
  "interpretation",
  "hypothesis",
  "emotion",
  "action",
]);

// Claim analysis uses six categories — includes "assumption" which is not
// a persistable epistemic_type for Evidence/Memory but is recognized
// during claim decomposition.
export const claimComponentTypeSchema = z.enum([
  "fact",
  "interpretation",
  "assumption",
  "emotion",
  "hypothesis",
  "action",
]);

export const confidenceCategorySchema = z.enum([
  "tentative",
  "moderate",
  "strong",
]);

export const reasoningLensSchema = z.enum([
  "coach",
  "challenger",
  "decision_advisor",
]);

// ── Model output response shapes ────────────────────────────────────

export const claimAnalysisResponseSchema = z.object({
  components: z.array(
    z.object({
      type: claimComponentTypeSchema,
      text: z.string(),
    }),
  ),
  summary: z.string(),
});

// ── Memory candidate extraction (Stage B: evidence only) ────────────

export const memoryCandidateSchema = z.object({
  entityType: z.literal("evidence"),
  extractedStatement: z.string().min(1),
  epistemicType: epistemicTypeSchema,
  sourceType: sourceTypeSchema,
  reasonToSave: z.string().min(1),
  linkedEntityId: z.string().optional(),
});

export const extractionResponseSchema = z.object({
  candidates: z.array(memoryCandidateSchema),
});

// ── Hypothesis evaluation (Stage C) ──────────────────────────────────

export const hypothesisStatusSchema = z.enum([
  "active",
  "tested_supports",
  "tested_contradicts",
  "superseded",
  "confirmed",
]);

export const linkTypeSchema = z.enum(["supports", "contradicts"]);

// ── Experiment (Stage D) ───────────────────────────────────────────────

export const experimentStatusSchema = z.enum([
  "proposed",
  "active",
  "completed",
  "abandoned",
]);

export const experimentProposalResponseSchema = z.object({
  hypothesisId: z.string(),
  description: z.string().min(1),
  successSignal: z.string().min(1),
  reviewDate: z.string(),
  rationale: z.string().min(1),
});
