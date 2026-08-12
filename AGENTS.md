# AGENTS.md — Canonical guide for AI coding agents

This is a personal project for one user. It will be picked up by different AI coding agents
(Claude Code, Codex, Manus, Perplexity Computer, GitHub Copilot) and possibly a human developer,
often without any memory of prior sessions. This file is the source of truth for continuing work
safely. Keep it current — update "Current Project State" and "Next Recommended Tasks" at the end
of every meaningful milestone.

## Product purpose

Mentor is a longitudinal Career Operating System — not a chatbot. Its value comes from
accumulating structured, evidence-linked, epistemically-honest knowledge about the user's career
(timeline, people, goals, constraints, evidence, hypotheses, experiments, decisions) and reasoning
over it. Read PRODUCT.md first — especially "Epistemic model," "Seniority is reasoning context,"
and "M0 scope" before touching any reasoning or memory code.

The current priority is **M0 — Career Intelligence Prototype**: prove the core loop (career
context → conversation → evidence → hypothesis → experiment → outcome → updated belief) works and
reasons well, before building the broader CRUD surface. See ROADMAP.md.

## Architecture summary

Modular monolith. Fastify + TypeScript backend, Postgres via Prisma, React Native/Expo frontend
(web-first for M0). Two reasoning layers sit between the API and the model:

```
UI/API → CareerReasoningEngine → retrieval/memory/prompts/tools → AIProvider → model
```

`AIProvider` = "how do I talk to a model." `CareerReasoningEngine` = "how does Mentor reason about
a senior professional's career." Route handlers must go through `CareerReasoningEngine`, never
call `AIProvider` or assemble prompts directly. Full detail and rationale in ARCHITECTURE.md —
read it before restructuring anything, especially § 6 (CareerReasoningEngine) and § 7 (epistemic
model).

## Product Invariants

**These are rules future AI coding agents must not casually violate.** If a change would violate
one of these, stop and flag it rather than working around it silently.

1. Never present an AI inference as a confirmed fact.
2. User-reported interpretations remain interpretations unless independently supported by an
   `observed_outcome`.
3. Advice should connect to available evidence where possible — not just the latest message's
   emotional tone.
4. Recommendations should explain why they matter: why, with whom, toward what objective.
5. Important recommendations should have an observable success signal.
6. Seniority must materially affect the advice — never fall back to generic junior-career coaching
   ("update your LinkedIn," "network more," "ask for feedback") without the why/with-whom/
   toward-what-objective reasoning attached.
7. Do not automatically recommend changing jobs before analyzing the existing organizational
   environment.
8. Do not assume management is inherently better than senior IC/technical leadership — staying an
   IC, architecture, product leadership, or consulting are all legitimate outcomes.
9. Separate mentorship from sponsorship — a mentor gives advice, a sponsor advocates when the user
   isn't in the room and has power to affect their next role. Don't conflate them in code or UI.
10. Longitudinal evidence should outweigh the emotional tone of the latest conversation.
11. Hypotheses should be falsifiable — every hypothesis needs an experiment or an evidence path
    that could disconfirm it, not just support it.
12. Memory must remain confirm-before-persist, with the epistemic type and source type visible and
    editable before confirmation. Nothing is written silently.
13. Do not introduce fake numerical precision (no "72% confidence," no "Leadership score: 87/100").
    Use qualitative categories (tentative/moderate/strong) with evidence counts shown.
14. Do not optimize for user agreement — respectful challenge is a core product behavior, not a
    failure mode to smooth over.
15. Do not let career-specific reasoning logic leak into route handlers, UI components, or
    provider-specific code — it belongs in `CareerReasoningEngine` / `ai/reasoning`.

When modifying a reasoning-lens prompt, a `CareerReasoningEngine` method, or memory extraction,
check the relevant scenarios in `evaluations/golden-career-scenarios.md` against these invariants
before considering the change done.

## Coding conventions

- TypeScript strict mode everywhere. No `any` without a comment explaining why.
- One Fastify route file per resource under `backend/src/api/`. Routes call
  `CareerReasoningEngine` methods; they do not assemble prompts or call `AIProvider` directly.
- All AI calls go through `AIProvider` (`backend/src/ai/providers/`), which is only ever called
  from inside `ai/reasoning` (`CareerReasoningEngine`) and its supporting retrieval/memory/prompts
  modules — never from a route handler or UI component.
- Prompts live in `backend/src/ai/prompts/<feature>/vN.ts`. Bump the version file, don't mutate an
  existing version in place, if the change is significant enough to want a rollback path.
- Zod schemas validate all API inputs/outputs, including the epistemic/source type enums on
  Evidence/Memory records.
- Prisma migrations are the only way schema changes reach the database — never hand-edit the DB.
- Tests: Vitest for backend logic, especially `ai/retrieval`, `ai/memory`, and `ai/reasoning` (the
  parts most likely to silently regress on the invariants above). UI tests are lower priority for
  M0.

## Directory structure

See ARCHITECTURE.md § Repository structure. Note the addition of `backend/src/ai/reasoning/`
(CareerReasoningEngine) and repo-root `evaluations/golden-career-scenarios.md` in this revision.

## Important design decisions (don't casually reverse these)

- **Structured relational data is the core memory, not a vector store.** Vector search (M4) is an
  additive retrieval enhancement, added only when structured filtering demonstrably misses
  relevant context. Do not replace the relational schema with an embeddings-only approach.
- **Memory is confirm-before-persist, with epistemic typing.** Never auto-save every conversational
  statement as a durable fact, and never let an `ai_inference`-sourced record silently become
  `epistemic_type: fact`. The extraction pipeline proposes with full typing; the user
  confirms/edits/rejects.
- **No fake precision.** Qualitative confidence categories + evidence counts, not scores or
  percentages, for both Career Hypotheses and Management Readiness.
- **AIProvider abstraction is load-bearing; CareerReasoningEngine is the layer above it.** Do not
  add a second, competing way to call a model, and do not let reasoning logic bypass the engine and
  talk to `AIProvider` directly from a route or UI component.
- **M0 has no auth by design**, not by oversight — it's local, single-user, not network-exposed.
  Auth is an M1 concern. This does not defer privacy/export/delete guarantees, which apply from M0.
- **Mentor and sponsor are distinct relationship types**, not synonyms — don't collapse the
  Sponsorship Map into generic "relationships" without preserving that distinction.
- **Seven reasoning lenses are an internal orchestration concept**, not seven user-facing modes.
  The user-facing surface is Coach / Challenge Me / Help Me Decide.

## How to run the application

See README.md "Getting started" for installation, database setup, and running instructions.
The backend uses a repository factory: `REPOSITORY_PROVIDER=supabase` for PostgreSQL,
`REPOSITORY_PROVIDER=memory` for in-memory (tests/fast dev), or `auto` (default — uses
Supabase when credentials are available).

## How to test

```bash
cd backend && npm test        # Vitest
cd backend && npm run lint    # ESLint
cd backend && npm run typecheck
```

## How database migrations work

`cd backend && npx prisma migrate dev --name <description>` after editing
`backend/prisma/schema.prisma`. Commit the generated migration folder. Never edit an already-applied
migration file; create a new one.

## How AI prompts are organized

`backend/src/ai/prompts/<feature>/vN.ts` — one file per reasoning lens/feature per version.
Assembled at call time by `CareerReasoningEngine` (via `ai/retrieval`), then passed to
`AIProvider.chat()`. Never inlined in route handlers or UI components.

## How the AI provider abstraction works

See ARCHITECTURE.md § 5. Env var `AI_PROVIDER` selects the implementation via a factory in
`backend/src/config/`. Adding a provider = implementing the `AIProvider` interface + registering it
in the factory. `AIProvider` is only ever called from inside `ai/reasoning` and its supporting
modules — see § Coding conventions.

## How database migrations work

(see above)

## Areas agents must not casually modify

- The `AIProvider` interface shape (breaks every provider implementation at once).
- The `CareerReasoningEngine` interface boundary (route handlers must go through it).
- The confirm-before-persist, epistemically-typed memory flow (a product/privacy requirement, not
  an implementation detail).
- Prisma schema for already-shipped tables without a migration — never hand-edit data or schema
  outside `prisma migrate`.
- The Product Invariants list above — extend it with discussion, don't quietly narrow it.

## Current Project State

_(Update this section every milestone.)_

- Repository scaffolded with PRODUCT.md, ARCHITECTURE.md, ROADMAP.md, README.md, AGENTS.md,
  CHANGELOG.md, `.env.example`, `.gitignore`.
- **M0 Stage A complete** — Career context capture + Coach conversation with epistemic claim
  analysis. The user can enter minimal career context, start a conversation, and receive a
  response that includes a structured claim decomposition (fact/interpretation/assumption/
  hypothesis/emotion). The response uses the MockProvider (placeholder) by default; set
  `AI_PROVIDER=perplexity` and `PERPLEXITY_API_KEY` for real AI reasoning.
- **M0 Stage B complete** — Memory candidate extraction with confirm/edit/reject flow.
  After each conversation turn, the engine proposes structured Evidence/Memory candidates
  with full epistemic/source typing. Candidates are pending until the user explicitly
  confirms, edits, or rejects them. Rejected candidates are deleted — nothing is persisted.
  Edits are validated again at the persistence boundary (ai_inference + fact is rejected in
  code, not just by prompt). Confirmed candidates are persisted as Evidence + Memory records.
  MockProvider generates deterministic mock candidates marked with [Mock] prefixes.
- **M0 Stage C complete** — Hypothesis creation and evaluation. Users create hypotheses from
  confirmed evidence. `evaluateHypothesis()` computes qualitative confidence
  (tentative/moderate/strong) from evidence counts, identifies untested assumptions, and
  produces a rationale referencing the actual evidence content. `creationRationale` is never
  overwritten — only `lastAssessmentRationale` is updated by evaluation.
- **M0 Stage D complete** — Experiment recommendation and creation. `recommendExperiment()`
  proposes an experiment with supporting/contradicting/inconclusive signals, a review date,
  and a rationale. Experiments are explicitly created by the user — no silent auto-creation.
  Review date validation uses a strict `YYYY-MM-DD` schema shared between the API and AI
  domain layers (single source of truth, no drift).
- **M0 Stage E complete** — Experiment outcome recording. The user records what happened,
  separating raw narrative (`outcomeText`, preserved verbatim on the Experiment) from a
  normalized factual observation (`observedFact`, becomes `observed_outcome` Evidence with
  `epistemic_type: fact`). Supports/contradicts require `observedFact`; inconclusive does
  not. Persistence is atomic — `recordExperimentOutcomeAtomic` on the repo creates Evidence
  + updates the experiment in one transaction. No orphaned Evidence possible.
- **M0 Stage F structurally implemented** — The core M0 loop is closed:
  context → conversation → evidence → hypothesis → experiment → outcome → updated hypothesis.
  `reviewExperimentOutcome()` links the outcome Evidence to the experiment's authoritative
  hypothesis (via `experiment.hypothesisId`, never LLM-inferred), re-evaluates using all
  linked evidence (prospective evaluation before persistence), and persists the link +
  updated hypothesis confidence + rationale + experiment review marker in one atomic
  transaction (`applyExperimentOutcomeReviewAtomic`). Returns a structured
  `ExperimentReviewResult` with the full before/after delta (previous/new confidence,
  supporting/contradicting counts, rationale, and a human-readable explanation).
  Idempotent — a second review call throws `ReviewError`. Confidence may stay the same.
  Strong confidence does not automatically set status to confirmed.
  **Transaction-boundary integrity enforcement**: `applyExperimentOutcomeReviewAtomic`
  derives ALL relationship-sensitive values (hypothesisId, evidenceId, linkType) from the
  stored Experiment — the caller cannot supply them. The repo validates that supports
  outcomes create only `supports` links, contradicts create only `contradicts` links,
  inconclusive creates no link, and the outcome Evidence is `sourceType: observed_outcome`
  + `epistemicType: fact`. Missing or mistyped Evidence for supports/contradicts is
  treated as corrupted state and rejected — never silently processed as inconclusive.
  **138 tests passing** (typecheck, lint, tests all green; frontend typecheck green).
- **Backend** (`backend/`): Fastify + TypeScript + Prisma + Vitest + ESLint. AIProvider interface
  with MockProvider and PerplexityProvider. CareerReasoningEngine with `analyzeClaim()`,
  `respond()`, `extractMemoryCandidates()`, `evaluateHypothesis()`, `recommendExperiment()`,
  `recordExperimentOutcome()`, and `reviewExperimentOutcome()`. Epistemic enforcement in code
  (`validateEpistemicPair` rejects ai_inference+fact at extraction and persistence boundaries).
  Qualitative confidence computation (`computeConfidence` — tentative/moderate/strong,
  provisional M0 heuristic). Four reasoning-lens prompts (Coach, Challenger, Decision Advisor,
  Extraction v1). Retrieval module. In-memory conversation repository with evidence, memory,
  pending candidates, hypotheses, evidence links, experiments, and atomic outcome/review
  methods. Fastify routes for context, conversations, candidates, evidence, memory,
  hypotheses, and experiments (including outcome recording and review). Zod validation
  including `claimComponentTypeSchema`, `epistemicTypeSchema`, `recordOutcomeSchema`
  (with `superRefine` for observedFact requirement), and strict `reviewDateSchema`.
- **Frontend** (`apps/mobile/`): Expo + TypeScript + Expo Router. Career context capture screen.
  Coach chat screen with Coach / Challenge Me / Help Me Decide controls. Claim analysis panel
  with color-coded epistemic decomposition. Candidate review panel with Confirm / Edit / Reject
  buttons, mock badges, and inline editing. Hypotheses screen with confidence display and
  evidence links. Experiments screen with creation, recommendation, outcome recording
  (narrative + observedFact + classification), and Stage F review delta display (before/after
  confidence, evidence counts, what-changed explanation).
- **Prisma schema** (`backend/prisma/schema.prisma`): M0 subset applied and validated.
  Includes `OutcomeClassification` enum, Stage E/F fields on `CareerExperiment`
  (`outcomeClassification`, `outcomeEvidenceId`, `reviewedAt`) with an explicit `Evidence`
  relation (`ExperimentOutcomeEvidence`), and `PendingCandidate` model (persistent candidate
  queue). Migration `m0_initial_schema` applied to Supabase PostgreSQL. Migration SQL is
  committed at `backend/prisma/migrations/20260812000000_m0_initial_schema/migration.sql`.
- **No auth** — M0 is localhost-only, single-user, per ARCHITECTURE.md § 2. Auth is documented as
  a future trigger, not implemented.
- **PostgreSQL-backed**: `SupabaseConversationRepository` implements the full
  `ConversationRepository` interface using the Supabase JS client (PostgREST API).
  Repository factory in `backend/src/modules/conversations/factory.ts` selects between
  in-memory and Supabase based on `REPOSITORY_PROVIDER` env var. The M0 local user
  (`m0-local-user`) is upserted at database setup time. 209 tests passing (138 existing +
  34 in-memory contract + 34 Supabase contract + 3 persistence/restart), typecheck, lint,
  and frontend typecheck all green.

### M0 status: structurally implemented and PostgreSQL-backed, not yet product-validated

The M0 loop is **structurally implemented and PostgreSQL-backed** — all stages (A through F)
are implemented, the data flows correctly from context through to updated hypothesis,
persistence is atomic, epistemic invariants are enforced in code, the transaction boundary
protects relationship-sensitive values from caller manipulation, data persists to real
PostgreSQL via Supabase, and 209 tests verify the plumbing, validation, edge cases,
integrity guards, and cross-restart persistence. However, **M0 is not yet
product-validated**. Unit tests verify structure, not reasoning. The `MockProvider` and
`StubProvider` return deterministic placeholders, not genuine career reasoning. The
following remain before M0 can be called product-validated:

1. **Golden Career Scenarios evaluation**: Manually exercise scenarios #1, #3, #4, #5, #8, #10
   from `evaluations/golden-career-scenarios.md` against the full reasoning loop using a real
   AIProvider (Perplexity). Do not evaluate against MockProvider. This is the acceptance
   step for M0 reasoning quality — unit tests passing does not constitute proof.
2. **Real-provider integration testing**: Verify that `analyzeClaim()`, `respond()`,
   `extractMemoryCandidates()`, and `recommendExperiment()` produce genuinely useful output
   with a real model, not just structurally valid output.

## Next Recommended Tasks

1. **Golden Career Scenarios evaluation**: Once a real AIProvider (Perplexity) is connected,
   manually exercise scenarios #1, #3, #4, #5, #8, #10 against the reasoning loop. Do not
   evaluate scenarios against MockProvider. This is the acceptance step for M0 reasoning
   quality — unit tests passing does not constitute proof.
2. **Real-provider integration testing**: Verify that `analyzeClaim()`, `respond()`,
   `extractMemoryCandidates()`, and `recommendExperiment()` produce genuinely useful output
   with a real model, not just structurally valid output.
3. Push initial commits to `https://github.com/pushkarravi/Mentor`.
4. After M0 is product-validated via Golden Scenarios, begin M1
   (Career Context expansion). Do not begin M1 before M0 is product-validated.
