# Academy Phase 2C — Practice and Game Plan Generation

## Outcome

Phase 2C proves that the canonical U11–U12 Development Goal Graph can drive
coach-ready planning without an LLM.

The implemented path is:

```text
confirmed film evidence
  → canonical evidence tags
  → Development Goal IDs
  → deterministic recommendations
  → practice or game plan
  → optional language-only enhancement
```

Clips and opponent notes never bypass Development Goals to select coaching
content.

## Deterministic practice generator

`generateDeterministicPractice` accepts:

- selected primary and supporting Development Goal IDs
- age band
- 45, 60, 75, or 90 minute duration
- roster and goalkeeper counts
- available field dimensions
- available equipment

It always returns the six required sections:

1. Warm-up
2. Technical
3. Small Group
4. Conditioned Game
5. Scrimmage
6. Reflection

Section durations add exactly to the requested duration. Drill selection is
stable and ranked by direct goal overlap, related-goal overlap, section role,
age, roster, goalkeeper needs, field dimensions, and equipment. Completed or
saved plans contain drill preset references rather than copied drill content.

When no compatible, goal-linked drill exists, the section stays explicit and
contains goal-derived coaching cues plus a warning. The generator does not
silently substitute unrelated content.

## Drill metadata bridge

The 15 existing built-in practice drills remain canonical in
`lib/tactics-presets/drills.ts`. `lib/academy/drill-catalog.ts` adds an Academy
metadata overlay without creating duplicate drills.

Every built-in drill now exposes:

- Development Goal IDs
- age range
- difficulty
- required equipment
- minimum roster, group size, and goalkeeper count
- minimum field dimensions
- duration
- coaching cues
- common errors and corrections
- progressions
- regressions
- suitable practice sections
- editorial status

The overlay currently maps 56 of 57 canonical goals to at least one existing
drill. `u12-receive-aerial-ball` remains an honest content gap because none of
the existing drills trains aerial receiving. No duplicate or invented drill was
added to conceal that gap.

## Recommendation engine

`recommendAcademyContent` returns deterministic recommendations for:

- Development Goals
- related Development Goals
- drills
- tactical lessons
- assignment templates
- quizzes

It accepts content catalogs as inputs. The current built-in drill catalog is
available immediately. Lesson, assignment, and quiz results remain empty until
approved goal-linked content exists; the engine does not fabricate records.

## Game plan generator

`generateDeterministicGamePlan` produces:

- pregame objectives
- today's coaching focus
- key reminders
- warm-up focus
- optional formation notes
- transition emphasis
- bench reminders
- halftime discussion points
- postgame reflection prompts

The templates use only selected goals and goals resolved from confirmed
previous-game evidence tags. Opponent notes are preserved as coach context and
do not invent new tactical priorities.

## Optional AI boundary

`enhancePracticeLanguage` and `enhanceGamePlanLanguage` are provider-neutral
hooks. They permit wording, tone, and flow changes. Runtime guards reject an
enhancement that changes:

- selected or evidence-derived Goal IDs
- practice sections or durations
- drill or lesson references

There is no AI package or provider dependency in the core workflow.

## Coach route

The functional planner is available at:

```text
/team/{teamId}/academy
```

With Academy enabled, a coach can select Development Goals, set practice
constraints, generate a practice, generate a game plan, and print the current
plans.

## Validation

Focused tests cover:

- metadata completeness for every existing drill
- deterministic recommendation ordering
- goal and constraint filtering
- all six practice sections
- exact practice duration
- unavailable-equipment filtering
- game-plan sections
- evidence-tag-to-goal use in game plans
- AI authority guards

The existing Phase 2B film evidence bridge remains unchanged.

Verification completed:

- full test suite: 49 passed
- production build: passed
- Academy source validation: passed
- canonical goal graph validation: passed
- Phase 2C changed-file lint: passed

The repository-wide lint command still reports unrelated existing React hook
and ref-rule violations outside the Phase 2C files.

