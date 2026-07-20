# Phase 3E — Confirmed Evidence to Published Lesson

## Scope

This audit traces only the committed `u12-receive-open-body` runtime path. It
does not introduce curriculum, evidence tags, or inferred player intent.

## Path before Phase 3E

1. `/game/{gameId}/review` renders `GameReview`.
2. A coach who can manage game statistics can open the review panel's
   **Develop** tab and select a timeline event.
3. `AcademyFilmEvidencePicker` infers only a coarse event family. It presents
   canonical evidence tags for the coach to choose; inferred tags are not saved
   automatically.
4. On confirmation, `saveFilmEvidenceAttachment` writes the selected canonical
   tag IDs, resolved Development Goal IDs, game/event reference, optional
   player references, coach note, actor, and catalog release to:
   `teams/{teamId}/academyFilmEvidence/{attachmentId}`.
5. Firestore rules restrict that collection to team coaches/admins.
6. The picker previously linked to `/team/{teamId}/academy?goals=...`, where a
   generic deterministic practice generator selected goals from the query
   string.

The graph connection from a confirmed tag to a Development Goal already
existed in `resolveGoalsForEvidenceTags`. The published package selectors also
already resolved a published lesson to its canonical activities, assignment,
quiz, and questions.

## Missing runtime connections found

- Team Academy did not read saved `academyFilmEvidence`.
- The generic development follow-up stopped at goal IDs and explicitly did not
  select a published lesson.
- No published-only resolver joined evidence tags → goals → lessons.
- There was no deduplication, recency/repetition ranking, or visible
  clip-to-lesson explanation.
- Generated practice output was not saved and did not preserve published
  lesson/activity release references.
- The published assignment had no team-scoped assignment action.
- Quiz questions rendered read-only, and the published browser payload still
  contained answer keys.
- There was no authenticated server scoring or coach-facing completion record.
- Dismiss/current-focus actions had no team-scoped persistence.

## Phase 3E runtime path

1. Team Academy reads coach-confirmed `academyFilmEvidence` records.
2. `resolvePublishedLessonRecommendations` validates canonical tag IDs and
   resolves goals through the committed U12 Development Goal graph.
3. Goals are joined only to lessons in the immutable published catalog. Missing
   or incomplete packages produce a goal result without a lesson
   recommendation.
4. Evidence for one lesson is deduplicated by game/moment identity and ranked
   with understandable labels based on confirmed tags, repeated moments,
   recency, and optional coach priority.
5. The Develop panel shows the complete trace:
   confirmed game event → canonical evidence tag →
   `u12-receive-open-body` → published lesson.
6. Coach actions save reference-only practice drafts, assignment records, and
   recommendation decisions in team-scoped Firestore collections.
7. Player-safe quiz payloads omit answer keys and explanations. An
   authenticated route verifies team membership, confirms the quiz is still
   published, scores against server-only authored keys, and stores a completion
   record for coach review.

## Published release and version policy

Saved records retain the published catalog ID/version and referenced object
versions. Practice drafts store canonical activity IDs, order, durations, and
coach modifications rather than copied activity definitions. Consequently,
unpublishing prevents new recommendations while existing drafts retain safe,
auditable release references.

## Authorization boundaries

- Evidence creation, practice/assignment writes, focus/dismiss decisions, and
  coach completion review use existing team-coach Firestore rules.
- Team Academy visibility still requires team membership.
- Quiz submission sends a Firebase ID token to the server. The server verifies
  the token and team membership before scoring or writing a result.
- Published answer keys never enter the Team Academy client payload.

## Verification

- Evidence tags exercised:
  - `u12-receive-open-body-evidence-improvement`
  - `u12-receive-open-body-evidence-positive`
- Recommendation chain:
  confirmed film attachment → canonical evidence tag →
  `u12-receive-open-body` → `academy-lesson-receive-open-body`
- Develop UI route: `/team/{teamId}/academy`
- Practice draft assembly references:
  - `academy-warmup-open-body-gates`
  - `academy-activity-open-body-diamond`
  - `academy-ssg-open-body-end-zones`
- Assignment workflow: coach-only Firestore writes for selected players or entire team
- Quiz workflow: player-safe published payload + authenticated `/api/academy/quiz/submit` scoring
- Published release identity: `film-room-academy` catalog version `2`
- Academy/admin tests: 80 passing
- Targeted lint: clean
- Production build: succeeded
- Unrelated pre-existing failure: `npm run test:rules` still blocked locally by missing Java runtime for the Firestore emulator
