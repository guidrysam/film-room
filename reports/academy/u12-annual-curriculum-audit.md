# Phase A0 — U12 Annual Curriculum Audit

Audit only. No curriculum content generated. No product code changed for this report.

Date context: Film Room Academy after Phase 3E (evidence → published lesson).

---

## 1. Existing models

Primary definitions: `lib/academy/types.ts`.

| Layer | Types | Live content today |
|-------|--------|--------------------|
| Goals / age / stage | `AcademyGoal`, `AcademyGoalDomain`, `AcademyDevelopmentStage`, `ageBand` / `ageBands` | Full U12 goal graph in `u12-goal-catalog.ts` (57 goals, 6 season blocks, 12 weeks) |
| Annual / blocks / weeks | `AcademyPreset`, `AcademyBlock`, `AcademyWeekTemplate`, `AcademyPracticeTemplate`, `AcademySeasonBlockDefinition`, `seasonal_program` object type | **Types exist; no authored annual preset.** U12 has block **definitions** only |
| Lesson | `AcademyTacticalLesson`, `lesson_package` | **One** published lesson |
| Activity | `AcademyActivity` (+ warmup / SSG object types) | **Three** published activities for open-body; plus seed drill metadata for practice generator |
| Practice | `AcademyPracticeTemplate`, `GeneratedAcademyPractice`, `AcademyPublishedPracticeDraft` | Generator + reference-only drafts; no annual practice calendar |
| Assignment / quiz | `AcademyAssignmentTemplate`, `AcademyQuiz`, `AcademyQuizQuestion` | One assignment + one 6-question quiz in published package |
| Publication | `AcademyCanonicalRecord`, `PublishedAcademyCatalog`, editorial workflow statuses | CLI-backed editorial → `catalog-published/catalog.json` |
| Team runtime | `TeamAcademyPlan`, assignments, quiz submissions, film evidence | Refs / overrides in Firestore — **not** curriculum copies |

Docs: `docs/academy-catalog.md`.

---

## 2. Published U12 lesson package

Published catalog: `film-room-academy` **v2**, **13 objects**.

| ID | Type |
|----|------|
| `u12-receive-open-body` | Development Goal (code catalog, not a published catalog object) |
| `academy-package-receive-open-body` | `lesson_package` |
| `academy-lesson-receive-open-body` | `lesson` |
| `academy-warmup-open-body-gates` | `warmup` |
| `academy-activity-open-body-diamond` | `activity` |
| `academy-ssg-open-body-end-zones` | `small_sided_game` |
| `academy-assignment-open-body-three-moments` | `assignment` |
| `academy-quiz-receive-open-body` | `quiz` |
| `academy-quiz-receive-open-body-q1`…`q6` | `quiz_question` |

Source of truth for payloads: `lib/academy/receive-open-body-content.ts` → enveloped by `open-body-package.ts` → editorial seed/approve/publish.

**Constraint:** Do not overwrite this published lesson when generating the annual curriculum. New lessons are additive packages.

---

## 3. Editorial workflow

```text
seed → needs_coach_review → approve → publish
                 ↘ reject
publish → approved (unpublish)
```

- Admin UI (`/admin/academy`): **read-only**
- Writes: CLI only (`academy:editorial:*`) with `ACADEMY_EDITOR_ACTOR` + allowlist
- Editorial records: `data/academy/catalog-editorial/` (gitignored JSON)
- Audit: append-only `audit.jsonl`
- Team Academy reads **only** `data/academy/catalog-published/catalog.json`

Package policy: approve members, then one atomic package publish. Quiz answer keys are stripped from published client payloads; scoring uses server-side authored keys.

---

## 4. Canonical activity IDs in practices

Three paths:

1. **Published lesson practice draft** (`AcademyPublishedPracticeDraft`)  
   `activitySequence[].activityId` from `lesson.activityIds` (order preserved). Open-body currently expects three activities.

2. **Deterministic practice generator** (`GeneratedAcademyPractice`)  
   Sections use `drillId` (+ optional `sourcePresetId` for tactics boards).

3. **Planning skeleton** (`GeneratedPracticePlan`)  
   Often leaves drill slots empty until content exists.

**Gap:** `activityId` vs `drillId` naming is inconsistent; annual curriculum should standardize on canonical activity IDs (+ optional tactics preset reference).

---

## 5. Editable vs published-only

| Surface | Editable? |
|---------|-----------|
| Canonical Film Room source modules / editorial CLI | Editors via CLI + review |
| Admin Academy UI | Preview / queue only |
| Published catalog | Immutable until next publish/unpublish |
| Team Firestore Academy collections | Coach: plans, assignments, quiz results, evidence — **references**, not curriculum forks |
| Club-owned curriculum copy | **Not implemented** |

---

## 6. Model fitness for annual curriculum

| Capability | Verdict | Evidence |
|------------|---------|----------|
| Age groups | **Yes** | `ageBand` / labels; U12 = `U11-U12` |
| Annual curricula | **Partial** | `AcademyPreset`, `seasonal_program` type; no authored instance |
| Ordered training blocks | **Partial** | U12 has 6 goal-placement blocks (12 weeks); not a full ~40-week lesson pathway |
| Ordered weekly lessons | **Partial** | `AcademyWeekTemplate` exists; unused for lesson packages |
| Lesson recurrence / reinforcement | **Partial** | Goal `seasonalPlacement.role: "reinforcement"` only |
| Club-owned curriculum copies | **No** | Firestore rules: built-in curriculum is app data; teams store refs/overrides |
| Curriculum versioning | **Partial** | Object + catalog versions; no fork lineage (`basedOnCurriculumId`, season pin) |

---

## 7. Model changes required before full generation

**Must have before Phase C content volume:**

1. **Canonical annual curriculum object** (new or first real `seasonal_program` / `AcademyPreset` instance) with:
   - stable ID + version  
   - age group + development stage  
   - ordered blocks  
   - ordered weekly lesson slots (core + flexible)  
   - assessment weeks  
   - prerequisite / reinforcement links between lessons  

2. **Curriculum block object** with objectives, outcomes, principles, assessment criteria, advance/repeat guidance.

3. **Weekly lesson slot** pointing at a `lesson_package` ID (not embedding full lesson payloads).

4. **Unify practice activity references** (`activityId` + optional `tacticsPresetId`).

**Must have before club editability (can follow first Film Room publish):**

5. **Ownership layers:**  
   - `film-room` canonical (immutable when published)  
   - `club` copy (`sourceCurriculumId` + `sourceVersion`)  
   - `team-season` assignment pinned to a curriculum version  

6. **Immutability rule:** published curriculum versions never mutate; upgrades are explicit.

**Do not need first:** redesign of goals, film evidence, tactical-board editor, or quiz security model.

---

## Architecture decision (recommended)

Treat the **lesson package** (lesson + activities + assignment + quiz) as the atom — already proven by open-body.

Add a **curriculum shell** that sequences packages into blocks/weeks:

```text
Film Room Canonical Curriculum (versioned)
  → Training Block
    → Week slot → lesson_package ID
    → Assessment / flexible week markers
Club copy (fork) → Team season pin
```

Film review / evidence tags remain **secondary** annotations on goals/lessons, not the curriculum spine.

**Publication strategy (per product brief):**  
Publish shell + first complete block first; verify Team Academy UI; then remaining blocks. Do not mass-publish unreviewed content. Preserve `academy-lesson-receive-open-body`.

**Existing U12 goal catalog** remains the developmental vocabulary (57 goals). The annual curriculum **maps lessons onto those goals** and may extend block structure beyond the current 12-week goal-placement calendar.

---

## What exists that we reuse

- Open-body quality baseline (lesson, 3 activities, assignment, quiz, boards, concept brief)
- Editorial CLI + published catalog privacy stripping
- Canonical activity library pattern
- Secure quiz submission
- Tactics preset linking from practice sections
- U12 goal graph + evidence tags

## What does not exist yet

- ~40-week ordered lesson pathway
- Flexible / assessment weeks as first-class slots
- Curriculum shell + club fork + season pin
- Content volume beyond one lesson package
- Typed Firestore plan children for week calendars

---

## Risks

- Scaling package publish to dozens of packages without batch tooling will be slow — need package-set / curriculum publish later.
- Reusing activities without meaningful constraint variation will feel repetitive — validation must catch that.
- 12-week goal blocks vs ~40-week lesson year — do not conflate; curriculum weeks ≠ current goal-catalog weeks.
- Club copies deferred too long will force coaches to fork by editing team plans ad hoc.

---

## Exact next step

1. **Review this audit** (architecture decision above).
2. On approval, produce Phase A map only:  
   `reports/academy/u12-annual-curriculum-map.md`  
   (blocks, ~40 core lesson titles, flexible weeks, prerequisites, assessments — **no** full lesson payloads yet).
3. Then Phase B schema extensions + tests.
4. Then Phase C generation in reviewable source packages.
5. Phase E: publish shell + **first block only**, verify `/team/{teamId}/academy`.
