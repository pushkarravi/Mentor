# Mentor

A personal career intelligence system for experienced professionals navigating the transition from senior individual contributor to leadership.

## Why I'm building this

After close to two decades in the industry, career questions look very different from the ones I had early on.

The problem is no longer how to write a better résumé, prepare for an interview, or learn the next technology. The harder questions are less obvious:

- Why am I trusted with difficult problems but not necessarily with larger organizational responsibility?
- Am I actually demonstrating management potential, or am I simply becoming a stronger individual contributor?
- How does senior leadership perceive me?
- Do I have mentors but no real sponsors?
- Am I indispensable in ways that are actually limiting my mobility?
- Is the obstacle my manager, the organization, my own behavior, or some combination of the three?
- Should I continue pursuing management at all?
- What evidence would tell me that my interpretation of the situation is wrong?

These are difficult questions to answer from a single conversation. They require context accumulated over time.

That's the reason for Mentor.

## The idea

Mentor is an experiment in building a **longitudinal career intelligence system** rather than another AI career chatbot.

It maintains structured context about a career:

- roles and significant career events
- goals and constraints
- important people and organizational relationships
- evidence and feedback
- career hypotheses
- experiments intended to test those hypotheses
- important decisions and their eventual outcomes

The conversational interface sits on top of that information.

The goal is for the system to become more useful as the history becomes richer—not because it remembers every conversation, but because it develops a better evidence-based model of the career behind those conversations.

A useful shorthand for the project is:

> **Career history + evidence + relationships + decisions + reflection + AI reasoning**

## Evidence, not just narrative

One of the central ideas behind Mentor is that career narratives are often unreliable.

Consider:

> "My manager doesn't want me to move into management."

That may be true. It may also be an interpretation of several unrelated events.

Mentor tries to keep these things separate:

**Fact → Interpretation → Assumption → Emotion → Hypothesis → Action**

Instead of accepting a conclusion immediately, the system should ask what evidence supports it, what contradicts it, and what else could explain the situation.

A hypothesis such as:

> Leadership sees me primarily as a technical troubleshooter rather than someone who can lead through others.

can then be connected to actual evidence and, importantly, tested.

## Career experiments

Advice is more useful when it can be tested.

Rather than simply recommending "increase your visibility," Mentor should be able to turn an idea into an experiment.

For example:

**Hypothesis**  
Senior leadership understands my technical contribution but not my organizational impact.

**Experiment**  
For the next four weeks, communicate progress in terms of business outcomes, cross-team dependencies, risks and decisions rather than implementation details.

**Success signal**  
Senior leaders begin involving me directly in planning or organizational discussions.

The result becomes new evidence. The hypothesis can become stronger, weaker, or be discarded.

This creates the core reasoning loop:

> **Context → Evidence → Hypothesis → Experiment → Outcome → Updated belief**

## Designed for senior careers

Mentor is deliberately opinionated about its initial audience.

It is being designed around professionals with roughly 15–25+ years of experience, where career decisions may involve:

- organizational leverage rather than individual output
- sponsorship rather than simply mentorship
- accumulated reputation and political capital
- executive communication
- delegation and developing others
- organizational headroom
- scope and visibility
- compensation and opportunity cost
- family, geographic and other real-world constraints
- deciding between management and senior individual-contributor paths

Years of experience should not simply be another profile field. Seniority should change how the system reasons about a situation.

## Not everything the user says is a fact

Career conversations contain facts, interpretations, emotions and assumptions mixed together.

Mentor's memory model is therefore intentionally conservative.

The AI can propose information worth remembering, but durable career memory is confirmed by the user before it is persisted. AI-generated interpretations should remain identifiable as interpretations rather than quietly becoming "facts" after several conversations.

This distinction is important because longitudinal memory is only valuable if it can be trusted.

## Architecture

Mentor is being built as a modular monolith.

The current technical direction is:

- **Client:** React Native, Expo, TypeScript
- **Backend:** Node.js, TypeScript, Fastify
- **Database:** PostgreSQL with Prisma
- **AI:** provider-independent abstraction
- **Primary memory:** structured relational data
- **Semantic retrieval:** additive, not the primary data model

The project deliberately avoids making a vector database the source of truth. Career information is highly relational: a piece of evidence can support one hypothesis, contradict another, involve a particular person, and belong to a particular point in a career timeline.

That structure belongs in a relational model.

AI providers are kept behind a common interface so the application is not fundamentally tied to Perplexity, OpenAI, Anthropic, Google, or another model provider.

## Current focus

The first milestone is intentionally narrow.

Before building a large career-management application, I want to establish whether the core reasoning loop is actually useful.

The initial prototype needs to demonstrate that Mentor can:

1. understand enough career context to have a meaningful conversation;
2. separate observations from interpretations and assumptions;
3. identify evidence worth retaining;
4. form falsifiable career hypotheses;
5. suggest practical experiments;
6. revisit the outcome later; and
7. update its understanding rather than starting from scratch.

Features such as extensive dashboards, document ingestion, semantic search, native distribution and broader career workflows come later.

If this core loop isn't good, adding more screens won't fix the product.

## AI evaluation

Career advice can sound plausible while being completely generic.

To guard against that, the project uses a set of **golden career scenarios** representing ambiguous senior-career situations: technical indispensability, lack of sponsorship, weak executive communication, organizational headroom, management versus IC decisions, difficult managers, reorganizations and similar problems.

Changes to prompts and reasoning behavior can be evaluated against these scenarios.

The standard is not whether the AI produces a polished response. The standard is whether it:

- notices the important ambiguity;
- distinguishes evidence from narrative;
- considers credible alternative explanations;
- reasons at the appropriate level of seniority; and
- recommends something that can produce new information.

## Repository philosophy

This repository is intended to be maintainable across different development environments and AI coding agents.

The repository—not a conversation with any particular AI—is the source of truth.

`AGENTS.md` documents the architectural and product invariants that coding agents should preserve. `PRODUCT.md` explains the product model, `ARCHITECTURE.md` records technical decisions and trade-offs, and `ROADMAP.md` tracks implementation priorities.

This is intentional: the project should be possible to continue with Claude, ChatGPT/Codex, Manus, Perplexity Computer, GitHub Copilot, or a human developer without depending on the history of whichever tool worked on it last.

## Project status

**Early development / experimental.**

The product model and architecture are being established first, with implementation proceeding through small vertical slices.

This repository should not yet be considered a finished application or production-ready career-advice system.

## A note on the name

"Mentor" is a working name.

The system is intended to do more than mentorship: over time it should function as a career historian, challenger, strategist, decision partner and leadership coach.

For now, Mentor is simple enough to describe what I'm trying to build.
