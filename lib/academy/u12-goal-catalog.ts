import type {
  AcademyGameEvidenceEventType,
  AcademyGoal,
  AcademyGoalDomain,
  AcademyGoalDomainId,
  AcademyGoalGraphCatalog,
  AcademyGoalType,
  AcademyPositionGroup,
  AcademySeasonBlockDefinition,
} from "./types";

export const U12_ACADEMY_DOMAINS = [
  { id: "ball-mastery", title: "Ball Mastery", description: "Secure, adaptable control under realistic pressure.", order: 1 },
  { id: "receiving-first-touch", title: "Receiving & First Touch", description: "Receive to protect, connect, or progress.", order: 2 },
  { id: "passing-combination-play", title: "Passing & Combination Play", description: "Connect accurately and combine to move opponents.", order: 3 },
  { id: "scanning-decision-making", title: "Scanning & Decision-Making", description: "Gather useful information and choose effective actions.", order: 4 },
  { id: "support-width-depth", title: "Support, Width & Depth", description: "Create useful team spacing around the ball.", order: 5 },
  { id: "one-v-one-attacking", title: "1v1 Attacking", description: "Unbalance and beat defenders with purpose.", order: 6 },
  { id: "one-v-one-defending", title: "1v1 Defending", description: "Delay, direct, and regain without diving in.", order: 7 },
  { id: "building-from-goalkeeper", title: "Building from the Goalkeeper", description: "Start attacks with composed 9v9 structure.", order: 8 },
  { id: "creating-finishing-chances", title: "Creating & Finishing Chances", description: "Create, attack, and finish high-value opportunities.", order: 9 },
  { id: "team-defending", title: "Team Defending", description: "Protect central space and regain together.", order: 10 },
  { id: "transition-to-attack", title: "Transition to Attack", description: "Recognize and exploit the moment after regaining.", order: 11 },
  { id: "transition-to-defense", title: "Transition to Defense", description: "React together immediately after losing possession.", order: 12 },
  { id: "goalkeeping", title: "Goalkeeping", description: "Develop safe technique, positioning, and distribution.", order: 13 },
  { id: "communication-leadership", title: "Communication & Leadership", description: "Share timely information and help teammates organize.", order: 14 },
  { id: "reflection-game-understanding", title: "Reflection & Game Understanding", description: "Explain decisions, learn from evidence, and transfer learning.", order: 15 },
] as const satisfies readonly AcademyGoalDomain[];

export const U12_ACADEMY_SEASON_BLOCKS = [
  {
    id: "u12-block-1",
    title: "Block 1 · Ball mastery and first touch",
    weekStart: 1,
    weekEnd: 2,
    description: "Secure the ball, receive with purpose, scan early, and communicate useful information.",
  },
  {
    id: "u12-block-2",
    title: "Block 2 · Passing and support",
    weekStart: 3,
    weekEnd: 4,
    description: "Connect with useful weight, create support angles, and solve early 1v1 pictures.",
  },
  {
    id: "u12-block-3",
    title: "Block 3 · Width, depth, and buildup",
    weekStart: 5,
    weekEnd: 6,
    description: "Build from the goalkeeper, stretch with width and depth, and progress through or around the first press.",
  },
  {
    id: "u12-block-4",
    title: "Block 4 · Combination play and finishing",
    weekStart: 7,
    weekEnd: 8,
    description: "Combine to create chances, finish under realistic pressure, and exploit transition advantages.",
  },
  {
    id: "u12-block-5",
    title: "Block 5 · Transition and team defending",
    weekStart: 9,
    weekEnd: 10,
    description: "Defend 1v1 with control, protect central space, and react immediately after loss.",
  },
  {
    id: "u12-block-6",
    title: "Block 6 · Leadership, reflection, and transfer",
    weekStart: 11,
    weekEnd: 12,
    description: "Integrate prior goals, organize teammates, and convert film evidence into transferable next actions.",
  },
] as const satisfies readonly AcademySeasonBlockDefinition[];

type Position = readonly [AcademyPositionGroup, "primary" | "secondary"];
type GoalSeed = {
  id: `u12-${string}`;
  title: string;
  description: string;
  domainId: AcademyGoalDomainId;
  type: AcademyGoalType;
  principles: readonly [string, string];
  cues: readonly [string, string];
  indicators: readonly [string, string, string];
  failure: readonly [string, string];
  feedback: readonly [string, string];
  prerequisiteGoalIds?: readonly `u12-${string}`[];
  block: 1 | 2 | 3 | 4 | 5 | 6;
  positions?: readonly Position[];
  resources: readonly [string, string];
};

const seeds: readonly GoalSeed[] = [
  { id: "u12-control-across-surfaces", title: "Control Across Surfaces", description: "Use both feet and varied surfaces to keep the ball available while moving.", domainId: "ball-mastery", type: "technical", principles: ["Keep the ball within the next-action distance.", "Use the surface that protects the intended route."], cues: ["Soft ankle, useful touch.", "Both feet, eyes up."], indicators: ["Carries with inside, outside, and sole on both feet.", "Changes surface without breaking stride.", "Keeps the ball playable while looking beyond it."], failure: ["Single-surface dependence", "Uses one foot or surface until pressure closes the route."], feedback: ["Your outside touch opened the lane; now check over your shoulder.", "Try the same route with your other foot and keep the ball one step away."], block: 1, resources: ["bilateral ball control", "dribbling surface selection"] },
  { id: "u12-change-speed-direction", title: "Change Speed and Direction", description: "Use controlled turns and acceleration to escape pressure or enter space.", domainId: "ball-mastery", type: "technical", principles: ["Slow to invite pressure, then accelerate away.", "Turn into visible space rather than by habit."], cues: ["Sell the first route.", "Turn, push, accelerate."], indicators: ["Decelerates before a controlled change of direction.", "Takes the exit touch beyond the defender's reach.", "Accelerates for at least three steps after turning."], failure: ["Turn without escape", "Completes a move but leaves the ball close enough for an immediate second challenge."], feedback: ["The turn worked; make your exit touch longer so you actually escape.", "You saw the space early—change pace after the cut to use it."], prerequisiteGoalIds: ["u12-control-across-surfaces"], block: 1, resources: ["turning under pressure", "change-of-pace dribbling"] },
  { id: "u12-shield-and-retain", title: "Shield and Retain", description: "Use body position and legal contact to protect possession until support arrives.", domainId: "ball-mastery", type: "technical", principles: ["Place the body between opponent and ball.", "Retain with a purpose: escape, pass, or draw support."], cues: ["Side-on and strong.", "Feel pressure; move the ball away."], indicators: ["Adopts a balanced side-on stance before contact.", "Uses the far foot to keep the ball away from pressure.", "Exits or releases once a safe option appears."], failure: ["Static shielding", "Stops over the ball and remains trapped instead of adjusting feet or finding an exit."], feedback: ["Good body position; keep moving your feet so the defender cannot reach around.", "You protected it—now release as soon as your teammate gives an angle."], prerequisiteGoalIds: ["u12-control-across-surfaces"], block: 1, resources: ["protecting possession", "legal use of the body"] },
  { id: "u12-escape-double-pressure", title: "Escape Double Pressure", description: "Recognize a second defender and protect, combine, or change direction before being trapped.", domainId: "ball-mastery", type: "tactical", principles: ["A second defender creates space elsewhere.", "Escape before both defenders close the same side."], cues: ["See the second defender.", "Protect, release, or reverse."], indicators: ["Scans for the covering defender before the first duel.", "Changes route or releases before the trap closes.", "Finds the teammate or space vacated by double pressure."], failure: ["Dribbling into the trap", "Focuses on beating the first defender and carries directly into cover."], feedback: ["You beat one, but the second was waiting—scan before your move.", "Two defenders came to you; the early pass would free a teammate."], prerequisiteGoalIds: ["u12-change-speed-direction", "u12-shield-and-retain"], block: 2, resources: ["escaping pressure", "recognizing defensive cover"] },

  { id: "u12-receive-open-body", title: "Receive with an Open Body", description: "Prepare a side-on shape that keeps forward and safe options visible.", domainId: "receiving-first-touch", type: "technical", principles: ["Arrive where hips can see two directions.", "Prepare before the ball arrives."], cues: ["Half-turn early.", "See ball and next space."], indicators: ["Checks shoulder before setting body shape.", "Receives side-on when pressure allows.", "Can play forward or retain with the next action."], failure: ["Closed reception", "Faces the passer with feet square and needs extra touches to turn."], feedback: ["Your shoulder check was early; now let your hips face the next space.", "Open one more step so your first touch can travel forward."], block: 1, resources: ["body orientation when receiving", "receiving on the half-turn"] },
  { id: "u12-first-touch-away-pressure", title: "First Touch Away from Pressure", description: "Direct the first touch away from the nearest challenge while preserving the next option.", domainId: "receiving-first-touch", type: "technical", principles: ["First touch solves the immediate pressure.", "Touch toward a useful next action, not merely away."], cues: ["Know the pressure side.", "Touch across your body."], indicators: ["Identifies the pressure side before contact.", "Uses the foot farther from the defender when appropriate.", "Completes the next action before pressure recovers."], failure: ["Touch into pressure", "Receives with the near foot and leaves the ball on the defender's side."], feedback: ["You felt the defender; use your far foot to take the ball across.", "That touch escaped pressure—make the next pass while the gap is open."], prerequisiteGoalIds: ["u12-receive-open-body"], block: 1, resources: ["pressure-side recognition", "directional first touch"] },
  { id: "u12-receive-between-lines", title: "Receive Between Lines", description: "Find and use pockets between opponents' units without blocking a teammate's lane.", domainId: "receiving-first-touch", type: "tactical", principles: ["Move out of cover shadows before the pass.", "Receive where the next line can be threatened."], cues: ["Find a window.", "Check, arrive, turn if free."], indicators: ["Adjusts position to become visible through a passing window.", "Checks behind before the pass enters.", "Turns, sets, or bounces the ball according to pressure."], failure: ["Hidden in cover", "Waits directly behind an opponent and asks for an unavailable pass."], feedback: ["Slide two steps out of the defender's shadow before asking.", "You found the pocket; your scan tells you whether to turn or set."], prerequisiteGoalIds: ["u12-receive-open-body", "u12-scan-before-receiving"], block: 2, positions: [["midfielder", "primary"], ["forward", "secondary"]], resources: ["playing between lines", "cover-shadow movement"] },
  { id: "u12-receive-aerial-ball", title: "Receive an Aerial Ball", description: "Cushion a dropping ball safely into controllable space using an appropriate surface.", domainId: "receiving-first-touch", type: "technical", principles: ["Get in line with the flight early.", "Cushion rather than rebound."], cues: ["Track, relax, absorb.", "First touch into safe space."], indicators: ["Moves feet to align with the ball's flight.", "Selects foot, thigh, or chest appropriately.", "Brings the ball within playing distance in no more than two contacts."], failure: ["Rigid first contact", "Meets the ball with a stiff surface and loses it beyond immediate reach."], feedback: ["You tracked it well; relax the surface as the ball arrives.", "Choose the thigh here so the ball drops in front of your next step."], prerequisiteGoalIds: ["u12-control-across-surfaces"], block: 3, resources: ["aerial control safety", "cushioning first touch"] },

  { id: "u12-pass-weight-accuracy", title: "Pass with Useful Weight", description: "Deliver accurate ground passes at a speed the receiver can use immediately.", domainId: "passing-combination-play", type: "technical", principles: ["Weight serves the receiver's next action.", "Accuracy includes the correct foot and side."], cues: ["Lock ankle; follow the line.", "Pass to the useful foot."], indicators: ["Passes arrive within the receiver's controllable stride.", "Adjusts speed for distance and pressure.", "Targets the receiver's safe or forward foot intentionally."], failure: ["Playable but unhelpful pass", "Reaches the teammate but forces them toward pressure or to stop moving."], feedback: ["It reached your teammate; aim for the far foot so they can play forward.", "Add weight across that distance so the defender cannot intercept."], block: 1, resources: ["passing mechanics", "pass weight and target foot"] },
  { id: "u12-wall-pass-combination", title: "Use a Wall Pass", description: "Combine around a defender with timed support, a set pass, and movement beyond.", domainId: "passing-combination-play", type: "tactical", principles: ["Pass and move immediately.", "The return pass meets the runner beyond pressure."], cues: ["Set and spin.", "One touch if the picture is clear."], indicators: ["First passer accelerates after releasing the ball.", "Supporting player angles the return beyond the defender.", "Pair completes the combination without occupying the same lane."], failure: ["Pass and admire", "First passer remains stationary, removing the return option."], feedback: ["Your first pass drew the defender; sprint beyond for the return.", "Angle the set pass into your teammate's path, not back under pressure."], prerequisiteGoalIds: ["u12-pass-weight-accuracy", "u12-support-angle-distance"], block: 2, resources: ["wall-pass timing", "give-and-go combinations"] },
  { id: "u12-third-player-combination", title: "Connect the Third Player", description: "Use a set or bounce pass to release a teammate facing forward.", domainId: "passing-combination-play", type: "tactical", principles: ["The first receiver can connect rather than turn.", "Third-player movement begins before the set pass."], cues: ["See the next teammate.", "Set, move, play forward."], indicators: ["Third player adjusts into a visible forward-facing lane.", "Middle player sets with controlled weight.", "Combination bypasses at least one opponent line."], failure: ["Late third-player movement", "The next receiver waits until the set pass is made and the lane closes."], feedback: ["Move as the first pass travels so you arrive facing forward.", "Your set was clean; place it away from the marker for the third player."], prerequisiteGoalIds: ["u12-wall-pass-combination", "u12-scan-beyond-next-action"], block: 3, resources: ["third-player movement", "bounce-pass combinations"] },
  { id: "u12-switch-point-attack", title: "Switch the Point of Attack", description: "Move the ball away from congestion to exploit width on the opposite side.", domainId: "passing-combination-play", type: "tactical", principles: ["Circulate before forcing through a crowded lane.", "The far side prepares before the switch arrives."], cues: ["Crowded here, find there.", "Secure first pass, speed the next."], indicators: ["Recognizes when the ball side is overloaded.", "Uses one or more secure passes to access the far side.", "Far-side player holds useful width and receives facing forward."], failure: ["Forced direct switch", "Attempts a long risky ball through pressure when a secure connecting pass is available."], feedback: ["You saw the far side; use the central connector to make the switch safer.", "Stay wide one more second so the switch creates room to advance."], prerequisiteGoalIds: ["u12-pass-weight-accuracy", "u12-use-full-team-width"], block: 3, resources: ["switching play in 9v9", "circulation away from pressure"] },

  { id: "u12-scan-before-receiving", title: "Scan Before Receiving", description: "Check relevant spaces before the pass arrives to locate pressure and options.", domainId: "scanning-decision-making", type: "tactical", principles: ["Scan while the ball travels elsewhere.", "Look for information that changes the next action."], cues: ["Ball moves, head moves.", "Check near, then far."], indicators: ["Looks away from the ball at least once before receiving.", "Can identify pressure side through subsequent action or explanation.", "Body shape reflects information gathered."], failure: ["Empty head turn", "Glances without changing position, body shape, or next action despite visible pressure."], feedback: ["You checked; now use what you saw and receive away from that defender.", "Scan earlier while the passer is preparing, not as the ball reaches you."], block: 1, resources: ["pre-reception scanning", "pressure awareness"] },
  { id: "u12-scan-beyond-next-action", title: "Scan Beyond the Next Action", description: "Notice the next teammate, defender, or space before making the current pass.", domainId: "scanning-decision-making", type: "tactical", principles: ["See one action ahead without predetermining.", "Use the next picture to improve the current pass."], cues: ["See through your teammate.", "What happens after this pass?"], indicators: ["Checks the area beyond the intended receiver.", "Pass choice helps the receiver's likely next action.", "Moves after passing based on the developing picture."], failure: ["Single-action focus", "Completes a pass then reacts late because the next pressure or option was not observed."], feedback: ["Before you play, look beyond your teammate to see their pressure.", "That forward-foot pass showed you had already seen the next lane."], prerequisiteGoalIds: ["u12-scan-before-receiving"], block: 2, resources: ["playing one action ahead", "scanning beyond the receiver"] },
  { id: "u12-choose-progress-retain", title: "Choose Progress or Retention", description: "Distinguish when to advance, combine, or secure possession in 9v9 play.", domainId: "scanning-decision-making", type: "tactical", principles: ["Progress when advantage is present.", "Retention can create a better forward moment."], cues: ["Can we go? Must we keep?", "Forward with advantage, secure without it."], indicators: ["Attempts forward play when a receiver has time or space.", "Uses a secure option when forward lanes are controlled.", "Reassesses after each pass rather than repeating one choice."], failure: ["Forward at any cost", "Forces a vertical action despite a compact opponent and available support."], feedback: ["Forward was blocked; your reset can move them before we try again.", "That was the moment to go—the receiver had space behind their midfield."], prerequisiteGoalIds: ["u12-scan-beyond-next-action", "u12-pass-weight-accuracy"], block: 3, resources: ["risk and reward decisions", "progression versus retention"] },
  { id: "u12-recognize-overload-isolation", title: "Recognize Overload or Isolation", description: "Identify whether to combine around numbers or attack an isolated defender.", domainId: "scanning-decision-making", type: "tactical", principles: ["Use extra teammates to combine through pressure.", "Use space to attack a favorable isolated duel."], cues: ["Count nearby.", "Numbers combine; space attacks."], indicators: ["Identifies a local numerical advantage before acting.", "Chooses combination play in crowded overloads.", "Finds or uses an isolated 1v1 when cover is distant."], failure: ["Wrong solution for the picture", "Dribbles into an overload or passes away from a favorable isolated duel."], feedback: ["Three of us are around two defenders—combine before carrying.", "Their fullback has no cover; receive and attack that space."], prerequisiteGoalIds: ["u12-choose-progress-retain"], block: 6, resources: ["overload recognition", "isolating defenders"] },

  { id: "u12-support-angle-distance", title: "Create a Support Angle", description: "Offer a visible passing lane at a distance suited to pressure and the next action.", domainId: "support-width-depth", type: "tactical", principles: ["Move off the defender's line.", "Distance changes with pressure and pass speed."], cues: ["Can the ball see you?", "Angle, distance, body shape."], indicators: ["Moves out of a defender's cover shadow.", "Adjusts closer under pressure and farther when space permits.", "Receives with at least two next-action options."], failure: ["Flat support", "Stands directly beside or behind the ball carrier, allowing one defender to cover both."], feedback: ["Drop at an angle so the defender cannot screen both of you.", "The ball carrier is pressed—come close enough for a safe release."], block: 2, resources: ["support angles", "support distance under pressure"] },
  { id: "u12-use-full-team-width", title: "Use Full Team Width", description: "Stretch the 9v9 field responsibly to open central and wide passing lanes.", domainId: "support-width-depth", type: "tactical", principles: ["Width enlarges gaps between defenders.", "Wide players reconnect when the ball or game phase changes."], cues: ["Make the field big.", "Hold width until it helps."], indicators: ["Wide players occupy separate outside channels in possession.", "Width opens a visible central lane for a teammate.", "Far-side player adjusts inward when balance or transition risk requires it."], failure: ["Width without connection", "Stays on the touchline when the ball is far away and cannot support or recover."], feedback: ["Hold the line while we build; your width is opening the middle.", "Now slide in a channel so you can connect and protect the far side."], prerequisiteGoalIds: ["u12-support-angle-distance"], block: 2, positions: [["wide_player", "primary"], ["outside_defender", "primary"], ["midfielder", "secondary"]], resources: ["9v9 attacking width", "far-side balance"] },
  { id: "u12-provide-penetrating-depth", title: "Provide Penetrating Depth", description: "Threaten space beyond the back line while remaining connected to buildup.", domainId: "support-width-depth", type: "tactical", principles: ["Depth stretches defenders away from the ball.", "Runs are timed to the passer's ability to play."], cues: ["Stretch, then reconnect.", "Go when the passer can see you."], indicators: ["At least one attacker threatens behind during settled possession.", "Runner checks line and passer before accelerating.", "Deep player reconnects when a penetrating pass is unavailable."], failure: ["Disconnected depth", "Stays beyond useful passing range or runs while the passer is under closed pressure."], feedback: ["Your depth pinned the defender; check back when the passer cannot play forward.", "Wait until your teammate lifts their head, then accelerate beyond."], prerequisiteGoalIds: ["u12-support-angle-distance"], block: 3, positions: [["forward", "primary"], ["wide_player", "secondary"]], resources: ["attacking depth", "timing runs behind"] },
  { id: "u12-balance-behind-ball", title: "Balance Behind the Ball", description: "Maintain connected cover behind attacks so possession can recycle and transitions can be defended.", domainId: "support-width-depth", type: "tactical", principles: ["Attack with protection behind the ball.", "Supporting depth shifts as the ball travels."], cues: ["Who protects the play?", "Stay connected behind."], indicators: ["One or more players remain available behind the ball.", "Balancing players shift toward the active side without crowding it.", "A backward pass can be received facing the field."], failure: ["Everyone ahead", "All nearby players run beyond the ball, removing both the reset and transition cover."], feedback: ["Hold behind this attack so we can reset or stop the counter.", "Shift across with the ball, but keep enough distance to see the field."], prerequisiteGoalIds: ["u12-support-angle-distance"], block: 5, positions: [["defender", "primary"], ["midfielder", "primary"]], resources: ["rest defense for youth", "support behind possession"] },

  { id: "u12-attack-defender-front-foot", title: "Attack the Defender's Front Foot", description: "Approach under control and move as the defender shifts weight.", domainId: "one-v-one-attacking", type: "technical", principles: ["Close space before performing the move.", "Exploit the defender's weight transfer."], cues: ["Approach, pause, explode.", "Move them before the ball."], indicators: ["Dribbles close enough to engage the defender.", "Uses body or ball disguise before changing route.", "Accelerates past the defender's shoulder after the move."], failure: ["Move from too far away", "Performs a skill before engaging the defender, allowing easy recovery."], feedback: ["Carry closer before the move so the defender has to commit.", "You shifted their weight—explode past the opposite shoulder."], prerequisiteGoalIds: ["u12-change-speed-direction"], block: 2, resources: ["1v1 approach distance", "attacking weight transfer"] },
  { id: "u12-protect-after-beating", title: "Protect After Beating", description: "Place the body and next touch between the recovering defender and the ball.", domainId: "one-v-one-attacking", type: "technical", principles: ["Winning the first step is not the end of the duel.", "The exit line protects the ball from recovery."], cues: ["Across their line.", "First step wins; next touch protects."], indicators: ["Exit touch crosses or clears the defender's recovery path.", "Uses arm and torso legally to protect space.", "Maintains speed into the next action."], failure: ["Re-entry into the duel", "Cuts back into the beaten defender's recovery path without a tactical reason."], feedback: ["You beat them; now drive across their line to stay in front.", "Keep the next touch on your far foot while they recover."], prerequisiteGoalIds: ["u12-attack-defender-front-foot", "u12-shield-and-retain"], block: 2, resources: ["protecting after a dribble", "1v1 exit lines"] },
  { id: "u12-isolate-wide-defender", title: "Isolate a Wide Defender", description: "Use width, timing, and teammate movement to create space for a wide 1v1.", domainId: "one-v-one-attacking", type: "tactical", principles: ["Clear nearby space before the duel.", "Attack while cover is too far to help."], cues: ["Clear the lane.", "Receive, face, attack."], indicators: ["Nearby teammate moves away from the intended duel lane.", "Attacker receives with room to face forward.", "Attacker initiates before a second defender arrives."], failure: ["Crowded isolation", "A teammate moves into the same lane and brings an extra defender to the duel."], feedback: ["Clear inside so the wide player has one defender, not two.", "You are isolated now—attack before their midfielder recovers."], prerequisiteGoalIds: ["u12-attack-defender-front-foot", "u12-use-full-team-width"], block: 4, positions: [["wide_player", "primary"], ["outside_defender", "secondary"]], resources: ["wide isolation", "creating 1v1 space"] },
  { id: "u12-choose-dribble-pass", title: "Choose Dribble or Pass", description: "Read pressure, cover, and teammate advantage before entering a 1v1.", domainId: "one-v-one-attacking", type: "tactical", principles: ["Dribble to create advantage, not to prove skill.", "Release when a defender commits and frees a teammate."], cues: ["Can you beat one safely?", "Draw, then release."], indicators: ["Attacks when the defender is isolated and space exists.", "Passes when cover closes the dribbling route.", "Releases to a teammate after drawing an extra defender."], failure: ["Automatic dribble", "Carries into every defender regardless of cover or a teammate's better position."], feedback: ["The defender was alone—that was your moment to attack.", "You drew the second defender; release now to use the teammate you freed."], prerequisiteGoalIds: ["u12-escape-double-pressure", "u12-recognize-overload-isolation"], block: 6, resources: ["dribble-pass decisions", "drawing and releasing pressure"] },

  { id: "u12-delay-and-show", title: "Delay and Show", description: "Approach under control, block the dangerous route, and guide the attacker toward help.", domainId: "one-v-one-defending", type: "tactical", principles: ["Protect the most dangerous space first.", "Delay until support improves the duel."], cues: ["Fast approach, slow arrival.", "Show toward help."], indicators: ["Closes space quickly then shortens steps.", "Adopts a balanced side-on stance.", "Guides the attacker away from central danger."], failure: ["Straight-line dive", "Continues at full speed into the tackle and is beaten by one touch."], feedback: ["Your approach was quick; brake earlier so you can react.", "Angle your run to close the middle and show them toward support."], block: 5, resources: ["defensive approach", "showing away from danger"] },
  { id: "u12-defend-ball-side", title: "Defend the Ball Side", description: "Adjust feet and distance to prevent the attacker crossing the defender's front.", domainId: "one-v-one-defending", type: "technical", principles: ["Stay between ball and protected space.", "Move feet before reaching."], cues: ["Small steps, strong base.", "No free route across you."], indicators: ["Maintains a distance that permits reaction.", "Adjusts laterally without crossing feet unnecessarily.", "Uses body position to block the direct route."], failure: ["Reaching from behind", "Lets the attacker cross the body line, then relies on a trailing tackle."], feedback: ["Move your feet across first; do not reach from the wrong side.", "Stay half a step farther away so you can match the next touch."], prerequisiteGoalIds: ["u12-delay-and-show"], block: 5, resources: ["1v1 defensive footwork", "protecting the inside route"] },
  { id: "u12-time-defensive-challenge", title: "Time the Defensive Challenge", description: "Win or poke the ball when the attacker's touch separates from control.", domainId: "one-v-one-defending", type: "technical", principles: ["Patience creates a clearer tackling moment.", "Challenge through the ball with balance."], cues: ["Wait for the loose touch.", "Win it, then secure it."], indicators: ["Delays while touches remain protected.", "Steps in as the ball moves beyond the attacker's stride.", "Attempts to retain or direct the regained ball safely."], failure: ["Challenge on a protected ball", "Tackles while the attacker has full control and exposes space behind."], feedback: ["Keep delaying until their touch leaves their foot.", "Good win—take the next touch away from the recovering attacker."], prerequisiteGoalIds: ["u12-defend-ball-side"], block: 5, resources: ["tackle timing", "securing a regain"] },
  { id: "u12-recover-goal-side", title: "Recover Goal Side", description: "Sprint along an efficient line to protect central space and rejoin the defensive unit.", domainId: "one-v-one-defending", type: "physical", principles: ["First recovery steps are urgent.", "Recover toward danger, not merely toward the ball."], cues: ["Sprint inside first.", "See ball and runner."], indicators: ["Transitions immediately into a recovery sprint.", "Uses an inside line that protects the route to goal.", "Slows into a controllable defending position near the play."], failure: ["Chasing directly behind", "Runs only toward the ball and leaves a central passing or running lane open."], feedback: ["Take the inside route first so you protect goal while recovering.", "Sprint now, then arrive under control when you can affect the play."], prerequisiteGoalIds: ["u12-delay-and-show"], block: 5, resources: ["recovery running", "goal-side positioning"] },

  { id: "u12-gk-starting-shape", title: "Form a Buildup Starting Shape", description: "Create clear goalkeeper, defender, and midfielder lines for a 9v9 restart.", domainId: "building-from-goalkeeper", type: "tactical", principles: ["Stretch the first press vertically and horizontally.", "Keep a secure connection behind and ahead of the ball."], cues: ["Wide, deep, connected.", "Show in different lines."], indicators: ["Defenders separate to provide distinct first-pass options.", "A midfielder offers beyond or beside the first pressure line.", "Players avoid standing in the same passing lane."], failure: ["Flat crowded start", "Receivers cluster on one horizontal line and are screened together."], feedback: ["Create a second line so one defender cannot cover both options.", "Stay wide enough to stretch them, but connected enough to receive."], block: 3, positions: [["goalkeeper", "primary"], ["defender", "primary"], ["midfielder", "secondary"]], resources: ["9v9 buildup shape", "goal-kick positioning"] },
  { id: "u12-play-around-first-press", title: "Play Around the First Press", description: "Use goalkeeper and back-line connections to find the free side of an opponent's press.", domainId: "building-from-goalkeeper", type: "tactical", principles: ["Invite pressure without trapping the receiver.", "Move the ball faster than the press shifts."], cues: ["Draw one, find the free side.", "Back if needed, across when open."], indicators: ["Identifies which first-line receiver is unmarked.", "Uses the goalkeeper or central defender to change sides.", "Next receiver receives with time to advance or connect."], failure: ["Same-side repetition", "Returns repeatedly into the pressed channel without checking the free side."], feedback: ["They sent two to one side; use the goalkeeper to reach the free defender.", "Let the press travel, then move the ball across before it resets."], prerequisiteGoalIds: ["u12-gk-starting-shape", "u12-pass-weight-accuracy"], block: 3, positions: [["goalkeeper", "primary"], ["defender", "primary"]], resources: ["playing around a press", "goalkeeper as connector"] },
  { id: "u12-play-through-first-press", title: "Play Through the First Press", description: "Find a prepared midfielder between or beyond pressing players when the central lane is genuinely open.", domainId: "building-from-goalkeeper", type: "tactical", principles: ["Central progression requires a visible lane and prepared receiver.", "Support the receiver before the pass is played."], cues: ["Lane open, receiver ready.", "Play through, support underneath."], indicators: ["Midfielder moves outside a cover shadow before receiving.", "Pass enters only when the lane is unobstructed.", "Nearby players provide a bounce or forward option for the receiver."], failure: ["Forced central entry", "Passes through a screened lane to a receiver facing immediate pressure without support."], feedback: ["The midfielder is marked behind the striker—move the ball before forcing it in.", "The lane is open and they checked; play firmly to the safe foot."], prerequisiteGoalIds: ["u12-gk-starting-shape", "u12-receive-between-lines"], block: 3, positions: [["goalkeeper", "secondary"], ["central_defender", "primary"], ["midfielder", "primary"]], resources: ["playing through pressure", "central buildup connections"] },
  { id: "u12-buildup-exit-pressure", title: "Exit Buildup Pressure", description: "Recognize when a direct pass into a prepared target or channel is safer than short circulation.", domainId: "building-from-goalkeeper", type: "tactical", principles: ["Short buildup is a tool, not a rule.", "A direct exit needs an organized first and second action."], cues: ["If trapped, find the exit.", "Target, support, secure second ball."], indicators: ["Recognizes when short options are locked by equal or greater pressure.", "Directs the pass toward a prepared player or usable channel.", "Team compresses around the likely next contest."], failure: ["Aimless clearance", "Kicks long without a target, channel, or nearby support plan."], feedback: ["Short is closed; name the target and organize around the next ball.", "That direct pass had purpose—now squeeze up to support the receiver."], prerequisiteGoalIds: ["u12-play-around-first-press"], block: 6, positions: [["goalkeeper", "primary"], ["defender", "primary"], ["forward", "secondary"]], resources: ["purposeful direct buildup", "second-ball organization"] },

  { id: "u12-create-cutback-lane", title: "Create a Cutback Lane", description: "Reach an advanced wide area and find a trailing teammate away from the goal line.", domainId: "creating-finishing-chances", type: "tactical", principles: ["Penetrate wide before selecting the final pass.", "Arrivals occupy different finishing lines."], cues: ["End line, eyes back.", "Arrive high, middle, and edge."], indicators: ["Wide attacker reaches a position beside or behind the defensive line.", "Ball carrier looks away from the crowded goalmouth toward a trailing option.", "Attackers occupy separated near, central, and edge zones."], failure: ["Everyone on the goal line", "All attackers run beyond the ball, leaving no cutback receiver."], feedback: ["One runner hold near the edge so the cutback has a target.", "You reached the end line—look back before forcing across goal."], prerequisiteGoalIds: ["u12-use-full-team-width", "u12-isolate-wide-defender"], block: 4, resources: ["cutback creation", "penalty-area arrival zones"] },
  { id: "u12-time-penalty-area-runs", title: "Time Penalty-Area Runs", description: "Arrive into finishing spaces as the final passer gains control and vision.", domainId: "creating-finishing-chances", type: "tactical", principles: ["Arrive rather than wait in finishing space.", "Different runs threaten different defenders."], cues: ["Check, hold, arrive.", "Cross runs; do not stack."], indicators: ["Runner checks the passer before accelerating.", "At least two runners use different lanes or heights.", "Runner remains available when the final ball is delivered."], failure: ["Early static arrival", "Enters the box too soon and stands marked before the passer can deliver."], feedback: ["Hold outside one more step, then arrive as the passer looks up.", "Split your runs—one near, one central—instead of following each other."], prerequisiteGoalIds: ["u12-provide-penetrating-depth"], block: 4, positions: [["forward", "primary"], ["midfielder", "secondary"], ["wide_player", "secondary"]], resources: ["timing box entries", "coordinated finishing runs"] },
  { id: "u12-finish-first-time", title: "Finish First Time", description: "Select a controlled one-contact finish when ball speed, angle, and pressure favor it.", domainId: "creating-finishing-chances", type: "technical", principles: ["Prepare feet before the final pass arrives.", "Accuracy and early contact often beat power."], cues: ["See goal before it arrives.", "Set foot, guide through."], indicators: ["Scans goal and goalkeeper before contact.", "Adjusts stride to meet the ball without an extra touch.", "Uses an appropriate surface to direct the shot on target."], failure: ["Unnecessary settling touch", "Takes an extra touch that allows a defender or goalkeeper to close."], feedback: ["You had the picture early—adjust your feet and finish without settling.", "Guide this one across goal; you do not need maximum power."], prerequisiteGoalIds: ["u12-pass-weight-accuracy"], block: 4, positions: [["forward", "primary"], ["wide_player", "secondary"], ["midfielder", "secondary"]], resources: ["first-time finishing", "finishing foot preparation"] },
  { id: "u12-finish-under-pressure", title: "Finish Under Pressure", description: "Protect the shooting line and choose placement, power, or an extra touch as pressure closes.", domainId: "creating-finishing-chances", type: "technical", principles: ["Keep the body between recovering pressure and ball.", "Finish based on goalkeeper position and available time."], cues: ["Protect the strike.", "Early if open; touch if needed."], indicators: ["Uses the far foot or body line to protect the ball.", "Shoots early when the goalkeeper is exposed.", "Takes a purposeful setup touch when the first-time finish is blocked."], failure: ["Same finish every time", "Uses power or an extra touch regardless of angle, goalkeeper, and pressure."], feedback: ["The defender is recovering on your right—keep it on your left to strike.", "The goalkeeper is set; your extra touch can create a new angle."], prerequisiteGoalIds: ["u12-finish-first-time", "u12-protect-after-beating"], block: 4, positions: [["forward", "primary"], ["wide_player", "secondary"]], resources: ["finishing under recovery pressure", "shot selection"] },

  { id: "u12-protect-central-space", title: "Protect Central Space", description: "Prioritize the route to goal and force possession toward less dangerous areas.", domainId: "team-defending", type: "tactical", principles: ["Central danger is protected before wide access.", "Pressure and cover share the same defensive picture."], cues: ["Middle first.", "Show outside, shift together."], indicators: ["Nearest defender angles pressure away from goal.", "Covering players remain inside likely central receivers.", "Unit shifts without opening a direct central lane."], failure: ["Chasing the touchline", "Multiple defenders leave central space to pressure one wide player."], feedback: ["One presses wide; the rest protect inside options.", "Your angle must remove the route toward goal before you close the ball."], prerequisiteGoalIds: ["u12-delay-and-show"], block: 5, resources: ["central compactness", "defensive pressing angles"] },
  { id: "u12-pressure-cover-balance", title: "Coordinate Pressure, Cover, Balance", description: "Organize first, second, and far-side defenders around the ball.", domainId: "team-defending", type: "tactical", principles: ["Pressure needs immediate cover.", "Far-side balance protects switches and runners."], cues: ["One presses, one covers.", "Far side tuck and see."], indicators: ["Nearest defender applies controlled pressure.", "Second defender provides angled cover at a useful distance.", "Far-side defender narrows while seeing ball and opponent."], failure: ["Flat defensive line", "Covering defenders stand level with pressure and cannot protect behind."], feedback: ["Drop behind the presser at an angle so you can cover the inside touch.", "Far side, tuck in but keep seeing your runner."], prerequisiteGoalIds: ["u12-protect-central-space", "u12-defend-ball-side"], block: 5, resources: ["pressure-cover-balance", "far-side defensive positioning"] },
  { id: "u12-shift-as-unit", title: "Shift as a Connected Unit", description: "Move defensive lines together as the ball travels across or backward.", domainId: "team-defending", type: "tactical", principles: ["Travel while the pass travels.", "Distances between teammates remain compact enough to help."], cues: ["Pass moves, unit moves.", "Close gaps together."], indicators: ["Multiple defenders shift as the ball is traveling.", "Horizontal gaps remain small enough for adjacent cover.", "Back and midfield lines move in the same direction."], failure: ["Staggered reaction", "One player presses after the pass while teammates remain on the previous side."], feedback: ["Move while the ball travels so the receiver sees pressure on arrival.", "Back line and midfield must shift together; close the gap between you."], prerequisiteGoalIds: ["u12-pressure-cover-balance"], block: 5, resources: ["unit shifting", "defensive line connections"] },
  { id: "u12-defend-crosses-box", title: "Defend Crosses in the Box", description: "Protect goal-side zones, track runners, and clear into safer areas.", domainId: "team-defending", type: "tactical", principles: ["See ball and opponent before delivery.", "First contact moves danger away from central goal."], cues: ["Goal side, open body.", "Clear high and wide."], indicators: ["Defenders adopt positions between runners and goal.", "Players scan between ball and assigned space or runner.", "Clearances are directed away from the central scoring area."], failure: ["Watching only the ball", "Loses a runner behind while facing the crosser throughout the delivery."], feedback: ["Open your body so you can see both the crosser and runner.", "Make first contact and direct it wide, not back into the middle."], prerequisiteGoalIds: ["u12-pressure-cover-balance"], block: 6, positions: [["defender", "primary"], ["goalkeeper", "primary"], ["midfielder", "secondary"]], resources: ["defending crosses", "box marking for 9v9"] },

  { id: "u12-first-look-forward-regain", title: "First Look Forward After Regain", description: "Scan immediately for a safe forward advantage when possession changes.", domainId: "transition-to-attack", type: "tactical", principles: ["Transition space may disappear quickly.", "Forward is preferred only when control and advantage exist."], cues: ["Secure, look forward.", "Can we go now?"], indicators: ["Regaining player lifts head after securing the ball.", "Attempts a forward pass or carry when space is available.", "Uses a safe option when the regain is unstable."], failure: ["Blind forward ball", "Kicks forward immediately without securing possession or identifying a target."], feedback: ["Win it cleanly, then check forward before they recover.", "No forward lane this time—secure the first pass and let us spread."], block: 4, resources: ["first action after regain", "forward transition scanning"] },
  { id: "u12-spread-after-regain", title: "Spread After Regain", description: "Expand quickly from defensive positions to provide forward, wide, and supporting options.", domainId: "transition-to-attack", type: "tactical", principles: ["Regain changes the team's shape immediately.", "Expansion must preserve one secure connection."], cues: ["Win it, get big.", "One supports, others stretch."], indicators: ["Wide players move away from congestion after a clean regain.", "A forward option threatens space beyond.", "At least one teammate stays close enough to secure possession."], failure: ["Everyone runs away", "All teammates sprint forward and leave the regaining player isolated."], feedback: ["Stretch quickly, but one player stay underneath the ball.", "Your wide run opened the field; keep checking whether the pass is available."], prerequisiteGoalIds: ["u12-first-look-forward-regain", "u12-use-full-team-width"], block: 4, resources: ["attacking transition shape", "expansion after regain"] },
  { id: "u12-break-line-in-transition", title: "Break a Line in Transition", description: "Use the first controlled actions after a regain to bypass a disorganized opponent line.", domainId: "transition-to-attack", type: "tactical", principles: ["Attack before defensive lines reconnect.", "The line-breaking action needs support beyond it."], cues: ["Find the open line.", "Play and run with it."], indicators: ["Identifies a gap between recovering opponents.", "Pass or carry moves beyond at least one defensive line.", "A teammate supports the receiver's next action."], failure: ["Slow sideways transition", "Circulates without pressure until the opponent restores compact shape despite an open forward lane."], feedback: ["The gap is open now—play through before their midfield recovers.", "Support the receiver after the line break; do not admire the pass."], prerequisiteGoalIds: ["u12-first-look-forward-regain", "u12-choose-progress-retain"], block: 4, resources: ["line breaks in transition", "supporting fast attacks"] },
  { id: "u12-secure-transition-if-closed", title: "Secure Transition When Closed", description: "Recognize when the quick attack is gone and establish composed possession.", domainId: "transition-to-attack", type: "tactical", principles: ["A transition ends when the advantage disappears.", "Retention allows the team to rebuild spacing."], cues: ["No advantage, keep it.", "Reset and rebuild."], indicators: ["Recognizes when opponents have recovered behind the ball.", "Uses a supporting or backward pass instead of forcing play.", "Team expands into a stable possession shape after the reset."], failure: ["Transition forced too long", "Continues a low-percentage attack after numbers and space no longer favor it."], feedback: ["They recovered—keep the ball and rebuild our width.", "The fast attack was on at first; now use the support behind you."], prerequisiteGoalIds: ["u12-break-line-in-transition", "u12-balance-behind-ball"], block: 6, resources: ["ending the transition phase", "securing possession after regain"] },

  { id: "u12-react-immediately-loss", title: "React Immediately to Loss", description: "Change role on the first steps after possession is lost.", domainId: "transition-to-defense", type: "psychological", principles: ["The first reaction delays or protects.", "Every nearby player takes a clear defensive action."], cues: ["Lost it—act now.", "Press, cover, or recover."], indicators: ["Player changes direction within the first moments after loss.", "Nearest player pressures or blocks a forward route.", "Other nearby players recover into cover positions."], failure: ["Pause after turnover", "Shows frustration or watches the ball while opponents begin the counterattack."], feedback: ["Your next job starts the instant we lose it—press or recover now.", "Good reaction; your first three steps stopped their forward pass."], block: 5, resources: ["transition mentality", "immediate reaction after loss"] },
  { id: "u12-counterpress-near-ball", title: "Counterpress Near the Ball", description: "Use nearby numbers to close the ball and immediate exits after a controllable loss.", domainId: "transition-to-defense", type: "tactical", principles: ["Counterpress only when distance and numbers allow.", "Pressure closes forward exits before chasing the ball."], cues: ["Close ball and exits.", "Together or recover."], indicators: ["Nearest player pressures under control.", "Second and third players block short forward outlets.", "Group abandons the press and recovers when it is bypassed."], failure: ["Solo counterpress", "One player chases while teammates are too far away, opening space behind."], feedback: ["You are close enough together—one presses and two close the exits.", "You are alone here; recover instead of starting a press we cannot support."], prerequisiteGoalIds: ["u12-react-immediately-loss", "u12-pressure-cover-balance"], block: 5, resources: ["youth counterpressing", "press-or-recover decisions"] },
  { id: "u12-protect-center-after-loss", title: "Protect Center After Loss", description: "Recover inside passing and running lanes when immediate pressure cannot win the ball.", domainId: "transition-to-defense", type: "tactical", principles: ["Central protection slows the counterattack.", "Recovery runs track danger as well as the ball."], cues: ["Inside first.", "Find the runner and lane."], indicators: ["Players away from the ball sprint toward central lanes.", "Recovering player checks for an opponent running beyond.", "Team forms a compact barrier between ball and goal."], failure: ["Wide ball chasing", "Multiple players recover toward the ball while leaving the direct central route open."], feedback: ["Recover inside the ball first; make them play around us.", "Check your shoulder while you run so you can pick up the central runner."], prerequisiteGoalIds: ["u12-react-immediately-loss", "u12-recover-goal-side"], block: 5, resources: ["central recovery after loss", "tracking transition runners"] },
  { id: "u12-delay-counterattack", title: "Delay the Counterattack", description: "Manage space and time until teammates recover behind the ball.", domainId: "transition-to-defense", type: "tactical", principles: ["Delay can be more valuable than an immediate tackle.", "Protect the most dangerous route while retreating."], cues: ["Slow them down.", "Stay between ball and goal."], indicators: ["First defender avoids an unsupported lunge.", "Uses body angle to steer play away from central goal.", "Retreats at a speed that permits reaction until support arrives."], failure: ["Emergency dive-in", "Attempts an unlikely tackle and removes the final layer of protection."], feedback: ["You are the last cover—delay and let teammates recover.", "Keep showing outside while matching their speed; the tackle can wait."], prerequisiteGoalIds: ["u12-protect-center-after-loss", "u12-delay-and-show"], block: 6, resources: ["defending counterattacks", "delay in transition"] },

  { id: "u12-gk-set-position", title: "Set for the Shot", description: "Adjust angle, depth, and balanced stance as the ball enters shooting range.", domainId: "goalkeeping", type: "goalkeeping", principles: ["Position is updated as the ball moves.", "A balanced set permits movement in either direction."], cues: ["Move, set, see.", "Hands ready, weight forward."], indicators: ["Goalkeeper adjusts toward the ball line before the shot.", "Sets with feet balanced as the shooter prepares.", "Maintains a clear view around or through players."], failure: ["Set too early or late", "Remains fixed while the ball changes angle or is still moving when the shot is struck."], feedback: ["Travel with the pass, then set as the shooter prepares.", "Take one step off your line here to improve the angle without losing balance."], block: 1, positions: [["goalkeeper", "primary"]], resources: ["goalkeeper set position", "shot angle management"] },
  { id: "u12-gk-handle-and-parry", title: "Handle or Parry Safely", description: "Select a secure catch or direct the ball away from central danger.", domainId: "goalkeeping", type: "goalkeeping", principles: ["Catch when body and ball permit secure control.", "Parries travel wide of goal and attackers."], cues: ["Secure if possible.", "Strong hands, wide away."], indicators: ["Gets body behind catchable shots.", "Uses appropriate hand shape for ball height.", "Directs unavoidable rebounds away from the central goalmouth."], failure: ["Central rebound", "Pushes a difficult ball back into the most dangerous finishing area."], feedback: ["Get your chest behind that ball and bring it safely into your body.", "If you cannot hold it, use strong hands to send it wide."], prerequisiteGoalIds: ["u12-gk-set-position"], block: 4, positions: [["goalkeeper", "primary"]], resources: ["goalkeeper handling", "safe parry direction"] },
  { id: "u12-gk-distribute-decision", title: "Choose Goalkeeper Distribution", description: "Select roll, throw, pass, or purposeful longer service from teammates' positions and opponent pressure.", domainId: "goalkeeping", type: "goalkeeping", principles: ["Distribution starts the next team action.", "Speed of release matches the available advantage."], cues: ["Scan before securing.", "Fast if open, patient if not."], indicators: ["Scans teammate and opponent positions before release.", "Selects a technique suited to distance and pressure.", "Delivers toward a teammate's useful side or a purposeful channel."], failure: ["Predetermined release", "Uses the same distribution regardless of pressure, distance, or teammate readiness."], feedback: ["You saw the wide player early—roll quickly into their path.", "The short side is marked; wait, shift them, then choose the safer exit."], prerequisiteGoalIds: ["u12-gk-handle-and-parry", "u12-play-around-first-press"], block: 6, positions: [["goalkeeper", "primary"]], resources: ["goalkeeper distribution choices", "transition starts by goalkeeper"] },

  { id: "u12-communicate-specific-information", title: "Give Specific Information", description: "Use brief, timely words that tell a teammate what they cannot easily see.", domainId: "communication-leadership", type: "social", principles: ["Useful communication is early and specific.", "Words support rather than replace player decisions."], cues: ["Name, information, now.", "Say what helps."], indicators: ["Uses a teammate's name or clear directional cue.", "Communicates before the teammate's action.", "Message matches visible pressure, space, or support."], failure: ["Noise without information", "Repeatedly shouts generic words that do not clarify pressure or options."], feedback: ["Instead of 'go,' tell them 'turn' or 'set' before the ball arrives.", "That early 'player left' helped your teammate protect the ball."], block: 1, resources: ["specific soccer communication", "timing verbal cues"] },
  { id: "u12-organize-restarts", title: "Organize Team Restarts", description: "Take shared responsibility for positions, options, and readiness before play restarts.", domainId: "communication-leadership", type: "social", principles: ["Organization begins before the ball is available.", "Leadership invites clear roles, not control of every action."], cues: ["Check roles early.", "Ball, options, protection."], indicators: ["Players identify taker and immediate options promptly.", "A teammate checks defensive balance before an attacking restart.", "Players use calm, specific communication to adjust positions."], failure: ["Late restart confusion", "Players debate roles after the ball is ready and begin from unprepared positions."], feedback: ["Decide the taker early, then show two clear options.", "Good leadership checking who protects behind the restart."], prerequisiteGoalIds: ["u12-communicate-specific-information"], block: 6, resources: ["youth restart organization", "shared team leadership"] },
  { id: "u12-lead-through-response", title: "Lead Through Response", description: "Respond constructively to mistakes, goals, and difficult moments so the team can perform the next action.", domainId: "communication-leadership", type: "psychological", principles: ["The next action matters more than blame.", "Leaders model composure and inclusion."], cues: ["Reset together.", "Help the next action."], indicators: ["Uses supportive language after a teammate's error.", "Returns attention to role and shape promptly.", "Invites or acknowledges quieter teammates' information."], failure: ["Blame spiral", "Gestures or comments about a mistake while the next phase continues."], feedback: ["Acknowledge it, then help everyone reset for the next play.", "Your calm cue brought your teammate back into the game—keep it specific."], prerequisiteGoalIds: ["u12-communicate-specific-information"], block: 6, resources: ["constructive team response", "youth leadership habits"] },

  { id: "u12-explain-game-decision", title: "Explain a Game Decision", description: "Describe the information, choice, and intended outcome behind a game action.", domainId: "reflection-game-understanding", type: "psychological", principles: ["Reflection connects what was seen to what was done.", "More than one reasonable choice may exist."], cues: ["What did you see?", "Choice and reason."], indicators: ["Names at least one relevant teammate, opponent, or space.", "Connects that information to the action selected.", "Identifies a plausible intended outcome without claiming certainty."], failure: ["Result-only explanation", "Judges the action only by success or failure without discussing the game picture."], feedback: ["Tell me what you saw before the pass, not only where it ended.", "Your choice makes sense from that pressure; what other option was available?"], prerequisiteGoalIds: ["u12-scan-before-receiving"], block: 1, resources: ["player decision reflection", "questioning for game understanding"] },
  { id: "u12-review-observable-evidence", title: "Review Observable Evidence", description: "Use a coach-selected clip or remembered moment to identify visible actions and alternatives without inventing intent.", domainId: "reflection-game-understanding", type: "psychological", principles: ["Describe visible behavior before interpreting.", "Evidence supports a next-step question, not a verdict about intent."], cues: ["What can we actually see?", "Pause, notice, propose."], indicators: ["Identifies observable position, movement, or ball action.", "Separates what is visible from what the player reports thinking.", "Proposes one realistic alternative for the same picture."], failure: ["Assumed intent", "States why a player acted as fact when the evidence only shows the action and context."], feedback: ["We can see your body was closed; tell us what you were thinking then.", "Name the visible pressure first, then suggest another action you could test."], prerequisiteGoalIds: ["u12-explain-game-decision"], block: 6, resources: ["evidence-based film reflection", "avoiding intent assumptions"] },
  { id: "u12-set-transfer-action", title: "Set a Transfer Action", description: "Turn reflection into one specific, observable action to try in the next match or practice.", domainId: "reflection-game-understanding", type: "psychological", principles: ["A useful target is controllable and observable.", "Review whether the action was attempted, not just whether it succeeded."], cues: ["One action, next game.", "Notice, try, review."], indicators: ["States a concrete action tied to a recognizable game cue.", "Target can be observed by player or coach.", "After play, reflects on attempts and adjusts the target."], failure: ["Vague improvement goal", "Chooses an outcome such as 'play better' with no observable action or trigger."], feedback: ["Make it observable: 'scan twice before receiving centrally.'", "Review how often you tried the action, even when the pass did not work."], prerequisiteGoalIds: ["u12-review-observable-evidence"], block: 6, resources: ["individual transfer goals", "observable player action plans"] },
];

const relatedByGoalId = new Map<string, Set<string>>();
function relate(left: string, right: string): void {
  const leftSet = relatedByGoalId.get(left) ?? new Set<string>();
  const rightSet = relatedByGoalId.get(right) ?? new Set<string>();
  leftSet.add(right);
  rightSet.add(left);
  relatedByGoalId.set(left, leftSet);
  relatedByGoalId.set(right, rightSet);
}

for (const domain of U12_ACADEMY_DOMAINS) {
  const domainGoalIds = seeds
    .filter((seed) => seed.domainId === domain.id)
    .map((seed) => seed.id);
  for (let index = 1; index < domainGoalIds.length; index += 1) {
    const left = domainGoalIds[index - 1];
    const right = domainGoalIds[index];
    if (!left || !right) continue;
    relate(left, right);
  }
}

for (const [left, right] of [
  ["u12-scan-before-receiving", "u12-receive-open-body"],
  ["u12-support-angle-distance", "u12-wall-pass-combination"],
  ["u12-use-full-team-width", "u12-switch-point-attack"],
  ["u12-use-full-team-width", "u12-gk-starting-shape"],
  ["u12-balance-behind-ball", "u12-secure-transition-if-closed"],
  ["u12-delay-and-show", "u12-protect-central-space"],
  ["u12-first-look-forward-regain", "u12-choose-progress-retain"],
  ["u12-react-immediately-loss", "u12-recover-goal-side"],
  ["u12-gk-distribute-decision", "u12-play-around-first-press"],
  ["u12-review-observable-evidence", "u12-explain-game-decision"],
] as const) {
  relate(left, right);
}

const evidenceEventTypesByDomain: Record<AcademyGoalDomainId, AcademyGameEvidenceEventType[]> = {
  "ball-mastery": ["duel", "receive", "turnover"],
  "receiving-first-touch": ["receive", "pass", "turnover"],
  "passing-combination-play": ["pass", "buildup", "coach_clip"],
  "scanning-decision-making": ["receive", "pass", "coach_clip"],
  "support-width-depth": ["buildup", "pass", "coach_clip"],
  "one-v-one-attacking": ["duel", "shot", "turnover"],
  "one-v-one-defending": ["duel", "defensive_action", "recovery"],
  "building-from-goalkeeper": ["buildup", "pass", "turnover"],
  "creating-finishing-chances": ["shot", "goal", "pass"],
  "team-defending": ["defensive_action", "recovery", "coach_clip"],
  "transition-to-attack": ["transition", "recovery", "pass"],
  "transition-to-defense": ["transition", "turnover", "defensive_action"],
  goalkeeping: ["shot", "recovery", "buildup"],
  "communication-leadership": ["coach_clip", "buildup", "defensive_action"],
  "reflection-game-understanding": ["coach_clip", "pass", "defensive_action"],
};

const positiveEvidenceTagId = (goalId: string) => `${goalId}-evidence-positive`;
const improvementEvidenceTagId = (goalId: string) => `${goalId}-evidence-improvement`;
const editorial = {
  status: "needs_coach_review" as const,
  originalWording: true,
  originalDiagram: true,
  generatedWithAssistance: true,
};

const makeGoal = (seed: GoalSeed): AcademyGoal => ({
  id: seed.id,
  title: seed.title,
  description: seed.description,
  domainId: seed.domainId,
  type: seed.type,
  ageBands: ["U11-U12"],
  formats: ["9v9"],
  principles: [...seed.principles],
  coachCues: [...seed.cues],
  observableIndicators: [...seed.indicators],
  commonFailurePatterns: [{ title: seed.failure[0], description: seed.failure[1] }],
  coachFeedbackExamples: [...seed.feedback],
  gameEvidenceTags: [positiveEvidenceTagId(seed.id), improvementEvidenceTagId(seed.id)],
  prerequisiteGoalIds: [...(seed.prerequisiteGoalIds ?? [])],
  relatedGoalIds: [...(relatedByGoalId.get(seed.id) ?? [])],
  recommendedLessonCount: seed.type === "tactical" ? 2 : 1,
  recommendedDrillCount: seed.type === "psychological" || seed.type === "social" ? 2 : 3,
  suitableFor: seed.positions ? ["team", "position_group", "individual"] : ["team", "individual"],
  positionRelevance: seed.positions
    ? seed.positions.map(([positionGroup, relevance]) => ({ positionGroup, relevance }))
    : [{ positionGroup: "all", relevance: "primary" }],
  individualLearningSupport: {
    homePractice: seed.type === "technical" || seed.type === "goalkeeping",
    partnerPractice: seed.type !== "psychological",
    filmStudy: true,
    quiz:
      seed.type === "tactical" ||
      seed.type === "psychological" ||
      seed.type === "social" ||
      seed.type === "goalkeeping",
    reflection: true,
  },
  recommendedResourceTopics: [...seed.resources],
  seasonalPlacement: [
    { blockId: `u12-block-${seed.block}`, role: "primary" },
    ...(seed.block < 6 ? [{ blockId: `u12-block-${seed.block + 1}`, role: "reinforcement" as const }] : []),
  ],
  sourceProvenance: [],
  editorial: { ...editorial },
});

const goals = seeds.map(makeGoal);

export const U12_ACADEMY_EVIDENCE_TAGS = goals.flatMap((goal) => {
  const eventTypes = evidenceEventTypesByDomain[goal.domainId];
  return [
    {
      id: positiveEvidenceTagId(goal.id),
      label: `${goal.title}: observed`,
      description: `Coach-tagged moment showing one or more observable indicators for "${goal.title}"; the tag records visible action, not inferred tactical intent.`,
      category: "positive" as const,
      applicableGoalIds: [goal.id],
      applicableEventTypes: eventTypes,
    },
    {
      id: improvementEvidenceTagId(goal.id),
      label: `${goal.title}: review`,
      description: `Coach-tagged moment suitable for reviewing a visible failure pattern or next action for "${goal.title}"; player intent must be discussed, not assumed.`,
      category: "improvement" as const,
      applicableGoalIds: [goal.id],
      applicableEventTypes: eventTypes,
    },
  ];
});

function validateCatalogGraph(catalogGoals: readonly AcademyGoal[]): void {
  const goalIds = new Set(catalogGoals.map((goal) => goal.id));
  const goalById = new Map(catalogGoals.map((goal) => [goal.id, goal]));

  for (const goal of catalogGoals) {
    if (goal.prerequisiteGoalIds.includes(goal.id) || goal.relatedGoalIds.includes(goal.id)) {
      throw new Error(`U12 academy catalog contains a self-link on ${goal.id}.`);
    }
    for (const prerequisiteId of goal.prerequisiteGoalIds) {
      if (!goalIds.has(prerequisiteId)) throw new Error(`Missing prerequisite ${prerequisiteId} for ${goal.id}.`);
    }
    for (const relatedId of goal.relatedGoalIds) {
      const relatedGoal = goalById.get(relatedId);
      if (!relatedGoal?.relatedGoalIds.includes(goal.id)) {
        throw new Error(`Asymmetric related-goal link between ${goal.id} and ${relatedId}.`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (goalId: string): void => {
    if (visiting.has(goalId)) throw new Error(`Prerequisite cycle detected at ${goalId}.`);
    if (visited.has(goalId)) return;
    visiting.add(goalId);
    for (const prerequisiteId of goalById.get(goalId)?.prerequisiteGoalIds ?? []) visit(prerequisiteId);
    visiting.delete(goalId);
    visited.add(goalId);
  };
  for (const goal of catalogGoals) visit(goal.id);
}

validateCatalogGraph(goals);

export const U12_ACADEMY_GOAL_CATALOG = {
  id: "u12-9v9-canonical-goal-catalog",
  version: 1,
  title: "Canonical U11-U12 9v9 Goal Catalog",
  ageBand: "U11-U12",
  primaryFormat: "9v9",
  seasonWeeks: 12,
  practicesPerWeek: 2,
  typicalRoster: { min: 12, max: 16 },
  goalkeepers: { min: 1, max: 2 },
  domains: [...U12_ACADEMY_DOMAINS],
  blocks: [...U12_ACADEMY_SEASON_BLOCKS],
  goals,
  evidenceTags: U12_ACADEMY_EVIDENCE_TAGS,
} satisfies AcademyGoalGraphCatalog;
