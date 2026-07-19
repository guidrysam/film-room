import type {
  TacticsBoardObject,
  TacticsPlayerTeam,
} from "@/lib/tactics-boards";
import {
  DEFAULT_PRESET_PLAYBACK,
  ball,
  drawing,
  player,
  step,
} from "@/lib/tactics-presets/helpers";
import type {
  TacticsPreset,
  TacticsPresetFormat,
} from "@/lib/tactics-presets/types";

type Point = { x: number; y: number };
type Token = readonly [
  id: string,
  team: TacticsPlayerTeam,
  x: number,
  y: number,
  label: string,
];
type SetPieceFrame = {
  title: string;
  notes: string;
  ball: Point;
  moves?: Record<string, Point>;
  arrows: [Point, Point][];
};

const NINE: Token[] = [
  ["gk", "home", 0.08, 0.5, "GK"],
  ["d1", "home", 0.35, 0.28, "D1"],
  ["d2", "home", 0.33, 0.5, "D2"],
  ["d3", "home", 0.35, 0.72, "D3"],
  ["m1", "home", 0.58, 0.22, "M1"],
  ["m2", "home", 0.56, 0.5, "M2"],
  ["m3", "home", 0.58, 0.78, "M3"],
  ["a1", "home", 0.76, 0.38, "A1"],
  ["a2", "home", 0.76, 0.62, "A2"],
];

const ELEVEN: Token[] = [
  ["gk", "home", 0.07, 0.5, "GK"],
  ["d1", "home", 0.3, 0.18, "D1"],
  ["d2", "home", 0.28, 0.4, "D2"],
  ["d3", "home", 0.28, 0.6, "D3"],
  ["d4", "home", 0.3, 0.82, "D4"],
  ["m1", "home", 0.52, 0.2, "M1"],
  ["m2", "home", 0.48, 0.42, "M2"],
  ["m3", "home", 0.48, 0.58, "M3"],
  ["m4", "home", 0.52, 0.8, "M4"],
  ["a1", "home", 0.75, 0.38, "A1"],
  ["a2", "home", 0.75, 0.62, "A2"],
];

function frameObjects(tokens: Token[], frame: SetPieceFrame): TacticsBoardObject[] {
  const players = tokens.map(([id, team, x, y, label]) => {
    const move = frame.moves?.[id];
    return player(id, team, move?.x ?? x, move?.y ?? y, label);
  });
  const arrows = [0, 1].map((index) =>
    drawing(
      `arrow-${index + 1}`,
      "arrow",
      frame.arrows[index] ?? [frame.ball, frame.ball],
      "#fbbf24",
    ),
  );
  return [...players, ball("ball", frame.ball.x, frame.ball.y), ...arrows];
}

function setPiece(input: {
  id: string;
  title: string;
  shortDescription: string;
  format: Extract<TacticsPresetFormat, "9v9" | "11v11">;
  difficulty: TacticsPreset["difficulty"];
  objectives: string[];
  setupInstructions: string[];
  coachingPoints: string[];
  tags: string[];
  opponents?: Token[];
  frames: SetPieceFrame[];
}): TacticsPreset {
  const home = input.format === "9v9" ? NINE : ELEVEN;
  const tokens = [...home, ...(input.opponents ?? [])];
  return {
    id: input.id,
    version: 1,
    title: input.title,
    shortDescription: input.shortDescription,
    kind: "tactical_sequence",
    category: "set_pieces",
    format: input.format,
    playerCount: input.format === "9v9" ? 9 : 11,
    goalkeeperCount: 1,
    ageGuidance: "Adapt roles, service, and opposition to your players.",
    difficulty: input.difficulty,
    estimatedMinutes: 10,
    fieldOrientation: "horizontal",
    fieldView: "full",
    fieldArea: "full",
    objectives: input.objectives,
    setupInstructions: input.setupInstructions,
    coachingPoints: input.coachingPoints,
    playbackSettings: { ...DEFAULT_PRESET_PLAYBACK },
    steps: input.frames.map((frame, index) =>
      step(
        `${input.id}-step-${index + 1}`,
        index + 1,
        frame.title,
        frameObjects(tokens, frame),
        frame.notes,
      ),
    ),
    tags: input.tags,
  };
}

const BOX_DEFENDERS_9: Token[] = [
  ["o1", "away", 0.83, 0.32, "Z1"],
  ["o2", "away", 0.86, 0.47, "Z2"],
  ["o3", "away", 0.84, 0.62, "Z3"],
  ["o4", "away", 0.76, 0.5, "M"],
];

const BOX_DEFENDERS_11: Token[] = [
  ["o1", "away", 0.84, 0.25, "Z1"],
  ["o2", "away", 0.86, 0.38, "Z2"],
  ["o3", "away", 0.87, 0.52, "Z3"],
  ["o4", "away", 0.85, 0.66, "Z4"],
  ["o5", "away", 0.76, 0.44, "M1"],
  ["o6", "away", 0.76, 0.62, "M2"],
];

const CORNER_NEAR_9 = setPiece({
  id: "9v9-corner-near-post",
  title: "9v9 Attacking Corner: Near-Post Movement",
  shortDescription:
    "A simple near-post run with staggered finishers and two-player rest defense.",
  format: "9v9",
  difficulty: "foundation",
  objectives: ["Attack the near-post space with timing.", "Cover a clearance."],
  setupInstructions: [
    "M3 serves; A1 starts central and A2 starts beyond.",
    "D1 and D2 hold rest-defense positions; D3 guards the edge.",
  ],
  coachingPoints: [
    "Arrive at the near post as the ball is delivered.",
    "Second attacker anticipates a flick or loose ball.",
    "Rest defense: D1 and D2 stay goal-side and connected.",
  ],
  tags: ["9v9", "corner", "near post", "rest defense"],
  opponents: BOX_DEFENDERS_9,
  frames: [
    {
      title: "Starting positions",
      notes: "Server checks targets; rest defense remains two plus one at the edge.",
      moves: {
        m3: { x: 0.94, y: 0.94 },
        a1: { x: 0.78, y: 0.5 },
        a2: { x: 0.82, y: 0.66 },
        m2: { x: 0.75, y: 0.36 },
        d3: { x: 0.68, y: 0.5 },
      },
      ball: { x: 0.95, y: 0.95 },
      arrows: [
        [{ x: 0.78, y: 0.5 }, { x: 0.88, y: 0.36 }],
        [{ x: 0.95, y: 0.95 }, { x: 0.88, y: 0.36 }],
      ],
    },
    {
      title: "Near-post run",
      notes: "A1 accelerates across the first defender; A2 delays.",
      moves: {
        m3: { x: 0.94, y: 0.94 },
        a1: { x: 0.88, y: 0.36 },
        a2: { x: 0.84, y: 0.62 },
        m2: { x: 0.77, y: 0.43 },
        d3: { x: 0.68, y: 0.5 },
      },
      ball: { x: 0.82, y: 0.46 },
      arrows: [
        [{ x: 0.78, y: 0.5 }, { x: 0.88, y: 0.36 }],
        [{ x: 0.95, y: 0.95 }, { x: 0.82, y: 0.46 }],
      ],
    },
    {
      title: "Finish and secure",
      notes: "A2 attacks the second ball; D3 screens the outlet without joining.",
      moves: {
        m3: { x: 0.9, y: 0.84 },
        a1: { x: 0.9, y: 0.37 },
        a2: { x: 0.88, y: 0.54 },
        m2: { x: 0.79, y: 0.45 },
        d3: { x: 0.69, y: 0.5 },
      },
      ball: { x: 0.9, y: 0.37 },
      arrows: [
        [{ x: 0.84, y: 0.62 }, { x: 0.88, y: 0.54 }],
        [{ x: 0.9, y: 0.37 }, { x: 0.96, y: 0.5 }],
      ],
    },
  ],
});

const CORNER_FAR_9 = setPiece({
  id: "9v9-corner-far-post",
  title: "9v9 Attacking Corner: Far-Post Target",
  shortDescription:
    "Serve beyond the first line to a far-post target with central support.",
  format: "9v9",
  difficulty: "developing",
  objectives: ["Create a clear far-post target.", "Balance attack and rest defense."],
  setupInstructions: [
    "M1 serves from the left corner; A2 begins away from the far post.",
    "D1 and D2 stay back; D3 protects the edge of the area.",
  ],
  coachingPoints: [
    "Far-post runner stays patient and attacks the flight.",
    "Central runner occupies defenders without crowding the target.",
    "Rest defense: two defenders remain split and goal-side.",
  ],
  tags: ["9v9", "corner", "far post", "rest defense"],
  opponents: BOX_DEFENDERS_9,
  frames: [
    {
      title: "Starting positions",
      notes: "Far-post target starts central enough to arrive unseen.",
      moves: {
        m1: { x: 0.94, y: 0.06 },
        a1: { x: 0.8, y: 0.44 },
        a2: { x: 0.77, y: 0.58 },
        m2: { x: 0.74, y: 0.34 },
        d3: { x: 0.68, y: 0.5 },
      },
      ball: { x: 0.95, y: 0.05 },
      arrows: [
        [{ x: 0.77, y: 0.58 }, { x: 0.9, y: 0.68 }],
        [{ x: 0.95, y: 0.05 }, { x: 0.9, y: 0.68 }],
      ],
    },
    {
      title: "Attack the far post",
      notes: "A2 moves late while A1 holds a central defender.",
      moves: {
        m1: { x: 0.94, y: 0.06 },
        a1: { x: 0.86, y: 0.46 },
        a2: { x: 0.9, y: 0.68 },
        m2: { x: 0.8, y: 0.36 },
        d3: { x: 0.68, y: 0.5 },
      },
      ball: { x: 0.84, y: 0.58 },
      arrows: [
        [{ x: 0.77, y: 0.58 }, { x: 0.9, y: 0.68 }],
        [{ x: 0.95, y: 0.05 }, { x: 0.84, y: 0.58 }],
      ],
    },
    {
      title: "Return across goal",
      notes: "Target can finish or head back into the central runner's path.",
      moves: {
        m1: { x: 0.88, y: 0.14 },
        a1: { x: 0.9, y: 0.48 },
        a2: { x: 0.91, y: 0.68 },
        m2: { x: 0.81, y: 0.4 },
        d3: { x: 0.68, y: 0.5 },
      },
      ball: { x: 0.91, y: 0.68 },
      arrows: [
        [{ x: 0.91, y: 0.68 }, { x: 0.9, y: 0.48 }],
        [{ x: 0.68, y: 0.5 }, { x: 0.72, y: 0.5 }],
      ],
    },
  ],
});

const DEFENSIVE_CORNER_9 = setPiece({
  id: "9v9-defensive-corner-zonal-marking",
  title: "9v9 Defensive Corner: Zonal Plus Marking",
  shortDescription:
    "Protect key goal-area zones while assigning clear marking and outlet roles.",
  format: "9v9",
  difficulty: "foundation",
  objectives: ["Protect the goal area first.", "Clear, step out, and secure the next ball."],
  setupInstructions: [
    "D1-D3 protect zones; M1 and M2 track key runners.",
    "A1 is the outlet and A2 starts ready to help clear.",
  ],
  coachingPoints: [
    "Goalkeeper owns the space they can reach and communicates early.",
    "Zonal players attack the ball rather than waiting beneath it.",
    "Rest defense/outlet: A1 stays available but recovers if the clearance fails.",
  ],
  tags: ["9v9", "defensive corner", "zonal", "marking"],
  opponents: [
    ["o1", "away", 0.82, 0.34, "T1"],
    ["o2", "away", 0.83, 0.52, "T2"],
    ["o3", "away", 0.79, 0.66, "T3"],
    ["o4", "away", 0.94, 0.94, "S"],
  ],
  frames: [
    {
      title: "Assign zones and marks",
      notes: "Three protect goal-side zones; two identify runners; one outlet stays higher.",
      moves: {
        gk: { x: 0.94, y: 0.5 },
        d1: { x: 0.88, y: 0.34 },
        d2: { x: 0.9, y: 0.5 },
        d3: { x: 0.88, y: 0.66 },
        m1: { x: 0.8, y: 0.34 },
        m2: { x: 0.8, y: 0.55 },
        m3: { x: 0.76, y: 0.7 },
        a1: { x: 0.58, y: 0.45 },
        a2: { x: 0.74, y: 0.5 },
      },
      ball: { x: 0.95, y: 0.95 },
      arrows: [
        [{ x: 0.88, y: 0.34 }, { x: 0.84, y: 0.42 }],
        [{ x: 0.58, y: 0.45 }, { x: 0.48, y: 0.4 }],
      ],
    },
    {
      title: "Attack the service",
      notes: "Nearest zonal player meets the ball; markers stay goal-side of runners.",
      moves: {
        gk: { x: 0.93, y: 0.5 },
        d1: { x: 0.85, y: 0.4 },
        d2: { x: 0.88, y: 0.5 },
        d3: { x: 0.87, y: 0.62 },
        m1: { x: 0.82, y: 0.36 },
        m2: { x: 0.81, y: 0.52 },
        m3: { x: 0.77, y: 0.65 },
        a1: { x: 0.58, y: 0.45 },
        a2: { x: 0.72, y: 0.5 },
      },
      ball: { x: 0.85, y: 0.4 },
      arrows: [
        [{ x: 0.88, y: 0.34 }, { x: 0.85, y: 0.4 }],
        [{ x: 0.85, y: 0.4 }, { x: 0.68, y: 0.3 }],
      ],
    },
    {
      title: "Clear and step",
      notes: "Clear wide, then the line steps together while the outlet secures space.",
      moves: {
        gk: { x: 0.93, y: 0.5 },
        d1: { x: 0.79, y: 0.35 },
        d2: { x: 0.79, y: 0.5 },
        d3: { x: 0.79, y: 0.65 },
        m1: { x: 0.7, y: 0.32 },
        m2: { x: 0.7, y: 0.5 },
        m3: { x: 0.7, y: 0.68 },
        a1: { x: 0.56, y: 0.38 },
        a2: { x: 0.64, y: 0.55 },
      },
      ball: { x: 0.68, y: 0.3 },
      arrows: [
        [{ x: 0.85, y: 0.4 }, { x: 0.68, y: 0.3 }],
        [{ x: 0.79, y: 0.5 }, { x: 0.72, y: 0.5 }],
      ],
    },
  ],
});

const GOAL_KICK_9 = setPiece({
  id: "9v9-goal-kick-buildout",
  title: "9v9 Goal Kick Buildout",
  shortDescription:
    "Create width around the goalkeeper and a central route beyond pressure.",
  format: "9v9",
  difficulty: "developing",
  objectives: ["Create three first-pass options.", "Progress or switch with balance."],
  setupInstructions: [
    "D1 and D3 split; D2 and M2 stagger centrally.",
    "Far-side players stay connected rather than crowding the ball.",
  ],
  coachingPoints: [
    "Receive side-on and scan before the pass arrives.",
    "Use the goalkeeper to switch if one side closes.",
    "Rest defense: the far defender and central player protect a turnover.",
  ],
  tags: ["9v9", "goal kick", "buildout", "rest defense"],
  opponents: [
    ["o1", "away", 0.34, 0.4, "P1"],
    ["o2", "away", 0.34, 0.6, "P2"],
  ],
  frames: [
    {
      title: "Starting positions",
      notes: "Defenders split and central players stagger beyond the press.",
      moves: {
        d1: { x: 0.2, y: 0.2 },
        d2: { x: 0.32, y: 0.44 },
        d3: { x: 0.2, y: 0.8 },
        m2: { x: 0.44, y: 0.56 },
      },
      ball: { x: 0.1, y: 0.5 },
      arrows: [
        [{ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.2 }],
        [{ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.8 }],
      ],
    },
    {
      title: "Draw the first presser",
      notes: "Play outside and keep the goalkeeper available behind the ball.",
      moves: {
        d1: { x: 0.22, y: 0.2 },
        d2: { x: 0.34, y: 0.42 },
        d3: { x: 0.2, y: 0.8 },
        m2: { x: 0.44, y: 0.56 },
        o1: { x: 0.25, y: 0.3 },
      },
      ball: { x: 0.22, y: 0.2 },
      arrows: [
        [{ x: 0.1, y: 0.5 }, { x: 0.22, y: 0.2 }],
        [{ x: 0.22, y: 0.2 }, { x: 0.34, y: 0.42 }],
      ],
    },
    {
      title: "Progress or switch",
      notes: "Find central support if open; otherwise return through the goalkeeper.",
      moves: {
        d1: { x: 0.28, y: 0.2 },
        d2: { x: 0.4, y: 0.42 },
        d3: { x: 0.24, y: 0.8 },
        m2: { x: 0.5, y: 0.56 },
        m1: { x: 0.58, y: 0.2 },
      },
      ball: { x: 0.4, y: 0.42 },
      arrows: [
        [{ x: 0.28, y: 0.2 }, { x: 0.4, y: 0.42 }],
        [{ x: 0.28, y: 0.2 }, { x: 0.1, y: 0.5 }],
      ],
    },
  ],
});

const THROW_IN_9 = setPiece({
  id: "9v9-throw-in-support-triangle",
  title: "9v9 Attacking Throw-In Support Triangle",
  shortDescription:
    "Give the thrower short, line, and backward options without crowding.",
  format: "9v9",
  difficulty: "foundation",
  objectives: ["Create three distinct passing options.", "Retain balance behind the ball."],
  setupInstructions: [
    "M3 takes the throw; A2 checks short, A1 runs down line, M2 supports inside.",
    "D2 and D3 remain connected as rest defense.",
  ],
  coachingPoints: [
    "Movements happen at different times and in different directions.",
    "The backward option must remain visible.",
    "Rest defense: two defenders stay goal-side of the nearest opponent.",
  ],
  tags: ["9v9", "throw-in", "support triangle", "rest defense"],
  opponents: [
    ["o1", "away", 0.68, 0.8, "D1"],
    ["o2", "away", 0.58, 0.62, "D2"],
  ],
  frames: [
    {
      title: "Starting positions",
      notes: "The thrower sees one short, one long, and one inside option.",
      moves: {
        m3: { x: 0.62, y: 0.96 },
        a1: { x: 0.74, y: 0.84 },
        a2: { x: 0.65, y: 0.72 },
        m2: { x: 0.53, y: 0.67 },
      },
      ball: { x: 0.62, y: 0.96 },
      arrows: [
        [{ x: 0.65, y: 0.72 }, { x: 0.6, y: 0.82 }],
        [{ x: 0.74, y: 0.84 }, { x: 0.82, y: 0.9 }],
      ],
    },
    {
      title: "Separate the defenders",
      notes: "Short option checks in as the line runner moves away.",
      moves: {
        m3: { x: 0.62, y: 0.96 },
        a1: { x: 0.82, y: 0.9 },
        a2: { x: 0.6, y: 0.82 },
        m2: { x: 0.52, y: 0.68 },
      },
      ball: { x: 0.62, y: 0.96 },
      arrows: [
        [{ x: 0.62, y: 0.96 }, { x: 0.6, y: 0.82 }],
        [{ x: 0.62, y: 0.96 }, { x: 0.52, y: 0.68 }],
      ],
    },
    {
      title: "Combine or retain",
      notes: "Receiver sets inside if pressured; the thrower re-enters play.",
      moves: {
        m3: { x: 0.66, y: 0.86 },
        a1: { x: 0.84, y: 0.9 },
        a2: { x: 0.62, y: 0.78 },
        m2: { x: 0.54, y: 0.66 },
      },
      ball: { x: 0.54, y: 0.66 },
      arrows: [
        [{ x: 0.62, y: 0.78 }, { x: 0.54, y: 0.66 }],
        [{ x: 0.62, y: 0.78 }, { x: 0.84, y: 0.9 }],
      ],
    },
  ],
});

const CORNER_NEAR_FAR_11 = setPiece({
  id: "11v11-corner-near-run-far-occupation",
  title: "11v11 Corner: Near-Post Run and Far-Post Occupation",
  shortDescription:
    "Combine a sharp near-post run with a delayed far-post target.",
  format: "11v11",
  difficulty: "developing",
  objectives: ["Threaten two goal-area zones.", "Maintain three-player rest defense."],
  setupInstructions: [
    "M4 serves; A1 attacks near and A2 occupies far.",
    "D2 and D3 stay back with M2 screening ahead.",
  ],
  coachingPoints: [
    "Near and far runners use different starting lines.",
    "One player protects the edge for a second ball.",
    "Rest defense: two defenders plus one midfielder remain connected.",
  ],
  tags: ["11v11", "corner", "near post", "far post"],
  opponents: BOX_DEFENDERS_11,
  frames: [
    {
      title: "Starting positions",
      notes: "Near and far targets are separated; three players hold rest defense.",
      moves: {
        m4: { x: 0.95, y: 0.95 },
        a1: { x: 0.78, y: 0.46 },
        a2: { x: 0.8, y: 0.64 },
        m1: { x: 0.76, y: 0.32 },
        m3: { x: 0.7, y: 0.5 },
      },
      ball: { x: 0.96, y: 0.96 },
      arrows: [
        [{ x: 0.78, y: 0.46 }, { x: 0.89, y: 0.35 }],
        [{ x: 0.8, y: 0.64 }, { x: 0.91, y: 0.68 }],
      ],
    },
    {
      title: "Crossing movements",
      notes: "A1 moves first to near; A2 delays before attacking far.",
      moves: {
        m4: { x: 0.95, y: 0.95 },
        a1: { x: 0.89, y: 0.35 },
        a2: { x: 0.88, y: 0.67 },
        m1: { x: 0.82, y: 0.46 },
        m3: { x: 0.71, y: 0.5 },
      },
      ball: { x: 0.84, y: 0.47 },
      arrows: [
        [{ x: 0.78, y: 0.46 }, { x: 0.89, y: 0.35 }],
        [{ x: 0.8, y: 0.64 }, { x: 0.88, y: 0.67 }],
      ],
    },
    {
      title: "Finish or return",
      notes: "Near runner finishes or redirects; far runner attacks the next touch.",
      moves: {
        m4: { x: 0.91, y: 0.85 },
        a1: { x: 0.91, y: 0.35 },
        a2: { x: 0.91, y: 0.67 },
        m1: { x: 0.85, y: 0.48 },
        m3: { x: 0.71, y: 0.5 },
      },
      ball: { x: 0.91, y: 0.35 },
      arrows: [
        [{ x: 0.91, y: 0.35 }, { x: 0.96, y: 0.5 }],
        [{ x: 0.91, y: 0.35 }, { x: 0.91, y: 0.67 }],
      ],
    },
  ],
});

const CORNER_EDGE_11 = setPiece({
  id: "11v11-corner-edge-option",
  title: "11v11 Corner: Edge-of-Box Option",
  shortDescription:
    "Use a deliberate edge option when the goal area is crowded.",
  format: "11v11",
  difficulty: "advanced",
  objectives: ["Create a controlled second-line option.", "Protect against the clearance."],
  setupInstructions: [
    "M4 serves; M3 waits at the edge while runners occupy the box.",
    "D2 and D3 hold; M2 balances between the edge player and defenders.",
  ],
  coachingPoints: [
    "The edge player checks the field before receiving.",
    "Delivery can be direct or disguised after a short combination.",
    "Rest defense: two defenders hold and M2 blocks the central counter.",
  ],
  tags: ["11v11", "corner", "edge of box", "second ball"],
  opponents: BOX_DEFENDERS_11,
  frames: [
    {
      title: "Starting positions",
      notes: "Box runners pin defenders while M3 remains available at the edge.",
      moves: {
        m4: { x: 0.95, y: 0.95 },
        a1: { x: 0.84, y: 0.4 },
        a2: { x: 0.84, y: 0.63 },
        m1: { x: 0.79, y: 0.52 },
        m3: { x: 0.69, y: 0.5 },
      },
      ball: { x: 0.96, y: 0.96 },
      arrows: [
        [{ x: 0.96, y: 0.96 }, { x: 0.69, y: 0.5 }],
        [{ x: 0.84, y: 0.4 }, { x: 0.9, y: 0.46 }],
      ],
    },
    {
      title: "Clear the edge lane",
      notes: "Runners attack the goal area and take markers away from M3.",
      moves: {
        m4: { x: 0.95, y: 0.95 },
        a1: { x: 0.9, y: 0.42 },
        a2: { x: 0.9, y: 0.62 },
        m1: { x: 0.86, y: 0.51 },
        m3: { x: 0.7, y: 0.5 },
      },
      ball: { x: 0.82, y: 0.62 },
      arrows: [
        [{ x: 0.84, y: 0.4 }, { x: 0.9, y: 0.42 }],
        [{ x: 0.96, y: 0.96 }, { x: 0.82, y: 0.62 }],
      ],
    },
    {
      title: "Set the edge option",
      notes: "A controlled touch returns the ball to M3 for a shot, pass, or recycle.",
      moves: {
        m4: { x: 0.9, y: 0.86 },
        a1: { x: 0.9, y: 0.42 },
        a2: { x: 0.88, y: 0.62 },
        m1: { x: 0.84, y: 0.51 },
        m3: { x: 0.72, y: 0.5 },
      },
      ball: { x: 0.72, y: 0.5 },
      arrows: [
        [{ x: 0.82, y: 0.62 }, { x: 0.72, y: 0.5 }],
        [{ x: 0.72, y: 0.5 }, { x: 0.95, y: 0.5 }],
      ],
    },
  ],
});

const DEFENSIVE_CORNER_11 = setPiece({
  id: "11v11-defensive-corner-zonal",
  title: "11v11 Defensive Corner: Zonal Starting Structure",
  shortDescription:
    "Protect central goal-area zones with clear blockers, markers, and an outlet.",
  format: "11v11",
  difficulty: "developing",
  objectives: ["Own high-priority zones.", "Clear and reorganize quickly."],
  setupInstructions: [
    "Back four protect zones; three midfielders identify runners and edge space.",
    "A1 is the primary outlet; A2 helps defend the first phase.",
  ],
  coachingPoints: [
    "Communicate goalkeeper space and first-ball responsibility.",
    "Attack the flight; do not defend flat-footed.",
    "Rest defense/outlet: one attacker stays available and reads the second ball.",
  ],
  tags: ["11v11", "defensive corner", "zonal", "outlet"],
  opponents: [
    ["o1", "away", 0.82, 0.3, "T1"],
    ["o2", "away", 0.83, 0.42, "T2"],
    ["o3", "away", 0.82, 0.56, "T3"],
    ["o4", "away", 0.8, 0.68, "T4"],
    ["o5", "away", 0.95, 0.95, "S"],
  ],
  frames: [
    {
      title: "Set zones and matchups",
      notes: "Four protect the goal area; midfield handles runners and the edge.",
      moves: {
        gk: { x: 0.94, y: 0.5 },
        d1: { x: 0.88, y: 0.28 },
        d2: { x: 0.89, y: 0.42 },
        d3: { x: 0.89, y: 0.56 },
        d4: { x: 0.88, y: 0.7 },
        m1: { x: 0.79, y: 0.32 },
        m2: { x: 0.78, y: 0.46 },
        m3: { x: 0.78, y: 0.62 },
        m4: { x: 0.72, y: 0.72 },
        a1: { x: 0.55, y: 0.42 },
        a2: { x: 0.72, y: 0.5 },
      },
      ball: { x: 0.96, y: 0.96 },
      arrows: [
        [{ x: 0.88, y: 0.28 }, { x: 0.84, y: 0.37 }],
        [{ x: 0.55, y: 0.42 }, { x: 0.46, y: 0.38 }],
      ],
    },
    {
      title: "Win the first ball",
      notes: "Nearest zonal player attacks the service while others protect goal-side space.",
      moves: {
        gk: { x: 0.93, y: 0.5 },
        d1: { x: 0.85, y: 0.37 },
        d2: { x: 0.88, y: 0.44 },
        d3: { x: 0.88, y: 0.56 },
        d4: { x: 0.87, y: 0.66 },
        m1: { x: 0.81, y: 0.33 },
        m2: { x: 0.79, y: 0.46 },
        m3: { x: 0.79, y: 0.6 },
        m4: { x: 0.73, y: 0.68 },
        a1: { x: 0.55, y: 0.42 },
        a2: { x: 0.7, y: 0.5 },
      },
      ball: { x: 0.85, y: 0.37 },
      arrows: [
        [{ x: 0.88, y: 0.28 }, { x: 0.85, y: 0.37 }],
        [{ x: 0.85, y: 0.37 }, { x: 0.66, y: 0.28 }],
      ],
    },
    {
      title: "Clear and squeeze",
      notes: "Clear wide, step as a line, and connect the outlet only when secure.",
      moves: {
        gk: { x: 0.93, y: 0.5 },
        d1: { x: 0.78, y: 0.28 },
        d2: { x: 0.78, y: 0.42 },
        d3: { x: 0.78, y: 0.58 },
        d4: { x: 0.78, y: 0.72 },
        m1: { x: 0.69, y: 0.3 },
        m2: { x: 0.68, y: 0.45 },
        m3: { x: 0.68, y: 0.58 },
        m4: { x: 0.68, y: 0.7 },
        a1: { x: 0.52, y: 0.38 },
        a2: { x: 0.61, y: 0.52 },
      },
      ball: { x: 0.66, y: 0.28 },
      arrows: [
        [{ x: 0.85, y: 0.37 }, { x: 0.66, y: 0.28 }],
        [{ x: 0.78, y: 0.42 }, { x: 0.71, y: 0.42 }],
      ],
    },
  ],
});

const WIDE_FREE_KICK_11 = setPiece({
  id: "11v11-wide-attacking-free-kick",
  title: "11v11 Wide Attacking Free Kick",
  shortDescription:
    "Deliver from a wide channel to staggered runners with second-ball cover.",
  format: "11v11",
  difficulty: "developing",
  objectives: ["Time runs across the defensive line.", "Protect the clearance and counter."],
  setupInstructions: [
    "M4 serves; A1 and A2 attack different depths.",
    "M2 protects the edge; D2 and D3 form rest defense.",
  ],
  coachingPoints: [
    "Start runs on the server's final preparation touch.",
    "Keep one runner available for a cutback or second ball.",
    "Rest defense: two defenders hold with M2 screening centrally.",
  ],
  tags: ["11v11", "free kick", "wide service", "rest defense"],
  opponents: BOX_DEFENDERS_11,
  frames: [
    {
      title: "Starting positions",
      notes: "Runners begin on separate lines; edge and rest-defense roles are clear.",
      moves: {
        m4: { x: 0.72, y: 0.88 },
        a1: { x: 0.78, y: 0.4 },
        a2: { x: 0.76, y: 0.62 },
        m1: { x: 0.72, y: 0.5 },
        m2: { x: 0.65, y: 0.5 },
      },
      ball: { x: 0.72, y: 0.88 },
      arrows: [
        [{ x: 0.78, y: 0.4 }, { x: 0.89, y: 0.38 }],
        [{ x: 0.76, y: 0.62 }, { x: 0.88, y: 0.6 }],
      ],
    },
    {
      title: "Stagger the runs",
      notes: "Near runner moves first; far runner delays to preserve separation.",
      moves: {
        m4: { x: 0.72, y: 0.88 },
        a1: { x: 0.88, y: 0.38 },
        a2: { x: 0.84, y: 0.61 },
        m1: { x: 0.79, y: 0.5 },
        m2: { x: 0.65, y: 0.5 },
      },
      ball: { x: 0.8, y: 0.65 },
      arrows: [
        [{ x: 0.78, y: 0.4 }, { x: 0.88, y: 0.38 }],
        [{ x: 0.72, y: 0.88 }, { x: 0.8, y: 0.65 }],
      ],
    },
    {
      title: "Attack and recover",
      notes: "Finish the delivery; edge player owns the clearance while rest defense holds.",
      moves: {
        m4: { x: 0.74, y: 0.82 },
        a1: { x: 0.91, y: 0.38 },
        a2: { x: 0.89, y: 0.6 },
        m1: { x: 0.84, y: 0.5 },
        m2: { x: 0.66, y: 0.5 },
      },
      ball: { x: 0.91, y: 0.38 },
      arrows: [
        [{ x: 0.8, y: 0.65 }, { x: 0.91, y: 0.38 }],
        [{ x: 0.66, y: 0.5 }, { x: 0.71, y: 0.5 }],
      ],
    },
  ],
});

const CENTRAL_FREE_KICK_11 = setPiece({
  id: "11v11-central-attacking-free-kick",
  title: "11v11 Central Attacking Free Kick Setup",
  shortDescription:
    "A flexible central setup with direct, layoff, and rebound responsibilities.",
  format: "11v11",
  difficulty: "developing",
  objectives: ["Create more than one credible restart option.", "Organize rebound and rest defense."],
  setupInstructions: [
    "M2 and M3 stand over the ball; A1 occupies the goalkeeper's sightline legally.",
    "D2 and D3 hold rest defense; M1 watches the rebound zone.",
  ],
  coachingPoints: [
    "Choose the option from distance, wall position, and goalkeeper setup.",
    "Avoid offside and goalkeeper interference.",
    "Rest defense: two defenders stay split with one midfielder screening.",
  ],
  tags: ["11v11", "free kick", "central", "direct shot"],
  opponents: [
    ["o1", "away", 0.78, 0.36, "W1"],
    ["o2", "away", 0.78, 0.45, "W2"],
    ["o3", "away", 0.78, 0.54, "W3"],
    ["o4", "away", 0.78, 0.63, "W4"],
  ],
  frames: [
    {
      title: "Starting positions",
      notes: "Two stand over the ball; rebound, screen, and rest-defense roles are assigned.",
      moves: {
        m2: { x: 0.68, y: 0.47 },
        m3: { x: 0.68, y: 0.53 },
        m1: { x: 0.62, y: 0.38 },
        m4: { x: 0.62, y: 0.68 },
        a1: { x: 0.84, y: 0.56 },
        a2: { x: 0.76, y: 0.7 },
      },
      ball: { x: 0.7, y: 0.5 },
      arrows: [
        [{ x: 0.7, y: 0.5 }, { x: 0.96, y: 0.44 }],
        [{ x: 0.68, y: 0.47 }, { x: 0.72, y: 0.57 }],
      ],
    },
    {
      title: "Disguise the choice",
      notes: "One player shapes to strike while the second can roll or take over.",
      moves: {
        m2: { x: 0.7, y: 0.47 },
        m3: { x: 0.66, y: 0.55 },
        m1: { x: 0.63, y: 0.38 },
        m4: { x: 0.64, y: 0.68 },
        a1: { x: 0.85, y: 0.56 },
        a2: { x: 0.78, y: 0.7 },
      },
      ball: { x: 0.7, y: 0.5 },
      arrows: [
        [{ x: 0.7, y: 0.5 }, { x: 0.96, y: 0.44 }],
        [{ x: 0.7, y: 0.5 }, { x: 0.73, y: 0.57 }],
      ],
    },
    {
      title: "Strike and cover",
      notes: "Attack the rebound without sending rest-defense players forward.",
      moves: {
        m2: { x: 0.74, y: 0.46 },
        m3: { x: 0.72, y: 0.56 },
        m1: { x: 0.69, y: 0.4 },
        m4: { x: 0.7, y: 0.66 },
        a1: { x: 0.87, y: 0.55 },
        a2: { x: 0.82, y: 0.68 },
      },
      ball: { x: 0.91, y: 0.44 },
      arrows: [
        [{ x: 0.7, y: 0.5 }, { x: 0.91, y: 0.44 }],
        [{ x: 0.63, y: 0.38 }, { x: 0.69, y: 0.4 }],
      ],
    },
  ],
});

const GOAL_KICK_11 = setPiece({
  id: "11v11-goal-kick-two-pressers",
  title: "11v11 Goal Kick Buildout Against Two Pressers",
  shortDescription:
    "Use the goalkeeper and staggered midfield to create a free first-phase player.",
  format: "11v11",
  difficulty: "developing",
  objectives: ["Outnumber the first pressing line.", "Retain protection against a turnover."],
  setupInstructions: [
    "Center backs split, fullbacks advance, and M2 offers behind the press.",
    "M3 stays connected as the rest-defense midfielder.",
  ],
  coachingPoints: [
    "Goalkeeper reads which presser commits.",
    "Midfielders avoid standing on one horizontal line.",
    "Rest defense: far center back and holding midfielder protect the middle.",
  ],
  tags: ["11v11", "goal kick", "buildout", "two pressers"],
  opponents: [
    ["o1", "away", 0.34, 0.4, "P1"],
    ["o2", "away", 0.34, 0.6, "P2"],
  ],
  frames: [
    {
      title: "Starting positions",
      notes: "Split center backs and stagger midfield before the restart.",
      moves: {
        d2: { x: 0.18, y: 0.3 },
        d3: { x: 0.18, y: 0.7 },
        d1: { x: 0.32, y: 0.1 },
        d4: { x: 0.32, y: 0.9 },
        m2: { x: 0.39, y: 0.44 },
        m3: { x: 0.43, y: 0.6 },
      },
      ball: { x: 0.09, y: 0.5 },
      arrows: [
        [{ x: 0.09, y: 0.5 }, { x: 0.18, y: 0.3 }],
        [{ x: 0.09, y: 0.5 }, { x: 0.18, y: 0.7 }],
      ],
    },
    {
      title: "Draw one presser",
      notes: "Play to a center back and keep the goalkeeper as the return option.",
      moves: {
        d2: { x: 0.2, y: 0.3 },
        d3: { x: 0.18, y: 0.7 },
        d1: { x: 0.34, y: 0.1 },
        d4: { x: 0.32, y: 0.9 },
        m2: { x: 0.39, y: 0.44 },
        m3: { x: 0.43, y: 0.6 },
        o1: { x: 0.25, y: 0.34 },
      },
      ball: { x: 0.2, y: 0.3 },
      arrows: [
        [{ x: 0.09, y: 0.5 }, { x: 0.2, y: 0.3 }],
        [{ x: 0.2, y: 0.3 }, { x: 0.39, y: 0.44 }],
      ],
    },
    {
      title: "Find the free player",
      notes: "M2 leaves the cover shadow while the far side remains protected.",
      moves: {
        d2: { x: 0.24, y: 0.3 },
        d3: { x: 0.2, y: 0.7 },
        d1: { x: 0.4, y: 0.1 },
        d4: { x: 0.36, y: 0.9 },
        m2: { x: 0.42, y: 0.43 },
        m3: { x: 0.46, y: 0.6 },
        o1: { x: 0.29, y: 0.34 },
      },
      ball: { x: 0.42, y: 0.43 },
      arrows: [
        [{ x: 0.24, y: 0.3 }, { x: 0.42, y: 0.43 }],
        [{ x: 0.42, y: 0.43 }, { x: 0.52, y: 0.2 }],
      ],
    },
    {
      title: "Progress or switch",
      notes: "Advance through midfield or return to change the point of attack.",
      moves: {
        d2: { x: 0.28, y: 0.3 },
        d3: { x: 0.24, y: 0.7 },
        d1: { x: 0.44, y: 0.1 },
        d4: { x: 0.4, y: 0.9 },
        m2: { x: 0.5, y: 0.42 },
        m3: { x: 0.48, y: 0.62 },
      },
      ball: { x: 0.5, y: 0.42 },
      arrows: [
        [{ x: 0.42, y: 0.43 }, { x: 0.5, y: 0.42 }],
        [{ x: 0.42, y: 0.43 }, { x: 0.24, y: 0.7 }],
      ],
    },
  ],
});

const THROW_IN_11 = setPiece({
  id: "11v11-throw-in-support-structure",
  title: "11v11 Throw-In Support Structure",
  shortDescription:
    "Create short, line, inside, and backward options around the thrower.",
  format: "11v11",
  difficulty: "foundation",
  objectives: ["Give the thrower distinct choices.", "Stay protected if possession is lost."],
  setupInstructions: [
    "M4 throws; A2 checks short, A1 runs line, and M3 supports inside.",
    "D3 and D4 remain behind as rest defense with M2 screening.",
  ],
  coachingPoints: [
    "Players separate before checking into the ball.",
    "The thrower moves immediately to support the receiver.",
    "Rest defense: two defenders plus one midfielder protect central space.",
  ],
  tags: ["11v11", "throw-in", "support", "rest defense"],
  opponents: [
    ["o1", "away", 0.68, 0.82, "D1"],
    ["o2", "away", 0.58, 0.68, "D2"],
    ["o3", "away", 0.75, 0.58, "D3"],
  ],
  frames: [
    {
      title: "Starting positions",
      notes: "Four options occupy different heights and angles; rest defense is set.",
      moves: {
        m4: { x: 0.62, y: 0.96 },
        a1: { x: 0.75, y: 0.88 },
        a2: { x: 0.65, y: 0.72 },
        m3: { x: 0.55, y: 0.68 },
        m1: { x: 0.5, y: 0.84 },
      },
      ball: { x: 0.62, y: 0.96 },
      arrows: [
        [{ x: 0.65, y: 0.72 }, { x: 0.6, y: 0.82 }],
        [{ x: 0.75, y: 0.88 }, { x: 0.83, y: 0.91 }],
      ],
    },
    {
      title: "Create separation",
      notes: "Short player checks toward the thrower as the line runner moves away.",
      moves: {
        m4: { x: 0.62, y: 0.96 },
        a1: { x: 0.83, y: 0.91 },
        a2: { x: 0.6, y: 0.82 },
        m3: { x: 0.54, y: 0.68 },
        m1: { x: 0.49, y: 0.84 },
      },
      ball: { x: 0.62, y: 0.96 },
      arrows: [
        [{ x: 0.62, y: 0.96 }, { x: 0.6, y: 0.82 }],
        [{ x: 0.62, y: 0.96 }, { x: 0.54, y: 0.68 }],
      ],
    },
    {
      title: "Support the first touch",
      notes: "Thrower re-enters while inside and backward options stay visible.",
      moves: {
        m4: { x: 0.66, y: 0.86 },
        a1: { x: 0.84, y: 0.91 },
        a2: { x: 0.62, y: 0.78 },
        m3: { x: 0.55, y: 0.67 },
        m1: { x: 0.5, y: 0.82 },
      },
      ball: { x: 0.62, y: 0.78 },
      arrows: [
        [{ x: 0.62, y: 0.78 }, { x: 0.66, y: 0.86 }],
        [{ x: 0.62, y: 0.78 }, { x: 0.55, y: 0.67 }],
      ],
    },
  ],
});

export const SET_PIECE_PRESETS: TacticsPreset[] = [
  CORNER_NEAR_9,
  CORNER_FAR_9,
  DEFENSIVE_CORNER_9,
  GOAL_KICK_9,
  THROW_IN_9,
  CORNER_NEAR_FAR_11,
  CORNER_EDGE_11,
  DEFENSIVE_CORNER_11,
  WIDE_FREE_KICK_11,
  CENTRAL_FREE_KICK_11,
  GOAL_KICK_11,
  THROW_IN_11,
];
