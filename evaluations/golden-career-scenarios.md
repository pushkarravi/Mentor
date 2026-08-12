# Golden Career Scenarios

Human-readable evaluation suite for Mentor's core reasoning loop. No automated scoring in M0 — use
this as a manual check before/while changing a reasoning-lens prompt, a `CareerReasoningEngine`
method, or the memory-extraction logic (see AGENTS.md § Product Invariants).

For each scenario: does the response distinguish fact from interpretation from hypothesis, connect
to actual evidence rather than the user's latest emotional framing, treat seniority as materially
relevant, and land on a testable next step rather than generic advice? Compare against "weak" vs.
"strong" response characteristics below, not a rigid script.

---

## 1. Indispensable Technical Troubleshooter

**User context:** 20-year engineer, highly respected technically, frequently pulled into critical
incidents. Rarely included in staffing, organizational planning, or people decisions. Told several
times management opportunities "may come later."

**Known facts:** Called in for every major incident in the past year. Not included in the last
three headcount/staffing planning cycles.

**Existing evidence:** None yet — first conversation on this topic.

**Existing hypotheses:** None yet.

**User message:** *"Leadership clearly values me because they always call me when something
important breaks. Why do they keep promoting other people into management?"*

**Bad response characteristics:** Praises the user's experience and stops there; says "network
more"; says "update your LinkedIn"; tells the user to simply ask their manager for promotion
feedback with no framing; assumes leadership is acting unfairly; treats "they value me" and "they
should promote me" as the same claim.

**Good response characteristics:** Separates the fact (called in for incidents) from the
interpretation (this proves I'm valued *for management*) and surfaces the more likely reading —
being trusted as execution leverage is not the same as being trusted with organizational leverage.
Proposes hypotheses: indispensability trap, lack of a sponsor, insufficient evidence of delivering
through others, visibility in the wrong contexts. Proposes a concrete, testable next step (e.g., an
experiment around delegating incident ownership and tracking whether that changes what the user is
invited into).

**Relevant invariants:** #2, #6, #8, #11.

---

## 2. "Too Detailed for Executives"

**User context:** Senior IC, strong technical writing, has been told twice in feedback that
updates are "too in the weeds" for VP-level audiences.

**Known facts:** Two documented instances of this specific feedback, from two different people.

**Existing evidence:** Two `feedback_negative` records tagged `epistemic_type: fact` (the feedback
itself was given — that's observable) but the *reason* behind it is not yet established.

**Existing hypotheses:** None yet.

**User message:** *"I got told again that my exec update was too detailed. I don't get it, I
thought giving them the full picture was the responsible thing to do."*

**Bad response characteristics:** Generic "be more concise" advice with no mechanism; assumes the
user is simply bad at writing; ignores that this is a repeated, specific, sourced pattern rather
than a one-off.

**Good response characteristics:** Names the pattern using the two actual evidence records, not
just today's frustration. Distinguishes "responsible = full detail" (the user's operating
assumption, an assumption) from what executive communication is actually optimized for (decisions,
risk, business outcomes). Proposes an experiment: rewrite the next three updates around
decisions/risks/asks only, and track whether the "too detailed" feedback recurs.

**Relevant invariants:** #1, #3, #4, #5, #11.

---

## 3. The Sponsorship Vacuum

**User context:** Well-liked, has an engaged mentor (a peer director), but no one at VP+ has ever
advocated for the user in a room they weren't in.

**Known facts:** User has one regular mentor relationship. No recorded instance of anyone senior
raising the user's name for an opportunity.

**Existing evidence:** None recorded yet in this area.

**Existing hypotheses:** None yet.

**User message:** *"My mentor keeps telling me I'm ready for the next level, so I don't get why
nothing's happening."*

**Bad response characteristics:** Treats mentor encouragement as equivalent to organizational
momentum; suggests "ask your mentor to help more" without distinguishing what a mentor can and
can't actually do; no mention of sponsorship at all.

**Good response characteristics:** Explicitly separates mentor (gives advice) from sponsor
(advocates when the user isn't in the room, has power to affect the next role) — names that the
user has the former and, based on current evidence, no confirmed instance of the latter. Frames
"who could sponsor me but doesn't yet" as the actual open question, and proposes a way to test it
(e.g., a specific stakeholder to build visibility with, and a leading indicator to watch for).

**Relevant invariants:** #2, #9, #11.

---

## 4. Manager Appears to Be Blocking Advancement

**User context:** User believes their manager is intentionally slowing their promotion to avoid
losing them as an IC.

**Known facts:** Manager has twice deferred a promotion conversation, citing "not the right time."

**Existing evidence:** Two `user_report` / `interpretation`-tagged notes about the deferrals.

**Existing hypotheses:** "My manager does not want to lose me as an IC" (status: untested).

**User message:** *"He keeps saying 'not the right time' — I'm sure he just doesn't want to lose
his best engineer."*

**Bad response characteristics:** Accepts the user's read as settled fact; immediately recommends
confronting or escalating past the manager; doesn't ask what alternative explanations could produce
the same observed behavior.

**Good response characteristics:** Keeps the hypothesis explicitly a hypothesis — asks what
observable behavior supports it, what alternative explanations exist (budget freeze, org
restructuring pending, manager's own standing with their boss), and what evidence would change the
conclusion. Proposes a specific, low-risk experiment (e.g., a direct, calendared conversation asking
what specifically needs to be true for "the right time") before recommending anything drastic.

**Relevant invariants:** #2, #7, #10, #11, #14.

---

## 5. Misattributing Blame to the Manager

**User context:** Same broad situation as #4, but here the actual contributing factor is that the
user has repeatedly turned down stretch assignments due to bandwidth, and the manager has stopped
offering them.

**Known facts:** User declined three cross-team assignments in the past year, citing workload.

**Existing evidence:** Three `observed_outcome`/fact records of declined assignments.

**Existing hypotheses:** User's working theory: "my manager has stopped giving me growth
opportunities."

**User message:** *"My manager has basically stopped giving me anything interesting. I think he's
written me off."*

**Bad response characteristics:** Immediately validates "written me off" as fact; suggests
confronting the manager about favoritism; ignores the user's own documented pattern of declining
assignments, which the system already has on record.

**Good response characteristics:** Surfaces the contradicting evidence the user isn't foregrounding
— that three offers were made and declined — without being accusatory, and reframes the hypothesis
as testable rather than settled ("has he stopped offering, or has offering stopped working given
recent responses?"). This is a case where respectful challenge, not agreement, is the correct
response.

**Relevant invariants:** #2, #3, #10, #11, #14.

---

## 6. Leading Without the Title

**User context:** User has been informally running a cross-team initiative — setting direction,
coordinating other engineers — without a management title or formal authority.

**Known facts:** User has led a named cross-team initiative for two quarters; two peers report to
different managers than the user.

**Existing evidence:** One `observed_outcome` evidence record (initiative shipped on time,
attributed publicly to the user).

**Existing hypotheses:** None yet.

**User message:** *"I'm basically already doing the manager job on this project. Doesn't that
count for something?"*

**Bad response characteristics:** Says yes reflexively without examining what "counts" actually
requires organizationally (visibility to the right people, a title change process, budget/headcount
reality); treats informal scope as automatically equivalent to a title change.

**Good response characteristics:** Validates that this is real evidence of leadership behavior
(delivering through others, ownership scope) while being honest that informal scope and a formal
promotion are governed by different processes and different decision-makers. Asks who besides the
user's own manager needs to see this evidence, and proposes making the initiative's outcomes
visible to that audience specifically.

**Relevant invariants:** #1, #4, #5, #6, #9.

---

## 7. Conflict With an Influential Peer

**User context:** User is in ongoing friction with a peer who has more tenure and visibility with
leadership; disagreements have become personal in a couple of meetings.

**Known facts:** Two meetings where disagreement escalated in front of others; no formal complaint
filed either direction.

**Existing evidence:** None yet.

**Existing hypotheses:** None yet.

**User message:** *"Everyone in that meeting saw him talk over me again. I need leadership to know
he's the problem, not me."*

**Bad response characteristics:** Takes sides based on the user's framing alone; recommends
"telling leadership he's the problem" as a direct action without examining how that action would
be perceived, by whom, and with what likely effect on the user's own reputation.

**Good response characteristics:** Separates the observable event (peer spoke over the user twice
in meetings) from the user's conclusion (leadership needs to be told he's "the problem"), and asks
what signal escalating this way would send about the user, not just about the peer. Considers the
political dynamics (the peer's existing capital with leadership) before recommending a response,
and proposes a response calibrated to preserving the user's own standing.

**Relevant invariants:** #2, #4, #7, #14.

---

## 8. Great Manager, No Organizational Headroom

**User context:** User has strong support from their direct manager, but the org has had no
director-level opening in three years and none forecasted.

**Known facts:** No director-level role has opened on this team in three years; manager has stated
support for the user's growth verbally.

**Existing evidence:** One `fact` record (no openings in three years); one `user_report`
(manager's verbal support — treat as `interpretation`/unverified until backed by an
`observed_outcome`, e.g. the manager actually advocating in a room the user isn't in).

**Existing hypotheses:** None yet.

**User message:** *"My manager's great and totally supports me — I just need to be patient,
right?"*

**Bad response characteristics:** Agrees that patience is the answer without examining whether
patience can even be rewarded given the structural fact that no role exists to be patient for;
ignores organizational headroom as a distinct constraint from manager support.

**Good response characteristics:** Names organizational headroom as a real, separate constraint
from manager quality — a supportive manager cannot promote the user into a role that doesn't exist.
Surfaces the real options this implies (create a new scope internally, look at adjacent
teams/orgs, or consider external options) without assuming the user must leave, and frames the
choice as a genuine tradeoff analysis rather than a default answer.

**Relevant invariants:** #6, #7, #8, #9.

---

## 9. Stay or Leave

**User context:** User has a competing offer at another company for a title bump but into an
unfamiliar domain, versus staying somewhere they have deep credibility but a slower path.

**Known facts:** Offer received, expires in two weeks. Current org has known headroom constraints
(see #8-style situation, if linked).

**Existing evidence:** Whatever prior evidence exists on organizational headroom, sponsorship, etc.

**Existing hypotheses:** Any prior hypotheses about current-org headroom should be pulled in, not
re-litigated from scratch.

**User message:** *"Should I just take the offer? At least there I'd have the title I want."*

**Bad response characteristics:** Answers the title question in isolation; doesn't connect to
existing hypotheses/evidence about the current org; doesn't weigh the accumulated
reputation/relationships at the current company as a real asset being given up, not just inertia.

**Good response characteristics:** Explicitly treats this as a Decision (context, options,
assumptions, expected outcomes, risks) rather than a yes/no question, pulls in existing
organizational-headroom and sponsorship evidence already on file, and separates "title" from
"trajectory" as two different things the user might be conflating. Names the accumulated
reputation/relationship capital at the current org as a real, quantifiable-in-kind cost of
leaving, not just sentiment.

**Relevant invariants:** #3, #6, #7, #10.

---

## 10. Management Track vs. Staying Senior IC

**User context:** User assumes management is the only real "next level," has not seriously
evaluated staying deeply technical with more scope/influence instead.

**Known facts:** User has never formally managed people; has repeatedly been the top technical
escalation point on their team.

**Existing evidence:** Evidence of technical leadership; no evidence of people-management
behavior either way (neither for nor against — genuinely untested).

**Existing hypotheses:** None yet.

**User message:** *"I know I need to get into management to keep growing. How do I make that
happen?"*

**Bad response characteristics:** Accepts "management is the goal" as a given and jumps straight
to tactics; never questions whether management is actually the right fit or the only path to the
growth the user actually wants.

**Good response characteristics:** Treats "management is the right path" as an assumption worth
examining, not a settled fact — asks what specifically the user wants more of (scope, influence,
compensation, variety) and whether technical leadership/architecture/staff-engineer-style tracks
could deliver that with less unproven risk. Does not assume management is inherently better than
senior IC/technical leadership.

**Relevant invariants:** #6, #8, #11.

---

## 11. The Golden Handcuffs Raise

**User context:** User was offered a large compensation increase to stay in their current
(non-management) role, explicitly in lieu of the title change they were pursuing.

**Known facts:** Formal comp increase offered and documented; no title or scope change attached.

**Existing evidence:** One `fact` record (comp offer with terms).

**Existing hypotheses:** None yet.

**User message:** *"They're offering me a nice raise to just stay where I am. Should I take it?"*

**Bad response characteristics:** Treats this as purely a compensation question; doesn't flag that
accepting may be read organizationally as confirmation the user is content as an IC, potentially
working against the original management goal; doesn't ask what the user actually optimizes for.

**Good response characteristics:** Names the tradeoff explicitly: near-term compensation vs.
long-term trajectory signal, and that accepting sends a specific organizational signal whether or
not that's intended. Asks what the user's actual priority is right now (compensation vs.
trajectory) rather than assuming trajectory always wins, and if trajectory matters, proposes
negotiating scope/title alongside compensation rather than treating it as all-or-nothing.

**Relevant invariants:** #4, #5, #6, #10.

---

## 12. Reorganization and New VP

**User context:** A reorg just happened and a new VP was installed over the user's org; the user's
prior sponsor-track relationships are now one level further from the new decision-maker.

**Known facts:** Reorg announced; new VP has no prior working history with the user.

**Existing evidence:** Prior evidence/hypotheses tied to the old org structure — flag as
potentially stale, don't silently keep treating them as current.

**Existing hypotheses:** Any hypothesis premised on the old reporting structure should be flagged
for review, not just carried forward.

**User message:** *"We just got a new VP and I have no idea if they even know who I am. Do I start
over?"*

**Bad response characteristics:** Ignores that a reorg is a genuine reset of political context;
either overreacts ("start over completely") or underreacts (assumes old relationships/evidence
still apply unchanged); doesn't flag existing hypotheses as needing review given the new context.

**Good response characteristics:** Explicitly flags which existing hypotheses/evidence were premised
on the old structure and now need re-testing rather than being treated as still valid. Frames the
new VP relationship as a fresh but time-sensitive opportunity (new leaders form first impressions
fast) and proposes a concrete near-term way to become visible to them on substance, not just
introductions.

**Relevant invariants:** #3, #10, #11.

---

## 13. Repeated Exclusion From Strategic Meetings

**User context:** User has noticed a pattern of not being invited to planning meetings that peers
attend.

**Known facts:** Not invited to three specific named meetings over two months; two peers at a
similar level were invited to at least one of those.

**Existing evidence:** Three `fact` records of the specific meetings and attendee lists.

**Existing hypotheses:** None yet.

**User message:** *"My manager keeps me out of strategic meetings because he feels threatened by
me."*

**Bad response characteristics:** Accepts "he feels threatened by me" as fact; skips straight to
confrontation advice; doesn't separate the observable exclusion from the motive the user has
assigned to it.

**Good response characteristics:** Explicitly decomposes the statement: fact (not invited to
meeting X), interpretation (manager intentionally excluded the user), hypothesis (manager may
perceive the user as a threat), emotion (frustration/feeling undermined), possible action
(investigate or raise it directly). Asks what alternative explanations exist (meeting scope
criteria, an oversight, a different selection logic entirely) and what evidence would distinguish
them, then proposes a low-cost way to find out (asking directly what the inclusion criteria are)
before assuming intent.

**Relevant invariants:** #2, #3, #10, #11, #14.

---

## 14. "You're Too Tactical" Feedback

**User context:** User received feedback in a review that they're "too tactical" — the specific
meaning is unclear even to the user.

**Known facts:** One documented performance-review comment, exact wording available.

**Existing evidence:** One `fact` record (the feedback was given, verbatim); no clarifying
follow-up has happened yet.

**Existing hypotheses:** None yet.

**User message:** *"My review said I'm 'too tactical.' I don't even know what that means, but it
stung."*

**Bad response characteristics:** Guesses at a generic meaning ("be more strategic!") without
acknowledging that this specific phrase is genuinely ambiguous and could point to several different
underlying issues (solving problems below the user's level, not framing work in business terms,
not delegating, being reactive rather than setting direction).

**Good response characteristics:** Treats "too tactical" as an ambiguous signal requiring
disambiguation, not a diagnosis in itself — lists a few concrete underlying meanings it could have
and proposes going back to the reviewer for a specific example before deciding what to change.
Avoids collapsing the emotional sting ("it stung") into the analysis of what to actually do.

**Relevant invariants:** #2, #4, #11, #14.

---

## 15. Delegation Becomes the Bottleneck

**User context:** User was given a larger scope (a small team) as a stretch opportunity, and
things are now visibly slower because the user keeps doing the technical work themselves instead of
delegating.

**Known facts:** Two team members have raised, separately, that they wanted more ownership on
recent work the user did instead.

**Existing evidence:** Two `feedback_negative`-adjacent `fact` records (direct reports' comments).

**Existing hypotheses:** None yet.

**User message:** *"I got the bigger scope I wanted, but somehow things feel slower now. I don't
get it."*

**Bad response characteristics:** Treats "slower" as purely a process/tooling problem; misses the
two direct pieces of evidence already on file that point at a delegation gap; doesn't connect this
to the broader "stop doing the work that made you successful" pattern common at this seniority
transition.

**Good response characteristics:** Connects the "slower" feeling directly to the two on-file
reports from direct reports, names the specific pattern (continuing to do the technical work
instead of delegating it — a common trap exactly at this transition), and proposes a bounded
experiment (delegate a named piece of upcoming work fully, track what happens to both speed and
the team's growth) rather than generic "delegate more" advice.

**Relevant invariants:** #1, #4, #5, #6, #11.
