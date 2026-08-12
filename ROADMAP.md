# ROADMAP.md — Mentor

Sequencing principle: prove the core reasoning loop works and is genuinely good before building the
Career Operating System around it. M0 is a reasoning prototype, not a CRUD app.

## M0 — Career Intelligence Prototype

**Goal:** prove Mentor can reason well about a senior professional's real career problem — not
that we can build screens. This is the first (and only) vertical slice before broader scope opens up.

Core loop: **Career context → Conversation → Evidence → Hypothesis → Experiment → Outcome →
Updated belief.**

Scope:
- [x] Minimal senior-career context capture (a handful of fields — see PRODUCT.md "Minimal M0
      context" — not the full onboarding flow)
- [x] `CareerReasoningEngine` skeleton + `AIProvider` with Perplexity implementation
- [x] Coach conversation with epistemic separation (fact / interpretation / assumption / emotion /
      hypothesis / action) — single default "Coach" surface; internal reasoning lenses invoked as
      needed (see PRODUCT.md § Reasoning Lenses)
- [x] Evidence capture with `source_type` + `epistemic_type` (confirm-before-persist)
- [x] Career Hypothesis create/update with qualitative confidence (evidence-count based, not %)
- [x] Career Experiment tied to a hypothesis, with a success signal and a review point
- [x] Return later, record the outcome, system updates the hypothesis assessment based on that
      outcome (this "close the loop" step is the actual product bet — don't skip it for speed)
- [ ] Golden Career Scenarios suite (`evaluations/golden-career-scenarios.md`) used to sanity-check
      reasoning quality before/while building the above
- [x] No auth beyond a local-only single-user assumption (see ARCHITECTURE.md § Auth) — do not
      spend M0 budget on login infrastructure
- [x] Local Postgres via Prisma; minimal schema — only the tables the loop actually needs
      (CareerContext, Person (optional, only if mentioned), Evidence, CareerHypothesis,
      CareerExperiment, Conversation, Message, Memory, PendingCandidate)
      — schema applied to Supabase PostgreSQL, migration committed;
      SupabaseConversationRepository implements the full repository contract;
      34 Supabase contract tests + 3 persistence/restart tests pass against real PostgreSQL

### M0 status

**Structurally implemented and PostgreSQL-backed, not yet product-validated.** All six
stages (A–F) are implemented, the loop closes correctly, persistence is atomic, the
transaction boundary protects relationship-sensitive values from caller manipulation,
data persists to real PostgreSQL, and 209 tests verify the plumbing including
cross-restart persistence. However, the reasoning quality has not been evaluated against
a real AIProvider. The Golden Career Scenarios evaluation is the remaining acceptance
step. Do not begin M1 until it is complete.

Explicitly NOT in M0 (moved to later milestones):
- Full Situation Analysis workflow → M2
- Full Weekly Review workflow → M2
- Complete 19-dimension Management Readiness UI → M3 (domains are documented now, not built now)
- Elaborate timeline management (companies/roles CRUD, full history) → M1
- Advanced history screens / dashboards → M1+
- Document imports → M4
- Semantic/vector retrieval → M4
- Native app-store builds → later (post-M4)
- Complex settings, data export UI polish → M1 (export itself, minimally, can land whenever it's
  cheap; the UI does not need to be good in M0)

## M1 — Career Context

Build out the structured context the reasoning loop can draw on, now that the loop itself is
proven.

- People + Relationships (incl. mentor-vs-sponsor distinction, Sponsorship Map view)
- Career roles, companies, timeline (CareerEvent)
- Career Goals
- Constraints
- Career Strategy / Target Role Thesis (see PRODUCT.md § 5)
- Basic history view, basic settings, JSON export

## M2 — Coaching Workflows

- Situation Analysis (full structured workflow + later outcome recording)
- Decision Journal
- Weekly Review
- Action items / follow-up tracking across experiments, situations, decisions, reviews

## M3 — Leadership Intelligence

- Management Readiness: full detailed-dimension model, grouped into the five leadership domains
  (Leading People / Leading Work / Leading Across / Leading Up / Leading the System)
- Sponsorship gap analysis as a distinct reasoning capability (`analyzeSponsorship`)
- Career Strategy analysis (`analyzeCareerStrategy`) — gap analysis against the Target Role Thesis

## M4 — Rich Memory and Retrieval

- Document ingestion: resume, LinkedIn export, performance reviews, self-evaluations
- pgvector-based semantic retrieval layered on top of structured retrieval
- Richer longitudinal analysis (pattern detection across a larger evidence base)
- Additional `AIProvider` implementations (OpenAI, Anthropic, Google, OpenRouter)

## Later

- Native iOS/Android builds (signing, app store metadata)
- Multi-user support / Supabase Auth + RLS, if this ever goes beyond a single user
- Local/private model runtime behind the same `AIProvider` interface
- Automated scoring for the Golden Career Scenarios suite (M0 ships with human-readable scenarios
  only — automated grading is a later investment, not a blocker)
- Dark mode
- Migrate local Postgres → hosted Supabase project (database migration is the easy part; if/when
  auth also needs to move to Supabase Auth + RLS, treat that as a separate, harder project — see
  ARCHITECTURE.md § Database vs. Auth Migration)

## Explicitly deferred, not forgotten

Anything not listed under M0 is intentionally deferred to M1–M4, not dropped. See PRODUCT.md
"M0 scope" for the full rationale.
