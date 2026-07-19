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
  ["gk", 0.07, 0.5, "GK"],
  ["lb", 0.24, 0.14, "LB"],
  ["lcb", 0.2, 0.38, "LCB"],
  ["rcb", 0.2, 0.62, "RCB"],
  ["rb", 0.24, 0.86, "RB"],
  ["six", 0.4, 0.5, "6"],
  ["eight", 0.53, 0.35, "8"],
  ["ten", 0.55, 0.65, "10"],
  ["lw", 0.72, 0.14, "LW"],
  ["nine", 0.78, 0.5, "9"],
  ["rw", 0.72, 0.86, "RW"],
] as const;

function objects(
  frame: Frame,
  opponents: ReadonlyArray<readonly [string, number, number, string]>,
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
  const arrows = [0, 1].map((index) =>
    drawing(
      `arrow-${index + 1}`,
      "arrow",
      frame.arrows[index] ?? [frame.ball, frame.ball],
      "#fbbf24",
    ),
  );
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
    opponents?: ReadonlyArray<readonly [string, number, number, string]>;
    frames: Frame[];
  },
): TacticsPreset {
  const { frames, opponents = [], ...metadata } = input;
  return {
    version: 1,
    kind: "tactical_sequence",
    format: "11v11",
    playerCount: 11,
    goalkeeperCount: 1,
    ageGuidance: "Use with players ready for unit and line-level detail.",
    estimatedMinutes: 12,
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

const BUILDOUT = preset({
  id: "11v11-433-buildout-two-pressers",
  title: "4-3-3 Buildout Against Two Pressers",
  shortDescription:
    "Use the goalkeeper, split center backs, and diagonal support to find the free player.",
  category: "attacking",
  difficulty: "developing",
  objectives: [
    "Create a free player behind or beside the first pressure.",
    "Progress when possible and switch when pressure locks one side.",
  ],
  setupInstructions: [
    "Start in a 4-3-3 against two opposing forwards.",
    "Rehearse entries through the six, fullback, and goalkeeper.",
  ],
  coachingPoints: [
    "Use the goalkeeper as an extra passing option.",
    "Show outside cover shadows and create diagonal relationships.",
    "Do not force the forward pass when a switch is available.",
  ],
  tags: ["11v11", "4-3-3", "buildout", "two pressers"],
  opponents: [
    ["o1", 0.34, 0.4, "P1"],
    ["o2", 0.34, 0.6, "P2"],
  ],
  frames: [
    {
      title: "Split and support",
      notes: "Center backs separate; the six finds space behind the press.",
      moves: {
        lcb: { x: 0.18, y: 0.3 },
        rcb: { x: 0.18, y: 0.7 },
        six: { x: 0.38, y: 0.5 },
      },
      ball: { x: 0.07, y: 0.5 },
      arrows: [
        [{ x: 0.07, y: 0.5 }, { x: 0.18, y: 0.3 }],
        [{ x: 0.07, y: 0.5 }, { x: 0.18, y: 0.7 }],
      ],
    },
    {
      title: "Invite the pressure",
      notes: "The goalkeeper plays to one center back and reads both pressers.",
      moves: {
        lcb: { x: 0.18, y: 0.3 },
        rcb: { x: 0.18, y: 0.7 },
        six: { x: 0.38, y: 0.5 },
        o1: { x: 0.23, y: 0.35 },
        o2: { x: 0.29, y: 0.55 },
      },
      ball: { x: 0.18, y: 0.3 },
      arrows: [
        [{ x: 0.07, y: 0.5 }, { x: 0.18, y: 0.3 }],
        [{ x: 0.18, y: 0.3 }, { x: 0.38, y: 0.5 }],
      ],
    },
    {
      title: "Find the free player",
      notes: "The six moves out of the cover shadow as the fullback advances.",
      moves: {
        lcb: { x: 0.18, y: 0.3 },
        rcb: { x: 0.18, y: 0.7 },
        lb: { x: 0.34, y: 0.12 },
        six: { x: 0.4, y: 0.45 },
        o1: { x: 0.23, y: 0.34 },
        o2: { x: 0.3, y: 0.57 },
      },
      ball: { x: 0.4, y: 0.45 },
      arrows: [
        [{ x: 0.18, y: 0.3 }, { x: 0.4, y: 0.45 }],
        [{ x: 0.24, y: 0.14 }, { x: 0.34, y: 0.12 }],
      ],
    },
    {
      title: "Adjust ahead of the ball",
      notes: "Midfield staggers and the near fullback supplies an outside lane.",
      moves: {
        lb: { x: 0.42, y: 0.12 },
        six: { x: 0.43, y: 0.45 },
        eight: { x: 0.58, y: 0.3 },
        ten: { x: 0.59, y: 0.6 },
        lw: { x: 0.74, y: 0.12 },
      },
      ball: { x: 0.43, y: 0.45 },
      arrows: [
        [{ x: 0.43, y: 0.45 }, { x: 0.58, y: 0.3 }],
        [{ x: 0.43, y: 0.45 }, { x: 0.42, y: 0.12 }],
      ],
    },
    {
      title: "Progress or switch",
      notes: "Break the line if the lane opens; otherwise return and change sides.",
      moves: {
        lb: { x: 0.48, y: 0.12 },
        six: { x: 0.46, y: 0.45 },
        eight: { x: 0.63, y: 0.3 },
        rcb: { x: 0.25, y: 0.7 },
        rb: { x: 0.38, y: 0.88 },
      },
      ball: { x: 0.63, y: 0.3 },
      arrows: [
        [{ x: 0.46, y: 0.45 }, { x: 0.63, y: 0.3 }],
        [{ x: 0.46, y: 0.45 }, { x: 0.25, y: 0.7 }],
      ],
    },
  ],
});

const WIDE_ROTATION = preset({
  id: "11v11-433-wide-rotation",
  title: "4-3-3 Wide Rotation",
  shortDescription:
    "Coordinate winger, fullback, and advanced midfielder in two common wide rotations.",
  category: "attacking",
  difficulty: "advanced",
  objectives: [
    "Occupy the touchline, inside channel, and supporting lane.",
    "Rotate without placing two players in the same space.",
  ],
  setupInstructions: [
    "Focus on the right-side triangle in a 4-3-3.",
    "Use a passive fullback as the visual cue.",
  ],
  coachingPoints: [
    "Move in response to a teammate, not all at once.",
    "Preserve one player behind the ball.",
    "Choose the rotation that moves the defender or opens the next pass.",
  ],
  tags: ["11v11", "4-3-3", "wide rotation", "overlap"],
  opponents: [["o1", 0.7, 0.78, "FB"]],
  frames: [
    {
      title: "Form the wide triangle",
      notes: "Winger holds width, midfielder occupies inside, fullback supports.",
      ball: { x: 0.55, y: 0.65 },
      arrows: [
        [{ x: 0.55, y: 0.65 }, { x: 0.72, y: 0.86 }],
        [{ x: 0.24, y: 0.86 }, { x: 0.56, y: 0.9 }],
      ],
    },
    {
      title: "Variation one: overlap",
      notes: "Winger stays wide, fullback runs outside, and the ten enters inside.",
      moves: {
        rw: { x: 0.7, y: 0.84 },
        rb: { x: 0.67, y: 0.94 },
        ten: { x: 0.66, y: 0.62 },
      },
      ball: { x: 0.7, y: 0.84 },
      arrows: [
        [{ x: 0.24, y: 0.86 }, { x: 0.67, y: 0.94 }],
        [{ x: 0.55, y: 0.65 }, { x: 0.66, y: 0.62 }],
      ],
    },
    {
      title: "Exploit the overlap",
      notes: "Release the fullback or combine inside if the defender follows.",
      moves: {
        rw: { x: 0.74, y: 0.82 },
        rb: { x: 0.8, y: 0.93 },
        ten: { x: 0.7, y: 0.6 },
      },
      ball: { x: 0.8, y: 0.93 },
      arrows: [
        [{ x: 0.74, y: 0.82 }, { x: 0.8, y: 0.93 }],
        [{ x: 0.8, y: 0.93 }, { x: 0.86, y: 0.65 }],
      ],
    },
    {
      title: "Variation two: winger inside",
      notes: "Reset: the winger enters the inside channel as the fullback gives width.",
      moves: {
        rw: { x: 0.66, y: 0.65 },
        rb: { x: 0.6, y: 0.9 },
        ten: { x: 0.56, y: 0.76 },
      },
      ball: { x: 0.56, y: 0.76 },
      arrows: [
        [{ x: 0.72, y: 0.86 }, { x: 0.66, y: 0.65 }],
        [{ x: 0.24, y: 0.86 }, { x: 0.6, y: 0.9 }],
      ],
    },
    {
      title: "Play to the open lane",
      notes: "Find the inside receiver or use the fullback to retain width.",
      moves: {
        rw: { x: 0.72, y: 0.62 },
        rb: { x: 0.7, y: 0.91 },
        ten: { x: 0.63, y: 0.75 },
      },
      ball: { x: 0.72, y: 0.62 },
      arrows: [
        [{ x: 0.63, y: 0.75 }, { x: 0.72, y: 0.62 }],
        [{ x: 0.63, y: 0.75 }, { x: 0.7, y: 0.91 }],
      ],
    },
  ],
});

const CENTRAL_PROGRESSION = preset({
  id: "11v11-4231-central-progression",
  title: "4-2-3-1 Central Progression",
  shortDescription:
    "Stagger the double pivot to connect a center back with the number 10.",
  category: "attacking",
  difficulty: "developing",
  objectives: [
    "Create central passing lanes through staggered support.",
    "Find the number 10 between lines while retaining width and depth.",
  ],
  setupInstructions: [
    "Treat six and eight as the double pivot and ten as the attacking midfielder.",
    "Add three midfield defenders as reference points.",
  ],
  coachingPoints: [
    "One pivot lowers while the other moves higher or away.",
    "The ten checks shoulders before receiving.",
    "Wide players stretch the block and the striker pins the back line.",
  ],
  tags: ["11v11", "4-2-3-1", "central progression", "double pivot"],
  opponents: [
    ["o1", 0.46, 0.3, "M"],
    ["o2", 0.46, 0.5, "M"],
    ["o3", 0.46, 0.7, "M"],
  ],
  frames: [
    {
      title: "Center back carries",
      notes: "The ball carrier advances until an opponent engages.",
      moves: { lcb: { x: 0.28, y: 0.4 } },
      ball: { x: 0.28, y: 0.4 },
      arrows: [
        [{ x: 0.2, y: 0.38 }, { x: 0.28, y: 0.4 }],
        [{ x: 0.4, y: 0.5 }, { x: 0.35, y: 0.48 }],
      ],
    },
    {
      title: "Stagger the pivots",
      notes: "The six lowers to support; the eight moves beyond the first line.",
      moves: {
        lcb: { x: 0.28, y: 0.4 },
        six: { x: 0.34, y: 0.52 },
        eight: { x: 0.52, y: 0.36 },
      },
      ball: { x: 0.28, y: 0.4 },
      arrows: [
        [{ x: 0.4, y: 0.5 }, { x: 0.34, y: 0.52 }],
        [{ x: 0.53, y: 0.35 }, { x: 0.52, y: 0.36 }],
      ],
    },
    {
      title: "Open the pocket",
      notes: "The ten drifts away from the midfield screen and becomes visible.",
      moves: {
        lcb: { x: 0.28, y: 0.4 },
        six: { x: 0.34, y: 0.52 },
        eight: { x: 0.52, y: 0.32 },
        ten: { x: 0.59, y: 0.57 },
        nine: { x: 0.82, y: 0.5 },
      },
      ball: { x: 0.34, y: 0.52 },
      arrows: [
        [{ x: 0.28, y: 0.4 }, { x: 0.34, y: 0.52 }],
        [{ x: 0.34, y: 0.52 }, { x: 0.59, y: 0.57 }],
      ],
    },
    {
      title: "Connect the number 10",
      notes: "Play through the open lane as the striker maintains depth.",
      moves: {
        six: { x: 0.4, y: 0.5 },
        eight: { x: 0.58, y: 0.3 },
        ten: { x: 0.62, y: 0.57 },
        nine: { x: 0.84, y: 0.5 },
      },
      ball: { x: 0.62, y: 0.57 },
      arrows: [
        [{ x: 0.4, y: 0.5 }, { x: 0.62, y: 0.57 }],
        [{ x: 0.62, y: 0.57 }, { x: 0.84, y: 0.5 }],
      ],
    },
    {
      title: "Play forward or set back",
      notes: "Turn if free; otherwise set to the advancing pivot and continue.",
      moves: {
        six: { x: 0.48, y: 0.48 },
        eight: { x: 0.64, y: 0.32 },
        ten: { x: 0.66, y: 0.57 },
        nine: { x: 0.86, y: 0.5 },
      },
      ball: { x: 0.66, y: 0.57 },
      arrows: [
        [{ x: 0.66, y: 0.57 }, { x: 0.86, y: 0.5 }],
        [{ x: 0.66, y: 0.57 }, { x: 0.64, y: 0.32 }],
      ],
    },
  ],
});

const MID_BLOCK = preset({
  id: "11v11-mid-block-defensive-shift",
  title: "Mid-Block Defensive Shift",
  shortDescription:
    "Keep three lines compact while shifting pressure from side to side.",
  category: "defending",
  difficulty: "developing",
  objectives: [
    "Shift the team as connected lines.",
    "Protect central space while directing play wide.",
  ],
  setupInstructions: [
    "Begin in a compact 4-3-3 mid-block.",
    "Use three opponents to circulate the ball across the field.",
  ],
  coachingPoints: [
    "The first defender curves pressure to screen the inside.",
    "Far-side winger narrows as the ball travels.",
    "Back line adjusts width and depth together.",
  ],
  tags: ["11v11", "mid-block", "defensive shift", "compactness"],
  opponents: [
    ["o1", 0.66, 0.18, "L"],
    ["o2", 0.7, 0.5, "C"],
    ["o3", 0.66, 0.82, "R"],
  ],
  frames: [
    {
      title: "Set the compact block",
      notes: "Distances between lines allow the team to move as one unit.",
      moves: {
        lb: { x: 0.35, y: 0.24 },
        lcb: { x: 0.34, y: 0.42 },
        rcb: { x: 0.34, y: 0.58 },
        rb: { x: 0.35, y: 0.76 },
        six: { x: 0.47, y: 0.5 },
        eight: { x: 0.5, y: 0.34 },
        ten: { x: 0.5, y: 0.66 },
        lw: { x: 0.6, y: 0.3 },
        nine: { x: 0.61, y: 0.5 },
        rw: { x: 0.6, y: 0.7 },
      },
      ball: { x: 0.66, y: 0.18 },
      arrows: [
        [{ x: 0.6, y: 0.3 }, { x: 0.63, y: 0.22 }],
        [{ x: 0.5, y: 0.66 }, { x: 0.5, y: 0.56 }],
      ],
    },
    {
      title: "Pressure on the left",
      notes: "The winger presses while midfield and back line slide behind.",
      moves: {
        lb: { x: 0.39, y: 0.2 },
        lcb: { x: 0.37, y: 0.37 },
        rcb: { x: 0.36, y: 0.54 },
        rb: { x: 0.37, y: 0.68 },
        six: { x: 0.49, y: 0.43 },
        eight: { x: 0.52, y: 0.28 },
        ten: { x: 0.5, y: 0.55 },
        lw: { x: 0.63, y: 0.22 },
        rw: { x: 0.57, y: 0.58 },
      },
      ball: { x: 0.66, y: 0.18 },
      arrows: [
        [{ x: 0.6, y: 0.3 }, { x: 0.63, y: 0.22 }],
        [{ x: 0.6, y: 0.7 }, { x: 0.57, y: 0.58 }],
      ],
    },
    {
      title: "Travel with the switch",
      notes: "Release pressure and move while the ball crosses the field.",
      moves: {
        lb: { x: 0.36, y: 0.3 },
        lcb: { x: 0.35, y: 0.43 },
        rcb: { x: 0.35, y: 0.57 },
        rb: { x: 0.36, y: 0.7 },
        six: { x: 0.47, y: 0.5 },
        eight: { x: 0.5, y: 0.4 },
        ten: { x: 0.5, y: 0.62 },
        lw: { x: 0.57, y: 0.4 },
        rw: { x: 0.6, y: 0.72 },
      },
      ball: { x: 0.66, y: 0.82 },
      arrows: [
        [{ x: 0.66, y: 0.18 }, { x: 0.66, y: 0.82 }],
        [{ x: 0.6, y: 0.7 }, { x: 0.63, y: 0.78 }],
      ],
    },
    {
      title: "Pressure on the right",
      notes: "Roles mirror: nearest winger presses and far winger narrows.",
      moves: {
        lb: { x: 0.37, y: 0.32 },
        lcb: { x: 0.36, y: 0.46 },
        rcb: { x: 0.37, y: 0.63 },
        rb: { x: 0.39, y: 0.8 },
        six: { x: 0.49, y: 0.57 },
        eight: { x: 0.5, y: 0.45 },
        ten: { x: 0.52, y: 0.72 },
        lw: { x: 0.57, y: 0.42 },
        rw: { x: 0.63, y: 0.78 },
      },
      ball: { x: 0.66, y: 0.82 },
      arrows: [
        [{ x: 0.6, y: 0.7 }, { x: 0.63, y: 0.78 }],
        [{ x: 0.6, y: 0.3 }, { x: 0.57, y: 0.42 }],
      ],
    },
    {
      title: "Reset the block",
      notes: "If play returns backward, recover the original compact shape.",
      moves: {
        lb: { x: 0.35, y: 0.24 },
        lcb: { x: 0.34, y: 0.42 },
        rcb: { x: 0.34, y: 0.58 },
        rb: { x: 0.35, y: 0.76 },
        six: { x: 0.47, y: 0.5 },
        eight: { x: 0.5, y: 0.34 },
        ten: { x: 0.5, y: 0.66 },
        lw: { x: 0.6, y: 0.3 },
        nine: { x: 0.61, y: 0.5 },
        rw: { x: 0.6, y: 0.7 },
      },
      ball: { x: 0.7, y: 0.5 },
      arrows: [
        [{ x: 0.63, y: 0.78 }, { x: 0.6, y: 0.7 }],
        [{ x: 0.57, y: 0.42 }, { x: 0.6, y: 0.3 }],
      ],
    },
  ],
});

const COUNTERATTACK = preset({
  id: "11v11-counterattack-width-depth",
  title: "Counterattack With Width and Depth",
  shortDescription:
    "Turn a regain into a balanced counterattack with depth, width, and trailing support.",
  category: "transitions",
  difficulty: "developing",
  objectives: [
    "Secure the first action after regaining possession.",
    "Provide immediate width, depth, and support beneath the attack.",
  ],
  setupInstructions: [
    "Start with a central regain in the defensive half.",
    "Use two recovering opponents as decision cues.",
  ],
  coachingPoints: [
    "First touch should escape pressure or secure the ball.",
    "One attacker threatens behind while another stretches wide.",
    "The trailing midfielder stays available for retention.",
  ],
  tags: ["11v11", "counterattack", "transition", "width and depth"],
  opponents: [
    ["o1", 0.42, 0.45, "M"],
    ["o2", 0.63, 0.58, "D"],
  ],
  frames: [
    {
      title: "Regain possession",
      notes: "The six wins the ball and scans before the opponent can recover.",
      moves: { six: { x: 0.38, y: 0.48 } },
      ball: { x: 0.38, y: 0.48 },
      arrows: [
        [{ x: 0.42, y: 0.45 }, { x: 0.38, y: 0.48 }],
        [{ x: 0.38, y: 0.48 }, { x: 0.53, y: 0.35 }],
      ],
    },
    {
      title: "Secure or advance",
      notes: "The first player carries into space or releases a clean first pass.",
      moves: {
        six: { x: 0.45, y: 0.48 },
        eight: { x: 0.55, y: 0.35 },
      },
      ball: { x: 0.45, y: 0.48 },
      arrows: [
        [{ x: 0.38, y: 0.48 }, { x: 0.45, y: 0.48 }],
        [{ x: 0.45, y: 0.48 }, { x: 0.55, y: 0.35 }],
      ],
    },
    {
      title: "Add depth and width",
      notes: "The striker runs beyond and the winger opens the far lane.",
      moves: {
        six: { x: 0.45, y: 0.48 },
        eight: { x: 0.58, y: 0.36 },
        nine: { x: 0.86, y: 0.48 },
        rw: { x: 0.76, y: 0.9 },
        lw: { x: 0.72, y: 0.14 },
      },
      ball: { x: 0.58, y: 0.36 },
      arrows: [
        [{ x: 0.78, y: 0.5 }, { x: 0.86, y: 0.48 }],
        [{ x: 0.72, y: 0.86 }, { x: 0.76, y: 0.9 }],
      ],
    },
    {
      title: "Trail beneath the attack",
      notes: "The ten supports the next pass and protects against a turnover.",
      moves: {
        six: { x: 0.52, y: 0.48 },
        eight: { x: 0.66, y: 0.36 },
        ten: { x: 0.61, y: 0.58 },
        nine: { x: 0.88, y: 0.48 },
        rw: { x: 0.79, y: 0.9 },
      },
      ball: { x: 0.66, y: 0.36 },
      arrows: [
        [{ x: 0.55, y: 0.65 }, { x: 0.61, y: 0.58 }],
        [{ x: 0.66, y: 0.36 }, { x: 0.88, y: 0.48 }],
      ],
    },
    {
      title: "Choose the next action",
      notes: "Pass forward, use the width, or retain through trailing support.",
      moves: {
        six: { x: 0.54, y: 0.48 },
        eight: { x: 0.7, y: 0.38 },
        ten: { x: 0.64, y: 0.58 },
        nine: { x: 0.9, y: 0.48 },
        rw: { x: 0.82, y: 0.9 },
      },
      ball: { x: 0.7, y: 0.38 },
      arrows: [
        [{ x: 0.7, y: 0.38 }, { x: 0.9, y: 0.48 }],
        [{ x: 0.7, y: 0.38 }, { x: 0.82, y: 0.9 }],
      ],
    },
  ],
});

export const TACTICAL_PRESETS_11V11: TacticsPreset[] = [
  BUILDOUT,
  WIDE_ROTATION,
  CENTRAL_PROGRESSION,
  MID_BLOCK,
  COUNTERATTACK,
];
