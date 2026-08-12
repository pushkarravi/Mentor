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

See README.md "Getting started" (updated once application code exists — M0 has no code yet as of
this revision).

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
  CONTRIBUTING.md, CHANGELOG.md, `.env.example`, `.gitignore`.
- **This revision (v2 of the docs)** re-scoped the plan around M0 — Career Intelligence Prototype
  — before any broader CRUD build: added the epistemic model (source_type/epistemic_type),
  `CareerReasoningEngine` as an explicit layer above `AIProvider`, Career Strategy/Target Role
  Thesis, Sponsorship Map (as a Person/Relationship concept, not a new table), Management Readiness
  leadership domains, qualitative-only confidence, a reduced 3-control user-facing surface (Coach /
  Challenge Me / Help Me Decide) over the 7 internal reasoning lenses, and a Golden Career
  Scenarios evaluation suite at `evaluations/golden-career-scenarios.md`.
- No application code written yet. Prisma schema, backend, and frontend app have not been
  implemented. M0's schema is deliberately smaller than the original full data model — see
  ARCHITECTURE.md § 9 "M0 subset."
- Git repository initialized locally, two commits so far (initial scaffold, this revision).
  Target remote: `https://github.com/pushkarravi/Mentor` (not yet pushed).

## Next Recommended Tasks

1. Write the **M0 subset** of `backend/prisma/schema.prisma` (User, CareerContext, Person,
   Evidence, CareerHypothesis, HypothesisEvidence, CareerExperiment, Conversation, Message,
   Memory) per ARCHITECTURE.md § 9, and run the first migration against local Postgres.
2. Implement `AIProvider` interface + `PerplexityProvider`.
3. Implement the **M0 method set** of `CareerReasoningEngine` (`analyzeClaim`,
   `evaluateHypothesis`, `recommendExperiment`, `reviewExperimentOutcome`) — leave the M2/M3
   methods as documented stubs, not half-implementations.
4. Build the memory-extraction pipeline with epistemic/source typing and the confirm/edit/reject
   flow.
5. Read `evaluations/golden-career-scenarios.md` and validate the M0 reasoning loop against at
   least a handful of those scenarios before calling M0 "done."
6. Scaffold the Expo app (`apps/mobile/`) with a single Coach chat screen (Coach / Challenge Me /
   Help Me Decide controls) hitting the backend — minimal context capture, no full onboarding flow.
7. Wire the vertical slice end-to-end: minimal context → Coach conversation → evidence saved →
   hypothesis created/updated → experiment created → (later) outcome recorded → hypothesis
   assessment updated and visible.
8. Push initial commits to `https://github.com/pushkarravi/Mentor`.
