# Film Room Academy — Phase 2A Goal Graph Review

Date: 2026-07-19  
Rollback point: `46eeeeb`  
Catalog: `u12-9v9-canonical-goal-catalog` v1  
Admin review route: `/admin/academy` (development-only)

## Counts

| Metric | Value |
| --- | ---: |
| Domains | 15 |
| Goals | 57 |
| Prerequisite links | 67 |
| Related links (undirected) | 51 |
| Game evidence tags | 114 |
| Individual-suitable goals | 57 |
| Film-observable goals | 57 |

## Goals by development block

| Block | Primary | Supporting | Reinforcement |
| --- | ---: | ---: | ---: |
| Block 1 · Ball mastery and first touch | 10 | 0 | 0 |
| Block 2 · Passing and support | 8 | 0 | 10 |
| Block 3 · Width, depth, and buildup | 8 | 0 | 8 |
| Block 4 · Combination play and finishing | 9 | 0 | 8 |
| Block 5 · Transition and team defending | 11 | 0 | 9 |
| Block 6 · Leadership, reflection, and transfer | 11 | 0 | 11 |

Seasonal placement currently uses `primary` for first introduction and `reinforcement` in the following block. No goals are tagged `supporting` yet; that role can be used when weekly practice templates are authored.

## Goals by position group

| Position group | Primary | Secondary |
| --- | ---: | ---: |
| all | 41 | 0 |
| goalkeeper | 7 | 1 |
| defender | 5 | 0 |
| outside_defender | 1 | 1 |
| central_defender | 1 | 0 |
| midfielder | 3 | 5 |
| wide_player | 2 | 4 |
| forward | 4 | 2 |

## Validation results

- `npm run academy:goals:validate` — PASS
- Unique IDs, domain/block/tag references, acyclic prerequisites, bidirectional related links, positive + improvement evidence, editorial review gate — enforced
- No goal is auto-approved; all remain `needs_coach_review`
- Source provenance arrays are empty and stripped from serialized reports

## Potential curriculum gaps

1. `supporting` seasonal role is unused until practice templates exist.
2. Outside/central defender primary coverage is intentionally thin; many defending goals remain `all`/`defender` for U11–U12 versatility.
3. Related links mix within-domain neighbors and selected cross-domain retrieval edges; coaches may want denser retrieval pairs after first review.
4. Evidence tags are coach-applied teaching tags. They intentionally include Academy event types without exact native game-stat equivalents (`receive`, `buildup`, `coach_clip`).
5. Block 6 integrates leadership/reflection with advanced decision goals; some coaches may prefer moving more finishing reinforcement earlier.

## Goals needing human judgment

All 57 goals require coach review before approval. Highest-judgment clusters:

- Progress vs retention and overload/isolation decisions
- Counterpress vs recover choices
- Purposeful direct exits from buildup
- Reflection goals that must avoid inventing player intent from film

## Files created

- `lib/academy/u12-goal-catalog.ts`
- `lib/academy/u12-goal-catalog.test.ts`
- `lib/academy/goal-catalog-validation.ts`
- `lib/academy/goal-catalog-reporting.ts`
- `scripts/academy/generate-u12-goal-reports.ts`
- `app/admin/academy/GoalReviewClient.tsx`
- `reports/academy/u12-goal-graph.json`
- `reports/academy/u12-goal-graph.md`
- `reports/academy/u12-goal-graph.mmd`
- `reports/academy/u12-goal-coverage.md`
- `reports/academy/u12-content-demand-plan.md`
- `reports/academy/phase2a-goal-graph-review.md`

## Files changed

- `lib/academy/types.ts`
- `lib/academy/goal-catalog-reporting.ts`
- `lib/academy/goal-graph.test.ts`
- `lib/academy/validation.test.ts`
- `app/admin/academy/page.tsx`
- `package.json`

## Tests / build

- Full test suite — PASS (`35` tests)
- `npm run build` — PASS
- `npm run academy:validate` — PASS
- `npm run academy:goals:validate` — PASS

## Stop gate

Lesson generation has **not** started. Next phase should consume `reports/academy/u12-content-demand-plan.md` after human review of the goal graph.
