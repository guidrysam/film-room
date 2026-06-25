# Film Room — Tournament Streaming Manual

A field guide for streaming back‑to‑back games and reviewing them live. Three
positions: **Stream Operator**, **Coach**, and **Viewer / Parent**.

> **The one rule that trips everyone up:** In a live room, **"Host" vs "Viewer"
> is decided by who *starts the session* — not by team role.** Only the **Host**
> can add coach marks, draw, and control playback. Everyone who opens the shared
> link is a **Viewer** (watch‑only).
>
> → **The person who will add coach marks must be the one who clicks "Start live
> session."** There is only **one Host per room.**

---

## Pre‑tournament checklist (do this 24+ hours ahead)

- [ ] **Enable live streaming on the YouTube channel.** First‑time activation on a
      channel takes **~24 hours** — do this now or Saturday won't work.
      (Encoder/RTMP streaming has **no 50‑subscriber minimum**; that limit only
      applies to YouTube's mobile app.)
- [ ] **Create the reusable camera stream + save the preset** (Operator section,
      Setup mode). You do this **once**.
- [ ] **Put the RTMP Server URL + Stream Key into Streamlabs once.** Do not change
      encoder settings again all weekend.
- [ ] **Pre‑create all game shells** in the app (one per scheduled game) so nobody
      is typing during back‑to‑back turnarounds.
- [ ] **Use one dedicated operator device/browser all day.** Camera presets are
      saved in that browser's local storage only.
- [ ] **Do one full dress rehearsal:** preset → Streamlabs live → get watch link →
      start session → add a coach mark → watch on a second device → end → start a
      *second* broadcast on the same key. That last step is the back‑to‑back move
      you'll repeat every game.
- [ ] **Network plan:** 1080p30 needs ~4–6 Mbps **upload**. Have a cellular/bonded
      backup. Venue Wi‑Fi is the #1 failure point.
- [ ] **Power/thermal:** chargers and a shaded spot for the streaming phone.

**Recommended crew:** a **2‑person operating team** keeps 24 games sane — one on
the encoder/logistics, one driving Film Room (broadcasts + room). For testing the
loop midweek, use **3 people** (operator + 1 coach + 1 viewer); for a fuller test
use **5–6** (operator + 2 coaches + 2–3 viewers on different devices/networks).

---

## How it fits together (read once)

- **One reusable stream key** (the "camera preset") = what Streamlabs pushes to.
  Set it once.
- **One broadcast per game** = a separate YouTube video, created on demand and
  bound to that same key. Each game auto‑records to its own archive (DVR on).
- **One room per game** = the live review space where the Host marks plays and
  Viewers watch in sync. Room URL looks like `/room/{id}?view=sync`.

Quota is **not** a concern for live (the expensive thing is VOD uploads, not live
broadcasts) — 24 games is well within daily limits.

---

# POSITION 1 — STREAM OPERATOR

You run the encoder and create each game's broadcast. Page: **`/stream`
("Stream Room")**.

### A. One‑time setup ("Setup mode")
1. Go to **`/stream`**. (Creating a stream signs you in with Google / YouTube.)
2. Under **Camera**, type a name in **"New camera name (saved preset)"**
   (e.g. "Field 1 Cam").
3. Click **"Create New Camera Stream"**.
   - If it warns *"This creates a NEW YouTube stream key… Continue?"*, only accept
     if you intend to replace the key in Streamlabs.
4. Copy the two fields into **Streamlabs**:
   - **RTMP Server URL** → "Copy RTMP Server"
   - **Stream Key** → "Copy Stream Key"
5. Click **"Save camera preset"**. It's stored in this browser only.

> After this, you never re‑create the key. All weekend you reuse this one preset.

### B. Before each game — get the live link
1. Make sure **Streamlabs is streaming** (the saved key).
2. On `/stream`, find the preset under **"Saved cameras"** and click
   **"Create / Get Today's Watch Link"**.
   - You'll see status like *"Created today's broadcast."* then
     *"Broadcast is live."*
   - If you see *"YouTube is receiving video but has not gone live yet. Open
     Studio and click Go Live, or wait a moment and retry,"* wait a few seconds
     and click again (or click Go Live in YouTube Studio).
3. Optional sanity check: **"Verify Camera Stream"** → expect
   *"Camera verified: … (active)."*

### C. Start the live review session (the room)
1. After the watch link is live, click **"Start live session"**.
2. You're taken to **`/room/{id}?view=sync`** and you are the **Host**.
3. **Hand‑off decision (important):**
   - If the **Coach** will add marks, the **Coach should be the one to click
     "Start live session"** (so the Coach is Host). *Or:*
   - If **you** will add marks, you stay Host and the coach calls plays to you.
   - There is only one Host. Decide per game before you start.
4. Share with everyone else: in the room header click **"Copy Viewer Link"** and
   send it (team chat / text). Anyone opening it joins as a **Viewer**.

### D. Between games (the back‑to‑back move)
1. End the current game's broadcast at the final whistle.
2. Keep Streamlabs on the same key.
3. Repeat **B** ("Create / Get Today's Watch Link") and **C** ("Start live
   session") for the next game. Each game becomes its own video + room.

### If something's wrong
- **"Not embeddable" / embed errors:** open YouTube Studio and enable embedding
  for the broadcast/channel. You can also use the manual **"Paste working YouTube
  live link"** → **"Use this live link"** as a fallback.
- **"Start" button disabled:** at least one angle needs a valid, **embeddable**
  YouTube video. Re‑run "Create / Get Today's Watch Link."
- **"Could not start live session. Check Firebase permissions."** — you're signed
  out or lack access; sign in again.
- **Preset says "incomplete":** recreate the camera stream (Setup mode).

---

# POSITION 2 — COACH (live marking)

You watch the live feed and mark key moments so they're instantly reviewable.

> **You must be the room HOST to mark.** Either start the session yourself (`/stream`
> → "Start live session"), or have the Operator hand you the host role for that
> game. If your screen shows a **"Viewer"** badge, you cannot mark — get the host
> session instead.

### Marking a play
At the top of the room you'll see the **Coach marks** toolbar (labeled **"Marks"**).
Tap a button the moment something happens:
- **Mark** — generic key moment
- **Goal**
- **Defensive error**
- **Transition**
- **Set piece**
- **Custom** — prompts you to type your own label

Each tap timestamps the moment and pushes a **"Coach alert"** to every viewer with
a **"Jump to replay"** button.

There is also **"Mark Play"** (a one‑tap chapter button that auto‑labels
"Play", "Play 2", …) in non‑game‑linked rooms.

> **No keyboard shortcuts for marking** — use the on‑screen buttons. (The only
> keys in the room are **Esc** to exit fullscreen and **Enter/Space/←/→** to cycle
> camera angles.)
>
> Marks store a **label + time** only. There is **no player tagging or category**
> on a live coach mark, and no per‑mark colors.

### Reviewing / jumping to marks
- The **"Chapters / Marks"** list shows every mark; tap one to jump.
- Transport bar has **"Prev mark"** / **"Next mark"**.
- As Host you can **rename** ("Ren") or delete ("×") marks. (Viewers can see the
  list but can't jump — they get *"Only the host can jump to marks."*)

### Drawing on the video (telestrator)
- **"Draw On"** / **"Draw Off"** to toggle.
- **"Clear Drawings"** to wipe.
- Drawing is **freehand, single color (yellow)** — no shapes/arrows/eraser.
- Host‑only; viewers see your strokes but can't draw.

### Views (Host controls)
- **Clip View** vs **Sync View** (top toggle; `?view=sync` opens Sync View).
- In Sync View, **Single View** (one big angle + swipe/tap to change angle) vs
  **Multi View** (multiple angles, tap to swap focus).
- **Sync Status** + **"Reset Sync"** if angles drift.

---

# POSITION 3 — VIEWER / PARENT

Two things you might do: **watch the live game**, and (parents) **upload your own
sideline video** to enrich the film.

### Watching a live game
1. Open the **Viewer Link** someone shares (the `/room/...` link). No sign‑in
   required to watch.
2. You'll see a **"This is a shared session"** banner. To keep your own copy, sign
   in and tap **"Save to My Sessions."**
3. Tap **"Tap to enable playback"** to start following the Host in sync. (If video
   is blocked, tap the prompt on the player.)
4. You can:
   - Switch **Clip View / Sync View**.
   - In **Single View**, swipe or tap to cycle camera angles.
   - Tap **"Jump to replay"** when a **"Coach alert"** pops up.
5. You **can't** control playback, draw, or add marks — that's the Host.

### Joining a team (parents/coaches/players/viewers)
1. Open the **team invite link** (`/join/team/...`). It shows the team and your
   role (Coach / Parent / Player / Viewer).
2. If signed out: **"Sign in with Google."**
3. Click **"Join {team}."** Parents land in **Game Cap**; coaches in team setup.

### Parents — upload your sideline video (Game Cap)
1. Go to **`/game-cap`** (or you're sent there after joining). Sign in if asked.
2. **Select team** → **Select game** (parents can't create games — pick an
   existing one).
3. Click **"Add video"**, then choose **"Upload to YouTube."**
   - Or **"Paste YouTube link"** if it's already on YouTube.
4. Pick a **label** (e.g. *Parent cam, Main sideline, Goal cam, End zone,
   Opposite sideline*).
5. Click **"Upload to YouTube."** Keep the tab open (use Wi‑Fi for big files).
   - It uploads to **your own YouTube channel as Unlisted** and attaches it to the
     game automatically. You keep ownership of your footage.
6. On success: *"Upload complete — source attached."* If it fails, use
   **"Paste a YouTube link instead."**

> Tip: film roughly from one spot and keep recording — steadier sideline angles
> sync better with the main feed.

---

## Quick reference card

| You are… | Where | Do this |
|---|---|---|
| **Operator** | `/stream` | Streamlabs on saved key → **Create / Get Today's Watch Link** → **Start live session** → **Copy Viewer Link** |
| **Coach** | the room (as **Host**) | Tap **Marks** buttons (Mark/Goal/etc.) · **Mark Play** · **Draw On/Off** · jump via **Chapters / Marks** |
| **Viewer/Parent** | Viewer Link / `/game-cap` | **Tap to enable playback** · **Jump to replay** on alerts · Parents: **Add video → Upload to YouTube** |

**Remember:** one Host per room = the person who clicked **Start live session**.
That person is the only one who can mark, draw, and control playback.
