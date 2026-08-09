# Film Room — Parent-up spine

Product direction for restructuring Film Room around **parents as the growth
engine**, with **coaches keeping today’s organizer posture**. Same features for
everyone; different defaults, tenure, and “start here.”

This doc is the north star for pathing, permissions, billing, and migration.
It does not require a rewrite — prefer flipping gates, CTAs, and defaults on
the existing `teams` / `games` / `members` model.

---

## Film atom amendment (2026-08)

Field reality (Game Cap): **easy in is critical.** Parents/coaches will not
do team admin before upload if the film dies in a week.

**Amended spine:** Film enters via a **personal My Film inbox** (user Drive
link). Club / team / player / game attach is optional organization afterward.
Game-scoped vault upload remains for people who already pick a game.

See acceptance: signed-in upload with no team/game → My Film → review /
YouTube → optional organize.

---

## Thesis

1. **Parents drive the network.** They join and leave teams as seasons and
   events come and go. Many parents are also coaches.
2. **Film enters first; games organize later.** Personal inbox upload works
   with zero roster. Creating/attaching a game provisions review, tags, and
   archive paths when needed.
3. **Watching and organization matter most for parents.** A quality tagged full
   game with transport (slo-mo, replay) is the core product. Auto highlights and
   multi-angle sync are optional upgrades; **one angle is a finished product**.
4. **Roster enrichment is for the team to organize** — it improves the
   experience; it is never the gate.
5. **Buy-in for the workbench.** Tracking, archiving, and app tooling require a
   parent season seat. Finished cuts and team review can be shared without
   every watcher paying.
6. **Coaches get the current product posture** — setup, roster, staff, season
   structure — on the same feature set.

---

## Dual posture (one product)

| | Parent posture | Coach / organizer posture |
| --- | --- | --- |
| Teams | Temporary — join for a season/event, leave when done | Sticky — own and maintain teams/clubs |
| Network | Move across teams as kids move | Build a few long-lived teams |
| Home default | My games, Create game, Find / join / leave team, My record | Team setup, roster, games, staff (closer to today) |
| Primary job | Capture → cut → share → keep personal archive | Roster, schedule, invites, season structure |
| Features | Full stack available | Full stack available |

Posture comes from signup intent and behavior. A parent-coach can use both
defaults; we do **not** fork features into two apps.

---

## Core loops

### Parent

```text
Find / join / create team
  → Create game (provisions tentacles)
    → Capture or upload (Game Cap / RTMP / file)
      → Watch + tag + transport in Film Room
        → Optional highlights / multi-angle sync
          → Publish cut to YouTube (share freely)
          → Admin/coach shares team watch link (group review, no sub)
  → Leave team when season ends — personal record + archive trail remain
```

### Coach / admin parent

```text
Create / maintain team (optional club, optional CSV)
  → Roster / schedule enrichment when available
  → Games + staff invites
  → Mint team watch link for free group review
  → Same capture, tags, highlights, angles, YouTube, vault
```

---

## Create game = provision the system

One action, no roster required. Prefer **team name in the same flow** if none
exists yet (indexes cleanly; Find my team still works).

| Tentacle | Purpose |
| --- | --- |
| Game record | Title, sport, date/time, team, opponent optional |
| Game Cap / RTMP | Stream / attach slots ready |
| Indexing | Enough metadata to find it later |
| Angle slots | Main (and sport-appropriate extras); single angle is complete |
| YouTube archive path | Publish when film/cut is ready |
| Watch surface | Team/game room for seated users + shared watch link |
| Score / stats | Filled when Game Cap (or later entry) supplies them |

Imports, clubs, tactics, and academy spiral out from games that already work.

---

## Value layers

| Layer | Job | Required? |
| --- | --- | --- |
| **Watch** | Full game, tagged, transport | Primary |
| **Archive** | YouTube + in-app season trail | Primary for seated users |
| **Capture** | Game Cap / RTMP / upload for that game | Means to watch |
| **Condense** | Auto highlights | Optional |
| **Enrich angles** | Multi-angle + sync | Optional; never imply incomplete without it |
| **Organize** | Roster, kids, invites, Find my team | Team enrichment |

Design rules:

- Single angle is a finished product.
- Tags + transport beat fancy editors for the core parent loop.
- Highlights and sync spiral out from a watched game.
- Roster is enrichment, not setup step 1.

---

## Team network

### Join and leave

- Parents **join and leave teams as they go**. Teams are temporary containers.
- **Leave ≠ delete.** Leaving removes active membership only.
- The **team archive remains** for the team and for people with a historical tie.
- Coaches largely stay; their workspace stays “current product.”

### Find my team

Middle path between invite link and create:

1. Search by team name / org, sport, age/season (optional city).
2. Short match list — **no kid names** until approved.
3. **Request to join** (not open join).
4. Admin / coach / founding parent approves.
5. Then add/link kid if desired.

Also keep: invite URL and short join code for speed.

### Players across teams

- A **player (person) may have multiple teams**.
- Person is long-lived; team roster rows are memberships.
- “Add my kid” attaches a person to the current team — do not create a new
  identity per team.
- Parent **My kids / My record** rolls up across teams.

---

## Leave team vs personal record

On leave:

| Ends | Remains |
| --- | --- |
| Active `members` role | Team games, film, cuts (team archive) |
| Creating/capturing for that team | **Personal record** — teams you’ve been on, games, scores/stats when Cap supplied them |
| | YouTube links and published cuts as shared |

**My record** is the parent’s career/season trail across the network. Score and
stats are part of that record when Game Cap (or manual entry) provided them.

Access policy sketch:

- **Active members** — full team room + tools (if seated).
- **Past members** — personal record + published artifacts; live room may stay
  members-only unless they use a watch link.
- **Watchers** — team watch link or YouTube; no seat required.

---

## Roles (simplified)

| Role | Meaning |
| --- | --- |
| **Member** | Seated parent/coach-hybrid: create games, capture, cut, archive |
| **Admin** | Founder or promoted: settings, Drive/YouTube connect, team watch link, approvals |
| **Coach** | Label + organizer tools; often same human as member/admin |
| **Watcher** | Via team watch link or YouTube — no seat |

Avoid hard walls that block parent-coaches from the core loop. Labels guide UX
and invites; the game atom is available to seated members.

---

## Access and billing

### Free vs buy-in

| Free | Requires parent season seat (~$5–10/mo) |
| --- | --- |
| Watch finished cut via **YouTube link** the parent shares | Tracking, archiving, organization in the app |
| Watch together via **team watch link** (minted by coach/admin parent) | Create games, capture, tag, transport tooling, cuts, multi-angle tools |
| Find / request join (until approved) | Season seat for contributing parents |

**YouTube** = public distribution of the cut (parent’s choice).  
**Team watch link** = free group film review without a sub.  
**Film Room app** = workbench + archive + tracking — paid.

Expect **about four to five seated users per team** in a season. Parents use
the seat for the season, then pause; archive/record remain for next season.

### Credits

Existing user/club **credits** for heavy AI (tag, sync, propose-cut) can sit
inside seated usage (allotment later) or remain metered add-ons. Seats gate the
workbench; credits gate expensive compute.

---

## Information architecture

| Surface | Job |
| --- | --- |
| **Home (seated)** | Active teams, Create game, Find my team, My record / past teams |
| **Game** | Hub: capture, watch, tags, angles, publish, highlights, score/stats |
| **Team** | People, optional roster, watch link, settings (admin) |
| **Watch link** | Shared review — no sub |
| **Game Cap** | Capture arm of a **game**, not a parent dead-end home |
| **Club / CSV / Academy / Tactics** | Power tools under Organize — primary for coach posture |

Demote: “Create a club” as the default CTA; parent → Game Cap with no game;
“Import roster first” as step 1; UI that makes single-angle feel incomplete.

Promote: Create game, Find my team, Join/leave, Share watch link, Publish to
YouTube, My record.

---

## Data model notes (light)

Prefer extending current collections over a greenfield schema.

| Concern | Direction |
| --- | --- |
| Active membership | `teams/{id}.members` + `memberUids` |
| History | Membership history and/or user-side past team/game links for **My record** |
| Person across teams | Keep/strengthen `personId` and multi-team player links |
| Find my team | Searchable team fields + join **requests** collection |
| Watch link | Dedicated team (or game) watch-link docs; watch-only, no tooling |
| Seats | Billing seat on `users/{uid}` (season sub) |
| Cap score/stats | Game fields populated from Game Cap sidecars when present |
| Roster / parentInviteTargets | Remain as enrichment |

Game create: allow seated members (not coach-only). Always attach a team.

---

## Migration phases

| Phase | Change | Outcome |
| --- | --- | --- |
| **A. Pathing** | Onboarding + home by posture; Game Cap tied to a game | Feels parent-up / coach-familiar |
| **B. Game atom** | Members create games; provision tentacles; zero roster required | Works without CSV |
| **C. Watch link** | Admin/coach mint team watch link; watchers no sub | Team reviews together free |
| **D. Seats** | Parent season sub gates tooling; YouTube + watch link stay free | Monetization matches story |
| **E. Network** | Find my team, join requests, **leave team**, My record | Fluid parent network |
| **F. Enrichment polish** | Roster/CSV/club as Organize; Cap score/stats on record | Power users + archive quality |

A→B unlock the thesis. C→D lock the business model. E→F complete the network
and coach parity.

---

## Success tests

**Parent:** Create or find a team → create a game with no CSV → capture one
angle → watch with tags/transport → publish YouTube → share team watch link →
teammates watch free → leave team → My record still shows games and Cap
scores/stats → join a different team next month on the same seat.

**Player:** Same kid appears on club team and tournament team without duplicate
identity; parent record rolls up both.

**Coach:** Home still feels like today’s organizer product — roster, staff,
games shells, watch link — with the same capture and review stack underneath.

---

## Non-goals (for this spine)

- Public browseable directory of all kids/teams
- Requiring roster or schedule import to film
- Separate parent-only and coach-only codebases
- Locking finished YouTube cuts behind a subscription
- Making multi-angle mandatory for a “complete” game

---

## Related

- `docs/tournament-streaming-manual.md` — field ops (will need a parent-up pass)
- Existing invite flows, `personId`, Game Cap sidecars, billing credits — reuse
  and re-gate rather than replace where possible
