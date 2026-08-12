# Changelog

All notable changes to Mentor are documented in this file.

## [Unreleased] — M0 Stage A: Career Context + Coach Conversation

### Added

- **Backend scaffold** (`backend/`): Fastify + TypeScript + Prisma + Vitest + ESLint
  - `AIProvider` interface with `MockProvider` (placeholder for structure testing)
    and `PerplexityProvider` (real AI reasoning), selected via `AI_PROVIDER` env var
  - `CareerReasoningEngine` with `analyzeClaim()` and `respond()` methods
    — the reasoning layer between routes and the AI provider
  - Epistemic enforcement in code: `validateEpistemicPair()` rejects
    `ai_inference` + `fact` pairs (Product Invariant #1, #12)
  - `computeConfidence()` — qualitative confidence categories
    (tentative/moderate/strong) from evidence counts, no fake precision
  - Three reasoning-lens prompts: Coach (v1), Challenger (v1), Decision Advisor (v1)
  - Retrieval module for context assembly (career context, hypotheses,
    evidence, conversation history)
  - In-memory conversation repository (works without Postgres; Prisma-ready interface)
  - Fastify routes for career context (GET/POST) and conversations
    (create, list, get, send message)
  - Zod schemas for all API inputs/outputs
  - M0 Prisma schema: User, CareerContext, Person, Evidence, CareerHypothesis,
    HypothesisEvidence, CareerExperiment, Conversation, Message, Memory
  - Docker Compose for local PostgreSQL
  - 15 Vitest tests covering epistemic enforcement and qualitative confidence

- **Frontend scaffold** (`apps/mobile/`): Expo + TypeScript + Expo Router
  - Career context capture screen (role, years, target outcome, why-not-yet)
  - Coach chat screen with Coach / Challenge Me / Help Me Decide controls
  - Claim analysis panel showing epistemic decomposition
    (fact/interpretation/hypothesis/emotion color-coded)
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

### Not yet implemented (deferred to later stages)

- Stage B: Memory candidate extraction + confirm/edit/reject flow
- Stage C: Hypothesis creation and evaluation
- Stage D: Experiment recommendation
- Stage E: Outcome recording
- Stage F: Close the loop (outcome → evidence → hypothesis reassessment)
- Golden Career Scenarios evaluation (requires a real AIProvider)
- Auth (M1 concern per architecture)
