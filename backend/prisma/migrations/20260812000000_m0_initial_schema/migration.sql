-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('user_report', 'imported_document', 'ai_inference', 'observed_outcome');

-- CreateEnum
CREATE TYPE "EpistemicType" AS ENUM ('fact', 'interpretation', 'hypothesis', 'emotion', 'action');

-- CreateEnum
CREATE TYPE "ConfidenceCategory" AS ENUM ('tentative', 'moderate', 'strong');

-- CreateEnum
CREATE TYPE "HypothesisStatus" AS ENUM ('active', 'tested_supports', 'tested_contradicts', 'superseded', 'confirmed');

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('supports', 'contradicts');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('proposed', 'active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "ReasoningLens" AS ENUM ('coach', 'challenger', 'decision_advisor');

-- CreateEnum
CREATE TYPE "OutcomeClassification" AS ENUM ('supports', 'contradicts', 'inconclusive');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentRole" TEXT NOT NULL,
    "yearsExperience" INTEGER NOT NULL,
    "targetOutcome" TEXT NOT NULL,
    "whyNotYet" TEXT NOT NULL,
    "whyNotYetEpistemic" "EpistemicType" NOT NULL DEFAULT 'interpretation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "epistemicType" "EpistemicType" NOT NULL,
    "description" TEXT NOT NULL,
    "personId" TEXT,
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerHypothesis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "confidence" "ConfidenceCategory" NOT NULL DEFAULT 'tentative',
    "status" "HypothesisStatus" NOT NULL DEFAULT 'active',
    "creationRationale" TEXT NOT NULL,
    "lastAssessmentRationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HypothesisEvidence" (
    "id" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "linkType" "LinkType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HypothesisEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerExperiment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supportingSignal" TEXT NOT NULL,
    "contradictingSignal" TEXT NOT NULL,
    "inconclusiveSignal" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3),
    "status" "ExperimentStatus" NOT NULL DEFAULT 'proposed',
    "outcome" TEXT,
    "outcomeClassification" "OutcomeClassification",
    "outcomeEvidenceId" TEXT,
    "outcomeRecordedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "reasoningLens" "ReasoningLens",
    "claimAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "extractedStatement" TEXT NOT NULL,
    "epistemicType" "EpistemicType" NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceMessageId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "editedBeforeConfirm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "extractedStatement" TEXT NOT NULL,
    "epistemicType" "EpistemicType" NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "reasonToSave" TEXT NOT NULL,
    "linkedEntityId" TEXT,
    "sourceMessageId" TEXT,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "editedBeforeConfirm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareerContext_userId_idx" ON "CareerContext"("userId");

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "Evidence_userId_idx" ON "Evidence"("userId");

-- CreateIndex
CREATE INDEX "Evidence_personId_idx" ON "Evidence"("personId");

-- CreateIndex
CREATE INDEX "CareerHypothesis_userId_idx" ON "CareerHypothesis"("userId");

-- CreateIndex
CREATE INDEX "HypothesisEvidence_hypothesisId_idx" ON "HypothesisEvidence"("hypothesisId");

-- CreateIndex
CREATE INDEX "HypothesisEvidence_evidenceId_idx" ON "HypothesisEvidence"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "HypothesisEvidence_hypothesisId_evidenceId_key" ON "HypothesisEvidence"("hypothesisId", "evidenceId");

-- CreateIndex
CREATE INDEX "CareerExperiment_userId_idx" ON "CareerExperiment"("userId");

-- CreateIndex
CREATE INDEX "CareerExperiment_hypothesisId_idx" ON "CareerExperiment"("hypothesisId");

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Memory_userId_idx" ON "Memory"("userId");

-- CreateIndex
CREATE INDEX "Memory_confirmed_idx" ON "Memory"("confirmed");

-- CreateIndex
CREATE INDEX "PendingCandidate_userId_idx" ON "PendingCandidate"("userId");

-- AddForeignKey
ALTER TABLE "CareerContext" ADD CONSTRAINT "CareerContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerHypothesis" ADD CONSTRAINT "CareerHypothesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypothesisEvidence" ADD CONSTRAINT "HypothesisEvidence_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "CareerHypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypothesisEvidence" ADD CONSTRAINT "HypothesisEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerExperiment" ADD CONSTRAINT "CareerExperiment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerExperiment" ADD CONSTRAINT "CareerExperiment_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "CareerHypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerExperiment" ADD CONSTRAINT "CareerExperiment_outcomeEvidenceId_fkey" FOREIGN KEY ("outcomeEvidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCandidate" ADD CONSTRAINT "PendingCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

