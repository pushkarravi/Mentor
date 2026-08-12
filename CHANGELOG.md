# Changelog

All notable changes to Mentor are documented in this file.

## [Unreleased] — M0 Stages A–F: Core Reasoning Loop

### Added

- **Backend scaffold** (`backend/`): Fastify + TypeScript + Prisma + Vitest + ESLint
  - `AIProvider` interface with `MockProvider` (placeholder for structure testing)
    and `PerplexityProvider` (real AI reasoning), selected via `AI_PROVIDER` env var
  - `CareerReasoningEngine` with `analyzeClaim()`, `respond()`,
    `extractMemoryCandidates()`, `evaluateHypothesis()`, `recommendExperiment()`,
    `recordExperimentOutcome()`, and `reviewExperimentOutcome()` — the reasoning layer
    between routes and the AI provider
  - Epistemic enforcement in code: `validateEpistemicPair()` rejects
    `ai_inference` + `fact` pairs (Product Invariant #1, #12)
  - `computeConfidence()` — qualitative confidence categories
    (tentative/moderate/strong) from evidence counts, no fake precision
  - Three reasoning-lens prompts: Coach (v1), Challenger (v1), Decision Advisor (v1)
  - Retrieval module for context assembly (career context, hypotheses,
    evidence, conversation history)
  - In-memory conversation repository with evidence, memory, pending candidates,
    hypotheses, evidence links, experiments, and atomic outcome/review methods
  - Fastify routes for career context, conversations, candidates, evidence, memory,
    hypotheses, and experiments (including outcome recording and review)
  - Zod schemas for all API inputs/outputs, including `recordOutcomeSchema` with
    `superRefine` for observedFact requirement and strict `reviewDateSchema`
  - M0 Prisma schema: User, CareerContext, Person, Evidence, CareerHypothesis,
    HypothesisEvidence, CareerExperiment, Conversation, Message, Memory
  - Docker Compose for local PostgreSQL
  - 127 Vitest tests covering epistemic enforcement, qualitative confidence,
    hypothesis evaluation, experiment recommendation, outcome recording,
    and the full Stage F review loop

- **Stage C — Hypothesis creation and evaluation**
  - Users create hypotheses from confirmed evidence
  - `evaluateHypothesis()` computes qualitative confidence from evidence counts,
    identifies untested assumptions, and produces a rationale referencing evidence content
  - `creationRationale` is never overwritten — only `lastAssessmentRationale` is updated

- **Stage D — Experiment recommendation and creation**
  - `recommendExperiment()` proposes an experiment with supporting/contradicting/
    inconclusive signals, review date, and rationale
  - Experiments are explicitly created by the user — no silent auto-creation
  - Strict `YYYY-MM-DD` review date validation shared between API and AI domain layers

- **Stage E — Experiment outcome recording**
  - User records outcome with raw narrative (`outcomeText`) separate from normalized
    factual observation (`observedFact`)
  - `observedFact` becomes `observed_outcome` Evidence with `epistemic_type: fact`;
    raw narrative is preserved verbatim on the Experiment but never treated as fact
  - Supports/contradicts require `observedFact`; inconclusive does not
  - Atomic persistence via `recordExperimentOutcomeAtomic` — no orphaned Evidence
  - User-supplied classification and observedFact, not AI-inferred

- **Stage F — Experiment outcome review (the core M0 loop closure)**
  - `reviewExperimentOutcome()` closes the loop: completed experiment → outcome
    classification → observed_outcome Evidence → explicit Evidence→Hypothesis link
    → re-evaluate using all linked evidence → persist new confidence + rationale
    → return before/after delta
  - Uses `experiment.hypothesisId` as the authoritative hypothesis identity —
    never asks an LLM which hypothesis the outcome belongs to
  - Link direction derived from user's explicit Stage E classification, not LLM analysis
  - Prospective evaluation before persistence: evaluates the hypothesis with the
    new evidence in memory before persisting anything, then persists link + hypothesis
    + review marker atomically via `applyExperimentOutcomeReviewAtomic`
  - Returns `ExperimentReviewResult` with full before/after delta: previous/new
    confidence, supporting/contradicting counts, newly linked Evidence ID,
    untested assumptions, previous/new rationale, and a human-readable explanation
  - Confidence may stay the same — one supporting observation does not auto-upgrade
  - Strong confidence does not auto-set status to confirmed
  - Idempotent — second review call throws `ReviewError`, no duplicate evidence links
  - Inconclusive outcomes create no link, no evidence, no confidence change
  - 20 dedicated Stage F tests covering all link types, confidence transitions,
    idempotency, atomicity, creationRationale preservation, and no-numeric-probability

- **Frontend scaffold** (`apps/mobile/`): Expo + TypeScript + Expo Router
  - Career context capture screen (role, years, target outcome, why-not-yet)
  - Coach chat screen with Coach / Challenge Me / Help Me Decide controls
  - Claim analysis panel showing epistemic decomposition
    (fact/interpretation/hypothesis/emotion color-coded)
  - Candidate review panel with Confirm / Edit / Reject buttons, mock badges,
    inline editing
  - Hypotheses screen with confidence display and evidence links
  - Experiments screen with creation, recommendation, outcome recording
    (narrative + observedFact + classification), and Stage F review delta display
    (before/after confidence, evidence counts, what-changed explanation)
  - API client connecting to the Fastify backend

- **Project root**: workspace package.json, `.env.example`

### Migration status

The M0 Prisma schema (`backend/prisma/schema.prisma`) has been created and
validated (`prisma generate` succeeded). No migration has been applied yet —
`DATABASE_URL` is not available in this environment.

To generate and apply the migration locally:

```bash
cd backend
docker compose up -d        # start local PostgreSQL
# Set DATABASE_URL=postgresql://mentor:mentor@localhost:5432/mentor in .env
npx prisma migrate dev --name m0_initial_schema
```

### What works structurally vs. what still requires real-provider evaluation

The M0 loop is **structurally complete** — all stages (A through F) are implemented,
the data flows correctly, persistence is atomic, epistemic invariants are enforced
in code, and 127 unit tests verify the plumbing. However, **M0 reasoning quality
is not yet proven**. Unit tests verify structure, not reasoning. The remaining
acceptance step is Golden Career Scenarios evaluation against a real AIProvider.

### Not yet implemented (deferred)

- Golden Career Scenarios evaluation (requires a real AIProvider — the acceptance step)
- Prisma migration application (requires local PostgreSQL)
- Auth (M1 concern per architecture)
