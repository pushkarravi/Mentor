import { z } from "zod";

// ── Epistemic enums (mirror Prisma schema) ─────────────────────────────

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

// ── Career context ─────────────────────────────────────────────────────

export const saveCareerContextSchema = z.object({
  currentRole: z.string().min(1),
  yearsExperience: z.number().int().min(0).max(80),
  targetOutcome: z.string().min(1),
  whyNotYet: z.string().min(1),
});

// ── Conversation ───────────────────────────────────────────────────────

export const createConversationSchema = z.object({
  title: z.string().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  lens: reasoningLensSchema.default("coach"),
});

// ── Response shapes ────────────────────────────────────────────────────

export const claimAnalysisResponseSchema = z.object({
  components: z.array(
    z.object({
      type: epistemicTypeSchema,
      text: z.string(),
    }),
  ),
  summary: z.string(),
});

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
