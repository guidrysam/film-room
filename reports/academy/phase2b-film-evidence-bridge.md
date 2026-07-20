# Film Room Academy — Phase 2B Film Evidence Bridge

Date: 2026-07-19  
Depends on: Phase 2A goal graph (`ff548b8`)

## Objective

Connect coach-marked Film Room moments to canonical development goals through
evidence tags, then feed those goals into practice and game-plan generation.

## Flow

```text
Game timeline event / highlight moment
        ↓
Infer coarse Academy event family (stat/label only; no invented intent)
        ↓
Suggest evidence tags from U12 registry
        ↓
Coach confirms tag(s)
        ↓
Resolve development goal(s)
        ↓
Recommend follow-ups (practice goals, assignment kinds, cue language)
        ↓
Generate goal-aware practice / game-plan outline
```

## What shipped

- `AcademyFilmReference` now uses `gameTimeSec` and explicit timeline/highlight IDs
- `AcademyFilmEvidenceAttachment` team document shape
- `lib/academy/film-evidence.ts` mapping + recommendation helpers
- `lib/academy/practice-generation.ts` goal/evidence-aware practice and game-plan outlines
- Firestore rules + cleanup for `academyFilmEvidence`
- Persistence helper `saveFilmEvidenceAttachment`

## UI hook

- Game Review tab **Develop** (coach + team game + Academy enabled)
- Component: `components/AcademyFilmEvidencePicker.tsx`
- Evidence is stored on the team document path, not inside timeline event payloads

## Explicit non-goals (this phase)

- Full GameReview UI rewrite
- Auto-detecting tactical intent from video
- Selecting approved lesson/drill IDs (content not authored yet)
- Catalog maintenance tooling

## Next

1. Author minimal approved drills/lessons for highest-demand goals
2. Fill practice activity `drillId` slots from approved content
3. Surface film-evidence-driven practice suggestions on the team Academy page
