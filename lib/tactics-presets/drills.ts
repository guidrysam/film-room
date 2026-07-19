import type { TacticsBoardObject } from "@/lib/tactics-boards";
import {
  areaLabel,
  ball,
  cone,
  DEFAULT_FILM_ROOM_EDITORIAL_METADATA,
  DEFAULT_PRESET_PLAYBACK,
  drawing,
  miniGoal,
  player,
  step,
  withMovedObjects,
} from "@/lib/tactics-presets/helpers";
import type {
  CoachingMistake,
  DrillVariation,
  TacticsPreset,
} from "@/lib/tactics-presets/types";

type MoveMap = Record<string, { x: number; y: number }>;

type GuidedStep = {
  title: string;
  explanation: string;
  coachCue: string;
  playerAction: string;
  ballAction: string;
  moves?: MoveMap;
  arrow: [{ x: number; y: number }, { x: number; y: number }];
  arrowColor?: string;
  durationMs?: number;
};

type DrillInput = Omit<
  TacticsPreset,
  | "version"
  | "kind"
  | "category"
  | "format"
  | "fieldOrientation"
  | "fieldView"
  | "playbackSettings"
  | "editorialMetadata"
  | "steps"
> & {
  format?: TacticsPreset["format"];
  fieldOrientation?: TacticsPreset["fieldOrientation"];
  fieldView?: TacticsPreset["fieldView"];
  playbackSettings?: TacticsPreset["playbackSettings"];
  objects: TacticsBoardObject[];
  lesson: GuidedStep[];
};

const PASS = "#fbbf24";
const MOVE = "#94a3b8";
const DEFEND = "#ef4444";

function zone(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = "#22c55e24",
): TacticsBoardObject {
  return drawing(id, "zone", [{ x: x1, y: y1 }, { x: x2, y: y2 }], color);
}

function variation(title: string, description: string): DrillVariation {
  return { title, description };
}

function mistake(mistakeText: string, correction: string): CoachingMistake {
  return { mistake: mistakeText, correction };
}

function drillPreset(input: DrillInput): TacticsPreset {
  const { objects, lesson, ...preset } = input;
  return {
    version: 2,
    kind: "practice_drill",
    category: "practice_drills",
    format: input.format ?? "small_sided",
    fieldOrientation: input.fieldOrientation ?? "horizontal",
    fieldView: input.fieldView ?? "full",
    playbackSettings: input.playbackSettings ?? {
      ...DEFAULT_PRESET_PLAYBACK,
      loop: false,
    },
    editorialMetadata: {
      ...DEFAULT_FILM_ROOM_EDITORIAL_METADATA,
      methodologyTags: [
        "game-based learning",
        "guided discovery",
        "technical development",
      ],
    },
    ...preset,
    steps: lesson.map((phase, index) => {
      const phaseObjects = [
        ...withMovedObjects(objects, phase.moves ?? {}),
        drawing(
          `${input.id}-action`,
          "arrow",
          phase.arrow,
          phase.arrowColor ?? PASS,
        ),
      ];
      return step(
        `${input.id}-s${index + 1}`,
        index + 1,
        phase.title,
        phaseObjects,
        phase.explanation,
        {
          explanation: phase.explanation,
          coachCue: phase.coachCue,
          playerAction: phase.playerAction,
          ballAction: phase.ballAction,
          durationMs: phase.durationMs ?? 1400,
        },
      );
    }),
  };
}

const ballMasteryGrid = drillPreset({
  id: "drill-ball-mastery-grid",
  title: "Ball Mastery Grid",
  shortDescription:
    "An individual guided exploration of close control, scanning, turns, and acceleration in shared space.",
  playerCount: 9,
  ageGuidance: "U8+; enlarge the grid and simplify cues for new players.",
  difficulty: "foundation",
  estimatedMinutes: 10,
  fieldArea: "third",
  objectives: [
    "Keep the ball within playing distance while moving.",
    "Explore inside, outside, sole, and laces touches with both feet.",
    "Scan between touches and move into open space.",
    "Change direction, then accelerate away from the turn.",
  ],
  setupInstructions: [
    "Mark a 12-by-12-yard grid with four cones; adjust it so every player has room to turn safely.",
    "Give every player a ball and ask them to begin in a different pocket of the grid.",
    "Demonstrate the boundary rule: stay inside, avoid collisions, and stop immediately on the coach's signal.",
    "Place spare balls outside the grid so a lost ball can be replaced without delaying the round.",
  ],
  howItWorks: [
    "Players begin with free dribbling and identify open space before increasing speed.",
    "The coach names a foot surface; players test it while continuing to scan.",
    "On a visual or verbal signal, each player turns into a new lane and accelerates.",
    "After the action, players regain control, spread out, and prepare for the next cue.",
  ],
  coachingPoints: [
    "Take soft touches in traffic and a longer touch only when space opens.",
    "Lift the eyes between touches; name an open corner before moving toward it.",
    "Bend the knees and place the non-kicking foot beside the ball for controlled turns.",
    "Push away for two quick steps after every change of direction.",
  ],
  commonMistakes: [
    mistake("Players stare at the ball.", "Ask for a quick shoulder check after every two touches."),
    mistake("Touches run beyond playing distance.", "Reduce speed and keep the next touch within one stride."),
    mistake("Players use only their preferred foot.", "Give a short weak-foot round with no speed target."),
  ],
  progressions: [
    variation("Alternating surfaces", "Alternate inside and outside touches on every contact."),
    variation("Reactive turn", "Turn away from the color or direction shown by the coach."),
  ],
  regressions: [
    variation("More personal space", "Enlarge the grid and reduce the number of simultaneous players."),
    variation("Walk and rehearse", "Perform the turn slowly from a stationary start before dribbling."),
  ],
  equipment: { balls: "one-per-player", cones: 4 },
  tags: ["ball mastery", "dribbling", "scanning", "turning", "foundation"],
  objects: [
    zone("bm-grid", 0.25, 0.2, 0.75, 0.8, "#3b82f628"),
    cone("bm-c1", 0.25, 0.2), cone("bm-c2", 0.75, 0.2),
    cone("bm-c3", 0.25, 0.8), cone("bm-c4", 0.75, 0.8),
    player("bm-p1", "home", 0.34, 0.32, "1"),
    player("bm-p2", "home", 0.5, 0.32, "2"),
    player("bm-p3", "home", 0.66, 0.32, "3"),
    player("bm-p4", "home", 0.34, 0.5, "4"),
    player("bm-p5", "home", 0.5, 0.5, "5"),
    player("bm-p6", "home", 0.66, 0.5, "6"),
    player("bm-p7", "home", 0.34, 0.68, "7"),
    player("bm-p8", "home", 0.5, 0.68, "8"),
    player("bm-p9", "home", 0.66, 0.68, "9"),
    ball("bm-b1", 0.36, 0.34), ball("bm-b2", 0.52, 0.34),
    ball("bm-b3", 0.68, 0.34), ball("bm-b4", 0.36, 0.52),
    ball("bm-b5", 0.52, 0.52), ball("bm-b6", 0.68, 0.52),
    ball("bm-b7", 0.36, 0.7), ball("bm-b8", 0.52, 0.7),
    ball("bm-b9", 0.68, 0.7),
    areaLabel("bm-label", 0.5, 0.12, "Ball mastery grid"),
  ],
  lesson: [
    {
      title: "Set up personal space",
      explanation: "Each player starts with a ball in a clear pocket and checks the nearest traffic.",
      coachCue: "Find a window, then show me your eyes.",
      playerAction: "Spread out, soften the knees, and scan left and right.",
      ballAction: "The ball rests within one step of each player.",
      arrow: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }],
      arrowColor: "#00000000",
      durationMs: 1200,
    },
    {
      title: "Explore close touches",
      explanation: "Players travel through open pockets using the called foot surface.",
      coachCue: "Soft touches; eyes up between them.",
      playerAction: "Dribble into new space without following another player.",
      ballAction: "Every ball moves in short, controlled increments.",
      moves: { "bm-p1": { x: 0.4, y: 0.4 }, "bm-b1": { x: 0.42, y: 0.42 }, "bm-p5": { x: 0.56, y: 0.58 }, "bm-b5": { x: 0.58, y: 0.6 } },
      arrow: [{ x: 0.34, y: 0.32 }, { x: 0.42, y: 0.42 }],
    },
    {
      title: "Scan and avoid traffic",
      explanation: "Players lift their heads between touches, recognize congestion, and guide the ball toward a clearer pocket.",
      coachCue: "See the space before you enter it.",
      playerAction: "Check both shoulders and change the dribbling line before paths cross.",
      ballAction: "Small touches steer each ball away from crowded central space.",
      moves: { "bm-p1": { x: 0.38, y: 0.48 }, "bm-b1": { x: 0.39, y: 0.5 }, "bm-p5": { x: 0.62, y: 0.6 }, "bm-b5": { x: 0.64, y: 0.61 } },
      arrow: [{ x: 0.42, y: 0.42 }, { x: 0.39, y: 0.5 }],
      arrowColor: MOVE,
    },
    {
      title: "Turn into open space",
      explanation: "On the signal, players use the called turn and exit through a different lane.",
      coachCue: "Turn away from traffic.",
      playerAction: "Plant, turn with balance, and point the first step toward open grass.",
      ballAction: "The ball changes direction under close control.",
      moves: { "bm-p1": { x: 0.44, y: 0.58 }, "bm-b1": { x: 0.45, y: 0.6 }, "bm-p5": { x: 0.62, y: 0.46 }, "bm-b5": { x: 0.64, y: 0.44 } },
      arrow: [{ x: 0.42, y: 0.42 }, { x: 0.45, y: 0.6 }],
    },
    {
      title: "Change speed after the turn",
      explanation: "Players use a positive exit touch and accelerate for two or three steps into the space created by the turn.",
      coachCue: "Slow into the move, fast out of it.",
      playerAction: "Push away explosively while keeping the next touch reachable.",
      ballAction: "The ball travels farther on the acceleration touch, then returns to close control.",
      moves: { "bm-p1": { x: 0.42, y: 0.7 }, "bm-b1": { x: 0.43, y: 0.72 }, "bm-p5": { x: 0.68, y: 0.38 }, "bm-b5": { x: 0.69, y: 0.36 } },
      arrow: [{ x: 0.45, y: 0.6 }, { x: 0.43, y: 0.72 }],
    },
    {
      title: "Reset and prepare",
      explanation: "Players decelerate, regain close control, spread into safe pockets, and wait for the next command.",
      coachCue: "Own the ball, find new grass, eyes up.",
      playerAction: "Restore balanced spacing without returning to a fixed starting spot.",
      ballAction: "Settling touches bring every ball back within one step.",
      moves: { "bm-p1": { x: 0.33, y: 0.64 }, "bm-b1": { x: 0.35, y: 0.65 }, "bm-p5": { x: 0.62, y: 0.42 }, "bm-b5": { x: 0.64, y: 0.43 } },
      arrow: [{ x: 0.43, y: 0.72 }, { x: 0.35, y: 0.65 }],
      arrowColor: MOVE,
    },
  ],
});

const passingGates = drillPreset({
  id: "drill-passing-gates-pairs",
  title: "Passing Gates in Pairs",
  shortDescription: "Pairs pass through changing gates, receive across the body, and move together to the next target.",
  playerCount: 8,
  ageGuidance: "U8+; widen gates and shorten passes for beginners.",
  difficulty: "foundation",
  estimatedMinutes: 12,
  fieldArea: "third",
  objectives: ["Pass accurately through a target.", "Receive across the body into space.", "Communicate the next gate early.", "Move immediately after passing."],
  setupInstructions: [
    "Build at least five two-yard cone gates across a 20-by-20-yard area.",
    "Organize pairs with one ball each and start each pair at a different gate.",
    "Define a successful gate as a pass traveling cleanly between the cones to the partner.",
    "Keep a two-yard buffer around each gate and require pairs to yield when another pair arrives first.",
  ],
  howItWorks: [
    "Partners begin opposite a gate and connect one controlled pass.",
    "The receiver takes the first touch away from the gate and scans for a free target.",
    "The pair communicates and travels together to the new gate.",
    "They pass through the new gate, continue for the round, then reset to open space.",
  ],
  coachingPoints: ["Lock the ankle and pass through the center of the gate.", "Receive with the far foot when the next gate is to the side.", "Say the target gate before the ball arrives.", "Pass, then move to provide the next angle."],
  commonMistakes: [
    mistake("The pass clips a cone.", "Move the standing foot closer and point it through the middle of the gate."),
    mistake("The receiver stops the ball square.", "Open the hips and guide the first touch toward the next target."),
    mistake("Pairs chase the same gate.", "Scan early, call a different color, and change direction before congestion."),
  ],
  progressions: [variation("Two-touch travel", "Use one touch to receive and one to pass through every gate."), variation("Opposite foot", "Alternate the passing foot after each successful gate.")],
  regressions: [variation("Wider gates", "Increase each gate to three yards."), variation("Fixed gate rehearsal", "Complete three passes at one gate before moving.")],
  equipment: { balls: 4, cones: 10 },
  tags: ["passing", "receiving", "pairs", "gates", "communication"],
  objects: [
    cone("pg-g1a", 0.28, 0.3), cone("pg-g1b", 0.28, 0.4),
    cone("pg-g2a", 0.5, 0.22), cone("pg-g2b", 0.6, 0.22),
    cone("pg-g3a", 0.72, 0.42), cone("pg-g3b", 0.72, 0.52),
    cone("pg-g4a", 0.36, 0.66), cone("pg-g4b", 0.46, 0.66),
    cone("pg-g5a", 0.62, 0.72), cone("pg-g5b", 0.62, 0.82),
    player("pg-p1", "home", 0.2, 0.35, "1"), player("pg-p2", "home", 0.36, 0.35, "2"),
    player("pg-p3", "home", 0.5, 0.32, "3"), player("pg-p4", "home", 0.62, 0.32, "4"),
    ball("pg-b1", 0.24, 0.35), ball("pg-b2", 0.54, 0.32),
    areaLabel("pg-label", 0.5, 0.12, "Passing gates"),
  ],
  lesson: [
    { title: "Choose a starting gate", explanation: "Partners face each other through an unoccupied gate and check the space beyond it.", coachCue: "See your partner and the next gate.", playerAction: "Set an open stance on opposite sides of the gate.", ballAction: "The ball begins at the passer's front foot.", arrow: [{ x: 0.24, y: 0.35 }, { x: 0.34, y: 0.35 }] },
    { title: "Create useful distance", explanation: "The partners separate far enough that the ball must travel through the gate rather than being handed across it.", coachCue: "Make the passing lane clear.", playerAction: "Both players step away from the cones while staying on opposite sides.", ballAction: "The ball remains set at P1's front foot until the lane is ready.", moves: { "pg-p1": { x: 0.18, y: 0.35 }, "pg-p2": { x: 0.38, y: 0.35 }, "pg-b1": { x: 0.21, y: 0.35 } }, arrow: [{ x: 0.24, y: 0.35 }, { x: 0.21, y: 0.35 }], arrowColor: MOVE },
    { title: "Pass through the target", explanation: "The passer strikes through the gate with weight the partner can control.", coachCue: "Through the middle, to the safe side.", playerAction: "Pass accurately; the partner checks the shoulder before receiving.", ballAction: "The ball travels cleanly between both cones.", moves: { "pg-b1": { x: 0.34, y: 0.35 } }, arrow: [{ x: 0.24, y: 0.35 }, { x: 0.34, y: 0.35 }] },
    { title: "Receive and select", explanation: "The receiver opens across the body and identifies a free new gate.", coachCue: "First touch tells us where next.", playerAction: "Guide the ball out of the gate and call the next target.", ballAction: "The first touch carries the ball toward the upper gate.", moves: { "pg-p2": { x: 0.4, y: 0.31 }, "pg-b1": { x: 0.42, y: 0.29 } }, arrow: [{ x: 0.34, y: 0.35 }, { x: 0.42, y: 0.29 }], arrowColor: MOVE },
    { title: "Move and continue", explanation: "Both partners travel to opposite sides of the new gate and repeat without crossing other pairs.", coachCue: "Pass, move, talk, repeat.", playerAction: "Move together, restore the passing angle, and continue the round.", ballAction: "The receiver carries the ball to the new passing position.", moves: { "pg-p1": { x: 0.48, y: 0.3 }, "pg-p2": { x: 0.62, y: 0.3 }, "pg-b1": { x: 0.58, y: 0.29 } }, arrow: [{ x: 0.42, y: 0.29 }, { x: 0.58, y: 0.29 }], arrowColor: MOVE },
    { title: "Repeat in the opposite direction", explanation: "At the new gate, P2 becomes the passer and sends the ball back to P1 before both scan again.", coachCue: "New gate, new passer, same quality.", playerAction: "P1 opens beyond the gate while P2 sets the pass and checks the next space.", ballAction: "The ball travels back through the new gate to P1.", moves: { "pg-p1": { x: 0.48, y: 0.3 }, "pg-p2": { x: 0.63, y: 0.3 }, "pg-b1": { x: 0.5, y: 0.3 } }, arrow: [{ x: 0.58, y: 0.29 }, { x: 0.5, y: 0.3 }] },
  ],
});

const passingDiamond = drillPreset({
  id: "drill-passing-diamond",
  title: "Passing Diamond",
  shortDescription: "A guided pass-follow-receive pattern that develops checking movement and an open body shape.",
  playerCount: 4,
  ageGuidance: "U9+; use short sides and unlimited touches before adding speed.",
  difficulty: "foundation",
  estimatedMinutes: 12,
  fieldArea: "third",
  objectives: ["Check away before receiving.", "Receive on the back foot with an open body.", "Pass with useful pace.", "Follow every pass immediately."],
  setupInstructions: ["Place four cones in a 10-by-10-yard diamond.", "Start one player at each cone and one ball at the top.", "Explain that the passer follows the pass and fills the receiver's cone.", "Keep extra players, if any, in short queues behind the cones."],
  howItWorks: ["The first receiver checks away, returns, and presents an open body.", "The top player passes clockwise and immediately follows the pass.", "The receiver's first touch prepares the next clockwise pass.", "The pattern continues around the diamond before direction is reversed."],
  coachingPoints: ["Check away as the passer looks up.", "See the ball and the next target in the same body shape.", "Play to the receiver's back foot.", "Accelerate for the first steps after passing."],
  commonMistakes: [mistake("Receiver waits flat on the cone.", "Check away, then arrive as the ball is ready to travel."), mistake("First touch closes the next passing lane.", "Open the hips and receive with the foot farther from the passer."), mistake("Passer admires the pass.", "Follow immediately and arrive before the next ball moves.")],
  progressions: [variation("Two-touch rhythm", "Receive with one touch and release with the second."), variation("Reverse direction", "Run the same details counterclockwise.")],
  regressions: [variation("Shorter diamond", "Bring cones closer to improve passing success."), variation("Rehearse the receive", "Pause after each pass to set the body shape.")],
  equipment: { balls: 1, cones: 4 },
  tags: ["passing", "receiving", "diamond", "movement", "body shape"],
  objects: [
    cone("pd-c1", 0.5, 0.2), cone("pd-c2", 0.75, 0.5), cone("pd-c3", 0.5, 0.8), cone("pd-c4", 0.25, 0.5),
    player("pd-p1", "home", 0.5, 0.25, "1"), player("pd-p2", "home", 0.7, 0.5, "2"),
    player("pd-p3", "home", 0.5, 0.75, "3"), player("pd-p4", "home", 0.3, 0.5, "4"),
    ball("pd-ball", 0.5, 0.29), areaLabel("pd-label", 0.5, 0.1, "Passing diamond"),
  ],
  lesson: [
    { title: "Take starting positions", explanation: "One player occupies each cone, with extra players queued behind the starting cone and the ball at the top.", coachCue: "One player per cone; see the next side.", playerAction: "Players open their bodies toward the ball and the next target.", ballAction: "The ball rests at P1's front foot.", arrow: [{ x: 0.5, y: 0.29 }, { x: 0.5, y: 0.29 }], arrowColor: "#00000000" },
    { title: "Check away to arrive", explanation: "P2 moves away from the cone, then checks back as P1 raises the head.", coachCue: "Away, then arrive on the pass.", playerAction: "P2 creates separation and returns side-on.", ballAction: "P1 keeps the ball set until the receiver returns.", moves: { "pd-p2": { x: 0.74, y: 0.44 } }, arrow: [{ x: 0.7, y: 0.5 }, { x: 0.74, y: 0.44 }], arrowColor: MOVE },
    { title: "Pass to the back foot", explanation: "P1 passes clockwise to the foot that lets P2 face the next cone.", coachCue: "Firm to the back foot.", playerAction: "P1 passes; P2 opens to see P3.", ballAction: "The ball travels from the top cone to the right cone.", moves: { "pd-p2": { x: 0.7, y: 0.5 }, "pd-ball": { x: 0.68, y: 0.49 } }, arrow: [{ x: 0.5, y: 0.29 }, { x: 0.68, y: 0.49 }] },
    { title: "Follow the pass", explanation: "As the ball arrives, P1 moves decisively into P2's vacated position.", coachCue: "Pass and go—fill the cone.", playerAction: "P1 follows; P2 cushions the first touch forward.", ballAction: "P2 controls the ball just ahead of the right cone.", moves: { "pd-p1": { x: 0.62, y: 0.38 }, "pd-p2": { x: 0.69, y: 0.53 }, "pd-ball": { x: 0.67, y: 0.55 } }, arrow: [{ x: 0.5, y: 0.25 }, { x: 0.68, y: 0.48 }], arrowColor: MOVE },
    { title: "Play the next side", explanation: "P2 uses the prepared touch to pass to P3 and starts the next follow run.", coachCue: "First touch out; second touch on.", playerAction: "P2 passes to P3 while P3 checks and opens.", ballAction: "The ball travels down the next side of the diamond.", moves: { "pd-p1": { x: 0.7, y: 0.5 }, "pd-p2": { x: 0.62, y: 0.62 }, "pd-ball": { x: 0.52, y: 0.72 } }, arrow: [{ x: 0.67, y: 0.55 }, { x: 0.52, y: 0.72 }] },
    { title: "Continue around the diamond", explanation: "The same check, back-foot receive, pass, and follow pattern continues around the remaining sides.", coachCue: "Same detail at every cone.", playerAction: "P3 prepares the next side while the previous passers fill the open cones.", ballAction: "The ball keeps moving clockwise with controlled pace.", moves: { "pd-p1": { x: 0.7, y: 0.5 }, "pd-p2": { x: 0.5, y: 0.75 }, "pd-p3": { x: 0.4, y: 0.64 }, "pd-ball": { x: 0.41, y: 0.61 } }, arrow: [{ x: 0.52, y: 0.72 }, { x: 0.41, y: 0.61 }] },
    { title: "Reset after an error", explanation: "If a pass escapes or timing breaks down, the nearest player retrieves it and the group restarts from the nearest logical cone.", coachCue: "Solve it quickly; restore the shape.", playerAction: "Players refill one position per cone instead of returning all the way to the beginning.", ballAction: "The recovered ball is set at the nearest occupied cone for a calm restart.", moves: { "pd-p1": { x: 0.7, y: 0.5 }, "pd-p2": { x: 0.5, y: 0.75 }, "pd-p3": { x: 0.3, y: 0.5 }, "pd-ball": { x: 0.32, y: 0.5 } }, arrow: [{ x: 0.41, y: 0.61 }, { x: 0.32, y: 0.5 }], arrowColor: MOVE },
  ],
});

const rondo4v1 = drillPreset({
  id: "drill-rondo-4v1",
  title: "Rondo 4v1",
  shortDescription: "Four players create supporting angles around one defender and react immediately when possession changes.",
  playerCount: 5,
  ageGuidance: "U9+; begin with a passive defender and a generous square.",
  difficulty: "foundation",
  estimatedMinutes: 10,
  fieldArea: "custom",
  objectives: ["Create a visible passing angle.", "Move while the ball travels.", "Receive with the next pass in mind.", "React immediately to a win or loss."],
  setupInstructions: ["Mark an 8-by-8-yard square with four cones.", "Place one possession player on each side and one defender inside.", "Start with unlimited touches and a spare ball beside the coach.", "Rotate the defender after a clean win, an error, or a 45-second interval."],
  howItWorks: ["Outside players spread to make four passing options.", "The ball carrier draws pressure and plays to an available teammate.", "The other outside players adjust while the pass travels.", "After a turnover, the winner secures the ball and roles rotate before a quick restart."],
  coachingPoints: ["Move off the defender's cover shadow.", "Receive side-on and know the next option early.", "Use a firm pass to the teammate's safe foot.", "Defender approaches under control and blocks the next pass."],
  commonMistakes: [mistake("Support hides behind the defender.", "Move sideways until the passer can see both feet."), mistake("Players move only after the receiver controls.", "Travel as soon as the pass leaves the foot."), mistake("The defender dives in.", "Slow the last steps and show play toward one side.")],
  progressions: [variation("Two-touch maximum", "Limit outside players to control and pass."), variation("Pass target", "Score one point for six consecutive passes.")],
  regressions: [variation("Larger square", "Add two yards to each side."), variation("Guided defender", "Defender shadows passes without tackling for the first round.")],
  equipment: { balls: 2, cones: 4, pinnies: 1 },
  tags: ["rondo", "4v1", "possession", "support angles", "transition"],
  objects: [
    zone("r41-zone", 0.3, 0.25, 0.7, 0.75), cone("r41-c1", 0.3, 0.25), cone("r41-c2", 0.7, 0.25), cone("r41-c3", 0.3, 0.75), cone("r41-c4", 0.7, 0.75),
    player("r41-a1", "home", 0.32, 0.5, "1"), player("r41-a2", "home", 0.5, 0.28, "2"), player("r41-a3", "home", 0.68, 0.5, "3"), player("r41-a4", "home", 0.5, 0.72, "4"),
    player("r41-d1", "away", 0.46, 0.5, "D"), ball("r41-ball", 0.35, 0.5), areaLabel("r41-label", 0.5, 0.15, "4v1 rondo"),
  ],
  lesson: [
    { title: "Make four clear options", explanation: "The outside players occupy separate sides while the defender starts centrally.", coachCue: "Can the ball see both of your feet?", playerAction: "Spread, open the body, and check the defender's cover shadow.", ballAction: "The ball begins under P1's control.", arrow: [{ x: 0.35, y: 0.5 }, { x: 0.35, y: 0.5 }], arrowColor: "#00000000" },
    { title: "Draw and release", explanation: "P1 allows the defender to approach, then passes to P2's safe foot.", coachCue: "Invite pressure, release before it arrives.", playerAction: "P1 fixes the defender; P2 prepares side-on.", ballAction: "The ball travels into the top support player.", moves: { "r41-d1": { x: 0.4, y: 0.48 }, "r41-ball": { x: 0.49, y: 0.31 } }, arrow: [{ x: 0.35, y: 0.5 }, { x: 0.49, y: 0.31 }] },
    { title: "Move as it travels", explanation: "P3 and P4 adjust to remain visible before P2's first touch.", coachCue: "Travel with the pass.", playerAction: "Support players slide away from the defender's line.", ballAction: "P2 cushions the arriving pass into playing distance.", moves: { "r41-d1": { x: 0.46, y: 0.4 }, "r41-a3": { x: 0.67, y: 0.46 }, "r41-a4": { x: 0.54, y: 0.7 }, "r41-ball": { x: 0.5, y: 0.3 } }, arrow: [{ x: 0.68, y: 0.5 }, { x: 0.67, y: 0.46 }], arrowColor: MOVE },
    { title: "Defender applies pressure", explanation: "The defender closes P2 under control while curving the run to block the easiest next pass.", coachCue: "Arrive balanced and take one option away.", playerAction: "The defender presses without diving in; outside players remain beyond the cover shadow.", ballAction: "P2 protects the ball on the foot farthest from pressure.", moves: { "r41-d1": { x: 0.49, y: 0.36 }, "r41-a3": { x: 0.67, y: 0.46 }, "r41-a4": { x: 0.54, y: 0.7 }, "r41-ball": { x: 0.51, y: 0.31 } }, arrow: [{ x: 0.46, y: 0.4 }, { x: 0.49, y: 0.36 }], arrowColor: DEFEND },
    { title: "Find the next free side", explanation: "P2 scans beyond the presser and plays around pressure to P3.", coachCue: "Know the next pass before the ball arrives.", playerAction: "P2 releases quickly; all support rotates to preserve angles.", ballAction: "The ball moves from the top to the right side.", moves: { "r41-d1": { x: 0.53, y: 0.4 }, "r41-ball": { x: 0.65, y: 0.47 } }, arrow: [{ x: 0.5, y: 0.3 }, { x: 0.65, y: 0.47 }] },
    { title: "Defender wins possession", explanation: "A loose pass lets the defender intercept and secure the ball rather than simply knocking it away.", coachCue: "Win it and show control.", playerAction: "The interceptor gets the body behind the ball while the player responsible reacts immediately.", ballAction: "The defender takes a controlling touch inside the square.", moves: { "r41-d1": { x: 0.59, y: 0.46 }, "r41-ball": { x: 0.58, y: 0.46 }, "r41-a3": { x: 0.64, y: 0.5 } }, arrow: [{ x: 0.65, y: 0.47 }, { x: 0.58, y: 0.46 }], arrowColor: DEFEND },
    { title: "Rotate and restart immediately", explanation: "The player responsible becomes the new defender, the former defender fills the outside, and a spare ball restarts the rondo.", coachCue: "New defender, four options, play again.", playerAction: "Players exchange roles and rebuild four clear supporting positions.", ballAction: "A spare ball enters at P1 so the next repetition begins quickly.", moves: { "r41-d1": { x: 0.68, y: 0.5 }, "r41-a3": { x: 0.46, y: 0.5 }, "r41-ball": { x: 0.35, y: 0.5 } }, arrow: [{ x: 0.58, y: 0.46 }, { x: 0.35, y: 0.5 }], arrowColor: MOVE },
  ],
});

const rondo5v2 = drillPreset({
  id: "drill-rondo-5v2",
  title: "Rondo 5v2",
  shortDescription: "Five players identify the free player while two defenders coordinate pressure and cover.",
  playerCount: 7,
  ageGuidance: "U10+; use a larger rectangle until players recognize pressure and cover.",
  difficulty: "developing",
  estimatedMinutes: 12,
  fieldArea: "custom",
  objectives: ["Create width and depth around two defenders.", "Find the free player rather than force a split.", "Recognize a safe split-pass moment.", "Defend with connected pressure and cover."],
  setupInstructions: ["Mark a 12-by-10-yard rectangle.", "Place five possession players around its perimeter and two defenders inside.", "Start every repetition from an outside player with defenders connected centrally.", "Rotate both defenders after a win, an error, or one minute."],
  howItWorks: ["Possession players establish width and one deeper support angle.", "The nearest defender pressures while the partner covers the central route.", "Attackers circulate around pressure until a free player or split lane appears.", "On a win, defenders secure the ball; the group transitions and resets roles."],
  coachingPoints: ["Scan both defenders before receiving.", "Use the outside pass if the split lane is not clearly open.", "Move behind the line of the first defender to become the free player.", "Pressure and cover should move as one connected pair."],
  commonMistakes: [mistake("Attackers force a split pass.", "Circulate once more and play through only when the lane is fully visible."), mistake("The two defenders chase separately.", "Name one presser; the partner protects behind and inside."), mistake("Outside players stand on one line.", "Create one lower support position to add depth.")],
  progressions: [variation("Split-pass point", "Award a point for a controlled pass between defenders."), variation("Two-touch limit", "Use two touches when spacing and scanning are reliable.")],
  regressions: [variation("One active defender", "Make the covering defender passive for the first minute."), variation("Larger rectangle", "Increase width to make outside circulation clearer.")],
  equipment: { balls: 2, cones: 4, pinnies: 2 },
  tags: ["rondo", "5v2", "possession", "free player", "pressure cover"],
  objects: [
    zone("r52-zone", 0.25, 0.22, 0.75, 0.78), cone("r52-c1", 0.25, 0.22), cone("r52-c2", 0.75, 0.22), cone("r52-c3", 0.25, 0.78), cone("r52-c4", 0.75, 0.78),
    player("r52-a1", "home", 0.28, 0.5, "1"), player("r52-a2", "home", 0.4, 0.26, "2"), player("r52-a3", "home", 0.6, 0.26, "3"), player("r52-a4", "home", 0.72, 0.5, "4"), player("r52-a5", "home", 0.5, 0.74, "5"),
    player("r52-d1", "away", 0.44, 0.46, "D1"), player("r52-d2", "away", 0.56, 0.54, "D2"), ball("r52-ball", 0.31, 0.5), areaLabel("r52-label", 0.5, 0.13, "5v2 rondo"),
  ],
  lesson: [
    { title: "Build width and depth", explanation: "Five attackers occupy different edges while the defenders begin connected.", coachCue: "Stretch the pair; keep one player underneath.", playerAction: "Make five distinct passing pictures around the rectangle.", ballAction: "P1 controls the starting ball.", arrow: [{ x: 0.31, y: 0.5 }, { x: 0.31, y: 0.5 }], arrowColor: "#00000000" },
    { title: "Pressure and cover", explanation: "D1 presses P1 while D2 protects the central lane and the pass beyond.", coachCue: "One goes; one guards the gap.", playerAction: "D1 closes under control; D2 stays connected and inside.", ballAction: "P1 protects the ball and scans away from pressure.", moves: { "r52-d1": { x: 0.36, y: 0.48 }, "r52-d2": { x: 0.48, y: 0.5 } }, arrow: [{ x: 0.44, y: 0.46 }, { x: 0.35, y: 0.49 }], arrowColor: DEFEND },
    { title: "Circulate around pressure", explanation: "P1 chooses the safe outside pass and teammates move while it travels.", coachCue: "If through is closed, go around.", playerAction: "P1 passes to P2; far players adjust to remain available.", ballAction: "The ball moves around the pressing defender.", moves: { "r52-d1": { x: 0.36, y: 0.44 }, "r52-d2": { x: 0.48, y: 0.46 }, "r52-ball": { x: 0.39, y: 0.29 }, "r52-a5": { x: 0.54, y: 0.72 } }, arrow: [{ x: 0.31, y: 0.5 }, { x: 0.39, y: 0.29 }] },
    { title: "Recognize the split", explanation: "As defenders separate toward the outside pass, P2 checks whether P5 is visible between them.", coachCue: "See it early; do not invent it late.", playerAction: "P2 opens up; P5 checks into the window beyond the pair.", ballAction: "The ball is prepared in front of P2 for a possible split.", moves: { "r52-d1": { x: 0.4, y: 0.37 }, "r52-d2": { x: 0.54, y: 0.48 }, "r52-a5": { x: 0.54, y: 0.66 }, "r52-ball": { x: 0.41, y: 0.29 } }, arrow: [{ x: 0.41, y: 0.29 }, { x: 0.53, y: 0.64 }] },
    { title: "Defenders win together", explanation: "D1's pressure forces the pass into D2's covering lane, allowing the pair to regain possession as a unit.", coachCue: "Pressure creates the win; cover collects it.", playerAction: "D1 closes the first option while D2 anticipates and intercepts.", ballAction: "The attempted split is collected centrally by D2.", moves: { "r52-d1": { x: 0.42, y: 0.39 }, "r52-d2": { x: 0.5, y: 0.49 }, "r52-ball": { x: 0.5, y: 0.49 }, "r52-a2": { x: 0.43, y: 0.34 } }, arrow: [{ x: 0.41, y: 0.29 }, { x: 0.5, y: 0.49 }], arrowColor: DEFEND },
    { title: "Rotate and restore the shape", explanation: "The two players responsible enter as defenders while the winners take outside positions and restart.", coachCue: "Two connected defenders; five clear outlets.", playerAction: "Roles change quickly and the new defending pair begins close enough to cooperate.", ballAction: "The ball returns to an outside starter for the next repetition.", moves: { "r52-d1": { x: 0.28, y: 0.5 }, "r52-d2": { x: 0.4, y: 0.26 }, "r52-a1": { x: 0.44, y: 0.46 }, "r52-a2": { x: 0.56, y: 0.54 }, "r52-ball": { x: 0.31, y: 0.5 } }, arrow: [{ x: 0.5, y: 0.49 }, { x: 0.31, y: 0.5 }], arrowColor: MOVE },
  ],
});

const transitionBox3v1 = drillPreset({
  id: "drill-3v1-transition-box",
  title: "3v1 Transition Box",
  shortDescription: "A fully guided 3v1 that becomes an immediate race to a mini-goal after the defender wins possession.",
  playerCount: 4,
  ageGuidance: "U10+; begin with a large box and a close target.",
  difficulty: "developing",
  estimatedMinutes: 14,
  fieldArea: "third",
  objectives: ["Keep possession with clear support angles.", "Attack forward immediately after winning.", "Counterpress as soon as the ball is lost.", "Reset roles and spacing quickly."],
  setupInstructions: ["Mark a 10-by-10-yard possession box.", "Place one mini-goal eight yards beyond one side of the box.", "Start three attackers and one defender inside with spare balls beside the box.", "Explain that the defender attacks the mini-goal after a win while all three attackers recover."],
  howItWorks: ["Three attackers circulate until the defender can intercept or tackle.", "The defender's first look after winning is toward the mini-goal.", "The nearest former attacker counterpresses while teammates recover inside the goal line.", "The action ends with a goal, recovery, or ball out; roles rotate and restart."],
  coachingPoints: ["Possession players support on different sides of the ball.", "The winner's first touch should escape pressure and face the goal.", "Nearest player presses the ball; others protect the direct path.", "Use a fresh ball for a fast, organized reset."],
  commonMistakes: [mistake("Attackers stand in the same lane.", "Rebuild a triangle with support on three different sides."), mistake("The defender's first touch stays inside traffic.", "Take the winning touch toward the open side and goal."), mistake("Former attackers complain after losing it.", "Trigger an immediate three-step recovery before any discussion.")],
  progressions: [variation("Two-touch possession", "Limit the 3v1 players before the turnover."), variation("Recovering score", "Attackers earn a point for regaining before the shot.")],
  regressions: [variation("Passive opening", "Defender shadows for the first three passes."), variation("Closer mini-goal", "Reduce transition distance so the forward action is obvious.")],
  equipment: { balls: 3, cones: 4, miniGoals: 1, pinnies: 1 },
  tags: ["transition", "3v1", "counterpress", "mini-goal", "possession"],
  objects: [
    zone("t31-box", 0.18, 0.3, 0.55, 0.7), cone("t31-c1", 0.18, 0.3), cone("t31-c2", 0.55, 0.3), cone("t31-c3", 0.18, 0.7), cone("t31-c4", 0.55, 0.7),
    miniGoal("t31-mg", 0.88, 0.5, 90), player("t31-a1", "home", 0.25, 0.38, "1"), player("t31-a2", "home", 0.4, 0.5, "2"), player("t31-a3", "home", 0.25, 0.62, "3"), player("t31-d1", "away", 0.47, 0.5, "D"), ball("t31-ball", 0.28, 0.39), areaLabel("t31-label", 0.5, 0.16, "3v1 transition box"),
  ],
  lesson: [
    { title: "Set the possession triangle", explanation: "Three attackers occupy separate sides around the central defender.", coachCue: "Three sides, three clear pictures.", playerAction: "Attackers spread; defender scans the ball and nearest options.", ballAction: "The ball starts with A1 inside the box.", arrow: [{ x: 0.28, y: 0.39 }, { x: 0.28, y: 0.39 }], arrowColor: "#00000000" },
    { title: "Circulate to move pressure", explanation: "A1 passes into A2 as A3 adjusts behind the defender's pressure.", coachCue: "Move the defender before you beat the defender.", playerAction: "A2 opens; A3 slides into a new support lane.", ballAction: "The ball travels to the central support.", moves: { "t31-ball": { x: 0.39, y: 0.49 }, "t31-a3": { x: 0.3, y: 0.65 }, "t31-d1": { x: 0.44, y: 0.48 } }, arrow: [{ x: 0.28, y: 0.39 }, { x: 0.39, y: 0.49 }] },
    { title: "Defender wins and faces forward", explanation: "The defender anticipates the next pass, intercepts, and turns toward the mini-goal.", coachCue: "Win it forward.", playerAction: "D steps across the lane; attackers recognize the loss immediately.", ballAction: "The intercepted ball is taken out of the defender's feet toward goal.", moves: { "t31-d1": { x: 0.43, y: 0.5 }, "t31-ball": { x: 0.46, y: 0.5 }, "t31-a2": { x: 0.38, y: 0.52 } }, arrow: [{ x: 0.39, y: 0.49 }, { x: 0.46, y: 0.5 }], arrowColor: DEFEND },
    { title: "Counterattack and counterpress", explanation: "D drives toward goal while the nearest former attacker pressures and the others recover centrally.", coachCue: "New attacker forward; nearest defender now.", playerAction: "D accelerates; A2 presses from behind; A1 and A3 recover inside.", ballAction: "The ball is carried quickly toward the mini-goal.", moves: { "t31-d1": { x: 0.65, y: 0.5 }, "t31-ball": { x: 0.68, y: 0.5 }, "t31-a1": { x: 0.53, y: 0.4 }, "t31-a2": { x: 0.56, y: 0.52 }, "t31-a3": { x: 0.53, y: 0.6 } }, arrow: [{ x: 0.46, y: 0.5 }, { x: 0.68, y: 0.5 }] },
    { title: "Finish the transition", explanation: "The new attacker shoots if the route stays open or protects the ball from the recovery.", coachCue: "Finish early if the picture is clear.", playerAction: "D completes the attack; recovering players block the direct lane.", ballAction: "The ball is played toward the mini-goal.", moves: { "t31-d1": { x: 0.79, y: 0.5 }, "t31-ball": { x: 0.86, y: 0.5 }, "t31-a2": { x: 0.71, y: 0.52 } }, arrow: [{ x: 0.68, y: 0.5 }, { x: 0.86, y: 0.5 }] },
    { title: "Rotate and restart", explanation: "The finishing action ends, the interceptor joins the outside three, and a new defender enters.", coachCue: "Ball ready, triangle ready, defender ready.", playerAction: "Recover the ball, exchange roles, and restore the starting triangle.", ballAction: "A spare ball returns to A1 for the next repetition.", moves: { "t31-ball": { x: 0.28, y: 0.39 } }, arrow: [{ x: 0.86, y: 0.5 }, { x: 0.28, y: 0.39 }], arrowColor: MOVE },
  ],
});

const twoVOne = drillPreset({
  id: "drill-2v1-to-goal",
  title: "2v1 to Goal",
  shortDescription: "Two attackers commit one defender, read pass versus dribble, finish, and transition into the next repetition.",
  playerCount: 3,
  goalkeeperCount: 1,
  ageGuidance: "U9+; use a passive defender before making the decision live.",
  difficulty: "foundation",
  estimatedMinutes: 14,
  fieldArea: "third",
  fieldView: "offensive",
  objectives: ["Attack the defender with the ball.", "Maintain useful support separation.", "Pass only when the defender commits.", "Finish efficiently and react to a defensive win."],
  setupInstructions: ["Use one goal with a goalkeeper and mark a starting line 25 yards out.", "Place two attackers eight yards apart with one defender between them and goal.", "Serve to the central ball carrier and keep spare balls at the start.", "Define the end as a shot, defender win, goalkeeper claim, or ball out."],
  howItWorks: ["The ball carrier drives directly at the defender.", "The second attacker advances in a separate lane and stays level or slightly ahead.", "If the defender engages, pass; if the defender protects the pass, dribble.", "Finish quickly, then recover the ball and rotate attacker, defender, and server roles."],
  coachingPoints: ["Drive at the defender's front foot.", "Support wide enough to separate but close enough to receive.", "Delay the pass until commitment is clear.", "After the defender wins, react immediately to prevent a counter."],
  commonMistakes: [mistake("Ball carrier passes too early.", "Take another forward touch to make the defender choose."), mistake("Support runs too close.", "Hold a separate lane and stay outside the defender's reach."), mistake("Attackers slow after creating the advantage.", "Use the next action within two touches.")],
  progressions: [variation("Recovering defender", "Release a second defender from behind the play."), variation("Six-second finish", "Complete the attack within six seconds of the serve.")],
  regressions: [variation("Passive defender", "Defender screens but does not tackle."), variation("No goalkeeper", "Finish into a mini-goal to simplify the final action.")],
  equipment: { balls: 4, cones: 2, goals: 1, pinnies: 1 },
  tags: ["2v1", "finishing", "decision making", "attacking", "transition"],
  objects: [
    zone("21-area", 0.4, 0.18, 0.96, 0.82, "#3b82f622"), player("21-gk", "away", 0.93, 0.5, "GK"), player("21-a1", "home", 0.47, 0.4, "1"), player("21-a2", "home", 0.47, 0.64, "2"), player("21-d1", "away", 0.68, 0.5, "D"), ball("21-ball", 0.5, 0.41), areaLabel("21-label", 0.7, 0.11, "2v1 to goal"),
  ],
  lesson: [
    { title: "Start with separation", explanation: "Two attackers begin in different lanes with the defender between them and goal.", coachCue: "Two lanes—make one defender defend both.", playerAction: "A1 receives forward; A2 stays wide and ready.", ballAction: "The serve arrives at A1's front foot.", arrow: [{ x: 0.5, y: 0.41 }, { x: 0.53, y: 0.42 }] },
    { title: "Drive to commit", explanation: "A1 attacks the defender rather than drifting into the support lane.", coachCue: "Go at the defender's front foot.", playerAction: "A1 drives centrally; A2 advances with separation.", ballAction: "The ball moves forward under A1's control.", moves: { "21-a1": { x: 0.59, y: 0.44 }, "21-ball": { x: 0.62, y: 0.45 }, "21-a2": { x: 0.59, y: 0.65 }, "21-d1": { x: 0.67, y: 0.48 } }, arrow: [{ x: 0.5, y: 0.41 }, { x: 0.62, y: 0.45 }] },
    { title: "Read pass or dribble", explanation: "A1 reads whether D steps to the ball or protects A2.", coachCue: "Defender comes: pass. Defender stays: go.", playerAction: "A1 delays the choice; A2 remains visible beyond D.", ballAction: "The ball stays protected at the decision point.", moves: { "21-a1": { x: 0.63, y: 0.46 }, "21-ball": { x: 0.65, y: 0.47 }, "21-a2": { x: 0.66, y: 0.64 }, "21-d1": { x: 0.66, y: 0.49 } }, arrow: [{ x: 0.65, y: 0.47 }, { x: 0.69, y: 0.61 }] },
    { title: "Exploit the free lane", explanation: "Once D commits, A1 releases A2 into space and continues as a rebound option.", coachCue: "Commit, release, keep running.", playerAction: "A2 receives toward goal; A1 follows beneath the ball.", ballAction: "The pass travels around D into A2's path.", moves: { "21-a1": { x: 0.7, y: 0.48 }, "21-a2": { x: 0.74, y: 0.61 }, "21-ball": { x: 0.77, y: 0.59 }, "21-d1": { x: 0.7, y: 0.5 } }, arrow: [{ x: 0.65, y: 0.47 }, { x: 0.77, y: 0.59 }] },
    { title: "Finish efficiently", explanation: "A2 looks up, selects the open part of goal, and finishes before recovery.", coachCue: "Picture, plant, finish.", playerAction: "A2 finishes; A1 attacks a rebound; D recovers between ball and goal.", ballAction: "The shot travels toward the open side of goal.", moves: { "21-a1": { x: 0.79, y: 0.47 }, "21-a2": { x: 0.82, y: 0.57 }, "21-d1": { x: 0.79, y: 0.51 }, "21-ball": { x: 0.91, y: 0.52 }, "21-gk": { x: 0.93, y: 0.48 } }, arrow: [{ x: 0.8, y: 0.57 }, { x: 0.91, y: 0.52 }] },
    { title: "Transition and rotate", explanation: "If D wins, D can carry over the start line; otherwise players retrieve and rotate roles.", coachCue: "Play is live both ways, then rotate fast.", playerAction: "React to the result, collect the ball, and move to the next role.", ballAction: "The ball returns to the starting server for the next repetition.", moves: { "21-ball": { x: 0.5, y: 0.41 } }, arrow: [{ x: 0.91, y: 0.52 }, { x: 0.5, y: 0.41 }], arrowColor: MOVE },
  ],
});

const threeVTwo = drillPreset({
  id: "drill-3v2-to-goal",
  title: "3v2 to Goal",
  shortDescription: "Three attackers use width, a central option, and quick decisions against two delaying defenders.",
  playerCount: 5,
  goalkeeperCount: 1,
  ageGuidance: "U10+; begin with fixed attacking lanes to clarify spacing.",
  difficulty: "developing",
  estimatedMinutes: 16,
  fieldArea: "third",
  fieldView: "offensive",
  objectives: ["Advance in three separate lanes.", "Move defenders to create the free player.", "Penetrate at the right moment.", "Delay and protect central space when defending."],
  setupInstructions: ["Mark a 30-by-25-yard channel into one goal.", "Start three attackers across the width against two defenders and a goalkeeper.", "Serve centrally so all three attacking options are available.", "Place a counter line behind the attackers for defenders who win possession."],
  howItWorks: ["Three attackers advance in left, center, and right lanes.", "The ball carrier engages one defender while teammates stay available on both sides.", "Attackers pass or dribble through the opening; defenders delay and protect the center.", "The phase ends with a finish or defensive counter, followed by a quick role reset."],
  coachingPoints: ["Keep width without getting disconnected.", "Fix one defender before releasing the free player.", "The central attacker can support behind or run beyond—do not stand beside the ball.", "Defenders stay staggered and delay until support recovers."],
  commonMistakes: [mistake("Attackers converge on the ball.", "Restore three lanes and make defenders cover the full width."), mistake("The ball carrier forces forward play.", "Use the supporting player behind the ball and attack again."), mistake("Defenders become flat.", "One engages while the second protects behind and inside.")],
  progressions: [variation("Recovering defender", "Add a third defender chasing from the start line."), variation("Timed attack", "Require a shot within eight seconds.")],
  regressions: [variation("Passive first line", "Defenders delay without tackling until the final third."), variation("Wider channel", "Increase width to make the free player easier to identify.")],
  equipment: { balls: 4, cones: 4, goals: 1, pinnies: 2 },
  tags: ["3v2", "finishing", "overload", "delay", "decision making"],
  objects: [
    zone("32-area", 0.36, 0.14, 0.96, 0.86, "#3b82f622"), player("32-gk", "away", 0.93, 0.5, "GK"), player("32-a1", "home", 0.43, 0.3, "1"), player("32-a2", "home", 0.43, 0.5, "2"), player("32-a3", "home", 0.43, 0.7, "3"), player("32-d1", "away", 0.67, 0.4, "D1"), player("32-d2", "away", 0.67, 0.6, "D2"), ball("32-ball", 0.46, 0.5), areaLabel("32-label", 0.68, 0.09, "3v2 to goal"),
  ],
  lesson: [
    { title: "Occupy three lanes", explanation: "Attackers begin wide-left, central, and wide-right while defenders protect the middle.", coachCue: "Three lanes; one connected unit.", playerAction: "Attackers spread and face forward; defenders start staggered.", ballAction: "The central attacker controls the serve.", arrow: [{ x: 0.46, y: 0.5 }, { x: 0.46, y: 0.5 }], arrowColor: "#00000000" },
    { title: "Advance under control", explanation: "A2 carries forward as wide players move level and stay outside defenders.", coachCue: "Speed with control—keep both sides alive.", playerAction: "A2 advances; A1 and A3 stretch the pair.", ballAction: "The ball is carried centrally toward the defensive line.", moves: { "32-a1": { x: 0.56, y: 0.28 }, "32-a2": { x: 0.54, y: 0.5 }, "32-a3": { x: 0.56, y: 0.72 }, "32-ball": { x: 0.57, y: 0.5 } }, arrow: [{ x: 0.46, y: 0.5 }, { x: 0.57, y: 0.5 }] },
    { title: "Fix the first defender", explanation: "A2 drives at D1, forcing the defenders to narrow and expose a wide lane.", coachCue: "Commit one before finding one.", playerAction: "A2 attacks D1; A1 stays wide and A3 holds the far lane.", ballAction: "The ball reaches the decision point under A2's control.", moves: { "32-a1": { x: 0.63, y: 0.27 }, "32-a2": { x: 0.61, y: 0.47 }, "32-a3": { x: 0.63, y: 0.71 }, "32-d1": { x: 0.66, y: 0.45 }, "32-d2": { x: 0.7, y: 0.58 }, "32-ball": { x: 0.64, y: 0.47 } }, arrow: [{ x: 0.57, y: 0.5 }, { x: 0.64, y: 0.47 }] },
    { title: "Find the free player", explanation: "With D1 committed, A2 releases A1 and moves to support the next action.", coachCue: "Play away from the second defender.", playerAction: "A1 receives forward; A2 supports; A3 attacks the far-post lane.", ballAction: "The pass enters the open left channel.", moves: { "32-a1": { x: 0.72, y: 0.31 }, "32-a2": { x: 0.67, y: 0.49 }, "32-a3": { x: 0.71, y: 0.68 }, "32-d1": { x: 0.7, y: 0.44 }, "32-d2": { x: 0.74, y: 0.57 }, "32-ball": { x: 0.74, y: 0.32 } }, arrow: [{ x: 0.64, y: 0.47 }, { x: 0.74, y: 0.32 }] },
    { title: "Finish or combine", explanation: "A1 shoots if clear or squares to the best-positioned teammate.", coachCue: "Goal first; teammate second; recycle third.", playerAction: "A1 looks up; A2 and A3 arrive at different depths.", ballAction: "The selected final ball travels toward goal.", moves: { "32-a1": { x: 0.82, y: 0.36 }, "32-a2": { x: 0.76, y: 0.5 }, "32-a3": { x: 0.8, y: 0.64 }, "32-d1": { x: 0.8, y: 0.43 }, "32-d2": { x: 0.8, y: 0.57 }, "32-ball": { x: 0.91, y: 0.48 } }, arrow: [{ x: 0.81, y: 0.36 }, { x: 0.91, y: 0.48 }] },
    { title: "Transition after the outcome", explanation: "A defensive win becomes a counter over the start line, while attackers react to stop the first pass.", coachCue: "Finish, then react immediately.", playerAction: "Defenders break forward after a win; attackers recover through the middle.", ballAction: "The won ball travels away from goal toward the counter line.", moves: { "32-d1": { x: 0.62, y: 0.44 }, "32-d2": { x: 0.6, y: 0.57 }, "32-ball": { x: 0.58, y: 0.5 } }, arrow: [{ x: 0.91, y: 0.48 }, { x: 0.58, y: 0.5 }], arrowColor: DEFEND },
    { title: "Rotate and reset the overload", explanation: "Players leave the field, rotate attacking and defending roles, and the coach serves the next central ball.", coachCue: "Three lanes, two defenders, next ball ready.", playerAction: "The next group restores three attacking lanes and a staggered defensive pair.", ballAction: "A fresh ball returns to the central starting point.", moves: { "32-ball": { x: 0.46, y: 0.5 } }, arrow: [{ x: 0.58, y: 0.5 }, { x: 0.46, y: 0.5 }], arrowColor: MOVE },
  ],
});

const fourGoalGame = drillPreset({
  id: "drill-four-goal-directional",
  title: "Four-Goal Directional Game",
  shortDescription: "A directional game that teaches players to scan two goals and switch when one side is blocked.",
  playerCount: 6,
  ageGuidance: "U10+; use 3v3 first and expand to 5v5 as decisions improve.",
  difficulty: "developing",
  estimatedMinutes: 18,
  fieldArea: "half",
  objectives: ["Scan both goals before receiving.", "Draw pressure to one side and switch.", "Support behind and beyond the ball.", "Defend both goals as a compact unit."],
  setupInstructions: ["Mark a 30-by-25-yard field.", "Put two mini-goals on each end line, near the corners.", "Organize 3v3 and clearly identify which pair each team attacks.", "Keep spare balls at halfway for immediate restarts after goals or outs."],
  howItWorks: ["Teams attack either of their two assigned mini-goals.", "The ball-side goal may draw defenders and open the weak-side goal.", "Players retain and switch rather than forcing a blocked route.", "After a score, turnover, or out, teams change roles and restart quickly."],
  coachingPoints: ["Check both targets before the first touch.", "Use a supporting pass to change the point of attack.", "Far-side players stay wide enough to threaten the second goal.", "Defenders shift together and protect the central route between goals."],
  commonMistakes: [mistake("Players attack the nearest goal every time.", "Require the receiver to name both goal options before play resumes."), mistake("The switch pass travels square under pressure.", "Use a supporting player behind the ball to create a safer angle."), mistake("Defenders guard goals individually.", "Keep the unit compact and shift together toward the ball.")],
  progressions: [variation("Alternate target", "A team cannot score in the same goal twice in succession."), variation("Neutral connector", "Add one neutral who plays with possession.")],
  regressions: [variation("Larger field", "Increase width to make the weak-side goal easier to see."), variation("Free restart", "Allow the restarting team one unopposed pass.")],
  equipment: { balls: 3, cones: 8, pinnies: 3, miniGoals: 4 },
  tags: ["small-sided", "scanning", "switching", "four goals", "directional"],
  objects: [
    zone("fg-field", 0.16, 0.18, 0.84, 0.82), miniGoal("fg-mg1", 0.18, 0.3, 270), miniGoal("fg-mg2", 0.18, 0.7, 270), miniGoal("fg-mg3", 0.82, 0.3, 90), miniGoal("fg-mg4", 0.82, 0.7, 90),
    player("fg-h1", "home", 0.36, 0.32, "1"), player("fg-h2", "home", 0.4, 0.5, "2"), player("fg-h3", "home", 0.36, 0.68, "3"), player("fg-a1", "away", 0.64, 0.32, "1"), player("fg-a2", "away", 0.6, 0.5, "2"), player("fg-a3", "away", 0.64, 0.68, "3"), ball("fg-ball", 0.43, 0.5), areaLabel("fg-label", 0.5, 0.1, "Four-goal directional game"),
  ],
  lesson: [
    { title: "Identify both targets", explanation: "Home attacks the two right goals while away protects them and prepares to counter left.", coachCue: "Two goals—see both before we start.", playerAction: "Teams spread into three lanes and scan both target goals.", ballAction: "The ball starts centrally with H2.", arrow: [{ x: 0.43, y: 0.5 }, { x: 0.79, y: 0.3 }] },
    { title: "Attack the available side", explanation: "H2 carries toward the upper target while H1 provides width and H3 supports behind.", coachCue: "Show one goal to move the defense.", playerAction: "Home advances with width; away shifts toward the upper goal.", ballAction: "The ball moves into the upper channel.", moves: { "fg-h1": { x: 0.48, y: 0.28 }, "fg-h2": { x: 0.5, y: 0.42 }, "fg-h3": { x: 0.44, y: 0.62 }, "fg-a1": { x: 0.59, y: 0.3 }, "fg-a2": { x: 0.57, y: 0.44 }, "fg-a3": { x: 0.61, y: 0.58 }, "fg-ball": { x: 0.52, y: 0.4 } }, arrow: [{ x: 0.43, y: 0.5 }, { x: 0.52, y: 0.4 }] },
    { title: "Recognize the block", explanation: "Away closes the upper goal, so H2 protects the ball and sees the lower target open.", coachCue: "Blocked is information, not failure.", playerAction: "H2 turns away from pressure; H3 widens toward the lower goal.", ballAction: "The ball is retained rather than forced through traffic.", moves: { "fg-h2": { x: 0.52, y: 0.44 }, "fg-h3": { x: 0.5, y: 0.68 }, "fg-a1": { x: 0.61, y: 0.32 }, "fg-a2": { x: 0.58, y: 0.42 }, "fg-ball": { x: 0.53, y: 0.45 } }, arrow: [{ x: 0.53, y: 0.45 }, { x: 0.5, y: 0.68 }], arrowColor: MOVE },
    { title: "Switch to the weak side", explanation: "H2 uses support to move the ball to H3 before defenders can shift.", coachCue: "Out of pressure, across with pace.", playerAction: "H3 receives facing the lower goal; H1 balances the far side.", ballAction: "The ball switches diagonally into the lower channel.", moves: { "fg-h1": { x: 0.56, y: 0.34 }, "fg-h2": { x: 0.55, y: 0.5 }, "fg-h3": { x: 0.6, y: 0.67 }, "fg-a1": { x: 0.64, y: 0.35 }, "fg-a2": { x: 0.63, y: 0.48 }, "fg-a3": { x: 0.68, y: 0.62 }, "fg-ball": { x: 0.62, y: 0.66 } }, arrow: [{ x: 0.53, y: 0.45 }, { x: 0.62, y: 0.66 }] },
    { title: "Score in the open goal", explanation: "H3 attacks the lower mini-goal while teammates secure rebound and counterpress positions.", coachCue: "Open goal—finish the action.", playerAction: "H3 passes into goal; H1 and H2 stay connected behind.", ballAction: "The ball travels into the lower right mini-goal.", moves: { "fg-h3": { x: 0.72, y: 0.68 }, "fg-ball": { x: 0.8, y: 0.7 }, "fg-a3": { x: 0.72, y: 0.62 } }, arrow: [{ x: 0.62, y: 0.66 }, { x: 0.8, y: 0.7 }] },
    { title: "Transition and restart", explanation: "Away becomes the attacking team toward the left goals and restarts before home can switch off.", coachCue: "Goal or turnover—new direction now.", playerAction: "Both teams reverse roles, recover shape, and communicate the new targets.", ballAction: "A spare ball restarts centrally for away.", moves: { "fg-ball": { x: 0.57, y: 0.5 } }, arrow: [{ x: 0.57, y: 0.5 }, { x: 0.2, y: 0.3 }], arrowColor: DEFEND },
  ],
});

const endZoneGame = drillPreset({
  id: "drill-end-zone-possession",
  title: "End-Zone Possession Game",
  shortDescription: "Teams create width, time penetrating runs, and score by receiving a controlled pass in an end zone.",
  playerCount: 6,
  ageGuidance: "U10+; enlarge end zones and favor attackers for early success.",
  difficulty: "developing",
  estimatedMinutes: 16,
  fieldArea: "half",
  objectives: ["Create width before penetration.", "Time runs rather than waiting in the end zone.", "Recognize when to retain possession.", "Recover compactly after losing the ball."],
  setupInstructions: ["Mark a 35-by-25-yard field with a five-yard end zone at each end.", "Organize two teams of three and assign attacking direction.", "A point requires a teammate to receive a pass under control inside the target end zone.", "Keep spare balls on the sides and restart from the team entitled to possession."],
  howItWorks: ["The team in possession spreads and circulates to create a forward lane.", "A runner enters the end zone only when the passer can play forward.", "If penetration is blocked, the team recycles and rebuilds width.", "After a score or turnover, direction changes immediately and the next phase begins."],
  coachingPoints: ["Arrive in the zone; do not stand there.", "The passer's head-up moment triggers the run.", "Use support behind the ball when forward play is closed.", "On loss, recover centrally before marking wide space."],
  commonMistakes: [mistake("An attacker waits permanently in the end zone.", "Start outside and time the run as the passer looks forward."), mistake("Players force the penetrating pass.", "Recycle through support and recreate width."), mistake("The receiving touch exits the zone.", "Arrive under control and cushion the ball into the scoring area.")],
  progressions: [variation("Minimum circulation", "Complete four passes before a scoring attempt."), variation("One-touch score", "The end-zone receiver sets the ball first time to a supporting teammate.")],
  regressions: [variation("Deeper end zones", "Increase each scoring zone by two yards."), variation("Attacking neutral", "Add one neutral to the team in possession.")],
  equipment: { balls: 3, cones: 8, pinnies: 3 },
  tags: ["possession", "penetration", "end zone", "timing", "transition"],
  objects: [
    zone("ez-field", 0.12, 0.2, 0.88, 0.8), zone("ez-left", 0.12, 0.2, 0.26, 0.8, "#f59e0b30"), zone("ez-right", 0.74, 0.2, 0.88, 0.8, "#f59e0b30"),
    cone("ez-c1", 0.12, 0.2), cone("ez-c2", 0.88, 0.2), cone("ez-c3", 0.12, 0.8), cone("ez-c4", 0.88, 0.8), player("ez-h1", "home", 0.35, 0.34, "1"), player("ez-h2", "home", 0.4, 0.5, "2"), player("ez-h3", "home", 0.35, 0.66, "3"), player("ez-a1", "away", 0.65, 0.34, "1"), player("ez-a2", "away", 0.6, 0.5, "2"), player("ez-a3", "away", 0.65, 0.66, "3"), ball("ez-ball", 0.43, 0.5), areaLabel("ez-label", 0.5, 0.12, "End-zone possession"),
  ],
  lesson: [
    { title: "Set width outside the zone", explanation: "Home begins in three lanes and no player waits in the target end zone.", coachCue: "Stretch first; arrive later.", playerAction: "Home spreads, away stays compact, and everyone checks direction.", ballAction: "The ball starts with H2 in central support.", arrow: [{ x: 0.43, y: 0.5 }, { x: 0.43, y: 0.5 }], arrowColor: "#00000000" },
    { title: "Circulate to open forward play", explanation: "Home moves the ball wide to shift away and expose a lane beyond them.", coachCue: "Move them side to side before going through.", playerAction: "H1 receives wide; H2 supports; H3 holds the far lane.", ballAction: "The ball travels from H2 to H1.", moves: { "ez-h1": { x: 0.47, y: 0.3 }, "ez-h2": { x: 0.45, y: 0.5 }, "ez-h3": { x: 0.4, y: 0.68 }, "ez-a1": { x: 0.57, y: 0.34 }, "ez-a2": { x: 0.58, y: 0.48 }, "ez-ball": { x: 0.48, y: 0.31 } }, arrow: [{ x: 0.43, y: 0.5 }, { x: 0.48, y: 0.31 }] },
    { title: "Time the penetrating run", explanation: "As H1 looks up, H3 accelerates from outside into the end zone.", coachCue: "Head up is the runner's trigger.", playerAction: "H3 changes speed and enters beyond the defensive line.", ballAction: "H1 holds the ball until the run is onside and visible.", moves: { "ez-h3": { x: 0.7, y: 0.66 }, "ez-a3": { x: 0.66, y: 0.62 }, "ez-ball": { x: 0.49, y: 0.31 } }, arrow: [{ x: 0.4, y: 0.68 }, { x: 0.76, y: 0.66 }], arrowColor: MOVE },
    { title: "Complete the scoring pass", explanation: "H1 plays into H3's path so the receiver controls inside the end zone.", coachCue: "Lead the run, then secure the touch.", playerAction: "H3 receives on the move; H2 supports for a return pass.", ballAction: "The pass enters the right end zone and stays there under control.", moves: { "ez-h3": { x: 0.78, y: 0.64 }, "ez-h2": { x: 0.6, y: 0.5 }, "ez-ball": { x: 0.77, y: 0.64 }, "ez-a3": { x: 0.7, y: 0.61 } }, arrow: [{ x: 0.49, y: 0.31 }, { x: 0.77, y: 0.64 }] },
    { title: "Reverse direction", explanation: "After the point, away receives immediately and attacks the opposite end zone.", coachCue: "Score, release, recover through the middle.", playerAction: "Home recovers centrally while away spreads to counter left.", ballAction: "The scored ball is released to away for the restart.", moves: { "ez-ball": { x: 0.61, y: 0.5 }, "ez-h1": { x: 0.55, y: 0.38 }, "ez-h2": { x: 0.56, y: 0.5 }, "ez-h3": { x: 0.57, y: 0.62 } }, arrow: [{ x: 0.61, y: 0.5 }, { x: 0.2, y: 0.5 }], arrowColor: DEFEND },
    { title: "Reset outside the end zones", explanation: "Before the next possession settles, all attackers leave the scoring zone and rebuild width in the main field.", coachCue: "Arrive to score; leave to play again.", playerAction: "Away spreads outside the left zone while home resets a compact defensive shape.", ballAction: "The ball is secured in the central area before the next forward run.", moves: { "ez-a1": { x: 0.45, y: 0.32 }, "ez-a2": { x: 0.4, y: 0.5 }, "ez-a3": { x: 0.45, y: 0.68 }, "ez-ball": { x: 0.43, y: 0.5 } }, arrow: [{ x: 0.61, y: 0.5 }, { x: 0.43, y: 0.5 }], arrowColor: MOVE },
  ],
});

const fourVFourNeutral = drillPreset({
  id: "drill-4v4-plus-neutrals",
  title: "4v4 Plus Neutral Players",
  shortDescription: "A guided overload game where neutrals connect possession and both teams transition immediately.",
  playerCount: 10,
  ageGuidance: "U11+; begin with two unrestricted outside neutrals.",
  difficulty: "developing",
  estimatedMinutes: 18,
  fieldArea: "half",
  objectives: ["Use neutrals to create a 6v4 overload.", "Play through pressure with simple combinations.", "Change roles immediately after a turnover.", "Keep supporting angles around the neutrals."],
  setupInstructions: ["Mark a 35-by-25-yard field with one mini-goal at each end.", "Organize 4v4 inside and place one neutral on each touchline.", "Neutrals play with the team in possession and cannot be tackled outside the boundary.", "Keep spare balls beside both neutrals to preserve game flow."],
  howItWorks: ["The possession team uses either neutral to create an overload.", "Players combine through pressure and attack their assigned mini-goal.", "On turnover, neutrals immediately support the new team in possession.", "Former attackers counterpress or recover goal-side, then the game continues."],
  coachingPoints: ["Find the neutral before pressure closes.", "After playing to a neutral, move to receive the next pass.", "Neutrals scan inside before the ball arrives.", "Nearest two react on loss while teammates recover centrally."],
  commonMistakes: [mistake("Players pass to a neutral and stand.", "Follow with a supporting angle for the return or third-player pass."), mistake("Neutrals force the ball back into pressure.", "Switch through the other neutral or play to a free supporting player."), mistake("Teams are slow to change roles.", "Use a clear turnover call and demand the first three recovery steps.")],
  progressions: [variation("One central neutral", "Move one neutral inside and remove the second."), variation("Neutral touch limit", "Give neutrals one or two touches.")],
  regressions: [variation("Possession only", "Remove goals and score with six consecutive passes."), variation("Larger field", "Add width so neutral connections are easier.")],
  equipment: { balls: 3, cones: 8, pinnies: 6, miniGoals: 2 },
  tags: ["4v4", "neutrals", "overload", "transition", "combination play"],
  objects: [
    zone("44n-field", 0.16, 0.2, 0.84, 0.8), miniGoal("44n-mg1", 0.18, 0.5, 270), miniGoal("44n-mg2", 0.82, 0.5, 90),
    player("44n-h1", "home", 0.34, 0.3, "1"), player("44n-h2", "home", 0.35, 0.46, "2"), player("44n-h3", "home", 0.34, 0.66, "3"), player("44n-h4", "home", 0.46, 0.54, "4"), player("44n-a1", "away", 0.66, 0.3, "1"), player("44n-a2", "away", 0.65, 0.46, "2"), player("44n-a3", "away", 0.66, 0.66, "3"), player("44n-a4", "away", 0.54, 0.54, "4"),
    player("44n-n1", "home", 0.5, 0.18, "N", "#a78bfa"), player("44n-n2", "home", 0.5, 0.82, "N", "#a78bfa"), ball("44n-ball", 0.39, 0.46), areaLabel("44n-label", 0.5, 0.1, "4v4 + neutrals"),
  ],
  lesson: [
    { title: "Locate both neutrals", explanation: "Home starts in possession and can use either touchline neutral to form a 6v4.", coachCue: "See both helpers before choosing one.", playerAction: "Home spreads; neutrals open to the field; away stays compact.", ballAction: "The ball starts with H2.", arrow: [{ x: 0.39, y: 0.46 }, { x: 0.5, y: 0.2 }] },
    { title: "Connect out of pressure", explanation: "H2 uses the upper neutral as away closes the central lane.", coachCue: "Use the free player, then move again.", playerAction: "H2 passes and supports; N1 receives facing inside.", ballAction: "The ball travels to N1 outside pressure.", moves: { "44n-h2": { x: 0.44, y: 0.4 }, "44n-n1": { x: 0.52, y: 0.2 }, "44n-ball": { x: 0.52, y: 0.21 }, "44n-a2": { x: 0.53, y: 0.4 } }, arrow: [{ x: 0.39, y: 0.46 }, { x: 0.52, y: 0.21 }] },
    { title: "Use the third player", explanation: "N1 plays beyond the presser to H1, while H2's support keeps the return available.", coachCue: "Around one, beyond the next.", playerAction: "H1 receives forward; H4 runs into a finishing lane.", ballAction: "The neutral's pass enters the attacking half.", moves: { "44n-h1": { x: 0.59, y: 0.29 }, "44n-h2": { x: 0.51, y: 0.39 }, "44n-h4": { x: 0.65, y: 0.55 }, "44n-ball": { x: 0.6, y: 0.3 }, "44n-a1": { x: 0.64, y: 0.34 } }, arrow: [{ x: 0.52, y: 0.21 }, { x: 0.6, y: 0.3 }] },
    { title: "Attack the mini-goal", explanation: "Home combines toward goal while the far neutral remains available for a switch.", coachCue: "Goal if clear; opposite neutral if crowded.", playerAction: "H1 attacks; H4 supports; away recovers toward goal.", ballAction: "The ball moves into a finishing position.", moves: { "44n-h1": { x: 0.7, y: 0.35 }, "44n-h4": { x: 0.72, y: 0.56 }, "44n-a1": { x: 0.72, y: 0.4 }, "44n-a2": { x: 0.68, y: 0.49 }, "44n-ball": { x: 0.75, y: 0.43 } }, arrow: [{ x: 0.6, y: 0.3 }, { x: 0.79, y: 0.49 }] },
    { title: "Turnover changes the overload", explanation: "Away wins the ball, and both neutrals immediately become away's support players.", coachCue: "New color, new angles now.", playerAction: "Away spreads toward the left goal; home counterpresses or recovers.", ballAction: "The winner secures the ball and finds a neutral.", moves: { "44n-a2": { x: 0.61, y: 0.47 }, "44n-ball": { x: 0.59, y: 0.47 }, "44n-h2": { x: 0.55, y: 0.45 } }, arrow: [{ x: 0.75, y: 0.43 }, { x: 0.59, y: 0.47 }], arrowColor: DEFEND },
    { title: "Counter or recover", explanation: "Away attacks left through the available neutral while home protects the center and resets defensive shape.", coachCue: "First look forward; first recovery inside.", playerAction: "Away moves left at speed; home recovers between ball and goal.", ballAction: "The ball travels toward the left-side attack.", moves: { "44n-a1": { x: 0.48, y: 0.3 }, "44n-a2": { x: 0.46, y: 0.46 }, "44n-a3": { x: 0.5, y: 0.66 }, "44n-a4": { x: 0.4, y: 0.54 }, "44n-h1": { x: 0.43, y: 0.34 }, "44n-h2": { x: 0.42, y: 0.47 }, "44n-ball": { x: 0.42, y: 0.52 } }, arrow: [{ x: 0.59, y: 0.47 }, { x: 0.42, y: 0.52 }] },
  ],
});

const buildoutGame = drillPreset({
  id: "drill-buildout-directional",
  title: "Buildout Directional Game",
  shortDescription: "A guided directional game through thirds that teaches width, support, and the choice to progress or retain.",
  playerCount: 10,
  goalkeeperCount: 1,
  ageGuidance: "U11+; begin with fewer pressers and a free goalkeeper pass.",
  difficulty: "developing",
  estimatedMinutes: 20,
  fieldArea: "half",
  objectives: ["Create width and depth from the goalkeeper.", "Find the free player away from the first presser.", "Support beneath the ball before progressing.", "React immediately if possession is lost high."],
  setupInstructions: ["Mark a 50-by-35-yard field and divide it into build, midfield, and attacking thirds.", "Use a goalkeeper plus six building players against three pressers.", "Begin every repetition from the goalkeeper with the building team in realistic spread positions.", "Pressers score by winning and carrying into the build zone; builders score by controlled entry into the final third."],
  howItWorks: ["The goalkeeper starts while defenders create width and a midfielder offers depth.", "The first presser triggers pressure and teammates screen nearby options.", "Builders find the free player, support the next pass, and progress through midfield.", "A turnover creates an immediate counter; otherwise the group resets from the goalkeeper."],
  coachingPoints: ["Open the field before asking for the ball.", "The free player is often opposite the first presser.", "Play forward when the receiver can continue; retain when the picture is closed.", "After loss, protect the center and pressure the ball."],
  commonMistakes: [mistake("Deep players stand too narrow.", "Use the full build-zone width before the goalkeeper starts."), mistake("Midfielders hide behind pressers.", "Move laterally or drop beneath the ball to become visible."), mistake("Players force a pass into the next third.", "Recycle through the goalkeeper or opposite defender and rebuild.")],
  progressions: [variation("Extra presser", "Add a fourth opponent after consistent progression."), variation("Live final third", "Continue into a finishing action after controlled entry.")],
  regressions: [variation("Free first pass", "Pressers cannot engage until the goalkeeper's pass arrives."), variation("Larger build zone", "Increase depth to create more time for the first decision.")],
  equipment: { balls: 4, cones: 10, pinnies: 4, goals: 1 },
  tags: ["buildout", "possession", "pressing", "directional", "thirds"],
  objects: [
    zone("bo-def", 0.08, 0.2, 0.32, 0.8, "#3b82f628"), zone("bo-mid", 0.32, 0.2, 0.68, 0.8), zone("bo-att", 0.68, 0.2, 0.92, 0.8, "#f59e0b28"),
    player("bo-gk", "home", 0.11, 0.5, "GK"), player("bo-h1", "home", 0.22, 0.3, "2"), player("bo-h2", "home", 0.24, 0.5, "4"), player("bo-h3", "home", 0.22, 0.7, "5"), player("bo-h4", "home", 0.4, 0.28, "7"), player("bo-h5", "home", 0.4, 0.5, "6"), player("bo-h6", "home", 0.4, 0.72, "11"),
    player("bo-a1", "away", 0.48, 0.34, "9"), player("bo-a2", "away", 0.48, 0.56, "10"), player("bo-a3", "away", 0.58, 0.45, "8"), ball("bo-ball", 0.14, 0.5), areaLabel("bo-label", 0.5, 0.1, "Buildout through thirds"),
  ],
  lesson: [
    { title: "Open the build shape", explanation: "The goalkeeper has width from two defenders, central support, and higher options in separate lanes.", coachCue: "Make the field big before the ball moves.", playerAction: "Builders spread and scan pressure; pressers identify triggers.", ballAction: "The goalkeeper controls the starting ball.", arrow: [{ x: 0.14, y: 0.5 }, { x: 0.14, y: 0.5 }], arrowColor: "#00000000" },
    { title: "Invite the first presser", explanation: "The goalkeeper passes wide to H1 and A1 steps to press.", coachCue: "Draw one out to free another.", playerAction: "H1 opens to the field; H2 supports inside; A1 presses on the pass.", ballAction: "The ball travels from goalkeeper to the wide defender.", moves: { "bo-h1": { x: 0.25, y: 0.3 }, "bo-h2": { x: 0.28, y: 0.48 }, "bo-a1": { x: 0.37, y: 0.34 }, "bo-ball": { x: 0.25, y: 0.31 } }, arrow: [{ x: 0.14, y: 0.5 }, { x: 0.25, y: 0.31 }] },
    { title: "Find the free player", explanation: "H1 scans inside and away from A1, where H5 has moved off A3's cover shadow.", coachCue: "Look beyond the first pressure.", playerAction: "H5 shifts into view; H3 holds opposite width; H1 prepares the pass.", ballAction: "The ball is set outside H1's feet for a forward option.", moves: { "bo-h1": { x: 0.27, y: 0.32 }, "bo-h5": { x: 0.43, y: 0.57 }, "bo-a1": { x: 0.34, y: 0.34 }, "bo-a3": { x: 0.52, y: 0.46 }, "bo-ball": { x: 0.29, y: 0.33 } }, arrow: [{ x: 0.29, y: 0.33 }, { x: 0.43, y: 0.57 }] },
    { title: "Progress with support", explanation: "H1 finds H5, and H2 moves underneath so the receiver can play forward or recycle.", coachCue: "Forward pass, supporting run.", playerAction: "H5 receives side-on; H2 supports; H4 and H6 stretch the next line.", ballAction: "The ball enters midfield under control.", moves: { "bo-h1": { x: 0.31, y: 0.34 }, "bo-h2": { x: 0.37, y: 0.48 }, "bo-h4": { x: 0.53, y: 0.27 }, "bo-h5": { x: 0.49, y: 0.56 }, "bo-h6": { x: 0.53, y: 0.72 }, "bo-ball": { x: 0.48, y: 0.55 }, "bo-a2": { x: 0.53, y: 0.58 } }, arrow: [{ x: 0.29, y: 0.33 }, { x: 0.48, y: 0.55 }] },
    { title: "Recycle when forward play closes", explanation: "The pressing unit blocks H6, so H5 uses H2 underneath and the team changes the point of attack.", coachCue: "Closed picture—keep it and move them again.", playerAction: "H2 drops beneath the ball; H3 restores opposite width; H5 protects possession.", ballAction: "The ball travels backward into support instead of being forced forward.", moves: { "bo-h2": { x: 0.41, y: 0.49 }, "bo-h3": { x: 0.28, y: 0.7 }, "bo-h5": { x: 0.52, y: 0.55 }, "bo-h6": { x: 0.58, y: 0.7 }, "bo-ball": { x: 0.42, y: 0.5 }, "bo-a2": { x: 0.57, y: 0.57 }, "bo-a3": { x: 0.59, y: 0.46 } }, arrow: [{ x: 0.48, y: 0.55 }, { x: 0.42, y: 0.5 }], arrowColor: MOVE },
    { title: "Progress when the lane reopens", explanation: "After recycling shifts pressure, H2 finds H6 in the newly opened wide lane into the final third.", coachCue: "Move them, see it, then play forward.", playerAction: "H6 advances with width while H4 and H5 support beneath and inside.", ballAction: "The ball is played with pace into the final-third entry.", moves: { "bo-h2": { x: 0.44, y: 0.49 }, "bo-h4": { x: 0.56, y: 0.27 }, "bo-h5": { x: 0.57, y: 0.53 }, "bo-h6": { x: 0.7, y: 0.68 }, "bo-ball": { x: 0.69, y: 0.67 }, "bo-a2": { x: 0.6, y: 0.56 }, "bo-a3": { x: 0.62, y: 0.44 } }, arrow: [{ x: 0.42, y: 0.5 }, { x: 0.69, y: 0.67 }] },
    { title: "Transition or restart", explanation: "Controlled entry scores; a pressing win becomes a direct counter into the build zone.", coachCue: "End the action, react, rebuild quickly.", playerAction: "Both teams react to the outcome and restore their starting organization.", ballAction: "A new ball returns to the goalkeeper for the next guided repetition.", moves: { "bo-ball": { x: 0.14, y: 0.5 } }, arrow: [{ x: 0.69, y: 0.67 }, { x: 0.14, y: 0.5 }], arrowColor: MOVE },
  ],
});

const pressureCoverBalance = drillPreset({
  id: "drill-pressure-cover-balance",
  title: "Defensive Pressure-Cover-Balance Game",
  shortDescription: "Three defenders learn to assign pressure, cover, and balance as attackers circulate the ball.",
  playerCount: 6,
  ageGuidance: "U11+; freeze between passes until all three roles are understood.",
  difficulty: "developing",
  estimatedMinutes: 16,
  fieldArea: "third",
  objectives: ["Send the nearest defender to pressure.", "Provide angled cover behind the presser.", "Protect central and weak-side space with balance.", "Shift roles while the pass travels."],
  setupInstructions: ["Mark a 25-by-20-yard area and divide it visually into three vertical lanes.", "Place three attackers across one side and three defenders between them and the opposite line.", "Start the ball with a flank attacker so pressure, cover, and balance are easy to identify.", "Attackers score by carrying over the far line; defenders score by winning and finding the coach."],
  howItWorks: ["The nearest defender closes the ball with an angle that guides play.", "The second defender takes cover behind and inside; the third protects the weak side.", "As attackers pass across, defenders exchange roles while the ball travels.", "A win becomes a short counter; after the outcome, both units reset."],
  coachingPoints: ["Pressure arrives fast and finishes under control.", "Cover is close enough to help but not flat beside the presser.", "Balance protects the middle and sees the far attacker.", "The unit shifts on the pass, not after the receiver's touch."],
  commonMistakes: [mistake("The presser runs straight at the ball.", "Curve the approach to show play toward cover or the sideline."), mistake("Cover stands on the same line.", "Drop behind and inside to protect the space the presser leaves."), mistake("Balance follows too far toward the ball.", "Stay connected while preserving the central and far-side lane.")],
  progressions: [variation("Live penetration", "Allow attackers to dribble over the far line at any moment."), variation("Faster circulation", "Give attackers two touches to accelerate role exchanges.")],
  regressions: [variation("Freeze and name", "Pause after each pass and have defenders name their roles."), variation("Extra defender", "Add a fourth defender to support weak-side balance.")],
  equipment: { balls: 2, cones: 8, pinnies: 3 },
  tags: ["defending", "pressure", "cover", "balance", "unit movement"],
  objects: [
    zone("pcb-field", 0.18, 0.18, 0.82, 0.82, "#64748b22"),
    drawing("pcb-lane1", "line", [{ x: 0.4, y: 0.18 }, { x: 0.4, y: 0.82 }], "#94a3b866"), drawing("pcb-lane2", "line", [{ x: 0.6, y: 0.18 }, { x: 0.6, y: 0.82 }], "#94a3b866"),
    player("pcb-a1", "away", 0.27, 0.32, "A1"), player("pcb-a2", "away", 0.27, 0.5, "A2"), player("pcb-a3", "away", 0.27, 0.68, "A3"), player("pcb-d1", "home", 0.47, 0.35, "P"), player("pcb-d2", "home", 0.57, 0.49, "C"), player("pcb-d3", "home", 0.67, 0.62, "B"), ball("pcb-ball", 0.3, 0.32), areaLabel("pcb-label", 0.5, 0.1, "Pressure · Cover · Balance"),
  ],
  lesson: [
    { title: "Identify the three roles", explanation: "With A1 on the ball, D1 is pressure, D2 cover, and D3 weak-side balance.", coachCue: "Nearest presses; next covers; far player balances.", playerAction: "Defenders point and name roles before movement begins.", ballAction: "The ball remains with A1 on the flank.", arrow: [{ x: 0.47, y: 0.35 }, { x: 0.35, y: 0.33 }], arrowColor: DEFEND },
    { title: "Pressure with an angle", explanation: "D1 closes quickly, then curves the final steps to guide A1 toward the sideline.", coachCue: "Fast approach, slow arrival, show outside.", playerAction: "D1 bends the run; D2 tucks behind and inside.", ballAction: "A1 protects the ball and looks for A2.", moves: { "pcb-d1": { x: 0.36, y: 0.33 }, "pcb-d2": { x: 0.47, y: 0.42 }, "pcb-d3": { x: 0.59, y: 0.54 } }, arrow: [{ x: 0.47, y: 0.35 }, { x: 0.35, y: 0.33 }], arrowColor: DEFEND },
    { title: "Shift while the pass travels", explanation: "A1 passes to A2 and the unit moves before A2 receives.", coachCue: "Ball travels, whole line travels.", playerAction: "D2 becomes presser; D1 drops into cover; D3 narrows for balance.", ballAction: "The ball moves from the flank into the central attacker.", moves: { "pcb-a1": { x: 0.27, y: 0.35 }, "pcb-a2": { x: 0.29, y: 0.5 }, "pcb-ball": { x: 0.31, y: 0.5 }, "pcb-d1": { x: 0.43, y: 0.42 }, "pcb-d2": { x: 0.4, y: 0.49 }, "pcb-d3": { x: 0.53, y: 0.55 } }, arrow: [{ x: 0.3, y: 0.32 }, { x: 0.31, y: 0.5 }] },
    { title: "Exchange pressure and cover", explanation: "D2 presses A2 while D1 protects behind and D3 stays connected to the weak side.", coachCue: "New ball, new roles—stay staggered.", playerAction: "D2 closes; D1 drops; D3 sees ball and A3.", ballAction: "A2 controls centrally and considers the far-side pass.", moves: { "pcb-ball": { x: 0.31, y: 0.5 }, "pcb-d1": { x: 0.46, y: 0.44 }, "pcb-d2": { x: 0.36, y: 0.49 }, "pcb-d3": { x: 0.53, y: 0.57 } }, arrow: [{ x: 0.4, y: 0.49 }, { x: 0.34, y: 0.5 }], arrowColor: DEFEND },
    { title: "Protect the weak side", explanation: "As the ball goes to A3, D3 becomes pressure and the other two recover centrally behind.", coachCue: "Far player goes; the others protect inside.", playerAction: "D3 closes A3; D2 covers; D1 balances the central lane.", ballAction: "The ball travels into the far lane.", moves: { "pcb-a3": { x: 0.29, y: 0.68 }, "pcb-ball": { x: 0.31, y: 0.68 }, "pcb-d1": { x: 0.55, y: 0.42 }, "pcb-d2": { x: 0.46, y: 0.56 }, "pcb-d3": { x: 0.37, y: 0.66 } }, arrow: [{ x: 0.31, y: 0.5 }, { x: 0.31, y: 0.68 }] },
    { title: "Win, counter, and reset", explanation: "A compact unit can intercept, play forward to the coach, then restore the original roles.", coachCue: "Secure the win, find forward, reset together.", playerAction: "The winner controls; teammates spread for the counter; both units reset afterward.", ballAction: "The intercepted ball is carried forward, then replaced at A1.", moves: { "pcb-d3": { x: 0.33, y: 0.66 }, "pcb-ball": { x: 0.36, y: 0.64 } }, arrow: [{ x: 0.31, y: 0.68 }, { x: 0.43, y: 0.61 }], arrowColor: DEFEND },
  ],
});

const transitionFourGoals = drillPreset({
  id: "drill-transition-four-mini-goals",
  title: "Transition Game to Four Mini-Goals",
  shortDescription: "A guided multi-goal game built around recognizing a turnover, attacking open space, and recovering centrally.",
  playerCount: 6,
  ageGuidance: "U11+; pause briefly on early turnovers so teams can identify the new direction.",
  difficulty: "developing",
  estimatedMinutes: 18,
  fieldArea: "half",
  objectives: ["Recognize the direction change immediately.", "Attack an open mini-goal with the first actions.", "Recover through the middle after losing possession.", "Communicate the new target and defensive roles."],
  setupInstructions: ["Mark a 30-by-25-yard field with two mini-goals on each end line.", "Organize 3v3 and assign each team the two goals at one end.", "Start from the center and place spare balls on both touchlines.", "After every turnover, the new team attacks the opposite pair without a pause."],
  howItWorks: ["One team attacks either of its two goals while the opponent defends compactly.", "A turnover reverses direction instantly.", "The new attackers scan for the least-protected goal and spread.", "Former attackers recover centrally, defend the next action, then continue or restart."],
  coachingPoints: ["First look after winning is forward and away from traffic.", "Name the target goal so teammates run with the same picture.", "First recovery run protects the center, not the nearest sideline.", "Keep one player behind the attack to manage the next turnover."],
  commonMistakes: [mistake("The winner dribbles back into pressure.", "Take the first touch toward open space and lift the head."), mistake("All attackers run to one goal.", "Keep width so both mini-goals remain live."), mistake("Former attackers chase from behind.", "Recover through the center and get goal-side first.")],
  progressions: [variation("Six-second score", "A goal counts double within six seconds of a turnover."), variation("Different target", "A team cannot use the same goal twice in succession.")],
  regressions: [variation("Turnover freeze", "Pause for two seconds so players can point to goals and recovery lanes."), variation("Larger area", "Add width to make transition space easier to recognize.")],
  equipment: { balls: 4, cones: 4, pinnies: 3, miniGoals: 4 },
  tags: ["transition", "four mini-goals", "recovery", "recognition", "small-sided"],
  objects: [
    zone("tf-field", 0.18, 0.18, 0.82, 0.82), miniGoal("tf-mg1", 0.2, 0.3, 270), miniGoal("tf-mg2", 0.2, 0.7, 270), miniGoal("tf-mg3", 0.8, 0.3, 90), miniGoal("tf-mg4", 0.8, 0.7, 90),
    player("tf-h1", "home", 0.38, 0.33, "1"), player("tf-h2", "home", 0.4, 0.5, "2"), player("tf-h3", "home", 0.38, 0.67, "3"), player("tf-a1", "away", 0.62, 0.33, "1"), player("tf-a2", "away", 0.6, 0.5, "2"), player("tf-a3", "away", 0.62, 0.67, "3"), ball("tf-ball", 0.43, 0.5), areaLabel("tf-label", 0.5, 0.1, "Transition to four mini-goals"),
  ],
  lesson: [
    { title: "Attack with two targets", explanation: "Home attacks both right-side goals while H3 balances behind the ball.", coachCue: "Keep both goals alive.", playerAction: "H1 and H2 threaten separate targets; H3 supports the attack.", ballAction: "H2 carries toward the right side.", moves: { "tf-h1": { x: 0.53, y: 0.3 }, "tf-h2": { x: 0.51, y: 0.48 }, "tf-h3": { x: 0.45, y: 0.64 }, "tf-ball": { x: 0.54, y: 0.47 } }, arrow: [{ x: 0.43, y: 0.5 }, { x: 0.54, y: 0.47 }] },
    { title: "Turnover changes direction", explanation: "A2 intercepts and the attack instantly reverses toward the two left goals.", coachCue: "Ours—face the other way.", playerAction: "A2 secures and turns; away teammates spread; home recognizes the loss.", ballAction: "The intercepted ball is taken toward open left-side space.", moves: { "tf-a2": { x: 0.55, y: 0.49 }, "tf-ball": { x: 0.52, y: 0.5 }, "tf-h2": { x: 0.56, y: 0.48 } }, arrow: [{ x: 0.54, y: 0.47 }, { x: 0.52, y: 0.5 }], arrowColor: DEFEND },
    { title: "Scan for the open goal", explanation: "A2 sees home recover high, so the lower-left mini-goal is the clearer target.", coachCue: "Head up—name the open goal.", playerAction: "A3 widens toward the lower goal; A1 holds the upper option.", ballAction: "A2 carries diagonally away from the turnover pressure.", moves: { "tf-a1": { x: 0.47, y: 0.31 }, "tf-a2": { x: 0.46, y: 0.54 }, "tf-a3": { x: 0.45, y: 0.7 }, "tf-ball": { x: 0.43, y: 0.56 } }, arrow: [{ x: 0.52, y: 0.5 }, { x: 0.43, y: 0.56 }] },
    { title: "Recover through the middle", explanation: "Home's first runs protect the central route before stepping toward the ball.", coachCue: "Inside first, then pressure.", playerAction: "H2 recovers centrally; H1 and H3 get goal-side and compact.", ballAction: "Away keeps the ball moving toward the selected goal.", moves: { "tf-a2": { x: 0.41, y: 0.57 }, "tf-a3": { x: 0.34, y: 0.69 }, "tf-h1": { x: 0.43, y: 0.4 }, "tf-h2": { x: 0.45, y: 0.52 }, "tf-h3": { x: 0.43, y: 0.62 }, "tf-ball": { x: 0.36, y: 0.66 } }, arrow: [{ x: 0.56, y: 0.48 }, { x: 0.45, y: 0.52 }], arrowColor: MOVE },
    { title: "Exploit before recovery", explanation: "A3 attacks the lower goal before home can shift fully across.", coachCue: "Open target—finish the transition.", playerAction: "A3 passes into goal; A2 supports; A1 balances against another turnover.", ballAction: "The ball travels into the lower-left mini-goal.", moves: { "tf-a3": { x: 0.28, y: 0.7 }, "tf-a2": { x: 0.36, y: 0.57 }, "tf-ball": { x: 0.21, y: 0.7 }, "tf-h3": { x: 0.34, y: 0.64 } }, arrow: [{ x: 0.36, y: 0.66 }, { x: 0.21, y: 0.7 }] },
    { title: "Restart the next transition", explanation: "A spare ball enters centrally and both teams restore width without losing transition readiness.", coachCue: "Reset shape, but stay ready to change.", playerAction: "Teams return to connected starting positions and communicate direction.", ballAction: "The next ball starts near midfield.", moves: { "tf-ball": { x: 0.43, y: 0.5 } }, arrow: [{ x: 0.21, y: 0.7 }, { x: 0.43, y: 0.5 }], arrowColor: MOVE },
  ],
});

const cutbackFinish = drillPreset({
  id: "drill-finishing-cutback",
  title: "Finishing From a Cutback",
  shortDescription: "A wide player reaches the end line while two finishers arrive at staggered depths for a controlled cutback.",
  playerCount: 3,
  goalkeeperCount: 1,
  ageGuidance: "U11+; rehearse unopposed before adding a recovering defender.",
  difficulty: "developing",
  estimatedMinutes: 14,
  fieldArea: "third",
  fieldView: "offensive",
  objectives: ["Drive the wide ball to the end line.", "Scan before delivering.", "Arrive at different finishing depths.", "Finish first time or recycle when blocked."],
  setupInstructions: ["Use one goal and goalkeeper with a wide starting cone 25 yards from goal.", "Mark a cutback zone between the penalty spot and top of the six-yard area.", "Start one wide server and two finishers outside the box; add one defender after rehearsal.", "Keep balls at the wide cone and rotate server, near finisher, and deep finisher after each action."],
  howItWorks: ["The wide player drives toward the end line with the ball.", "Finishers delay, then arrive at near and deeper cutback spaces.", "The server looks up and plays backward away from the goalkeeper.", "The receiver finishes if clear or recycles; everyone exits and rotates."],
  coachingPoints: ["Server's final touch creates room to look up.", "Finishers arrive rather than wait in the box.", "Occupy different depths so one defender cannot cover both.", "Use a controlled finish and choose placement before power."],
  commonMistakes: [mistake("Finishers reach the box too early.", "Delay outside, then accelerate as the server approaches the end line."), mistake("Both finishers occupy the same depth.", "Assign one near cutback and one deeper edge-of-box lane."), mistake("The server crosses without looking.", "Take a final controlled touch, lift the head, and select the free runner.")],
  progressions: [variation("Recovering defender", "Release a defender as the wide player takes the first touch."), variation("Both flanks", "Mirror the action and require the opposite-foot delivery.")],
  regressions: [variation("No defender", "Rehearse timing and service unopposed."), variation("Settling touch", "Allow the finisher one touch to set before shooting.")],
  equipment: { balls: 6, cones: 4, goals: 1, pinnies: 1 },
  tags: ["finishing", "cutback", "wide play", "timing", "attacking"],
  objects: [
    zone("cb-box", 0.68, 0.22, 0.96, 0.78, "#3b82f622"), player("cb-gk", "away", 0.93, 0.5, "GK"), player("cb-w", "home", 0.68, 0.78, "7"), player("cb-f1", "home", 0.73, 0.4, "9"), player("cb-f2", "home", 0.7, 0.56, "10"), player("cb-d1", "away", 0.82, 0.48, "D"), ball("cb-ball", 0.7, 0.75), areaLabel("cb-label", 0.8, 0.13, "Cutback finish"),
  ],
  lesson: [
    { title: "Set delayed starting positions", explanation: "The server begins wide while both finishers stay outside their final spaces.", coachCue: "Wide player goes; finishers wait to arrive.", playerAction: "W opens forward; F1 and F2 scan the server, defender, and each other.", ballAction: "The ball starts under W's control near the touchline.", arrow: [{ x: 0.7, y: 0.75 }, { x: 0.7, y: 0.75 }], arrowColor: "#00000000" },
    { title: "Drive to the end line", explanation: "W takes a positive touch beyond the defender's line and keeps the ball in play.", coachCue: "Attack the line; final touch under control.", playerAction: "W accelerates wide; finishers hold until the server can look up.", ballAction: "The ball travels down the outside channel.", moves: { "cb-w": { x: 0.86, y: 0.77 }, "cb-ball": { x: 0.88, y: 0.76 }, "cb-d1": { x: 0.84, y: 0.52 } }, arrow: [{ x: 0.7, y: 0.75 }, { x: 0.88, y: 0.76 }] },
    { title: "Arrive at different depths", explanation: "F1 attacks the near cutback lane while F2 arrives later in the deeper lane.", coachCue: "One near, one deep—arrive together.", playerAction: "F1 accelerates toward the six-yard edge; F2 holds behind the penalty spot.", ballAction: "W settles the ball and lifts the head.", moves: { "cb-w": { x: 0.88, y: 0.76 }, "cb-ball": { x: 0.89, y: 0.74 }, "cb-f1": { x: 0.83, y: 0.41 }, "cb-f2": { x: 0.78, y: 0.57 }, "cb-d1": { x: 0.85, y: 0.49 } }, arrow: [{ x: 0.73, y: 0.4 }, { x: 0.83, y: 0.41 }], arrowColor: MOVE },
    { title: "Select and cut back", explanation: "W sees the deeper runner free and plays backward, away from goalkeeper and defender.", coachCue: "Look, choose, play back with pace.", playerAction: "W delivers to F2; F1 continues to occupy the defender.", ballAction: "The cutback travels backward into F2's path.", moves: { "cb-w": { x: 0.89, y: 0.76 }, "cb-f1": { x: 0.84, y: 0.41 }, "cb-f2": { x: 0.79, y: 0.56 }, "cb-d1": { x: 0.85, y: 0.46 }, "cb-ball": { x: 0.8, y: 0.56 } }, arrow: [{ x: 0.89, y: 0.74 }, { x: 0.8, y: 0.56 }] },
    { title: "Finish or recycle", explanation: "F2 finishes into the open side; if the lane is blocked, F2 secures the ball and uses F1 or W.", coachCue: "Place it if clear; keep it if blocked.", playerAction: "F2 sets the body and finishes; F1 attacks rebound space; W remains a recycle option.", ballAction: "The shot travels toward the open side of goal.", moves: { "cb-f1": { x: 0.86, y: 0.42 }, "cb-f2": { x: 0.82, y: 0.55 }, "cb-d1": { x: 0.86, y: 0.48 }, "cb-gk": { x: 0.93, y: 0.47 }, "cb-ball": { x: 0.91, y: 0.53 } }, arrow: [{ x: 0.8, y: 0.56 }, { x: 0.91, y: 0.53 }] },
    { title: "Exit and rotate", explanation: "Players clear the box, retrieve the ball, and rotate roles before the next service.", coachCue: "Finish the action, clear the space, next group ready.", playerAction: "W becomes a finisher, one finisher becomes server, and the other resets.", ballAction: "A new ball is placed at the wide starting cone.", moves: { "cb-ball": { x: 0.7, y: 0.75 } }, arrow: [{ x: 0.91, y: 0.53 }, { x: 0.7, y: 0.75 }], arrowColor: MOVE },
  ],
});

export const DRILL_PRESETS: TacticsPreset[] = [
  ballMasteryGrid,
  passingGates,
  passingDiamond,
  rondo4v1,
  rondo5v2,
  transitionBox3v1,
  twoVOne,
  threeVTwo,
  fourGoalGame,
  endZoneGame,
  fourVFourNeutral,
  buildoutGame,
  pressureCoverBalance,
  transitionFourGoals,
  cutbackFinish,
];
