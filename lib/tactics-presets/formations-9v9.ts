import {
  formationPreset,
  player,
  step,
} from "@/lib/tactics-presets/helpers";
import type { TacticsPreset } from "@/lib/tactics-presets/types";

export const FORMATION_PRESETS_9V9: TacticsPreset[] = [
  formationPreset({
    id: "formation-9v9-3-3-2",
    title: "9v9 3-3-2",
    shortDescription:
      "A balanced shape with three defenders, three midfielders, and two forwards.",
    format: "9v9",
    playerCount: 9,
    goalkeeperCount: 1,
    ageGuidance: "U11-U12",
    objectives: [
      "Create reliable width and central support in every line.",
      "Build compact defensive connections from goalkeeper to forwards.",
    ],
    setupInstructions: [
      "Place the goalkeeper centrally behind a line of three defenders.",
      "Set three midfielders across the pitch and two forwards on the highest line.",
      "Adjust spacing so adjacent players can support one another without occupying the same channel.",
    ],
    coachingPoints: [
      "Outside defenders provide width while the central defender protects depth.",
      "The central midfielder connects the three lines and balances forward runs.",
      "The two forwards should stagger rather than stand on the same horizontal line.",
    ],
    tags: ["9v9", "formation", "balanced", "two-forwards", "build-out"],
    steps: [
      step(
        "formation-9v9-3-3-2-step-1",
        0,
        "Step 1",
        [
          player("formation-9v9-3-3-2-gk", "home", 0.08, 0.5, "GK"),
          player("formation-9v9-3-3-2-ld", "home", 0.28, 0.2, "LD"),
          player("formation-9v9-3-3-2-cd", "home", 0.25, 0.5, "CD"),
          player("formation-9v9-3-3-2-rd", "home", 0.28, 0.8, "RD"),
          player("formation-9v9-3-3-2-lm", "home", 0.51, 0.18, "LM"),
          player("formation-9v9-3-3-2-cm", "home", 0.47, 0.5, "CM"),
          player("formation-9v9-3-3-2-rm", "home", 0.51, 0.82, "RM"),
          player("formation-9v9-3-3-2-lf", "home", 0.75, 0.36, "LF"),
          player("formation-9v9-3-3-2-rf", "home", 0.75, 0.64, "RF"),
        ],
        "Starting positions for the 3-3-2 formation.",
      ),
    ],
  }),
  formationPreset({
    id: "formation-9v9-3-2-3",
    title: "9v9 3-2-3",
    shortDescription:
      "An attacking shape with a back three, two central midfielders, and a front three.",
    format: "9v9",
    playerCount: 9,
    goalkeeperCount: 1,
    ageGuidance: "U11-U12",
    difficulty: "developing",
    objectives: [
      "Stretch the opposition with three players across the forward line.",
      "Use the midfield pair to connect buildup and protect transitions.",
    ],
    setupInstructions: [
      "Place the goalkeeper behind three defenders.",
      "Position two midfielders centrally and at different heights.",
      "Set two wide forwards around a central striker on the highest line.",
    ],
    coachingPoints: [
      "Wide forwards stay available in outside channels before timing runs inside.",
      "One midfielder supports the attack while the other protects the center.",
      "The back three should slide together when the ball moves across the pitch.",
    ],
    tags: ["9v9", "formation", "attacking", "front-three", "width"],
    steps: [
      step(
        "formation-9v9-3-2-3-step-1",
        0,
        "Step 1",
        [
          player("formation-9v9-3-2-3-gk", "home", 0.08, 0.5, "GK"),
          player("formation-9v9-3-2-3-ld", "home", 0.27, 0.2, "LD"),
          player("formation-9v9-3-2-3-cd", "home", 0.24, 0.5, "CD"),
          player("formation-9v9-3-2-3-rd", "home", 0.27, 0.8, "RD"),
          player("formation-9v9-3-2-3-lcm", "home", 0.49, 0.38, "LCM"),
          player("formation-9v9-3-2-3-rcm", "home", 0.49, 0.62, "RCM"),
          player("formation-9v9-3-2-3-lw", "home", 0.73, 0.16, "LW"),
          player("formation-9v9-3-2-3-st", "home", 0.77, 0.5, "ST"),
          player("formation-9v9-3-2-3-rw", "home", 0.73, 0.84, "RW"),
        ],
        "Starting positions for the 3-2-3 formation.",
      ),
    ],
  }),
  formationPreset({
    id: "formation-9v9-2-3-3",
    title: "9v9 2-3-3",
    shortDescription:
      "A front-foot shape that commits three attackers ahead of a three-player midfield.",
    format: "9v9",
    playerCount: 9,
    goalkeeperCount: 1,
    ageGuidance: "U11-U12",
    difficulty: "advanced",
    objectives: [
      "Create high attacking width and multiple options around the penalty area.",
      "Develop coordinated counterpressing after possession is lost.",
    ],
    setupInstructions: [
      "Place the goalkeeper behind two central defenders.",
      "Arrange three midfielders across the middle with the central player slightly deeper.",
      "Position two wingers outside a central striker.",
    ],
    coachingPoints: [
      "The deeper midfielder must screen the two defenders when teammates advance.",
      "Attackers counterpress immediately or recover into compact positions together.",
      "This shape is vulnerable to counterattacks in wide defensive channels; the nearest midfielder must cover quickly.",
    ],
    safetyNotes: [
      "Introduce the shape only after players understand recovery runs and transition responsibilities.",
    ],
    tags: ["9v9", "formation", "attacking", "front-three", "counterpress"],
    steps: [
      step(
        "formation-9v9-2-3-3-step-1",
        0,
        "Step 1",
        [
          player("formation-9v9-2-3-3-gk", "home", 0.08, 0.5, "GK"),
          player("formation-9v9-2-3-3-lcb", "home", 0.26, 0.36, "LCB"),
          player("formation-9v9-2-3-3-rcb", "home", 0.26, 0.64, "RCB"),
          player("formation-9v9-2-3-3-lm", "home", 0.5, 0.2, "LM"),
          player("formation-9v9-2-3-3-dm", "home", 0.45, 0.5, "DM"),
          player("formation-9v9-2-3-3-rm", "home", 0.5, 0.8, "RM"),
          player("formation-9v9-2-3-3-lw", "home", 0.74, 0.16, "LW"),
          player("formation-9v9-2-3-3-st", "home", 0.78, 0.5, "ST"),
          player("formation-9v9-2-3-3-rw", "home", 0.74, 0.84, "RW"),
        ],
        "Starting positions for the 2-3-3 formation.",
      ),
    ],
  }),
  formationPreset({
    id: "formation-9v9-4-3-1",
    title: "9v9 4-3-1",
    shortDescription:
      "A compact defensive shape with a back four, midfield three, and one central forward.",
    format: "9v9",
    playerCount: 9,
    goalkeeperCount: 1,
    ageGuidance: "U11-U12",
    objectives: [
      "Protect the center with compact defensive and midfield lines.",
      "Build attacks through fullbacks and coordinated midfield support.",
    ],
    setupInstructions: [
      "Place the goalkeeper behind two center backs and two fullbacks.",
      "Arrange three midfielders across the central line.",
      "Position one striker centrally ahead of the midfield.",
    ],
    coachingPoints: [
      "Fullbacks provide attacking width but recover quickly when possession changes.",
      "The midfield three slide together to deny central passing lanes.",
      "The striker holds the ball and waits for midfield runners to join.",
    ],
    tags: ["9v9", "formation", "compact", "back-four", "single-striker"],
    steps: [
      step(
        "formation-9v9-4-3-1-step-1",
        0,
        "Step 1",
        [
          player("formation-9v9-4-3-1-gk", "home", 0.08, 0.5, "GK"),
          player("formation-9v9-4-3-1-lb", "home", 0.28, 0.14, "LB"),
          player("formation-9v9-4-3-1-lcb", "home", 0.24, 0.38, "LCB"),
          player("formation-9v9-4-3-1-rcb", "home", 0.24, 0.62, "RCB"),
          player("formation-9v9-4-3-1-rb", "home", 0.28, 0.86, "RB"),
          player("formation-9v9-4-3-1-lm", "home", 0.5, 0.24, "LM"),
          player("formation-9v9-4-3-1-cm", "home", 0.47, 0.5, "CM"),
          player("formation-9v9-4-3-1-rm", "home", 0.5, 0.76, "RM"),
          player("formation-9v9-4-3-1-st", "home", 0.75, 0.5, "ST"),
        ],
        "Starting positions for the 4-3-1 formation.",
      ),
    ],
  }),
];
