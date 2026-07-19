# Film Room Academy — Phase 1 Architecture Audit

Date: 2026-07-19  
Scope: Domain model, source ingestion/privacy, runtime wiring, planning interfaces  
Status after remediation: **Phase 1 foundation ready to commit; Phase 2 content generation not started**

## Executive summary

Phase 1 delivered a private PDF ingestion pipeline, Academy domain schemas, editorial/admin/team entry points, and planning stubs. Four independent audits found the foundation strong on types and ingestion, but initially incomplete for knowledge-graph readiness, Firestore runtime, privacy hardening, and deterministic planning. The high-severity gaps that would block Phase 2 graph-first authoring were remediated before this commit point.

**Architecture score (post-remediation): 7.5 / 10**

- Domain / knowledge graph: 7.5 / 10  
- Ingestion / privacy / editorial: 8.0 / 10  
- Runtime / permissions / UI: 7.0 / 10  
- Planning / deterministic generation: 7.0 / 10  

## Audit sources

| Area | Agent | Initial finding | Post-fix |
|------|-------|-----------------|-------------|
| Domain graph | [Audit Academy domain graph](c3d8dce5-9484-4ebb-af32-f24e59cfa709) | Schemas present; graph spine incomplete | Quiz/assignment templates, goal graph helpers, stronger validators, film refs |
| Ingestion privacy | [Audit Academy ingestion privacy](29b0fe14-5a6a-48a5-8d36-303a564fd475) | Extracted text trackable if committed | Private JSON gitignored; rewrite-only eligibility enforced |
| Runtime wiring | [Audit Academy runtime wiring](01322762-ca69-4ac8-a189-00223e3996cd) | UI shells without Firestore rules/accessors | Team collections + rules scaffolding; admin locked to development |
| Planning | [Audit Academy planning interfaces](5db8a2f4-d1ca-457d-be1b-29f9b445fae1) | Types only | Duration scaler, compatibility filters, practice/outline stubs |

## What Phase 1 includes

- Private source corpus under `docs/academy-sources/` (PDFs gitignored)
- Register → extract → index → editorial queue → validate pipeline
- Domain types for presets, goals, blocks, weeks, practices, drills, lessons, quizzes, assignment templates, runtime assignments, evidence, planning DTOs, and `AcademyContentGraph`
- Goal catalog validation with circular prerequisite detection
- `lib/academy/goal-graph.ts` spine builder for Phase 2 content edges
- Team Academy route + admin editorial shell behind feature/env gates
- Firestore rules and team cleanup hooks for Academy collections
- Reports under `reports/academy/`

## Remediation applied before commit

1. Added `AcademyQuiz`, `AcademyAssignmentTemplate`, and `goalIds` on assignments  
2. Renamed week `playerLessonIds` → `tacticalLessonIds`  
3. Added `AcademyFilmReference` and `highlight` evidence type  
4. Extended content path helpers (`goals/`, `drills/`, lessons, practices, presets, quizzes, assignments)  
5. Strengthened validators and goal-graph cycle checks  
6. Added deterministic U12 session scaling + practice/outline planner stubs  
7. Gitignored private source/index/queue JSON  
8. Hardened admin/team Academy feature flags and Firestore scaffolding  

## Remaining Phase 2 prerequisites (intentionally deferred)

These are not commit blockers for Phase 1, but must land **before** bulk U12 content generation:

1. Author the development **goal graph** (goals + prerequisites/related edges) as the first content artifact  
2. Generate content in order: Goals → Lessons → Drills → Practices → Assignments → Quizzes  
3. Wire privacy-strip helpers onto every product-facing serialization path  
4. Complete Firestore CRUD modules and confirm rules via emulator (Java runtime required)  
5. Replace planner stubs with goal-linked catalog selection and lazy practice instantiation  
6. Keep source titles/brand cues out of player-facing UI  

## Verification

- `npm run academy:validate` — PASS  
- Academy unit tests (IDs, privacy, validation, planning, goal graph) — included in suite  
- Full test suite and production build should be re-run immediately before commit  

## Decision

Proceed with a Phase 1 commit as the rollback point. Do **not** generate the full U11–U12 curriculum until the goal graph exists and content generation is constrained to that graph.
