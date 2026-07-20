# U12 Block 1 Coach Review — Own the Ball

**Curriculum:** `film-room-u12-development-v1`  
**Block:** `u12-curr-block-01-own-the-ball`  
**Sequence:** `u12-curr-block-01-own-the-ball-seq-01`  
**Status:** Seeded for coach review — **not published**  
**Quality baseline:** `academy-package-receive-open-body` (unchanged)

Approve, revise, or reject each package individually. Do not mass-publish.

---

## Block 1 audit (pre-authoring)

| Field | Value |
|-------|--------|
| **Title** | Own the Ball |
| **Objective** | Establish safe ball security, bilateral comfort, and early scanning habits. |
| **Player outcomes** | Control with both feet; change surface without panic; keep the ball playable while moving. |
| **Lesson slots** | (1) `u12-lesson-ball-available` → Keep the Ball Available · (2) `u12-lesson-turn-escape` → Turn to Escape · (3) `u12-lesson-shield-purpose` → Shield with a Purpose |
| **Prerequisites** | None (entry block) |
| **Spiral concepts** | Ball mastery (introduce L1); Protect the ball (introduce L3); Transition first actions (light weave via “notice when the ball is free”); Scanning is **preparatory** here — dedicated introduce remains L4 in Block 2 |
| **Assessment** | Can the player keep the ball available while moving and name one nearby pressure or teammate? |
| **Shared activity families** | Surface-switch lanes; opposed box / corridor; directional keep / end-zone SSGs |

### Map ↔ shell mismatch resolution

Block-level primary goals include `u12-scan-before-receiving`, but no Block 1 slot owns that goal as primary. **Resolved without sequence change:** Block 1 weaves eyes-up / “ball free?” awareness; formal scanning lesson stays `u12-lesson-scan-early` (Block 2). Shell package IDs now point at the three authored packages below.

---

## Package 1 — Keep the Ball Available

| | |
|--|--|
| **Package ID** | `academy-package-ball-available` |
| **Lesson ID** | `u12-lesson-ball-available` |
| **Objective** | Move the ball across both feet and the sole while keeping it within one stride and glancing up to notice nearby space. |
| **Developmental rationale** | Opens the year with playable control — the foundation for turn, shield, and later open receiving. |
| **Practice flow (75 / 45)** | Surface Switch Lane → Available Box → Keep-Available Game · reflection on free vs tight |
| **Activity reuse** | New surface-switch family (template for later bilateral warmups); not a clone of open-body gates |
| **Assignment** | Solo surface circuit + write when the ball felt free (~18 min); easier/harder options included |
| **Quiz focus** | Playable distance, when to glance up, pressure-side surface choice (5 questions) |
| **Tactical boards** | Lesson + activity steps; one idea per board (stuck → available → scan) |
| **Risks / questions** | Is “call free or tight” age-appropriate language for your club? Shadow pressure intensity OK for week 1? |

**Reviewer decision:** ☐ Approve · ☐ Revise · ☐ Reject  
**Notes:**

---

## Package 2 — Turn to Escape

| | |
|--|--|
| **Package ID** | `academy-package-turn-escape` |
| **Lesson ID** | `u12-lesson-turn-escape` |
| **Objective** | Recognize pressure side, execute one sharp turn into open space, and accelerate away with the ball protected. |
| **Developmental rationale** | Builds on available control: now the player *uses* that control to escape. Prepares shield and later 1v1. |
| **Practice flow (75 / 45)** | Turn Channels → Escape Corridor → End-Zone Turn Game |
| **Activity reuse** | Channel family related to Block 1 warmup lanes; corridor is distinct from open-body diamond |
| **Assignment** | Partner turn practice + observe one escape moment in next play (~18 min) |
| **Quiz focus** | Scan before turn, turn away from pressure, accelerate after the cut (5 questions) |
| **Tactical boards** | Corridor with clear direction; defender cue → exit lane |
| **Risks / questions** | Opposed corridor: confirm defender constraints for U11. End-zone scoring rule clear enough? |

**Reviewer decision:** ☐ Approve · ☐ Revise · ☐ Reject  
**Notes:**

---

## Package 3 — Shield with a Purpose

| | |
|--|--|
| **Package ID** | `academy-package-shield-purpose` |
| **Lesson ID** | `u12-lesson-shield-purpose` |
| **Objective** | Place the body between opponent and ball, retain on the safe foot, and release or escape once a purpose appears. |
| **Developmental rationale** | Closes Block 1: protect with intention — not static hiding. Links forward to scanning (Block 2) and later protect-after-beating. |
| **Practice flow (75 / 45)** | Shield Pairs → Purpose Box → Retain-to-Release Game |
| **Activity reuse** | Opposed box family shared conceptually with L1 technical; purpose/release constraint is new |
| **Assignment** | Wall shield holds + name your purpose (wait / turn / release) (~18 min) |
| **Quiz focus** | Why shield, safe foot, when to release (5 questions) |
| **Tactical boards** | Side-on shape + target release; legal contact emphasis in cues |
| **Risks / questions** | Legal use of arm/body — any club policy wording to add? Next link to `u12-lesson-scan-early` OK before that package exists? |

**Reviewer decision:** ☐ Approve · ☐ Revise · ☐ Reject  
**Notes:**

---

## Editorial status (expected after seed)

| Package | Lifecycle | Workflow |
|---------|-----------|----------|
| `academy-package-ball-available` | needs_review | needs_coach_review |
| `academy-package-turn-escape` | needs_review | needs_coach_review |
| `academy-package-shield-purpose` | needs_review | needs_coach_review |

Open-body published package was **not** modified.

---

## Coach commands

```bash
# Seed Block 1 into editorial (requires ACADEMY_EDITOR_ACTOR + ACADEMY_EDITOR_ALLOWLIST)
npm run academy:editorial:seed-block1

# Transition a single object (example)
ACADEMY_EDITOR_ACTOR=you ACADEMY_EDITOR_ALLOWLIST=you \
  npm run academy:editorial:transition -- <objectId> approved --note "Coach approved"

# Approve entire package after members are ready
ACADEMY_EDITOR_ACTOR=you ACADEMY_EDITOR_ALLOWLIST=you \
  npm run academy:editorial:approve-package -- academy-package-ball-available

# Publish only after explicit approval (do not run yet)
# npm run academy:editorial:publish-package -- academy-package-ball-available
```

## UI routes (after eventual publication)

- Admin review queue: `/admin/academy`
- Package review detail: `/admin/academy/review/[objectId]`
- Team Academy (feature-flagged): `/team/{teamId}/academy`

Until published, packages appear in the **editorial** admin surfaces only — not in the public catalog.
