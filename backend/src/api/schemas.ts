import { z } from "zod";

/**
 * API-layer Zod schemas — validate HTTP request/response bodies.
 *
 * AI-domain schemas (model-output validation, epistemic enums) are
 * defined in src/ai/schemas.ts and re-exported here for convenience.
 * The reasoning layer imports from src/ai/schemas.ts, never from here.
 */

// Re-export AI-domain schemas so API routes can use them without
// a second import path.
export {
  sourceTypeSchema,
  epistemicTypeSchema,
  claimComponentTypeSchema,
  confidenceCategorySchema,
  reasoningLensSchema,
  claimAnalysisResponseSchema,
  memoryCandidateSchema,
  extractionResponseSchema,
  hypothesisStatusSchema,
  linkTypeSchema,
  experimentStatusSchema,
  experimentProposalResponseSchema,
} from "../ai/schemas.js";

import {
  epistemicTypeSchema,
  reasoningLensSchema,
  claimAnalysisResponseSchema,
  confidenceCategorySchema,
  hypothesisStatusSchema,
  linkTypeSchema,
  experimentStatusSchema,
  reviewDateSchema,
} from "../ai/schemas.js";

// ── Career context (API input) ──────────────────────────────────────

export const saveCareerContextSchema = z.object({
  currentRole: z.string().min(1),
  yearsExperience: z.number().int().min(0).max(80),
  targetOutcome: z.string().min(1),
  whyNotYet: z.string().min(1),
});

// ── Conversation (API input) ────────────────────────────────────────

export const createConversationSchema = z.object({
  title: z.string().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  lens: reasoningLensSchema.default("coach"),
});

// ── Candidate confirmation (API input) ──────────────────────────────
// sourceType is intentionally absent from edits — it represents
// provenance and must not be user-editable.
export const confirmCandidateSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  edits: z
    .object({
      extractedStatement: z.string().min(1).optional(),
      epistemicType: epistemicTypeSchema.optional(),
    })
    .optional(),
});

// ── API response shapes ─────────────────────────────────────────────

export const messageResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  reasoningLens: reasoningLensSchema.nullable(),
  claimAnalysis: claimAnalysisResponseSchema.nullable(),
  createdAt: z.string(),
});

export const conversationResponseSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  messages: z.array(messageResponseSchema),
});

// ── Hypothesis (Stage C) ──────────────────────────────────────────────

export const createHypothesisSchema = z.object({
  statement: z.string().min(1),
  creationRationale: z.string().min(1),
});

export const linkEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  linkType: linkTypeSchema,
});

export const hypothesisResponseSchema = z.object({
  id: z.string(),
  statement: z.string(),
  confidence: confidenceCategorySchema,
  status: hypothesisStatusSchema,
  creationRationale: z.string(),
  lastAssessmentRationale: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const hypothesisDetailResponseSchema = z.object({
  id: z.string(),
  statement: z.string(),
  confidence: confidenceCategorySchema,
  status: hypothesisStatusSchema,
  creationRationale: z.string(),
  lastAssessmentRationale: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  links: z.array(
    z.object({
      id: z.string(),
      evidenceId: z.string(),
      linkType: linkTypeSchema,
      evidence: z.object({
        id: z.string(),
        description: z.string(),
        sourceType: z.string(),
        epistemicType: z.string(),
      }),
    }),
  ),
});

// ── Experiment (Stage D) ───────────────────────────────────────────────

export const createExperimentSchema = z.object({
  hypothesisId: z.string().min(1),
  description: z.string().min(1),
  supportingSignal: z.string().min(1),
  contradictingSignal: z.string().min(1),
  inconclusiveSignal: z.string().min(1),
  rationale: z.string().min(1),
  reviewDate: reviewDateSchema,
});

export const experimentResponseSchema = z.object({
  id: z.string(),
  hypothesisId: z.string(),
  description: z.string(),
  supportingSignal: z.string(),
  contradictingSignal: z.string(),
  inconclusiveSignal: z.string(),
  rationale: z.string(),
  reviewDate: z.string().nullable(),
  status: experimentStatusSchema,
  outcome: z.string().nullable(),
  outcomeRecordedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// experimentProposalResponseSchema is re-exported from ../ai/schemas.js
// (see export block at top of file). The API layer does not maintain a
// separate copy — the AI-domain schema is the single contract.
