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

/**
 * Domain-level review-date validator. Shared by the API layer (manual
 * experiment creation) and the reasoning engine (model-generated
 * proposals) so the rule is defined once.
 *
 * M0 constraints:
 * - Valid ISO date string (YYYY-MM-DD or full ISO 8601).
 * - Must be in the future.
 * - Must be approximately 1–6 weeks from now (7–42 days).
 *
 * An experiment without a review point is difficult to close
 * longitudinally, so the schema requires a value — null is not
 * accepted. The Prisma column remains nullable for forward
 * compatibility, but the domain schema enforces presence.
 */
const REVIEW_DATE_MIN_DAYS = 7;
const REVIEW_DATE_MAX_DAYS = 42;

export const reviewDateSchema = z
  .string()
  .min(1, "A review date is required.")
  .refine((val) => !isNaN(new Date(val).getTime()), {
    message: "The review date is not a valid date.",
  })
  .refine(
    (val) => {
      const diffDays = Math.round(
        (new Date(val).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return diffDays >= 1;
    },
    { message: "The review date must be in the future." },
  )
  .refine(
    (val) => {
      const diffDays = Math.round(
        (new Date(val).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return diffDays >= REVIEW_DATE_MIN_DAYS;
    },
    { message: "The review date must be at least 1 week from now." },
  )
  .refine(
    (val) => {
      const diffDays = Math.round(
        (new Date(val).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return diffDays <= REVIEW_DATE_MAX_DAYS;
    },
    { message: "The review date must be at most 6 weeks from now." },
  );

export const experimentProposalResponseSchema = z.object({
  hypothesisId: z.string().optional(),
  description: z.string().min(1),
  supportingSignal: z.string().min(1),
  contradictingSignal: z.string().min(1),
  inconclusiveSignal: z.string().min(1),
  reviewDate: reviewDateSchema,
  rationale: z.string().min(1),
});
