# PRODUCT.md — Mentor

## What this is

Mentor is a personal **Career Operating System** for a senior professional (~18–20 years of
experience) who is technically respected but stuck moving into management/leadership. It is not a
generic career-coaching chatbot. It is a longitudinal system that accumulates structured knowledge
about the user's career — history, relationships, goals, constraints, evidence, hypotheses,
experiments, decisions — and uses that knowledge to make every conversation sharper than the last.

The core moat is:

> Career history + evidence + relationships + decisions + reflection + AI reasoning.

Not "a chatbot with memory." Structured data is the product; the chat is the interface to it.

**The first product test is not "can we build all the screens." It is: does the system understand
my career situation better after multiple interactions, distinguish evidence from narrative,
challenge me intelligently, and help me run useful experiments that improve my career decisions?**
Everything in this document is organized to prove that before broader scope is built (see
ROADMAP.md M0).

## Who it's for

Primary user (v1): one person, 15–25+ years of experience, who:
- already knows resume/interview basics — do not coach on those
- has real organizational and technical credibility
- is unsure whether/how to move into management, and why past attempts stalled
- has real constraints (family, geography, comp, risk tolerance) that limit options
- wants a peer-level thinking partner, not a motivational app

## What it must NOT feel like

Gamified habit tracker, motivational quote generator, HR portal, social network, or a coaching app
built for someone with 2 years of experience. No streaks, no badges, no generic "network more"
advice without a specific target, mechanism, and success signal attached.

## Seniority is reasoning context, not profile metadata

Storing `yearsExperience = 19` and otherwise reasoning like a generic career bot is a product
failure. Seniority must materially change *what the system assumes and asks*, not just how it
addresses the user. For an experienced professional, the system should actively reason about:

- organizational leverage and reputation accumulated over years (asset *and* liability)
- sponsorship, succession, and delegation — not just individual output
- scope, executive trust, and political capital
- business impact vs. technical impact
- organizational headroom (is there even a role to grow into here?)
- role architecture (is "management" actually the next rung, or a lateral move?)
- compensation constraints and opportunity cost of changing paths
- family/geographic constraints and the real cost of "starting over"
- the possibility that the user is *too valuable in their current role* for others to want to
  move them
- whether the user has actually demonstrated management-type behavior, or is assumed to want
  management by default
- **whether management is even the correct destination** — technical leadership, architecture,
  product leadership, consulting, and staying put are all legitimate outcomes

This is not a one-time onboarding checkbox; it's a standing constraint on every response the
system generates. See Product Invariant #6/#7 in AGENTS.md.

## Epistemic model

This is a critical product requirement: **the system must never treat a user's interpretation as
an objective fact**, and must never let its own inference silently become a stored fact.

Example user statement: *"My manager keeps me out of strategic meetings because he feels
threatened by me."* This bundles several different kinds of claims:

- **Fact:** user was not invited to meeting X
- **Interpretation:** user's read on *why* — "manager intentionally excluded me"
- **Hypothesis:** "manager may perceive me as a threat" (testable, not yet established)
- **Emotion:** frustration, feeling undermined
- **Action:** something the user might do about it

The AI actively separates these six categories in conversation and in anything it proposes for
memory: **FACT, INTERPRETATION, ASSUMPTION, EMOTION, HYPOTHESIS, ACTION.**

Every candidate memory/evidence record carries two dimensions (schema detail in ARCHITECTURE.md):

```
source_type:    user_report | imported_document | ai_inference | observed_outcome
epistemic_type: fact | interpretation | hypothesis | emotion | action
```

An `ai_inference`-sourced record can never be silently upgraded to `fact`. Only a genuine
`observed_outcome` (something that actually happened, e.g. "was invited to the next planning
meeting") counts as fact-grade evidence toward a hypothesis.

## Confidence, without fake precision

No `"72% confidence"`, no `"Leadership score: 87/100"` — those numbers imply a calibration the
system doesn't have. Use qualitative categories instead: **Tentative, Moderate, Strong.** Show the
basis, not just the label:

```
Evidence supporting: 3
Evidence contradicting: 1
Untested assumptions: 2
```

This applies to Career Hypotheses and to Management Readiness — a domain or dimension is
"Moderate evidence of X, based on 3 supporting observations and 1 contradicting one," never a bare
score.

## Reasoning lenses (formerly "Mentor Modes")

Seven reasoning lenses remain internally useful, but the user should not have to pick between
seven AI personalities to have a conversation. **Reasoning modes are primarily an AI orchestration
concept, not necessarily seven separate user-facing products.**

User-facing surface (M0):

| Control | Behavior |
|---|---|
| **Coach** | Balanced default. The system automatically invokes whichever internal lens(es) fit the message — this is the only control most conversations need. |
| **Challenge Me** | Explicitly asks the system to lean on the Challenger lens — test assumptions, surface uncomfortable alternatives. |
| **Help Me Decide** | Explicitly invokes the Decision Advisor lens for structured analysis of a specific choice. |

Internally, `CareerReasoningEngine` can still invoke Mentor, Challenger, Strategist, Manager Coach,
Executive Coach, Decision Advisor, and Reflection Partner lenses as reasoning strategies selected
per-message — they're prompt/behavior templates the engine chooses from, not modes the user
manages.

## Career Strategy / Target Role Thesis

`CareerGoal` ("become an Engineering Director") is not sufficient on its own for a senior-career
product — it doesn't capture the *reasoning* behind the goal or how it will be tested over time.

**Career Strategy** (aka Target Role Thesis) is the user's current working theory of where they're
going and how they might get there. Unlike a goal, it's expected to be revised as evidence comes
in — it is itself something the system helps validate or invalidate over time, the same way a
Career Hypothesis is.

Fields:
- target role, target scope/level
- target timeframe
- preferred path, alternative path
- why this path is attractive, why it appears achievable
- required experiences vs. missing experiences
- required leadership evidence, required sponsorship
- important stakeholders, organizational opportunities
- external-market alternatives
- constraints, risks
- leading indicators (observable signals the thesis is on track)
- assumptions being tested

Example:

```
Target: Engineering Director
Time horizon: 18–24 months
Preferred path: Internal promotion
Alternative path: External Senior Manager role, then Director progression

Current gaps:
- formal people-leadership evidence
- executive-level visibility
- sponsor at VP+ level

Leading indicators:
- invited into workforce/planning decisions
- trusted with cross-team outcomes
- asked to develop other leaders
```

Not required for M0's vertical slice, but the reasoning engine and schema are designed with it in
mind from the start (see ARCHITECTURE.md § Data model) so M1 doesn't require a rework.

## Sponsorship is not mentorship

**Mentor ≠ sponsor.** A mentor gives advice. A sponsor advocates for the user when the user isn't
in the room and has enough organizational power to affect their next role. For someone with ~20
years of experience, sponsorship gaps are frequently the actual blocker — and are easy to miss if
the product only tracks generic "relationships."

The system explicitly reasons about:
- Who gives the user advice? (mentorship)
- Who advocates for the user when absent, and has power to affect their next move? (sponsorship)
- Who knows the user's work well enough to vouch for it credibly?
- Who trusts the user? Who benefits from the user's success?
- Who *could* sponsor the user but currently doesn't?
- Where are the sponsorship gaps?

This is modeled as a **Sponsorship Map** — a view/query over `Person` + `Relationship`, not
necessarily a new top-level table (see ARCHITECTURE.md § Data model for the schema decision). The
product principle — mentor and sponsor are different roles a person can hold, and sponsorship
coverage is a first-class leadership-progression signal — is what must not get lost, regardless of
exact schema shape.

## Management Readiness: leadership domains, not 19 loose metrics

Detailed dimensions (delegation, coaching, conflict management, stakeholder management,
prioritization, executive communication, etc.) remain, but they are not the primary UI. They're
grouped into five leadership domains so the top-level view answers one question: **"Where is the
evidence that I already operate like a leader, and where are the gaps?"**

| Domain | Example dimensions underneath |
|---|---|
| **Leading People** | delegation, coaching, conflict management, hiring, performance management |
| **Leading Work** | prioritization, decision-making, ambiguity tolerance, ownership scope |
| **Leading Across** | stakeholder management, cross-functional influence, organizational awareness |
| **Leading Up** | executive communication, visibility, sponsorship, business understanding |
| **Leading the System** | strategic thinking, succession building, organizational leverage, scaling through others |

No gamified score, at either the domain or dimension level — qualitative assessment + evidence
count + confidence category, same as hypotheses. Full detailed model lands in M3; the domain
taxonomy is documented now so M3 doesn't restructure it later.

## Memory confirmation model

Confirm-before-persist remains the rule, made more intelligent than a bare "save this?" prompt.
When the extraction pipeline proposes a candidate record after a conversation, it shows:

- proposed record type (Evidence / Hypothesis update / Person / etc.)
- the extracted statement, verbatim or lightly cleaned up
- **epistemic type** (fact / interpretation / hypothesis / emotion / action)
- **source type** (user_report / ai_inference / etc.)
- a certainty category where relevant
- suggested linked entity (person, hypothesis, experiment)
- **why the system thinks it's worth saving**

The user can **confirm, edit, or reject** each candidate. Nothing uncertain becomes durable truth
merely because a model produced it — and editing before confirming means the user can correct the
epistemic type itself (e.g., downgrade something the AI proposed as `fact` to `interpretation`).

## Core behaviors (non-negotiable)

1. **Evidence over vibes.** Conclusions cite specific Evidence records, not just "how you feel
   this week." Longitudinal evidence outweighs the emotional tone of the latest conversation.
2. **Epistemic separation, always.** Fact / interpretation / assumption / emotion / hypothesis /
   action are actively distinguished, in conversation and in memory (see § Epistemic model).
3. **Hypotheses are falsifiable.** Every Career Hypothesis has supporting evidence, contradicting
   evidence, a qualitative confidence category, and an experiment designed to test it.
4. **No fake precision.** No numeric scores or percentages without genuine calibration behind them.
5. **Explain the "why."** Any recommended action states: why, with whom, toward what objective,
   what signal it sends, what success looks like, what to do next.
6. **Memory is opt-in and editable, not silent.** See § Memory confirmation model.
7. **Seniority materially changes the advice.** See § Seniority is reasoning context. Never fall
   back to generic junior-career coaching ("update your LinkedIn," "ask for feedback") without the
   why/with whom/toward-what-objective reasoning attached.

## M0 scope — Career Intelligence Prototype

Full milestone breakdown lives in ROADMAP.md. Product-level summary: M0 proves the core loop —
**Career context → Conversation → Evidence → Hypothesis → Experiment → Outcome → Updated belief**
— end to end, for one real career problem, before any broader CRUD surface is built. The user
should be able to:

1. provide minimal senior-career context (see below)
2. talk with the Coach about a real career problem
3. have the system distinguish facts from interpretations and hypotheses in that conversation
4. save useful evidence (with epistemic/source typing, confirm-before-persist)
5. create or update a Career Hypothesis
6. create an Experiment to test that hypothesis
7. return later and record what actually happened
8. have the system update its assessment of the hypothesis based on that outcome

### Minimal M0 context (not full onboarding)

Enough to make the first conversation meaningful, not a profiling form:
- current role/title and rough scope (one line)
- years of experience
- the career outcome they're trying to achieve (free text)
- why they believe they haven't reached it yet (free text — this is themselves surfacing an
  initial interpretation/hypothesis, which the system should treat as such, not as fact)
- one or two key people relevant to the problem, if any (optional — People/Relationships as a full
  feature is M1, but the reasoning loop can reference a bare name+role even before that exists)

### Explicitly NOT in M0

Full Situation Analysis workflow, full Weekly Review, the complete 19-dimension Management
Readiness UI, elaborate timeline management, advanced history/dashboards, document imports,
semantic/vector retrieval, native app-store builds, complex settings. All scheduled in M1–M4 — see
ROADMAP.md. None of this is dropped; M0 is deliberately narrow so the reasoning quality can be
evaluated before more surface area is built on top of it.

## Success criterion

**M0 succeeds if:** the user can say *"I have nearly 20 years of experience. I'm technically
respected, but I keep getting overlooked for management positions. Help me understand why,"* the
system responds by separating fact from interpretation from hypothesis in that very statement,
proposes a testable hypothesis and experiment rather than generic advice, and — when the user
returns later with an outcome — visibly updates its assessment rather than starting over. The
Golden Career Scenarios suite (`evaluations/golden-career-scenarios.md`) is the concrete bar for
"handles this well" across ~12-15 realistic senior-career situations, not just the one example
above.

**Beyond M0**, the broader Career Operating System (M1–M4) succeeds if, after six months of use,
it understands the user's career meaningfully better than it did on day one — see
"longitudinal understanding, not isolated chat responses" as the standing design principle.
