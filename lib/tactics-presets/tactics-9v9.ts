import type { TacticsBoardObject } from "@/lib/tactics-boards";
import {
  DEFAULT_PRESET_PLAYBACK,
  ball,
  drawing,
  player,
  step,
} from "@/lib/tactics-presets/helpers";
import type { TacticsPreset } from "@/lib/tactics-presets/types";

type Point = { x: number; y: number };
type Frame = {
  title: string;
  notes: string;
  moves?: Record<string, Point>;
  ball: Point;
  arrows: [Point, Point][];
};

const HOME = [
  ["gk", 0.08, 0.5, "GK"],
  ["ld", 0.25, 0.2, "LD"],
  ["cd", 0.22, 0.5, "CD"],
  ["rd", 0.25, 0.8, "RD"],
  ["lm", 0.5, 0.2, "LM"],
  ["cm", 0.46, 0.5, "CM"],
  ["rm", 0.5, 0.8, "RM"],
  ["lf", 0.74, 0.35, "9"],
  ["rf", 0.74, 0.65, "10"],
] as const;

function objects(
  frame: Frame,
  opponents: ReadonlyArray<readonly [string, number, number, string]> = [],
): TacticsBoardObject[] {
  const tokens = [
    ...HOME.map(([id, x, y, label]) => {
      const move = frame.moves?.[id];
      return player(id, "home", move?.x ?? x, move?.y ?? y, label);
    }),
    ...opponents.map(([id, x, y, label]) => {
      const move = frame.moves?.[id];
      return player(id, "away", move?.x ?? x, move?.y ?? y, label);
    }),
  ];
  const arrows = [0, 1].map((index) => {
    const points = frame.arrows[index] ?? [frame.ball, frame.ball];
    return drawing(`arrow-${index + 1}`, "arrow", points, "#fbbf24");
  });
  return [...tokens, ball("ball", frame.ball.x, frame.ball.y), ...arrows];
}

function preset(
  input: Pick<
    TacticsPreset,
    | "id"
    | "title"
    | "shortDescription"
    | "category"
    | "difficulty"
    | "objectives"
    | "setupInstructions"
    | "coachingPoints"
    | "tags"
  > & {
    frames: Frame[];
    opponents?: ReadonlyArray<readonly [string, number, number, string]>;
  },
): TacticsPreset {
  const { frames, opponents = [], ...metadata } = input;
  return {
    version: 1,
    kind: "tactical_sequence",
    format: "9v9",
    playerCount: 9,
    goalkeeperCount: 1,
    ageGuidance: "Commonly useful from U11; adapt language and pressure.",
    estimatedMinutes: 10,
    fieldOrientation: "horizontal",
    fieldView: "full",
    fieldArea: "full",
    playbackSettings: { ...DEFAULT_PRESET_PLAYBACK },
    ...metadata,
    steps: frames.map((frame, index) =>
      step(
        `${input.id}-step-${index + 1}`,
        index + 1,
        frame.title,
        objects(frame, opponents),
        frame.notes,
      ),
    ),
  };
}

const BUILD_OPPONENTS = [
  ["o1", 0.38, 0.4, "P1"],
  ["o2", 0.38, 0.6, "P2"],
] as const;

const SHIFT_OPPONENTS = [
  ["o1", 0.58, 0.18, "W"],
  ["o2", 0.65, 0.42, "9"],
  ["o3", 0.55, 0.72, "W"],
] as const;

const BUILD_FROM_GOALKEEPER = preset({
  id: "9v9-building-from-goalkeeper",
  title: "Building From the Goalkeeper",
  shortDescription:
    "Create width, support beneath the ball, and identify the free side.",
  category: "attacking",
  difficulty: "developing",
  objectives: [
    "Create width and multiple passing options.",
    "Progress or switch without everyone moving toward the ball.",
  ],
  setupInstructions: [
    "Begin in a 3-2-3 shape with two passive pressers.",
    "Restart with the goalkeeper and rehearse both sides.",
  ],
  coachingPoints: [
    "Open a clear diagonal passing lane.",
    "The far side moves across but preserves useful width.",
    "Use the goalkeeper again when forward play is closed.",
  ],
  tags: ["9v9", "buildout", "goalkeeper", "switching play"],
  opponents: BUILD_OPPONENTS,
  frames: [
    {
      title: "Create the starting picture",
      notes: "Defenders spread; midfielders show at different heights.",
      ball: { x: 0.08, y: 0.5 },
      arrows: [
        [{ x: 0.08, y: 0.5 }, { x: 0.25, y: 0.2 }],
        [{ x: 0.08, y: 0.5 }, { x: 0.25, y: 0.8 }],
      ],
    },
    {
      title: "Play around the first line",
      notes: "The goalkeeper finds the outside defender away from pressure.",
      moves: { o1: { x: 0.25, y: 0.42 }, o2: { x: 0.3, y: 0.62 } },
      ball: { x: 0.25, y: 0.2 },
      arrows: [
        [{ x: 0.08, y: 0.5 }, { x: 0.25, y: 0.2 }],
        [{ x: 0.25, y: 0.2 }, { x: 0.48, y: 0.33 }],
      ],
    },
    {
      title: "Support beneath the ball",
      notes: "The central midfielder moves off the pressers' cover shadow.",
      moves: {
        cm: { x: 0.4, y: 0.36 },
        lm: { x: 0.52, y: 0.14 },
        o1: { x: 0.32, y: 0.28 },
      },
      ball: { x: 0.25, y: 0.2 },
      arrows: [
        [{ x: 0.46, y: 0.5 }, { x: 0.4, y: 0.36 }],
        [{ x: 0.25, y: 0.2 }, { x: 0.4, y: 0.36 }],
      ],
    },
    {
      title: "Connect the far side",
      notes: "Weak-side players slide across while keeping the field open.",
      moves: {
        cm: { x: 0.4, y: 0.36 },
        rd: { x: 0.28, y: 0.7 },
        rm: { x: 0.5, y: 0.72 },
        rf: { x: 0.72, y: 0.62 },
      },
      ball: { x: 0.4, y: 0.36 },
      arrows: [
        [{ x: 0.25, y: 0.2 }, { x: 0.4, y: 0.36 }],
        [{ x: 0.4, y: 0.36 }, { x: 0.5, y: 0.72 }],
      ],
    },
    {
      title: "Progress or switch",
      notes: "Play forward if the lane opens; otherwise change the point.",
      moves: {
        cm: { x: 0.52, y: 0.42 },
        rm: { x: 0.62, y: 0.76 },
        rf: { x: 0.8, y: 0.62 },
      },
      ball: { x: 0.62, y: 0.76 },
      arrows: [
        [{ x: 0.4, y: 0.36 }, { x: 0.62, y: 0.76 }],
        [{ x: 0.62, y: 0.76 }, { x: 0.8, y: 0.62 }],
      ],
    },
  ],
});

const WIDE_OVERLOAD = preset({
  id: "9v9-creating-wide-overload",
  title: "Creating a Wide Overload",
  shortDescription:
    "Build a two-versus-one with an overlap, inside support, and a safe recycle.",
  category: "attacking",
  difficulty: "developing",
  objectives: [
    "Create a two-versus-one near the touchline.",
    "Support ahead, inside, and behind the ball.",
  ],
  setupInstructions: [
    "Start in balanced possession on the right.",
    "Use an away defender to show the decision cue.",
  ],
  coachingPoints: [
    "Let the defender's body position determine overlap or underlap.",
    "The central player stays available behind pressure.",
    "Recycle if the overload does not produce an advantage.",
  ],
  tags: ["9v9", "wide play", "overlap", "overload"],
  opponents: [["o1", 0.67, 0.78, "D"]],
  frames: [
    {
      title: "Balanced possession",
      notes: "Keep central support before committing players wide.",
      ball: { x: 0.46, y: 0.5 },
      arrows: [
        [{ x: 0.46, y: 0.5 }, { x: 0.5, y: 0.8 }],
        [{ x: 0.25, y: 0.8 }, { x: 0.58, y: 0.9 }],
      ],
    },
    {
      title: "Find the wide player",
      notes: "The receiver stays on the touchline to stretch the defender.",
      moves: { rm: { x: 0.62, y: 0.88 } },
      ball: { x: 0.62, y: 0.88 },
      arrows: [
        [{ x: 0.46, y: 0.5 }, { x: 0.62, y: 0.88 }],
        [{ x: 0.25, y: 0.8 }, { x: 0.7, y: 0.94 }],
      ],
    },
    {
      title: "Run beyond",
      notes: "The outside defender overlaps as the forward pins inside.",
      moves: {
        rm: { x: 0.62, y: 0.88 },
        rd: { x: 0.72, y: 0.94 },
        rf: { x: 0.76, y: 0.68 },
      },
      ball: { x: 0.62, y: 0.88 },
      arrows: [
        [{ x: 0.25, y: 0.8 }, { x: 0.72, y: 0.94 }],
        [{ x: 0.62, y: 0.88 }, { x: 0.72, y: 0.94 }],
      ],
    },
    {
      title: "Keep the exit available",
      notes: "The midfielder offers a backward diagonal if the lane closes.",
      moves: {
        rm: { x: 0.68, y: 0.82 },
        rd: { x: 0.78, y: 0.94 },
        cm: { x: 0.56, y: 0.58 },
        rf: { x: 0.78, y: 0.62 },
      },
      ball: { x: 0.68, y: 0.82 },
      arrows: [
        [{ x: 0.68, y: 0.82 }, { x: 0.78, y: 0.94 }],
        [{ x: 0.68, y: 0.82 }, { x: 0.56, y: 0.58 }],
      ],
    },
    {
      title: "Enter or recycle",
      notes: "Attack the end line when free; use the midfielder if blocked.",
      moves: {
        rd: { x: 0.86, y: 0.9 },
        rm: { x: 0.74, y: 0.78 },
        cm: { x: 0.6, y: 0.58 },
        rf: { x: 0.84, y: 0.55 },
      },
      ball: { x: 0.86, y: 0.9 },
      arrows: [
        [{ x: 0.78, y: 0.94 }, { x: 0.88, y: 0.68 }],
        [{ x: 0.86, y: 0.9 }, { x: 0.6, y: 0.58 }],
      ],
    },
  ],
});

const DEFENSIVE_SHIFT = preset({
  id: "9v9-defensive-shift-cover",
  title: "Defensive Shift and Cover",
  shortDescription:
    "Coordinate pressure, cover, and weak-side balance as the ball moves.",
  category: "defending",
  difficulty: "foundation",
  objectives: [
    "Move together while protecting central space.",
    "Provide pressure, cover, and balance.",
  ],
  setupInstructions: [
    "Place the opponent in possession on one flank.",
    "Walk through the unit's movement before adding speed.",
  ],
  coachingPoints: [
    "The nearest player arrives under control.",
    "Covering players protect inside first.",
    "Weak-side players narrow without losing awareness.",
  ],
  tags: ["9v9", "defending", "pressure cover balance", "compactness"],
  opponents: SHIFT_OPPONENTS,
  frames: [
    {
      title: "Recognize the strong side",
      notes: "The unit reads the wide pass and prepares to travel.",
      ball: { x: 0.58, y: 0.18 },
      arrows: [
        [{ x: 0.5, y: 0.2 }, { x: 0.55, y: 0.2 }],
        [{ x: 0.46, y: 0.5 }, { x: 0.5, y: 0.38 }],
      ],
    },
    {
      title: "Pressure and cover",
      notes: "Nearest midfielder pressures; the next player covers inside.",
      moves: {
        lm: { x: 0.55, y: 0.2 },
        cm: { x: 0.49, y: 0.36 },
        ld: { x: 0.4, y: 0.25 },
      },
      ball: { x: 0.58, y: 0.18 },
      arrows: [
        [{ x: 0.5, y: 0.2 }, { x: 0.55, y: 0.2 }],
        [{ x: 0.46, y: 0.5 }, { x: 0.49, y: 0.36 }],
      ],
    },
    {
      title: "Narrow the weak side",
      notes: "Far-side players protect the middle rather than marking grass.",
      moves: {
        lm: { x: 0.55, y: 0.2 },
        cm: { x: 0.49, y: 0.36 },
        rm: { x: 0.46, y: 0.58 },
        rd: { x: 0.36, y: 0.62 },
        rf: { x: 0.62, y: 0.5 },
      },
      ball: { x: 0.58, y: 0.18 },
      arrows: [
        [{ x: 0.5, y: 0.8 }, { x: 0.46, y: 0.58 }],
        [{ x: 0.25, y: 0.8 }, { x: 0.36, y: 0.62 }],
      ],
    },
    {
      title: "Travel with the switch",
      notes: "Release pressure and shift as the pass moves across.",
      moves: {
        lm: { x: 0.46, y: 0.42 },
        cm: { x: 0.49, y: 0.58 },
        rm: { x: 0.55, y: 0.76 },
        ld: { x: 0.35, y: 0.38 },
        rd: { x: 0.4, y: 0.7 },
        o3: { x: 0.58, y: 0.78 },
      },
      ball: { x: 0.58, y: 0.78 },
      arrows: [
        [{ x: 0.58, y: 0.18 }, { x: 0.58, y: 0.78 }],
        [{ x: 0.5, y: 0.8 }, { x: 0.55, y: 0.76 }],
      ],
    },
    {
      title: "Restore compactness",
      notes: "Pressure, cover, and balance re-form on the new side.",
      moves: {
        lm: { x: 0.46, y: 0.42 },
        cm: { x: 0.49, y: 0.58 },
        rm: { x: 0.57, y: 0.76 },
        ld: { x: 0.35, y: 0.38 },
        rd: { x: 0.42, y: 0.72 },
      },
      ball: { x: 0.58, y: 0.78 },
      arrows: [
        [{ x: 0.49, y: 0.58 }, { x: 0.52, y: 0.67 }],
        [{ x: 0.42, y: 0.72 }, { x: 0.48, y: 0.68 }],
      ],
    },
  ],
});

const TRANSITION_AFTER_LOSS = preset({
  id: "9v9-transition-after-loss",
  title: "Immediate Transition After Losing Possession",
  shortDescription:
    "React to a turnover with ball pressure, central recovery, and a clear reset.",
  category: "transitions",
  difficulty: "developing",
  objectives: [
    "Delay the opponent immediately after loss.",
    "Protect central lanes and recover a connected shape.",
  ],
  setupInstructions: [
    "Begin with the home team attacking in the middle third.",
    "Use two opponents to represent the turnover and outlet.",
  ],
  coachingPoints: [
    "The closest player pressures; teammates do not all chase.",
    "Recover toward goal-side central positions.",
    "If the ball is not regained quickly, restore the team shape.",
  ],
  tags: ["9v9", "transition", "counterpress", "recovery"],
  opponents: [
    ["o1", 0.64, 0.5, "D"],
    ["o2", 0.53, 0.3, "M"],
  ],
  frames: [
    {
      title: "Attack with balance",
      notes: "Players beneath the ball are ready for a possible turnover.",
      moves: {
        lm: { x: 0.62, y: 0.22 },
        cm: { x: 0.58, y: 0.45 },
        rm: { x: 0.64, y: 0.76 },
        lf: { x: 0.8, y: 0.38 },
        rf: { x: 0.8, y: 0.64 },
      },
      ball: { x: 0.62, y: 0.5 },
      arrows: [
        [{ x: 0.62, y: 0.5 }, { x: 0.8, y: 0.38 }],
        [{ x: 0.58, y: 0.45 }, { x: 0.68, y: 0.52 }],
      ],
    },
    {
      title: "Possession is lost",
      notes: "Identify the turnover before continuing the attacking run.",
      moves: {
        lm: { x: 0.62, y: 0.22 },
        cm: { x: 0.58, y: 0.45 },
        rm: { x: 0.64, y: 0.76 },
        o1: { x: 0.64, y: 0.5 },
      },
      ball: { x: 0.64, y: 0.5 },
      arrows: [
        [{ x: 0.62, y: 0.5 }, { x: 0.64, y: 0.5 }],
        [{ x: 0.58, y: 0.45 }, { x: 0.62, y: 0.48 }],
      ],
    },
    {
      title: "Pressure and close lanes",
      notes: "The nearest player delays while others protect inside passes.",
      moves: {
        cm: { x: 0.61, y: 0.47 },
        lm: { x: 0.55, y: 0.3 },
        rm: { x: 0.56, y: 0.66 },
        lf: { x: 0.7, y: 0.39 },
        rf: { x: 0.7, y: 0.61 },
      },
      ball: { x: 0.64, y: 0.5 },
      arrows: [
        [{ x: 0.58, y: 0.45 }, { x: 0.61, y: 0.47 }],
        [{ x: 0.64, y: 0.76 }, { x: 0.56, y: 0.66 }],
      ],
    },
    {
      title: "Recover centrally",
      notes: "Defenders step together and midfield protects the direct route.",
      moves: {
        ld: { x: 0.38, y: 0.28 },
        cd: { x: 0.38, y: 0.5 },
        rd: { x: 0.38, y: 0.72 },
        lm: { x: 0.49, y: 0.34 },
        cm: { x: 0.5, y: 0.5 },
        rm: { x: 0.49, y: 0.66 },
      },
      ball: { x: 0.58, y: 0.42 },
      arrows: [
        [{ x: 0.61, y: 0.47 }, { x: 0.5, y: 0.5 }],
        [{ x: 0.55, y: 0.3 }, { x: 0.49, y: 0.34 }],
      ],
    },
    {
      title: "Regain or reset",
      notes: "Win it if pressure succeeds; otherwise defend in a compact block.",
      moves: {
        ld: { x: 0.36, y: 0.3 },
        cd: { x: 0.35, y: 0.5 },
        rd: { x: 0.36, y: 0.7 },
        lm: { x: 0.47, y: 0.32 },
        cm: { x: 0.47, y: 0.5 },
        rm: { x: 0.47, y: 0.68 },
        lf: { x: 0.58, y: 0.4 },
        rf: { x: 0.58, y: 0.6 },
      },
      ball: { x: 0.56, y: 0.42 },
      arrows: [
        [{ x: 0.58, y: 0.4 }, { x: 0.56, y: 0.42 }],
        [{ x: 0.64, y: 0.5 }, { x: 0.47, y: 0.5 }],
      ],
    },
  ],
});

const THIRD_PLAYER = preset({
  id: "9v9-third-player-combination",
  title: "Third-Player Combination",
  shortDescription:
    "Use a checking player to release a third runner beyond pressure.",
  category: "attacking",
  difficulty: "developing",
  objectives: [
    "Create useful supporting angles.",
    "Move as the pass travels and recognize the third player.",
  ],
  setupInstructions: [
    "Use CM as Player A, a forward as Player B, and wide midfield as Player C.",
    "Rehearse unopposed, then add a passive defender.",
  ],
  coachingPoints: [
    "Player B checks at an angle and plays with a prepared body.",
    "Player C begins the run while the first pass travels.",
    "Weight the layoff into the runner's path.",
  ],
  tags: ["9v9", "combination", "third player", "movement"],
  opponents: [["o1", 0.62, 0.5, "D"]],
  frames: [
    {
      title: "Player A scans",
      notes: "A has the ball; B and C occupy different lanes.",
      moves: {
        cm: { x: 0.46, y: 0.5 },
        lf: { x: 0.7, y: 0.42 },
        rm: { x: 0.55, y: 0.76 },
      },
      ball: { x: 0.46, y: 0.5 },
      arrows: [
        [{ x: 0.7, y: 0.42 }, { x: 0.6, y: 0.47 }],
        [{ x: 0.55, y: 0.76 }, { x: 0.74, y: 0.62 }],
      ],
    },
    {
      title: "Player B checks",
      notes: "B moves off the defender into a visible passing lane.",
      moves: {
        cm: { x: 0.46, y: 0.5 },
        lf: { x: 0.58, y: 0.43 },
        rm: { x: 0.57, y: 0.72 },
      },
      ball: { x: 0.46, y: 0.5 },
      arrows: [
        [{ x: 0.7, y: 0.42 }, { x: 0.58, y: 0.43 }],
        [{ x: 0.46, y: 0.5 }, { x: 0.58, y: 0.43 }],
      ],
    },
    {
      title: "Pass into B",
      notes: "A plays firmly while C accelerates around the defender.",
      moves: {
        cm: { x: 0.46, y: 0.5 },
        lf: { x: 0.58, y: 0.43 },
        rm: { x: 0.66, y: 0.65 },
      },
      ball: { x: 0.58, y: 0.43 },
      arrows: [
        [{ x: 0.46, y: 0.5 }, { x: 0.58, y: 0.43 }],
        [{ x: 0.57, y: 0.72 }, { x: 0.72, y: 0.58 }],
      ],
    },
    {
      title: "Release Player C",
      notes: "B lays the ball into C's path instead of forcing a turn.",
      moves: {
        cm: { x: 0.5, y: 0.48 },
        lf: { x: 0.58, y: 0.43 },
        rm: { x: 0.74, y: 0.58 },
      },
      ball: { x: 0.74, y: 0.58 },
      arrows: [
        [{ x: 0.58, y: 0.43 }, { x: 0.74, y: 0.58 }],
        [{ x: 0.74, y: 0.58 }, { x: 0.86, y: 0.52 }],
      ],
    },
    {
      title: "Continue the attack",
      notes: "C drives forward; A and B support at different depths.",
      moves: {
        cm: { x: 0.62, y: 0.45 },
        lf: { x: 0.72, y: 0.36 },
        rm: { x: 0.84, y: 0.54 },
        rf: { x: 0.84, y: 0.7 },
      },
      ball: { x: 0.84, y: 0.54 },
      arrows: [
        [{ x: 0.74, y: 0.58 }, { x: 0.84, y: 0.54 }],
        [{ x: 0.58, y: 0.43 }, { x: 0.72, y: 0.36 }],
      ],
    },
  ],
});

export const TACTICAL_PRESETS_9V9: TacticsPreset[] = [
  BUILD_FROM_GOALKEEPER,
  WIDE_OVERLOAD,
  DEFENSIVE_SHIFT,
  TRANSITION_AFTER_LOSS,
  THIRD_PLAYER,
];
