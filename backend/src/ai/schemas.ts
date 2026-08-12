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
 * - Strict calendar format: YYYY-MM-DD (no datetime strings, to
 *   avoid timezone ambiguity).
 * - Must be a real calendar date (e.g. not 2026-02-31).
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

const YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a YYYY-MM-DD string as a UTC midnight Date, avoiding the
 * timezone-offer interpretation that `new Date("YYYY-MM-DD")` would
 * apply in non-UTC environments. Returns NaN for invalid dates.
 */
function parseDateOnlyUTC(val: string): number {
  const [y, m, d] = val.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject non-existent calendar dates (e.g. Feb 31).
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return NaN;
  }
  return dt.getTime();
}

export const reviewDateSchema = z
  .string()
  .min(1, "A review date is required.")
  .refine((val) => YYYY_MM_DD_REGEX.test(val), {
    message: "The review date must be in YYYY-MM-DD format.",
  })
  .refine((val) => !isNaN(parseDateOnlyUTC(val)), {
    message: "The review date is not a valid calendar date.",
  })
  .refine(
    (val) => parseDateOnlyUTC(val) > Date.now(),
    { message: "The review date must be in the future." },
  )
  .refine(
    (val) => {
      const diffDays = Math.round(
        (parseDateOnlyUTC(val) - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return diffDays >= REVIEW_DATE_MIN_DAYS;
    },
    { message: "The review date must be at least 1 week from now." },
  )
  .refine(
    (val) => {
      const diffDays = Math.round(
        (parseDateOnlyUTC(val) - Date.now()) / (1000 * 60 * 60 * 24),
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

// ── Experiment Outcome (Stage E) ───────────────────────────────────────

export const outcomeClassificationSchema = z.enum([
  "supports",
  "contradicts",
  "inconclusive",
]);

/**
 * Schema for recording a manually entered experiment outcome.
 *
 * The user provides:
 * - outcomeText: the raw, unedited narrative of what happened.
 *   This is preserved verbatim on the Experiment record. It may
 *   contain interpretations, emotions, and assumptions — it is
 *   NOT treated as fact-grade evidence.
 * - observedFact: a normalized factual observation distilled from
 *   the narrative (e.g. "I was not invited to the roadmap planning
 *   meeting on Aug 12"). Required for supports/contradicts — this
 *   is what becomes the observed_outcome Evidence record with
 *   epistemic_type: fact. Not required for inconclusive.
 * - classification: supports / contradicts / inconclusive.
 *
 * The engine does not auto-classify or auto-extract the fact in
 * M0 — the user explicitly provides or confirms the factual
 * observation. AI inference must not silently manufacture the fact.
 */
export const recordOutcomeSchema = z.object({
  outcomeText: z.string().min(1, "Outcome description is required."),
  observedFact: z.string().optional(),
  classification: outcomeClassificationSchema,
}).superRefine((data, ctx) => {
  if (
    (data.classification === "supports" ||
      data.classification === "contradicts") &&
    (!data.observedFact || data.observedFact.trim().length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["observedFact"],
      message:
        "A factual observation is required when the outcome supports " +
        "or contradicts the hypothesis. Describe the observable event " +
        "separately from your interpretation of it.",
    });
  }
});
