# ARCHITECTURE.md — Mentor

## 1. Style

Modular monolith. No microservices, no premature infra. One backend service, one frontend app,
one Postgres database. Split into clear internal modules so it can be decomposed later if it ever
needs to be — but don't build for that scale on day one. This is unchanged from the original
architecture and remains correct for M0–M4.

## 2. Stack

**Frontend:** React Native + Expo + TypeScript + Expo Router. Targets iOS/Android/Web, but M0/MVP
validation happens on the web build (`expo start --web`) for iteration speed. Native builds are a
post-M4 concern — the code is written to support them from the start (no web-only APIs), we just
don't spend time on device builds/signing yet.

**Backend:** Node.js + TypeScript + Fastify.

**Database:** PostgreSQL, accessed through Prisma (typed client + migrations). Runs locally
(Docker Compose) through at least M0–M3. The schema is written to be Postgres-portable so a later
move to hosted Supabase is realistic — but see § 9 for an honest breakdown of what is and isn't
"just a connection string."

**Auth (revised for M0):** M0 runs locally, single user, no network exposure — **no login system
is built for M0.** The original plan (email/password + bcrypt + JWT) is deferred to M1, when the
app first has a reason to be reachable outside a local dev machine. Building auth infrastructure in
M0 would spend effort that doesn't help answer M0's actual question ("can the reasoning loop work
well"), and a personal, localhost-only app doesn't need it yet.

This does **not** mean privacy is deferred — see § 10. Auth (access control) and privacy (data
handling, export, deletion, what's sent to AI providers) are different concerns; M0 defers the
former, not the latter. If M0 is ever run somewhere other than localhost (e.g. a shared dev
server), add a minimal shared-secret gate before that happens — full multi-user auth is still not
warranted until there's an actual second user.

## 3. Why not vector-first / microservices

- **Vector DB as primary store:** rejected for MVP. The product's value is structured, falsifiable
  claims (hypotheses, evidence, dimensions) — that needs relational integrity (foreign keys,
  joins, "show me all evidence contradicting hypothesis X"), which SQL does natively and vector
  stores don't. Semantic search is added later (M4: pgvector column on `Memory`/`Evidence`/
  `Message.summary`) as a *retrieval enhancement* once there's enough conversation volume that
  keyword/recency filtering stops being good enough.
- **Microservices:** rejected — one user, one team (you + AI agents), no scaling problem to solve.
  A modular monolith with clean module boundaries (`/ai`, `/career`, `/api`) gets 90% of the
  benefit with 10% of the operational cost.

## 4. Repository structure

```
Mentor/
  apps/
    mobile/                 # Expo app (web/iOS/Android)
      app/                  # Expo Router routes
      components/
      lib/                  # API client, auth storage (added when auth lands, M1+)
  backend/
    src/
      ai/
        providers/          # AIProvider implementations (Perplexity, OpenAI, Anthropic, ...)
        prompts/             # versioned prompt files per reasoning lens / feature
        tools/               # tool/function-call definitions for the AI
        retrieval/           # context assembly (structured queries today, +vector in M4)
        memory/              # memory-extraction pipeline (propose w/ epistemic typing → user
                              #   confirms/edits/rejects → persist)
        reasoning/           # CareerReasoningEngine — see § 6. New in this revision.
        evaluations/         # golden-scenario harness location once app code exists; for now
                              #   the scenarios live at repo-root `evaluations/` (see § 11)
      modules/
        career/              # roles, companies, goals, constraints, timeline, career strategy
        people/               # people + relationships (sponsorship map is a query over this)
        evidence/             # evidence, hypotheses, experiments
        readiness/            # management-readiness domains/dimensions
        situations/           # situation analysis (M2)
        decisions/            # decision journal (M2)
        reviews/              # weekly review (M2)
        conversations/        # conversation + message persistence
        export/               # data export/delete
      api/                   # Fastify routes, one file per resource — routes call
                              #   CareerReasoningEngine, never AIProvider directly (§ 6)
      db/                    # Prisma schema + migrations
      auth/                  # added in M1, not M0
      config/                # env/config loading, AIProvider selection
    prisma/
  evaluations/
    golden-career-scenarios.md   # human-readable golden suite, see § 11
  .env.example
  AGENTS.md
  README.md
  CONTRIBUTING.md
  CHANGELOG.md
  ROADMAP.md
  PRODUCT.md
```

Change from the original scaffold: added `backend/src/ai/reasoning/` for the
`CareerReasoningEngine` layer, and a repo-root `evaluations/` directory for the golden scenario
suite (created now, ahead of application code, per this revision).

## 5. AI provider abstraction

Unchanged in principle — this remains correct, it's just no longer the layer that talks to the
rest of the app directly (see § 6).

```ts
interface AIProvider {
  chat(input: {
    messages: ChatMessage[];
    system: string;
    tools?: ToolDefinition[];
  }): Promise<ChatResult>;
}
```

- `backend/src/ai/providers/perplexity.ts` — first implementation (env: `AI_PROVIDER=perplexity`,
  `PERPLEXITY_API_KEY`).
- Stubs for `openai.ts`, `anthropic.ts`, `google.ts`, `openrouter.ts`, `local.ts` (M4+) with the
  same interface, wired via a factory keyed off `AI_PROVIDER` env var. Nothing in `/api`, the
  frontend, or `CareerReasoningEngine` ever imports a provider SDK directly — everything goes
  through `AIProvider`.
- `AIProvider` answers **"how do I talk to this model?"** — nothing about career reasoning belongs
  here.

## 6. CareerReasoningEngine (new)

Provider abstraction alone is not enough — it would leave "retrieve context → build a big prompt →
call the LLM" as ad hoc logic scattered across route handlers, which is exactly what we're trying
to avoid per the original repo-portability goals.

`CareerReasoningEngine` is the application-level layer that answers **"how does Mentor reason
about a senior professional's career?"** It sits between the API layer and the
retrieval/memory/prompts machinery:

```
UI/API
   ↓
CareerReasoningEngine
   ↓
retrieval / memory / prompts / tools
   ↓
AIProvider
   ↓
Perplexity / OpenAI / Anthropic / etc.
```

Route handlers call `CareerReasoningEngine` methods; they never assemble prompts or call
`AIProvider` themselves. This is where the seven reasoning lenses (Mentor, Challenger, Strategist,
Manager Coach, Executive Coach, Decision Advisor, Reflection Partner) actually live as selectable
prompt/behavior strategies, and where product invariants (AGENTS.md § Product Invariants) get
enforced in code, not just in prompt text — e.g. the engine is what refuses to write an
`ai_inference`-sourced record as `epistemic_type: fact` regardless of what a model returns.

**M0 method set** (implement only what the vertical slice needs):

```ts
interface CareerReasoningEngine {
  analyzeClaim(input: UserMessage): Promise<ClaimAnalysis>;        // fact/interpretation/hypothesis split
  evaluateHypothesis(hypothesisId: string): Promise<HypothesisAssessment>;
  recommendExperiment(hypothesisId: string): Promise<ExperimentProposal>;
  reviewExperimentOutcome(experimentId: string, outcome: string): Promise<HypothesisAssessment>;
}
```

**Deferred to the milestone that needs them** (M2/M3, stubbed with a "not implemented" error until
then rather than half-built now):

```ts
analyzeSituation()        // M2
prepareDecision()         // M2
assessLeadershipReadiness() // M3
analyzeCareerStrategy()   // M3
analyzeSponsorship()      // M3
```

This is a deliberate narrowing from a nine-method interface designed up front — see the
disagreement noted in the summary sent alongside this revision: implementing all nine now would be
speculative generality against a product that hasn't yet proven its core loop.

## 7. Epistemic model (new)

Every candidate memory/evidence record carries two independent classifications, enforced by
`CareerReasoningEngine`/the memory-extraction pipeline, not left to prompt discipline alone:

```ts
type SourceType    = "user_report" | "imported_document" | "ai_inference" | "observed_outcome";
type EpistemicType = "fact" | "interpretation" | "hypothesis" | "emotion" | "action";
```

Rules enforced at the engine layer:
- An `ai_inference`-sourced record's `epistemic_type` can never be silently written as `fact`.
- Only `observed_outcome` (something that actually happened and was reported back, e.g. "was
  invited to the next planning meeting") can upgrade a hypothesis's supporting/contradicting
  evidence in a way that moves its confidence category.
- The memory-extraction pipeline must attach `source_type` + `epistemic_type` + a short "why this
  might be worth saving" to every candidate before it's shown to the user for confirm/edit/reject —
  see § 8.

## 8. Memory & retrieval flow (M0)

1. User sends a message to the Coach.
2. `CareerReasoningEngine.analyzeClaim()` separates the message into fact/interpretation/
   assumption/emotion/hypothesis/action components before any response is generated — this is a
   distinct step, not an implicit side effect of prompting.
3. `ai/retrieval` assembles context: minimal career context, open hypotheses relevant to the
   message, recent evidence, and recent conversation history.
4. `ai/prompts` renders the appropriate reasoning-lens prompt(s) + assembled context +
   the claim analysis from step 2.
5. `AIProvider.chat()` returns a response; it's stored as a `Message`.
6. `ai/memory/extract.ts` proposes candidate structured records (new Evidence, a Hypothesis
   update, etc.), each carrying: record type, extracted statement, `epistemic_type`, `source_type`,
   a qualitative certainty category where relevant, a suggested linked entity, and the reason it
   might be worth saving.
7. Candidates are shown to the user as a **confirm / edit / reject** list (edit includes being able
   to correct the epistemic type itself) — nothing is persisted without this step.
8. When an Experiment's outcome is later recorded, `reviewExperimentOutcome()` re-evaluates the
   linked Hypothesis's confidence category using the updated evidence — this closing-the-loop step
   is the actual product bet for M0, not a nice-to-have.
9. (M4) Once `Message`/`Evidence` volume is large enough that step 3's SQL filtering misses
   relevant context, add a `pgvector` embedding column and blend semantic + structured retrieval.
   Documented now, not built now.

## 9. Data model

See `backend/prisma/schema.prisma` for the authoritative schema (created when application code
starts, M0). Summary of entities and normalization decisions, updated for this revision:

**M0 subset** (only what the vertical slice needs):
- `User` — single row for M0, no auth table relationship needed yet.
- `CareerContext` — the minimal-context fields from PRODUCT.md § Minimal M0 context (role, years
  of experience, target outcome, self-reported "why not yet" — the last one stored with
  `epistemic_type: interpretation` from the moment it's captured, since it's the user's own theory,
  not a fact).
- `Person` — bare name + role, optional in M0, fleshed out in M1 with `Relationship`.
- `Evidence` — `source_type`, `epistemic_type`, description, optional link to `Person`, optional
  link to `CareerHypothesis` (via join table, below).
- `CareerHypothesis` + join table `HypothesisEvidence(evidenceId, hypothesisId, supports: boolean)`
  so one piece of evidence can support one hypothesis and contradict another. `confidence` is a
  qualitative enum (`tentative | moderate | strong`) computed/reviewed from the evidence counts,
  not stored as a free-floating number.
- `CareerExperiment` (linked to a `CareerHypothesis`, has `successSignal`, `reviewDate`, `status`,
  `outcome` — recording the outcome is what triggers `reviewExperimentOutcome()`).
- `Conversation`, `Message` (role, content, `reasoningLens` used if any, createdAt).
- `Memory` (confirmed structured facts extracted from conversation; `sourceType`, `epistemicType`,
  `sourceMessageId`, `entityType`/`entityId` link back to whatever table it became, `confirmed:
  boolean`, plus `editedBeforeConfirm: boolean` so we can see how often extraction gets it wrong).

**Added in M1+** (documented now so M0's schema doesn't need a rework, not built in M0):
- `Company`, `CareerRole`, `CareerEvent` — full timeline.
- `Relationship` (type: manager/skip-level/VP/peer/direct-report/mentor/sponsor/stakeholder, plus
  free-text influence/trust/history/goals/commitments/political-importance notes). **Sponsorship
  Map is a query/view over `Person` + `Relationship`** (e.g. "people with relationship type
  containing sponsor" and "people who could plausibly sponsor but have no sponsor-type
  relationship recorded"), not a separate top-level table — mentor and sponsor are just two
  possible relationship types a `Person` can hold, and a person can hold both over time.
- `CareerGoal`, `Constraint`.
- `CareerStrategy` (aka Target Role Thesis — see PRODUCT.md § 5): target role/scope/timeframe,
  preferred/alternative path, attractiveness/achievability rationale, required vs. missing
  experiences, required leadership evidence, required sponsorship, stakeholders (links to
  `Person`), organizational opportunities, external-market alternatives, constraints, risks,
  leading indicators, assumptions being tested (the last two as JSON lists — variable-shape,
  revised over time, not worth full normalization).

**Added in M2+:**
- `Situation` (structured fields matching the spec's analysis template, plus `outcomeRecordedAt`/
  `actualOutcome` for later follow-up).
- `Decision` (options/assumptions/risks as JSON — inherently variable-shape).
- `WeeklyReview` (structured answers as JSON + generated observations/patterns/risks/
  opportunities/actions as text).
- `ActionItem` (generic follow-up, optionally linked to an experiment/situation/decision/review).

**Added in M3+:**
- `ReadinessDomain` (the five leadership domains) + `ReadinessDimension` (detailed dimensions,
  each belonging to a domain) + `ReadinessObservation` (qualitative assessment + evidence link +
  confidence category) — avoids a single mutable "score" field, keeps history, groups under
  domains per PRODUCT.md § Management Readiness.

**Added in M4+:**
- `Document` (resume/LinkedIn/performance-review import — `type`, `rawText`, `parseStatus`).
- Embedding columns on `Memory`/`Evidence`/`Message` for pgvector.

## 10. Privacy

- No secrets in git — `.env` is gitignored, `.env.example` documents required vars with no values.
- All AI calls documented in `AGENTS.md` under "what is sent to AI providers": conversation
  messages, assembled structured context, and system prompts. No third-party analytics SDK.
- `export/` module supports full JSON export and full account deletion (cascade delete across all
  tables) from Settings — this applies from M0 onward regardless of the auth decision in § 2;
  deferring login is not the same as deferring data-ownership guarantees.

## 11. Database migration vs. auth/authorization migration (clarified)

The original architecture implied moving from local Postgres to hosted Supabase is "essentially a
connection-string change." That's true for the **database** and misleading about **auth** — worth
separating explicitly:

### Database migration — likely straightforward
Both are Postgres. If the schema avoids Postgres-incompatible features, moving the data and
pointing `DATABASE_URL` at a hosted Supabase Postgres instance is close to a connection-string
change plus a data migration/export step.

### Auth/authorization migration — not straightforward, do not underestimate
M0/M1's plan (local email/password + bcrypt + JWT, or even no auth in M0) is a genuinely different
system from **Supabase Auth + Row-Level Security**. Moving to Supabase Auth means: re-issuing
sessions, mapping existing user rows to Supabase Auth user IDs, writing RLS policies for every
table (which only matters once there's more than one user, or the app is exposed beyond
localhost), and testing that policies don't silently over- or under-expose data. Treat this as its
own scoped project when it's actually needed (see ROADMAP.md "Later"), not a side effect of a
database move.

## 12. Golden Career Scenarios (new)

Before serious prompt optimization or broad feature development, `evaluations/
golden-career-scenarios.md` (repo root, since no application code exists yet — see § 4) holds
~12–15 canonical senior-career scenarios: context, known facts, existing evidence/hypotheses, the
user's message, and both weak-response and strong-response characteristics, each tagged with the
Product Invariants (AGENTS.md) it exercises.

**How agents should use this file:** before changing a reasoning-lens prompt, a
`CareerReasoningEngine` method, or the memory-extraction logic, re-read the scenarios that
exercise the area you're touching and sanity-check the new behavior against "weak response" vs.
"strong response" for at least those scenarios. This is a human-readable check for M0 — automated
scoring is explicitly deferred (see ROADMAP.md "Later") so it doesn't block getting the reasoning
loop built and reviewed.
