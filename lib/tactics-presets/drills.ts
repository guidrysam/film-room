import type { TacticsBoardObject } from "@/lib/tactics-boards";
import {
  areaLabel,
  ball,
  cone,
  DEFAULT_PRESET_PLAYBACK,
  drawing,
  miniGoal,
  player,
  step,
  withMovedObjects,
} from "@/lib/tactics-presets/helpers";
import type { TacticsPreset } from "@/lib/tactics-presets/types";

function drillPreset(
  input: Omit<
    TacticsPreset,
    | "version"
    | "kind"
    | "category"
    | "format"
    | "fieldOrientation"
    | "fieldView"
    | "playbackSettings"
  > & {
    format?: TacticsPreset["format"];
    fieldOrientation?: TacticsPreset["fieldOrientation"];
    fieldView?: TacticsPreset["fieldView"];
    playbackSettings?: TacticsPreset["playbackSettings"];
  },
): TacticsPreset {
  return {
    version: 1,
    kind: "practice_drill",
    category: "practice_drills",
    format: input.format ?? "small_sided",
    fieldOrientation: input.fieldOrientation ?? "horizontal",
    fieldView: input.fieldView ?? "full",
    playbackSettings: input.playbackSettings ?? { ...DEFAULT_PRESET_PLAYBACK },
    ...input,
  };
}

function zone(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = "#22c55e33",
): TacticsBoardObject {
  return drawing(id, "zone", [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ], color);
}

/* -------------------------------------------------------------------------- */
/* 1. Ball Mastery Grid                                                       */
/* -------------------------------------------------------------------------- */

const ballMasteryGridObjects: TacticsBoardObject[] = [
  zone("bm-grid", 0.28, 0.22, 0.72, 0.78, "#3b82f633"),
  cone("bm-c1", 0.28, 0.22),
  cone("bm-c2", 0.72, 0.22),
  cone("bm-c3", 0.28, 0.78),
  cone("bm-c4", 0.72, 0.78),
  player("bm-p1", "home", 0.36, 0.34, "1"),
  player("bm-p2", "home", 0.5, 0.34, "2"),
  player("bm-p3", "home", 0.64, 0.34, "3"),
  player("bm-p4", "home", 0.36, 0.5, "4"),
  player("bm-p5", "home", 0.5, 0.5, "5"),
  player("bm-p6", "home", 0.64, 0.5, "6"),
  player("bm-p7", "home", 0.36, 0.66, "7"),
  player("bm-p8", "home", 0.5, 0.66, "8"),
  player("bm-p9", "home", 0.64, 0.66, "9"),
  ball("bm-b1", 0.38, 0.36),
  ball("bm-b2", 0.52, 0.36),
  ball("bm-b3", 0.66, 0.36),
  ball("bm-b4", 0.38, 0.52),
  ball("bm-b5", 0.52, 0.52),
  ball("bm-b6", 0.66, 0.52),
  ball("bm-b7", 0.38, 0.68),
  ball("bm-b8", 0.52, 0.68),
  ball("bm-b9", 0.66, 0.68),
  areaLabel("bm-label", 0.5, 0.14, "Ball mastery grid"),
];

const ballMasteryGrid = drillPreset({
  id: "drill-ball-mastery-grid",
  title: "Ball Mastery Grid",
  shortDescription:
    "Individual close-control work in a shared grid using different surfaces and direction changes.",
  playerCount: 9,
  ageGuidance: "U8+",
  difficulty: "foundation",
  estimatedMinutes: 10,
  fieldArea: "third",
  objectives: [
    "Close control within playing distance",
    "Use different surfaces of both feet",
    "Scan while dribbling",
    "Change speed after changing direction",
  ],
  setupInstructions: [
    "Mark a square or rectangular grid sized to the group.",
    "Give each player a ball.",
    "Space players so they can move without constant collisions.",
  ],
  activityInstructions: [
    "Players dribble freely inside the grid.",
    "Coach cues surfaces, feet, or direction changes.",
    "Players find open space after each turn.",
  ],
  coachingPoints: [
    "Keep the ball within playing distance.",
    "Look up between touches.",
    "Use both feet.",
    "Change speed after changing direction.",
  ],
  progressions: [
    "Right foot only",
    "Left foot only",
    "Inside/outside touches",
    "Sole movements",
    "Change direction on visual or verbal cue",
  ],
  regressions: [
    "Larger grid",
    "Slower tempo",
    "Allow more stationary touches before moving",
  ],
  equipment: { balls: "one-per-player", cones: 4 },
  tags: ["ball mastery", "dribbling", "warm-up", "foundation", "individual"],
  steps: [
    step("bm-s1", 1, "Setup", ballMasteryGridObjects, "One ball per player inside the grid."),
  ],
});

/* -------------------------------------------------------------------------- */
/* 2. Passing Gates in Pairs                                                  */
/* -------------------------------------------------------------------------- */

const passingGatesObjects: TacticsBoardObject[] = [
  cone("pg-g1a", 0.28, 0.28),
  cone("pg-g1b", 0.28, 0.36),
  cone("pg-g2a", 0.5, 0.22),
  cone("pg-g2b", 0.58, 0.22),
  cone("pg-g3a", 0.72, 0.32),
  cone("pg-g3b", 0.72, 0.4),
  cone("pg-g4a", 0.38, 0.58),
  cone("pg-g4b", 0.46, 0.58),
  cone("pg-g5a", 0.62, 0.68),
  cone("pg-g5b", 0.62, 0.76),
  player("pg-p1", "home", 0.22, 0.32, "1"),
  player("pg-p2", "home", 0.34, 0.32, "2"),
  player("pg-p3", "home", 0.48, 0.3, "3"),
  player("pg-p4", "home", 0.6, 0.3, "4"),
  ball("pg-b1", 0.26, 0.32),
  ball("pg-b2", 0.52, 0.3),
  drawing(
    "pg-a1",
    "arrow",
    [
      { x: 0.23, y: 0.32 },
      { x: 0.27, y: 0.32 },
    ],
    "#fbbf24",
  ),
  areaLabel("pg-label", 0.5, 0.12, "Passing gates"),
];

const passingGates = drillPreset({
  id: "drill-passing-gates-pairs",
  title: "Passing Gates in Pairs",
  shortDescription:
    "Pairs pass through cone gates, then move to a new gate with quality receiving and communication.",
  playerCount: 8,
  ageGuidance: "U8+",
  difficulty: "foundation",
  estimatedMinutes: 12,
  fieldArea: "third",
  objectives: [
    "Passing accuracy through a target",
    "Receiving across the body",
    "Communication between partners",
    "Movement after the pass",
  ],
  setupInstructions: [
    "Create multiple cone gates across a third of the field.",
    "Organize players into pairs with one ball per pair.",
    "Leave space between gates so pairs can rotate freely.",
  ],
  activityInstructions: [
    "Pairs pass through a gate to each other.",
    "After a successful pass, move to a different gate.",
    "Continue for a timed round, counting successful gates if useful.",
  ],
  coachingPoints: [
    "Pass with appropriate weight through the gate.",
    "Receive across the body when possible.",
    "Communicate the next gate early.",
    "Move immediately after the pass.",
  ],
  progressions: [
    "Two-touch only",
    "Alternate feet",
    "One point for every new gate",
    "Add passive defenders",
    "Require a change of direction before the next gate",
  ],
  regressions: [
    "Wider gates",
    "Allow unlimited touches",
    "Fewer pairs in the same area",
  ],
  equipment: { balls: 4, cones: 10 },
  tags: ["passing", "receiving", "pairs", "gates", "foundation"],
  steps: [
    step("pg-s1", 1, "Setup", passingGatesObjects, "Pairs work through multiple gates."),
  ],
});

/* -------------------------------------------------------------------------- */
/* 3. Passing Diamond (animated)                                              */
/* -------------------------------------------------------------------------- */

const diamondBase: TacticsBoardObject[] = [
  cone("pd-c1", 0.5, 0.22),
  cone("pd-c2", 0.72, 0.5),
  cone("pd-c3", 0.5, 0.78),
  cone("pd-c4", 0.28, 0.5),
  player("pd-p1", "home", 0.5, 0.26, "1"),
  player("pd-p2", "home", 0.68, 0.5, "2"),
  player("pd-p3", "home", 0.5, 0.74, "3"),
  player("pd-p4", "home", 0.32, 0.5, "4"),
  ball("pd-ball", 0.5, 0.3),
  drawing(
    "pd-path",
    "line",
    [
      { x: 0.5, y: 0.22 },
      { x: 0.72, y: 0.5 },
      { x: 0.5, y: 0.78 },
      { x: 0.28, y: 0.5 },
      { x: 0.5, y: 0.22 },
    ],
    "#64748e88",
  ),
  areaLabel("pd-label", 0.5, 0.1, "Passing diamond"),
];

const passingDiamond = drillPreset({
  id: "drill-passing-diamond",
  title: "Passing Diamond",
  shortDescription:
    "Four-cone diamond where players pass, follow the pass, and receive with an open body shape.",
  playerCount: 4,
  ageGuidance: "U9+",
  difficulty: "foundation",
  estimatedMinutes: 12,
  fieldArea: "third",
  objectives: [
    "Quality of pass and first touch",
    "Follow the pass with purpose",
    "Open body shape to play forward",
    "Timing of the check away",
  ],
  setupInstructions: [
    "Place four cones in a diamond.",
    "Start with one player at each cone and one ball.",
    "Add extra players behind cones as numbers grow.",
  ],
  activityInstructions: [
    "Player passes clockwise to the next cone.",
    "Passer follows the pass to that cone.",
    "Receiver opens the body and plays to the next player.",
    "Continue the pattern; reverse direction on the coach's cue.",
  ],
  coachingPoints: [
    "Check away before receiving.",
    "Receive on the back foot when appropriate.",
    "Pass with suitable pace.",
    "Move immediately after passing.",
  ],
  progressions: [
    "Two-touch maximum",
    "Opposite-direction pattern",
    "Add a wall-pass combination at one cone",
    "Increase distance between cones",
  ],
  regressions: [
    "Shorter distances",
    "Allow three touches",
    "Pass only; no follow until quality is consistent",
  ],
  equipment: { balls: 1, cones: 4 },
  tags: ["passing", "receiving", "diamond", "technique", "foundation"],
  playbackSettings: {
    transitionDurationMs: 800,
    holdDurationMs: 600,
    loop: true,
  },
  steps: [
    step(
      "pd-s1",
      1,
      "Pass to next",
      [
        ...diamondBase,
        drawing(
          "pd-a1",
          "arrow",
          [
            { x: 0.5, y: 0.3 },
            { x: 0.64, y: 0.46 },
          ],
          "#fbbf24",
        ),
      ],
      "P1 plays to P2.",
    ),
    step(
      "pd-s2",
      2,
      "Follow the pass",
      withMovedObjects(
        [
          ...diamondBase,
          drawing(
            "pd-a2",
            "arrow",
            [
              { x: 0.5, y: 0.28 },
              { x: 0.62, y: 0.46 },
            ],
            "#94a3b8",
          ),
        ],
        {
          "pd-ball": { x: 0.64, y: 0.48 },
          "pd-p1": { x: 0.58, y: 0.36 },
        },
      ),
      "Ball arrives at P2; P1 begins to follow.",
    ),
    step(
      "pd-s3",
      3,
      "Open body receive",
      withMovedObjects(
        [
          ...diamondBase,
          drawing(
            "pd-a3",
            "arrow",
            [
              { x: 0.66, y: 0.52 },
              { x: 0.54, y: 0.68 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "pd-ball": { x: 0.64, y: 0.52 },
          "pd-p1": { x: 0.68, y: 0.5 },
          "pd-p2": { x: 0.6, y: 0.58 },
        },
      ),
      "P2 opens and prepares the next pass.",
    ),
    step(
      "pd-s4",
      4,
      "Continue the pattern",
      withMovedObjects(diamondBase, {
        "pd-ball": { x: 0.5, y: 0.7 },
        "pd-p1": { x: 0.68, y: 0.5 },
        "pd-p2": { x: 0.5, y: 0.74 },
        "pd-p3": { x: 0.42, y: 0.62 },
      }),
      "Pattern continues around the diamond.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* 4. Rondo 4v1                                                               */
/* -------------------------------------------------------------------------- */

const rondo4v1Objects: TacticsBoardObject[] = [
  zone("r41-zone", 0.32, 0.28, 0.68, 0.72, "#22c55e28"),
  cone("r41-c1", 0.32, 0.28),
  cone("r41-c2", 0.68, 0.28),
  cone("r41-c3", 0.32, 0.72),
  cone("r41-c4", 0.68, 0.72),
  player("r41-a1", "home", 0.35, 0.5, "1"),
  player("r41-a2", "home", 0.5, 0.32, "2"),
  player("r41-a3", "home", 0.65, 0.5, "3"),
  player("r41-a4", "home", 0.5, 0.68, "4"),
  player("r41-d1", "away", 0.5, 0.5, "D"),
  ball("r41-ball", 0.38, 0.5),
  areaLabel("r41-label", 0.5, 0.18, "4v1 rondo"),
];

const rondo4v1 = drillPreset({
  id: "drill-rondo-4v1",
  title: "Rondo 4v1",
  shortDescription:
    "Four outside players keep possession against one defender inside a compact box.",
  playerCount: 5,
  ageGuidance: "U9+",
  difficulty: "foundation",
  estimatedMinutes: 10,
  fieldArea: "custom",
  objectives: [
    "Supporting angles around the defender",
    "Quick decisions under light pressure",
    "Passing quality",
    "Defensive pressure and work rate",
  ],
  setupInstructions: [
    "Mark a square sized to age and ability.",
    "Place four possession players around the outside.",
    "One defender starts in the middle.",
  ],
  activityInstructions: [
    "Outside players keep possession from the defender.",
    "Rotate the defender after a win, error, or timed interval.",
    "Count consecutive passes if useful for focus.",
  ],
  coachingPoints: [
    "Move as the ball travels.",
    "Avoid standing behind the defender.",
    "Prepare the body before receiving.",
    "Defend with intensity but under control.",
  ],
  progressions: [
    "Touch limit",
    "Smaller area",
    "Defender must control the ball to win",
    "Add a target number of passes",
  ],
  regressions: [
    "Larger area",
    "Passive defender",
    "Allow unlimited touches",
  ],
  equipment: { balls: 1, cones: 4, pinnies: 1 },
  tags: ["rondo", "possession", "4v1", "foundation", "decision making"],
  steps: [
    step("r41-s1", 1, "Setup", rondo4v1Objects, "Four keepers of the ball, one defender."),
  ],
});

/* -------------------------------------------------------------------------- */
/* 5. Rondo 5v2                                                               */
/* -------------------------------------------------------------------------- */

const rondo5v2Objects: TacticsBoardObject[] = [
  zone("r52-zone", 0.28, 0.24, 0.72, 0.76, "#22c55e28"),
  cone("r52-c1", 0.28, 0.24),
  cone("r52-c2", 0.72, 0.24),
  cone("r52-c3", 0.28, 0.76),
  cone("r52-c4", 0.72, 0.76),
  player("r52-a1", "home", 0.32, 0.5, "1"),
  player("r52-a2", "home", 0.42, 0.3, "2"),
  player("r52-a3", "home", 0.58, 0.3, "3"),
  player("r52-a4", "home", 0.68, 0.5, "4"),
  player("r52-a5", "home", 0.5, 0.7, "5"),
  player("r52-d1", "away", 0.46, 0.46, "D1"),
  player("r52-d2", "away", 0.56, 0.56, "D2"),
  ball("r52-ball", 0.36, 0.48),
  areaLabel("r52-label", 0.5, 0.14, "5v2 rondo"),
];

const rondo5v2 = drillPreset({
  id: "drill-rondo-5v2",
  title: "Rondo 5v2",
  shortDescription:
    "Five possession players find the free player against two cooperating defenders.",
  playerCount: 7,
  ageGuidance: "U10+",
  difficulty: "developing",
  estimatedMinutes: 12,
  fieldArea: "custom",
  objectives: [
    "Find the free player",
    "Play around or through pressure",
    "Defensive pressure and cover together",
  ],
  setupInstructions: [
    "Mark a rectangle large enough for 5v2.",
    "Five possession players start around and inside the area.",
    "Two defenders wear pinnies and start centrally.",
  ],
  activityInstructions: [
    "Possession team keeps the ball against two defenders.",
    "Defenders work together to pressure and cover.",
    "Rotate defenders after a win or set time.",
  ],
  coachingPoints: [
    "Create width and depth around the ball.",
    "Recognize when the split pass is available.",
    "Defenders pressure and cover together.",
    "Possession players should not force central passes.",
  ],
  progressions: [
    "Two-touch",
    "Smaller space",
    "Must complete a split pass to score a point",
    "Add a third defender briefly",
  ],
  regressions: [
    "Larger space",
    "One passive defender",
    "Allow unlimited touches",
  ],
  equipment: { balls: 1, cones: 4, pinnies: 2 },
  tags: ["rondo", "possession", "5v2", "developing", "pressure cover"],
  steps: [
    step("r52-s1", 1, "Setup", rondo5v2Objects, "Find free players around two defenders."),
  ],
});

/* -------------------------------------------------------------------------- */
/* 6. 3v1 Transition Box (animated)                                           */
/* -------------------------------------------------------------------------- */

const transitionBoxBase: TacticsBoardObject[] = [
  zone("t31-box", 0.22, 0.32, 0.55, 0.68, "#22c55e28"),
  cone("t31-c1", 0.22, 0.32),
  cone("t31-c2", 0.55, 0.32),
  cone("t31-c3", 0.22, 0.68),
  cone("t31-c4", 0.55, 0.68),
  miniGoal("t31-mg", 0.88, 0.5, 90),
  player("t31-a1", "home", 0.28, 0.4, "1"),
  player("t31-a2", "home", 0.4, 0.5, "2"),
  player("t31-a3", "home", 0.28, 0.6, "3"),
  player("t31-d1", "away", 0.46, 0.5, "D"),
  ball("t31-ball", 0.32, 0.42),
  areaLabel("t31-label", 0.5, 0.18, "3v1 transition box"),
];

const transitionBox3v1 = drillPreset({
  id: "drill-3v1-transition-box",
  title: "3v1 Transition Box",
  shortDescription:
    "Three attackers keep the ball against one defender, then attack a mini-goal on the turnover.",
  playerCount: 4,
  ageGuidance: "U10+",
  difficulty: "developing",
  estimatedMinutes: 14,
  fieldArea: "third",
  objectives: [
    "Possession under pressure",
    "Immediate attacking transition after a win",
    "Immediate defensive reaction after losing the ball",
  ],
  setupInstructions: [
    "Mark a possession box with cones.",
    "Place a mini-goal or target beyond the box.",
    "Start 3 attackers and 1 defender inside the box.",
  ],
  activityInstructions: [
    "Attackers keep possession inside the box.",
    "When the defender wins the ball, attack the mini-goal immediately.",
    "Former attackers recover and try to prevent the score.",
    "Reset and rotate roles.",
  ],
  coachingPoints: [
    "Possession players create clear supporting angles.",
    "On the win, play forward quickly while under control.",
    "On the loss, nearest player pressures immediately.",
    "Communicate the transition out loud.",
  ],
  progressions: [
    "Touch limit in possession",
    "Smaller box",
    "Defender must dribble out before scoring",
    "Add a recovering attacker from outside",
  ],
  regressions: [
    "Larger box",
    "Passive first phase",
    "Allow unlimited touches",
  ],
  equipment: { balls: 1, cones: 4, miniGoals: 1, pinnies: 1 },
  tags: ["transition", "3v1", "possession", "mini-goal", "developing"],
  playbackSettings: {
    transitionDurationMs: 850,
    holdDurationMs: 650,
    loop: false,
  },
  steps: [
    step(
      "t31-s1",
      1,
      "Possess in the box",
      [
        ...transitionBoxBase,
        drawing(
          "t31-arr1",
          "arrow",
          [
            { x: 0.32, y: 0.42 },
            { x: 0.38, y: 0.5 },
          ],
          "#fbbf24",
        ),
      ],
      "3v1 possession phase.",
    ),
    step(
      "t31-s2",
      2,
      "Defender wins",
      withMovedObjects(
        [
          ...transitionBoxBase,
          drawing(
            "t31-arr2",
            "arrow",
            [
              { x: 0.46, y: 0.5 },
              { x: 0.42, y: 0.48 },
            ],
            "#ef4444",
          ),
        ],
        {
          "t31-ball": { x: 0.44, y: 0.5 },
          "t31-d1": { x: 0.42, y: 0.5 },
          "t31-a2": { x: 0.36, y: 0.52 },
        },
      ),
      "Turnover inside the box.",
    ),
    step(
      "t31-s3",
      3,
      "Attack the mini-goal",
      withMovedObjects(
        [
          ...transitionBoxBase,
          drawing(
            "t31-arr3",
            "arrow",
            [
              { x: 0.5, y: 0.5 },
              { x: 0.82, y: 0.5 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "t31-ball": { x: 0.72, y: 0.5 },
          "t31-d1": { x: 0.68, y: 0.5 },
          "t31-a1": { x: 0.55, y: 0.38 },
          "t31-a2": { x: 0.58, y: 0.52 },
          "t31-a3": { x: 0.55, y: 0.62 },
        },
      ),
      "Immediate attacking transition to the target.",
    ),
    step(
      "t31-s4",
      4,
      "Finish or recover",
      withMovedObjects(transitionBoxBase, {
        "t31-ball": { x: 0.86, y: 0.5 },
        "t31-d1": { x: 0.8, y: 0.5 },
        "t31-a1": { x: 0.7, y: 0.4 },
        "t31-a2": { x: 0.72, y: 0.52 },
        "t31-a3": { x: 0.7, y: 0.6 },
      }),
      "Score or force a recovery.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* 7. 2v1 to Goal (animated)                                                  */
/* -------------------------------------------------------------------------- */

const twoVOneBase: TacticsBoardObject[] = [
  zone("21-area", 0.45, 0.2, 0.95, 0.8, "#3b82f622"),
  player("21-gk", "away", 0.92, 0.5, "GK"),
  player("21-a1", "home", 0.52, 0.42, "1"),
  player("21-a2", "home", 0.52, 0.62, "2"),
  player("21-d1", "away", 0.7, 0.5, "D"),
  ball("21-ball", 0.54, 0.42),
  areaLabel("21-label", 0.7, 0.12, "2v1 to goal"),
];

const twoVOne = drillPreset({
  id: "drill-2v1-to-goal",
  title: "2v1 to Goal",
  shortDescription:
    "Attacking pair commits a defender, decides pass vs dribble, and finishes on goal.",
  playerCount: 3,
  goalkeeperCount: 1,
  ageGuidance: "U9+",
  difficulty: "foundation",
  estimatedMinutes: 14,
  fieldArea: "third",
  fieldView: "offensive",
  objectives: [
    "Commit the defender",
    "Pass versus dribble decision",
    "Supporting run and separation",
    "Efficient finishing",
  ],
  setupInstructions: [
    "Use a goal with a goalkeeper when available.",
    "Start two attackers and one defender outside the box.",
    "Serve the ball to an attacker to begin each repetition.",
  ],
  activityInstructions: [
    "Attackers create a 2v1 toward goal.",
    "Ball carrier attacks the defender to force a decision.",
    "Supporting attacker stays available for the pass.",
    "Finish quickly once the advantage is created.",
  ],
  coachingPoints: [
    "Ball carrier attacks the defender.",
    "Supporting player maintains separation.",
    "Pass when the defender commits.",
    "Finish efficiently.",
  ],
  progressions: [
    "Recovering second defender",
    "Time limit to finish",
    "Start from different angles",
    "Require weaker-foot finish",
  ],
  regressions: [
    "Passive defender",
    "No goalkeeper",
    "Larger starting distance",
  ],
  equipment: { balls: 4, cones: 2, goals: 1, pinnies: 1 },
  tags: ["2v1", "finishing", "decision making", "attacking", "foundation"],
  playbackSettings: {
    transitionDurationMs: 800,
    holdDurationMs: 550,
    loop: false,
  },
  steps: [
    step(
      "21-s1",
      1,
      "Approach",
      [
        ...twoVOneBase,
        drawing(
          "21-arr1",
          "arrow",
          [
            { x: 0.54, y: 0.42 },
            { x: 0.64, y: 0.46 },
          ],
          "#fbbf24",
        ),
      ],
      "Attackers advance toward the defender.",
    ),
    step(
      "21-s2",
      2,
      "Commit the defender",
      withMovedObjects(
        [
          ...twoVOneBase,
          drawing(
            "21-arr2",
            "arrow",
            [
              { x: 0.62, y: 0.44 },
              { x: 0.68, y: 0.48 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "21-ball": { x: 0.62, y: 0.44 },
          "21-a1": { x: 0.6, y: 0.44 },
          "21-a2": { x: 0.6, y: 0.6 },
          "21-d1": { x: 0.68, y: 0.48 },
        },
      ),
      "Ball carrier engages; support stays separated.",
    ),
    step(
      "21-s3",
      3,
      "Pass or dribble",
      withMovedObjects(
        [
          ...twoVOneBase,
          drawing(
            "21-arr3",
            "arrow",
            [
              { x: 0.64, y: 0.46 },
              { x: 0.7, y: 0.58 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "21-ball": { x: 0.7, y: 0.58 },
          "21-a1": { x: 0.66, y: 0.46 },
          "21-a2": { x: 0.68, y: 0.6 },
          "21-d1": { x: 0.7, y: 0.5 },
        },
      ),
      "Pass into the free attacker once the defender commits.",
    ),
    step(
      "21-s4",
      4,
      "Finish",
      withMovedObjects(
        [
          ...twoVOneBase,
          drawing(
            "21-arr4",
            "arrow",
            [
              { x: 0.74, y: 0.58 },
              { x: 0.88, y: 0.52 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "21-ball": { x: 0.86, y: 0.52 },
          "21-a1": { x: 0.72, y: 0.44 },
          "21-a2": { x: 0.76, y: 0.56 },
          "21-d1": { x: 0.78, y: 0.5 },
          "21-gk": { x: 0.92, y: 0.48 },
        },
      ),
      "Finish on goal.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* 8. 3v2 to Goal (animated)                                                  */
/* -------------------------------------------------------------------------- */

const threeVTwoBase: TacticsBoardObject[] = [
  zone("32-area", 0.4, 0.15, 0.95, 0.85, "#3b82f622"),
  player("32-gk", "away", 0.92, 0.5, "GK"),
  player("32-a1", "home", 0.46, 0.32, "1"),
  player("32-a2", "home", 0.46, 0.5, "2"),
  player("32-a3", "home", 0.46, 0.68, "3"),
  player("32-d1", "away", 0.68, 0.4, "D1"),
  player("32-d2", "away", 0.68, 0.6, "D2"),
  ball("32-ball", 0.48, 0.5),
  areaLabel("32-label", 0.68, 0.1, "3v2 to goal"),
];

const threeVTwo = drillPreset({
  id: "drill-3v2-to-goal",
  title: "3v2 to Goal",
  shortDescription:
    "Three attackers use width and central options against two delaying defenders.",
  playerCount: 5,
  goalkeeperCount: 1,
  ageGuidance: "U10+",
  difficulty: "developing",
  estimatedMinutes: 16,
  fieldArea: "third",
  fieldView: "offensive",
  objectives: [
    "Attack a numerical advantage with control",
    "Create width and central penetration",
    "Defensive delay and communication",
    "Transition after the play ends",
  ],
  setupInstructions: [
    "Set a playing area into one goal.",
    "Start three attackers with the ball against two defenders and a GK.",
    "Reset quickly after each finish or defensive win.",
  ],
  activityInstructions: [
    "Attackers advance as a unit and look for the free player.",
    "Defenders delay, protect the most dangerous space, and communicate.",
    "Finish the attack, then recover shape for the next repetition.",
  ],
  coachingPoints: [
    "Attack with speed but remain under control.",
    "Do not occupy the same passing lane.",
    "Defenders protect the most dangerous space first.",
    "Supporting attackers remain available behind the ball.",
  ],
  progressions: [
    "Add a recovering third defender",
    "Limit touches",
    "Must score within a time window",
    "Start from wide or central serves",
  ],
  regressions: [
    "Passive defenders",
    "Larger attacking space",
    "No goalkeeper",
  ],
  equipment: { balls: 4, cones: 4, goals: 1, pinnies: 2 },
  tags: ["3v2", "finishing", "attacking", "defending", "developing"],
  playbackSettings: {
    transitionDurationMs: 850,
    holdDurationMs: 600,
    loop: false,
  },
  steps: [
    step(
      "32-s1",
      1,
      "Advance with width",
      [
        ...threeVTwoBase,
        drawing(
          "32-arr1",
          "arrow",
          [
            { x: 0.48, y: 0.5 },
            { x: 0.58, y: 0.5 },
          ],
          "#fbbf24",
        ),
      ],
      "Attackers stay in separate lanes.",
    ),
    step(
      "32-s2",
      2,
      "Create the free player",
      withMovedObjects(
        [
          ...threeVTwoBase,
          drawing(
            "32-arr2",
            "arrow",
            [
              { x: 0.58, y: 0.48 },
              { x: 0.62, y: 0.34 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "32-ball": { x: 0.58, y: 0.48 },
          "32-a1": { x: 0.6, y: 0.3 },
          "32-a2": { x: 0.56, y: 0.5 },
          "32-a3": { x: 0.6, y: 0.7 },
          "32-d1": { x: 0.7, y: 0.42 },
          "32-d2": { x: 0.7, y: 0.58 },
        },
      ),
      "Shift defenders and find the open lane.",
    ),
    step(
      "32-s3",
      3,
      "Penetrate",
      withMovedObjects(
        [
          ...threeVTwoBase,
          drawing(
            "32-arr3",
            "arrow",
            [
              { x: 0.64, y: 0.32 },
              { x: 0.78, y: 0.4 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "32-ball": { x: 0.72, y: 0.34 },
          "32-a1": { x: 0.7, y: 0.32 },
          "32-a2": { x: 0.64, y: 0.5 },
          "32-a3": { x: 0.66, y: 0.68 },
          "32-d1": { x: 0.76, y: 0.42 },
          "32-d2": { x: 0.74, y: 0.58 },
        },
      ),
      "Play into the free attacker.",
    ),
    step(
      "32-s4",
      4,
      "Finish",
      withMovedObjects(
        [
          ...threeVTwoBase,
          drawing(
            "32-arr4",
            "arrow",
            [
              { x: 0.8, y: 0.38 },
              { x: 0.9, y: 0.48 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "32-ball": { x: 0.88, y: 0.48 },
          "32-a1": { x: 0.8, y: 0.36 },
          "32-a2": { x: 0.74, y: 0.5 },
          "32-a3": { x: 0.76, y: 0.64 },
          "32-d1": { x: 0.82, y: 0.44 },
          "32-d2": { x: 0.8, y: 0.58 },
        },
      ),
      "Finish the chance.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* 9. Four-Goal Directional Game                                              */
/* -------------------------------------------------------------------------- */

const fourGoalObjects: TacticsBoardObject[] = [
  zone("fg-field", 0.18, 0.18, 0.82, 0.82, "#22c55e22"),
  miniGoal("fg-mg1", 0.2, 0.28, 270),
  miniGoal("fg-mg2", 0.2, 0.72, 270),
  miniGoal("fg-mg3", 0.8, 0.28, 90),
  miniGoal("fg-mg4", 0.8, 0.72, 90),
  player("fg-h1", "home", 0.38, 0.35, "1"),
  player("fg-h2", "home", 0.42, 0.5, "2"),
  player("fg-h3", "home", 0.38, 0.65, "3"),
  player("fg-a1", "away", 0.62, 0.35, "1"),
  player("fg-a2", "away", 0.58, 0.5, "2"),
  player("fg-a3", "away", 0.62, 0.65, "3"),
  ball("fg-ball", 0.46, 0.5),
  areaLabel("fg-label", 0.5, 0.1, "Four-goal game"),
  areaLabel("fg-home", 0.2, 0.5, "Home attacks →"),
];

const fourGoalGame = drillPreset({
  id: "drill-four-goal-directional",
  title: "Four-Goal Directional Game",
  shortDescription:
    "Two teams each attack a pair of mini-goals, rewarding scanning and switches of play.",
  playerCount: 6,
  ageGuidance: "U10+",
  difficulty: "developing",
  estimatedMinutes: 18,
  fieldArea: "half",
  objectives: [
    "Scan for the open goal",
    "Switch direction when one side is blocked",
    "Recognize space away from pressure",
    "Stay compact defensively",
  ],
  setupInstructions: [
    "Set four mini-goals, two on each end line or sideline.",
    "Assign each team two goals to attack.",
    "Use pinnies and a ball; adjust numbers to 3v3–5v5.",
  ],
  activityInstructions: [
    "Teams attack their two assigned mini-goals.",
    "Score by passing or shooting into an open goal.",
    "After a score or out-of-bounds, restart quickly from the nearest side.",
  ],
  coachingPoints: [
    "Scan before receiving.",
    "If one goal is covered, switch to the other.",
    "Defenders shift as a unit toward the ball-side goal.",
    "Do not force play into traffic.",
  ],
  progressions: [
    "Must pass before scoring",
    "Score in a different goal than the previous attack",
    "Add neutral players",
    "Limit touches when quality allows",
  ],
  regressions: [
    "Larger field",
    "Allow dribble-ins to score",
    "Remove one defender temporarily",
  ],
  equipment: { balls: 2, cones: 8, pinnies: 3, miniGoals: 4 },
  tags: ["small-sided", "scanning", "switching", "mini-goals", "developing"],
  steps: [
    step("fg-s1", 1, "Setup", fourGoalObjects, "Each team attacks two mini-goals."),
  ],
});

/* -------------------------------------------------------------------------- */
/* 10. End-Zone Possession Game                                               */
/* -------------------------------------------------------------------------- */

const endZoneObjects: TacticsBoardObject[] = [
  zone("ez-field", 0.15, 0.2, 0.85, 0.8, "#22c55e18"),
  zone("ez-end-l", 0.15, 0.2, 0.28, 0.8, "#f59e0b33"),
  zone("ez-end-r", 0.72, 0.2, 0.85, 0.8, "#f59e0b33"),
  cone("ez-c1", 0.15, 0.2),
  cone("ez-c2", 0.85, 0.2),
  cone("ez-c3", 0.15, 0.8),
  cone("ez-c4", 0.85, 0.8),
  cone("ez-c5", 0.28, 0.2),
  cone("ez-c6", 0.28, 0.8),
  cone("ez-c7", 0.72, 0.2),
  cone("ez-c8", 0.72, 0.8),
  player("ez-h1", "home", 0.35, 0.35, "1"),
  player("ez-h2", "home", 0.4, 0.5, "2"),
  player("ez-h3", "home", 0.35, 0.65, "3"),
  player("ez-a1", "away", 0.65, 0.35, "1"),
  player("ez-a2", "away", 0.6, 0.5, "2"),
  player("ez-a3", "away", 0.65, 0.65, "3"),
  ball("ez-ball", 0.42, 0.5),
  areaLabel("ez-label", 0.5, 0.12, "End-zone possession"),
  areaLabel("ez-l", 0.21, 0.5, "End zone"),
  areaLabel("ez-r", 0.79, 0.5, "End zone"),
];

const endZoneGame = drillPreset({
  id: "drill-end-zone-possession",
  title: "End-Zone Possession Game",
  shortDescription:
    "Directional possession where teams score by receiving a controlled pass in the opponent's end zone.",
  playerCount: 6,
  ageGuidance: "U10+",
  difficulty: "developing",
  estimatedMinutes: 16,
  fieldArea: "half",
  objectives: [
    "Movement off the ball",
    "Penetrating passes",
    "Timing of runs into the end zone",
    "Defensive compactness",
  ],
  setupInstructions: [
    "Mark a rectangular field with an end zone at each end.",
    "Organize two equal teams.",
    "Score only by receiving a controlled pass inside the end zone.",
  ],
  activityInstructions: [
    "Teams keep possession and look to play forward.",
    "A teammate times a run into the end zone to receive.",
    "If forward play is unavailable, retain possession and recreate width.",
  ],
  coachingPoints: [
    "Create width before trying to penetrate.",
    "Do not stand permanently inside the end zone.",
    "Time the run with the passer's ability to play forward.",
    "Retain possession when forward play is unavailable.",
  ],
  progressions: [
    "Must complete a minimum number of passes before scoring",
    "One-touch finish in the end zone",
    "Add a neutral player",
    "Narrow the field",
  ],
  regressions: [
    "Larger end zones",
    "Allow a dribble into the end zone to score",
    "Uneven numbers favoring attackers",
  ],
  equipment: { balls: 2, cones: 8, pinnies: 3 },
  tags: ["possession", "penetration", "end zone", "timing", "developing"],
  steps: [
    step("ez-s1", 1, "Setup", endZoneObjects, "Score with a controlled pass into the end zone."),
  ],
});

/* -------------------------------------------------------------------------- */
/* 11. 4v4 Plus Neutral Players                                               */
/* -------------------------------------------------------------------------- */

const fourVFourNeutralObjects: TacticsBoardObject[] = [
  zone("44n-field", 0.18, 0.2, 0.82, 0.8, "#22c55e18"),
  miniGoal("44n-mg1", 0.18, 0.5, 270),
  miniGoal("44n-mg2", 0.82, 0.5, 90),
  player("44n-h1", "home", 0.32, 0.32, "1"),
  player("44n-h2", "home", 0.36, 0.5, "2"),
  player("44n-h3", "home", 0.32, 0.68, "3"),
  player("44n-h4", "home", 0.44, 0.42, "4"),
  player("44n-a1", "away", 0.68, 0.32, "1"),
  player("44n-a2", "away", 0.64, 0.5, "2"),
  player("44n-a3", "away", 0.68, 0.68, "3"),
  player("44n-a4", "away", 0.56, 0.58, "4"),
  player("44n-n1", "home", 0.5, 0.28, "N", "#a78bfa"),
  player("44n-n2", "home", 0.5, 0.72, "N", "#a78bfa"),
  ball("44n-ball", 0.4, 0.48),
  areaLabel("44n-label", 0.5, 0.12, "4v4 + neutrals"),
];

const fourVFourNeutral = drillPreset({
  id: "drill-4v4-plus-neutrals",
  title: "4v4 Plus Neutral Players",
  shortDescription:
    "Two teams of four with supporting neutrals to create overloads and force quick transitions.",
  playerCount: 10,
  ageGuidance: "U11+",
  difficulty: "developing",
  estimatedMinutes: 18,
  fieldArea: "half",
  objectives: [
    "Create and use overloads",
    "Play through pressure",
    "Transition immediately after possession changes",
  ],
  setupInstructions: [
    "Mark a field suited to 4v4.",
    "Add one or two neutral players in pinnies of a third color.",
    "Use goals or mini-goals at each end.",
  ],
  activityInstructions: [
    "Neutrals always play with the team in possession.",
    "Teams attack their assigned goal.",
    "On turnover, both teams transition immediately.",
  ],
  coachingPoints: [
    "Use neutrals to create a numerical advantage.",
    "Play simply through pressure when the free player is available.",
    "On the loss, nearest players react first.",
    "Do not leave neutrals isolated without an angle.",
  ],
  progressions: [
    "One central neutral only",
    "Two outside neutrals",
    "End neutrals as targets",
    "Touch limits for team players",
  ],
  regressions: [
    "Larger field",
    "Two neutrals always available",
    "No goals — possession only",
  ],
  equipment: { balls: 2, cones: 8, pinnies: 6, miniGoals: 2 },
  tags: ["4v4", "neutrals", "overload", "transition", "developing"],
  steps: [
    step(
      "44n-s1",
      1,
      "Setup",
      fourVFourNeutralObjects,
      "Outside neutrals support the team in possession.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* 12. Buildout Directional Game                                              */
/* -------------------------------------------------------------------------- */

const buildoutObjects: TacticsBoardObject[] = [
  zone("bo-def", 0.1, 0.2, 0.32, 0.8, "#3b82f628"),
  zone("bo-mid", 0.32, 0.2, 0.68, 0.8, "#22c55e22"),
  zone("bo-att", 0.68, 0.2, 0.9, 0.8, "#f59e0b28"),
  player("bo-gk", "home", 0.12, 0.5, "GK"),
  player("bo-h1", "home", 0.22, 0.32, "2"),
  player("bo-h2", "home", 0.22, 0.5, "4"),
  player("bo-h3", "home", 0.22, 0.68, "5"),
  player("bo-h4", "home", 0.38, 0.28, "7"),
  player("bo-h5", "home", 0.4, 0.5, "6"),
  player("bo-h6", "home", 0.38, 0.72, "11"),
  player("bo-a1", "away", 0.48, 0.35, "9"),
  player("bo-a2", "away", 0.48, 0.55, "10"),
  player("bo-a3", "away", 0.58, 0.45, "8"),
  ball("bo-ball", 0.16, 0.5),
  areaLabel("bo-label", 0.5, 0.1, "Buildout directional"),
  areaLabel("bo-l1", 0.21, 0.14, "Build"),
  areaLabel("bo-l2", 0.5, 0.14, "Progress"),
  areaLabel("bo-l3", 0.79, 0.14, "Attack"),
];

const buildoutGame = drillPreset({
  id: "drill-buildout-directional",
  title: "Buildout Directional Game",
  shortDescription:
    "Directional game with thirds that rewards building from the back and finding the free player.",
  playerCount: 10,
  goalkeeperCount: 1,
  ageGuidance: "U11+",
  difficulty: "developing",
  estimatedMinutes: 20,
  fieldArea: "half",
  objectives: [
    "Build from the back with composure",
    "Provide width and depth",
    "Create a free player under pressure",
    "Recognize when to play forward or retain",
  ],
  setupInstructions: [
    "Divide the field into thirds or clear build/progress/attack zones.",
    "One team begins from the goalkeeper or end player.",
    "Opposition applies organized but readable pressure.",
  ],
  activityInstructions: [
    "Building team plays out from the GK or deep player.",
    "Pressing team tries to win the ball high and counter.",
    "Progression through midfield under control can earn bonus points.",
    "Avoid rules that force unrealistic passes.",
  ],
  coachingPoints: [
    "Create width early so central players have options.",
    "Support beneath the ball before playing forward.",
    "The free player is often away from the first presser.",
    "Play forward when the picture is clear; otherwise keep the ball.",
  ],
  progressions: [
    "Add a pressing player",
    "Remove touch restrictions",
    "Bonus points for controlled progression through midfield",
    "Allow direct play when pressure creates the opportunity",
  ],
  regressions: [
    "Fewer pressers",
    "Larger build zone",
    "Start with a free pass from the GK",
  ],
  equipment: { balls: 3, cones: 10, pinnies: 4, goals: 1 },
  tags: ["buildout", "possession", "pressing", "directional", "developing"],
  steps: [
    step("bo-s1", 1, "Setup", buildoutObjects, "Build through thirds against organized pressure."),
  ],
});

/* -------------------------------------------------------------------------- */
/* 13. Defensive Pressure-Cover-Balance (animated)                            */
/* -------------------------------------------------------------------------- */

const pcbBase: TacticsBoardObject[] = [
  zone("pcb-field", 0.2, 0.2, 0.8, 0.8, "#64748b22"),
  drawing(
    "pcb-lane1",
    "line",
    [
      { x: 0.4, y: 0.2 },
      { x: 0.4, y: 0.8 },
    ],
    "#94a3b866",
  ),
  drawing(
    "pcb-lane2",
    "line",
    [
      { x: 0.6, y: 0.2 },
      { x: 0.6, y: 0.8 },
    ],
    "#94a3b866",
  ),
  player("pcb-a1", "away", 0.28, 0.35, "A1"),
  player("pcb-a2", "away", 0.28, 0.55, "A2"),
  player("pcb-a3", "away", 0.28, 0.72, "A3"),
  player("pcb-d1", "home", 0.48, 0.38, "P"),
  player("pcb-d2", "home", 0.58, 0.5, "C"),
  player("pcb-d3", "home", 0.68, 0.62, "B"),
  ball("pcb-ball", 0.3, 0.35),
  areaLabel("pcb-label", 0.5, 0.1, "Pressure · Cover · Balance"),
  areaLabel("pcb-p", 0.48, 0.28, "Pressure"),
  areaLabel("pcb-c", 0.58, 0.4, "Cover"),
  areaLabel("pcb-b", 0.68, 0.52, "Balance"),
];

const pressureCoverBalance = drillPreset({
  id: "drill-pressure-cover-balance",
  title: "Defensive Pressure-Cover-Balance Game",
  shortDescription:
    "Small-sided defending focused on nearest pressure, cover, and balance as the ball travels.",
  playerCount: 6,
  ageGuidance: "U11+",
  difficulty: "developing",
  estimatedMinutes: 16,
  fieldArea: "third",
  objectives: [
    "Nearest player pressures the ball",
    "Second defender provides cover",
    "Remaining defenders balance and protect central space",
    "Team shifts together as the ball travels",
  ],
  setupInstructions: [
    "Mark a small directional field; add visual lanes if helpful.",
    "Organize attackers and defenders in equal or near-equal numbers.",
    "Start with the ball on one flank so roles are clear.",
  ],
  activityInstructions: [
    "Attackers keep and move the ball across the field.",
    "Nearest defender pressures; next provides cover; others balance.",
    "As the ball switches, the defensive unit slides together.",
  ],
  coachingPoints: [
    "Pressure angles force play away from goal or into cover.",
    "Cover stays connected—close enough to help, not flat.",
    "Balance players protect the middle and weak side.",
    "Shift on the pass, not after the next touch.",
  ],
  progressions: [
    "Faster ball circulation for attackers",
    "Add a goal for attackers to attack",
    "Require a recovery run after being beaten",
    "Reduce defensive numbers",
  ],
  regressions: [
    "Slower attacking tempo",
    "Freeze after each pass to check roles",
    "Add an extra defender",
  ],
  equipment: { balls: 1, cones: 8, pinnies: 3 },
  tags: ["defending", "pressure", "cover", "balance", "unit defending"],
  playbackSettings: {
    transitionDurationMs: 900,
    holdDurationMs: 700,
    loop: true,
  },
  steps: [
    step(
      "pcb-s1",
      1,
      "Pressure on the ball",
      [
        ...pcbBase,
        drawing(
          "pcb-arr1",
          "arrow",
          [
            { x: 0.48, y: 0.38 },
            { x: 0.36, y: 0.36 },
          ],
          "#ef4444",
        ),
      ],
      "Nearest defender presses; others organize.",
    ),
    step(
      "pcb-s2",
      2,
      "Ball travels centrally",
      withMovedObjects(
        [
          ...pcbBase,
          drawing(
            "pcb-arr2",
            "arrow",
            [
              { x: 0.3, y: 0.38 },
              { x: 0.3, y: 0.52 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "pcb-ball": { x: 0.3, y: 0.55 },
          "pcb-a1": { x: 0.28, y: 0.4 },
          "pcb-a2": { x: 0.3, y: 0.55 },
          "pcb-d1": { x: 0.46, y: 0.48 },
          "pcb-d2": { x: 0.56, y: 0.55 },
          "pcb-d3": { x: 0.66, y: 0.62 },
        },
      ),
      "Unit slides toward the new ball position.",
    ),
    step(
      "pcb-s3",
      3,
      "Cover and balance shift",
      withMovedObjects(
        [
          ...pcbBase,
          drawing(
            "pcb-arr3",
            "arrow",
            [
              { x: 0.46, y: 0.5 },
              { x: 0.36, y: 0.54 },
            ],
            "#ef4444",
          ),
        ],
        {
          "pcb-ball": { x: 0.3, y: 0.55 },
          "pcb-d1": { x: 0.4, y: 0.54 },
          "pcb-d2": { x: 0.52, y: 0.58 },
          "pcb-d3": { x: 0.64, y: 0.48 },
          "pcb-a3": { x: 0.28, y: 0.7 },
        },
      ),
      "New presser, cover, and weak-side balance.",
    ),
    step(
      "pcb-s4",
      4,
      "Weak-side balance",
      withMovedObjects(pcbBase, {
        "pcb-ball": { x: 0.3, y: 0.7 },
        "pcb-a1": { x: 0.28, y: 0.42 },
        "pcb-a2": { x: 0.28, y: 0.58 },
        "pcb-a3": { x: 0.3, y: 0.7 },
        "pcb-d1": { x: 0.42, y: 0.66 },
        "pcb-d2": { x: 0.54, y: 0.58 },
        "pcb-d3": { x: 0.64, y: 0.42 },
      }),
      "Whole unit connected across the field.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* 14. Transition Game to Four Mini-Goals (animated)                          */
/* -------------------------------------------------------------------------- */

const transitionFourBase: TacticsBoardObject[] = [
  zone("tf-field", 0.2, 0.2, 0.8, 0.8, "#22c55e18"),
  miniGoal("tf-mg1", 0.22, 0.3, 270),
  miniGoal("tf-mg2", 0.22, 0.7, 270),
  miniGoal("tf-mg3", 0.78, 0.3, 90),
  miniGoal("tf-mg4", 0.78, 0.7, 90),
  player("tf-h1", "home", 0.4, 0.35, "1"),
  player("tf-h2", "home", 0.42, 0.5, "2"),
  player("tf-h3", "home", 0.4, 0.65, "3"),
  player("tf-a1", "away", 0.6, 0.35, "1"),
  player("tf-a2", "away", 0.58, 0.5, "2"),
  player("tf-a3", "away", 0.6, 0.65, "3"),
  ball("tf-ball", 0.44, 0.48),
  areaLabel("tf-label", 0.5, 0.1, "Transition · 4 mini-goals"),
];

const transitionFourGoals = drillPreset({
  id: "drill-transition-four-mini-goals",
  title: "Transition Game to Four Mini-Goals",
  shortDescription:
    "Two teams attack multiple mini-goals with an immediate change of direction after every turnover.",
  playerCount: 6,
  ageGuidance: "U11+",
  difficulty: "developing",
  estimatedMinutes: 18,
  fieldArea: "half",
  objectives: [
    "Fast recognition after turnover",
    "Attack open space immediately",
    "Recover centrally when possession is lost",
    "Communicate the new direction",
  ],
  setupInstructions: [
    "Place four mini-goals around the field.",
    "Assign each team two goals, or allow scoring in any open goal after a win.",
    "Use pinnies and keep spare balls nearby for quick restarts.",
  ],
  activityInstructions: [
    "Play a directional or multi-goal small-sided game.",
    "On turnover, the new attacking team changes direction toward open goals.",
    "Former attackers recover through the middle first.",
  ],
  coachingPoints: [
    "First look after the win is open space, not the nearest traffic.",
    "Sprint to recover centrally before chasing wide.",
    "Talk: 'Ours!' and name the target goal.",
    "Do not switch off after your team loses the ball.",
  ],
  progressions: [
    "Must score within 6 seconds of a turnover",
    "Cannot score in the same goal twice in a row",
    "Add a neutral",
    "Smaller field to increase transition speed",
  ],
  regressions: [
    "Freeze briefly on turnover to identify the new target",
    "Larger field",
    "Only two mini-goals",
  ],
  equipment: { balls: 2, cones: 4, pinnies: 3, miniGoals: 4 },
  tags: ["transition", "mini-goals", "recovery", "recognition", "developing"],
  playbackSettings: {
    transitionDurationMs: 800,
    holdDurationMs: 600,
    loop: false,
  },
  steps: [
    step(
      "tf-s1",
      1,
      "Attack one direction",
      [
        ...transitionFourBase,
        drawing(
          "tf-arr1",
          "arrow",
          [
            { x: 0.44, y: 0.48 },
            { x: 0.7, y: 0.35 },
          ],
          "#fbbf24",
        ),
      ],
      "Home attacks the right-side goals.",
    ),
    step(
      "tf-s2",
      2,
      "Turnover",
      withMovedObjects(
        [
          ...transitionFourBase,
          drawing(
            "tf-arr2",
            "arrow",
            [
              { x: 0.58, y: 0.5 },
              { x: 0.5, y: 0.5 },
            ],
            "#ef4444",
          ),
        ],
        {
          "tf-ball": { x: 0.54, y: 0.5 },
          "tf-a2": { x: 0.52, y: 0.5 },
          "tf-h2": { x: 0.46, y: 0.52 },
        },
      ),
      "Away wins the ball.",
    ),
    step(
      "tf-s3",
      3,
      "Change direction",
      withMovedObjects(
        [
          ...transitionFourBase,
          drawing(
            "tf-arr3",
            "arrow",
            [
              { x: 0.52, y: 0.5 },
              { x: 0.3, y: 0.68 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "tf-ball": { x: 0.36, y: 0.62 },
          "tf-a1": { x: 0.45, y: 0.4 },
          "tf-a2": { x: 0.4, y: 0.55 },
          "tf-a3": { x: 0.42, y: 0.68 },
          "tf-h1": { x: 0.5, y: 0.42 },
          "tf-h2": { x: 0.52, y: 0.52 },
          "tf-h3": { x: 0.5, y: 0.62 },
        },
      ),
      "New attackers go to the open mini-goal.",
    ),
    step(
      "tf-s4",
      4,
      "Recover centrally",
      withMovedObjects(
        [
          ...transitionFourBase,
          drawing(
            "tf-arr4",
            "arrow",
            [
              { x: 0.5, y: 0.5 },
              { x: 0.4, y: 0.55 },
            ],
            "#94a3b8",
          ),
        ],
        {
          "tf-ball": { x: 0.26, y: 0.7 },
          "tf-a2": { x: 0.3, y: 0.68 },
          "tf-a3": { x: 0.32, y: 0.72 },
          "tf-h1": { x: 0.48, y: 0.45 },
          "tf-h2": { x: 0.46, y: 0.55 },
          "tf-h3": { x: 0.48, y: 0.65 },
        },
      ),
      "Recover through the middle while the attack finishes.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* 15. Finishing From a Cutback (animated)                                    */
/* -------------------------------------------------------------------------- */

const cutbackBase: TacticsBoardObject[] = [
  zone("cb-box", 0.7, 0.25, 0.95, 0.75, "#3b82f622"),
  player("cb-gk", "away", 0.92, 0.5, "GK"),
  player("cb-w", "home", 0.72, 0.78, "7"),
  player("cb-f1", "home", 0.78, 0.42, "9"),
  player("cb-f2", "home", 0.74, 0.55, "10"),
  player("cb-d1", "away", 0.82, 0.48, "D"),
  ball("cb-ball", 0.72, 0.74),
  areaLabel("cb-label", 0.78, 0.14, "Cutback finish"),
];

const cutbackFinish = drillPreset({
  id: "drill-finishing-cutback",
  title: "Finishing From a Cutback",
  shortDescription:
    "Wide service to the end line, delayed runs from finishers, and a cutback into the finishing zone.",
  playerCount: 3,
  goalkeeperCount: 1,
  ageGuidance: "U11+",
  difficulty: "developing",
  estimatedMinutes: 14,
  fieldArea: "third",
  fieldView: "offensive",
  objectives: [
    "Wide player drives to the end line",
    "Finishers arrive at different depths",
    "Cutback timing and weight",
    "First-time or composed finishing",
  ],
  setupInstructions: [
    "Use a goal and goalkeeper.",
    "Mark a wide service starting area and a cutback finishing zone.",
    "Optional: add one defender near the penalty spot.",
  ],
  activityInstructions: [
    "Wide player receives or dribbles toward the end line.",
    "Finishers adjust their runs rather than crowding the goal.",
    "Ball is played backward into the finishing area.",
    "Players finish or recycle if the cutback is cut out.",
  ],
  coachingPoints: [
    "Finishers arrive rather than stand.",
    "Provide different depths for the cutback.",
    "Server looks before playing the ball.",
    "Emphasize technique before speed.",
  ],
  progressions: [
    "Add a recovering defender",
    "Weaker-foot finish only",
    "One-touch finish required",
    "Serve from both flanks",
  ],
  regressions: [
    "No defender",
    "Slower wide approach",
    "Allow an extra touch before finishing",
  ],
  equipment: { balls: 6, cones: 4, goals: 1, pinnies: 1 },
  tags: ["finishing", "cutback", "crossing", "attacking", "developing"],
  playbackSettings: {
    transitionDurationMs: 850,
    holdDurationMs: 550,
    loop: false,
  },
  steps: [
    step(
      "cb-s1",
      1,
      "Wide drive",
      [
        ...cutbackBase,
        drawing(
          "cb-a1",
          "arrow",
          [
            { x: 0.72, y: 0.74 },
            { x: 0.88, y: 0.78 },
          ],
          "#fbbf24",
        ),
      ],
      "Wide player drives toward the end line.",
    ),
    step(
      "cb-s2",
      2,
      "Finishers adjust",
      withMovedObjects(
        [
          ...cutbackBase,
          drawing(
            "cb-a2",
            "arrow",
            [
              { x: 0.78, y: 0.42 },
              { x: 0.82, y: 0.4 },
            ],
            "#94a3b8",
          ),
          drawing(
            "cb-a2b",
            "arrow",
            [
              { x: 0.74, y: 0.55 },
              { x: 0.8, y: 0.58 },
            ],
            "#94a3b8",
          ),
        ],
        {
          "cb-ball": { x: 0.86, y: 0.78 },
          "cb-w": { x: 0.86, y: 0.78 },
          "cb-f1": { x: 0.82, y: 0.4 },
          "cb-f2": { x: 0.8, y: 0.58 },
          "cb-d1": { x: 0.84, y: 0.5 },
        },
      ),
      "Arrive at staggered depths—do not crowd.",
    ),
    step(
      "cb-s3",
      3,
      "Cutback",
      withMovedObjects(
        [
          ...cutbackBase,
          drawing(
            "cb-a3",
            "arrow",
            [
              { x: 0.88, y: 0.76 },
              { x: 0.8, y: 0.58 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "cb-ball": { x: 0.8, y: 0.58 },
          "cb-w": { x: 0.88, y: 0.78 },
          "cb-f1": { x: 0.84, y: 0.38 },
          "cb-f2": { x: 0.8, y: 0.56 },
          "cb-d1": { x: 0.86, y: 0.48 },
        },
      ),
      "Ball played backward into the finishing area.",
    ),
    step(
      "cb-s4",
      4,
      "Finish",
      withMovedObjects(
        [
          ...cutbackBase,
          drawing(
            "cb-a4",
            "arrow",
            [
              { x: 0.8, y: 0.56 },
              { x: 0.9, y: 0.5 },
            ],
            "#fbbf24",
          ),
        ],
        {
          "cb-ball": { x: 0.9, y: 0.5 },
          "cb-w": { x: 0.88, y: 0.78 },
          "cb-f1": { x: 0.84, y: 0.4 },
          "cb-f2": { x: 0.82, y: 0.54 },
          "cb-d1": { x: 0.86, y: 0.48 },
          "cb-gk": { x: 0.92, y: 0.48 },
        },
      ),
      "Finish or recycle if blocked.",
    ),
  ],
});

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

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
