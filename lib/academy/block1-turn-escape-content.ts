import {
  arrow,
  ball,
  cone,
  label,
  player,
  step,
  zone,
} from "@/lib/academy/block1-board-helpers";
import type {
  AcademyActivity,
  AcademyAssignmentTemplate,
  AcademyLessonPackagePracticePlan,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademyTacticalLesson,
} from "@/lib/academy/types";

const GOAL_ID = "u12-change-speed-direction";
const RELATED_GOAL_IDS = [
  "u12-control-across-surfaces",
  "u12-scan-before-receiving",
];
const EVIDENCE_TAG_IDS = [
  "u12-change-speed-direction-evidence-positive",
  "u12-change-speed-direction-evidence-improvement",
];

const EDITORIAL = {
  status: "needs_coach_review" as const,
  originalWording: true,
  originalDiagram: true,
  generatedWithAssistance: true,
};

export const TURN_ESCAPE_LESSON: AcademyTacticalLesson = {
  id: "u12-lesson-turn-escape",
  version: 1,
  title: "Turn to Escape",
  summary:
    "Players learn to change direction with one sharp turn, accelerate away from pressure, and glance up before committing to the escape route.",
  ageBands: ["U11-U12"],
  formats: ["small_group", "9v9"],
  difficulty: "foundation",
  goalIds: [GOAL_ID],
  relatedGoalIds: RELATED_GOAL_IDS,
  estimatedMinutes: 8,
  learningObjective:
    "Scan before turning, use one decisive change of direction to escape pressure, and accelerate into open space within two touches.",
  successCriteria: [
    "The player glances up before choosing a turn direction.",
    "The player completes the turn in one motion without multiple pivots.",
    "The player accelerates immediately after the turn.",
    "The player keeps the ball available through the turn.",
  ],
  coachingPoints: [
    "Know where pressure is before you turn.",
    "One sharp turn beats three small shuffles.",
    "First touch after the turn should explode into space.",
    "Use the outside or inside based on which side is free.",
  ],
  commonErrors: [
    {
      title: "Turning blind",
      description: "The player spins without checking and runs into pressure.",
      correction: "Shoulder check, then turn away from the defender.",
    },
    {
      title: "Multiple pivots",
      description: "The player spins twice and loses the ball.",
      correction: "Commit to one turn direction and protect with the body.",
    },
    {
      title: "No acceleration",
      description: "The player turns but jogs, letting pressure recover.",
      correction: "Explode on the first touch after the turn.",
    },
    {
      title: "Turn into traffic",
      description: "The player turns toward teammates and defenders.",
      correction: "Scan for the clearest lane before committing.",
    },
  ],
  observableEvidence: [
    "Checks a shoulder before turning.",
    "Uses one decisive turn to change direction.",
    "Accelerates within one stride after the turn.",
    "Escapes pressure while keeping the ball within one stride.",
  ],
  progression:
    "Move from channel turns without pressure to a corridor game where a live defender chooses which side to block.",
  introduction: [
    "Show a slow spin versus one sharp turn — which got away from pressure faster?",
    "Turn to escape means leave the defender behind, not just spin in place.",
    "Coach cue: Look, turn, go.",
  ],
  steps: [
    step(
      "lesson-turn-1",
      1,
      "setup",
      "Pressure behind",
      "The player faces forward with a defender approaching from behind.",
      [
        player("lesson-p1", "home", 0.5, 0.5, "P"),
        player("lesson-d1", "away", 0.5, 0.68, "D"),
        ball("lesson-ball", 0.5, 0.52),
        arrow(
          "lesson-pressure",
          { x: 0.5, y: 0.66 },
          { x: 0.5, y: 0.56 },
          "#f87171",
        ),
        label("lesson-label", 0.5, 0.14, "Pressure arriving"),
      ],
      {
        coachCue: "Where is the defender?",
        playerAction: "Player feels pressure from behind.",
        ballAction: "Ball at player's feet facing forward.",
        coachingPurpose: "Establish the problem the turn solves.",
      },
    ),
    step(
      "lesson-turn-2",
      2,
      "start",
      "Shoulder check",
      "The player glances over the shoulder and sees pressure on the right.",
      [
        player("lesson-p1", "home", 0.5, 0.5, "P"),
        player("lesson-d1", "away", 0.52, 0.62, "D"),
        ball("lesson-ball", 0.5, 0.52),
        arrow(
          "lesson-scan",
          { x: 0.5, y: 0.48 },
          { x: 0.58, y: 0.58 },
          "#94a3b8",
        ),
        label("lesson-label", 0.5, 0.14, "Check first"),
      ],
      {
        coachCue: "Look before you turn.",
        playerAction: "Player scans and identifies pressure side.",
        ballAction: "Ball stays close during the scan.",
        coachingPurpose: "Connect scanning to turn direction.",
      },
    ),
    step(
      "lesson-turn-3",
      3,
      "action",
      "Turn away from pressure",
      "The player uses one sharp turn to the left, away from the defender.",
      [
        player("lesson-p1", "home", 0.48, 0.46, "P"),
        player("lesson-d1", "away", 0.52, 0.58, "D"),
        ball("lesson-ball", 0.44, 0.44),
        arrow(
          "lesson-turn",
          { x: 0.5, y: 0.5 },
          { x: 0.42, y: 0.42 },
          "#22c55e",
        ),
        label("lesson-label", 0.5, 0.14, "One sharp turn"),
      ],
      {
        coachCue: "Away from pressure — one motion.",
        playerAction: "Player turns left in one decisive move.",
        ballAction: "Ball stays within one stride through the turn.",
        coachingPurpose: "Show efficient escape mechanics.",
      },
    ),
    step(
      "lesson-turn-4",
      4,
      "decision",
      "Accelerate into space",
      "The first touch after the turn explodes into the open lane.",
      [
        player("lesson-p1", "home", 0.38, 0.38, "P"),
        player("lesson-d1", "away", 0.5, 0.55, "D"),
        ball("lesson-ball", 0.34, 0.36),
        zone("lesson-space", { x: 0.15, y: 0.2 }, { x: 0.42, y: 0.45 }),
        arrow(
          "lesson-burst",
          { x: 0.42, y: 0.42 },
          { x: 0.32, y: 0.34 },
          "#22c55e",
        ),
        label("lesson-label", 0.5, 0.14, "Look, turn, go"),
      ],
      {
        coachCue: "First touch forward — sprint.",
        playerAction: "Player accelerates into open space.",
        ballAction: "Ball pushes into the escape lane.",
        coachingPurpose: "Complete the escape with speed change.",
      },
    ),
  ],
  coachQuestions: [
    "Which side was free before you turned?",
    "How many touches did your turn take?",
    "When should you turn back instead of forward?",
  ],
  playerQuestions: [
    "Did you look before you turned?",
    "Which foot made the escape fastest?",
    "What would have happened without the acceleration?",
  ],
  activityIds: [
    "academy-warmup-turn-escape-channels",
    "academy-activity-turn-escape-corridor",
    "academy-ssg-turn-escape-ends",
  ],
  relatedAssignmentIds: ["academy-assignment-turn-escape"],
  relatedQuizIds: ["academy-quiz-turn-escape"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const TURN_ESCAPE_WARMUP: AcademyActivity = {
  id: "academy-warmup-turn-escape-channels",
  version: 1,
  title: "Channel Turn Relay",
  summary:
    "Players dribble through narrow channels, execute one turn at the end, and sprint back using the opposite foot.",
  description:
    "A relay warmup in parallel channels that isolates one sharp turn at each end. Players must glance up before turning and accelerate on the return leg.",
  category: "warmup",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "foundation",
  formats: ["small_group", "9v9"],
  activityRole: "warm_up",
  activityType: "warmup",
  playerCount: { min: 4, ideal: 12, max: 16 },
  durationMinutes: { min: 8, default: 10, max: 12 },
  field: {
    length: 20,
    width: 8,
    unit: "yards",
    guidance: "One 20-by-8-yard channel per player with a turn zone at each end.",
  },
  equipment: ["one ball per player", "four cones per channel"],
  goalIds: [GOAL_ID, "u12-control-across-surfaces"],
  relatedActivityIds: ["academy-activity-turn-escape-corridor"],
  relatedLessonIds: [TURN_ESCAPE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-turn-escape"],
  relatedQuizIds: ["academy-quiz-turn-escape"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Execute one sharp turn at each end of the channel.",
    "Glance up before committing to the turn direction.",
    "Accelerate immediately on the return leg.",
  ],
  setupInstructions: [
    "Mark parallel 20-by-8-yard channels four yards apart.",
    "Place one player with a ball at the start of each channel.",
    "Define a two-yard turn zone at each end with cones.",
    "Coach calls inside or outside turn at each end.",
  ],
  organization: [
    "Players dribble down, turn once, and return.",
    "Alternate turn direction each repetition.",
    "Run 45-second relays with 15-second resets.",
  ],
  howItWorks: [
    "The player dribbles through the channel at jogging pace.",
    "At the turn zone the player glances up and executes one called turn.",
    "The player accelerates back using the opposite foot to lead.",
    "Next player starts when the previous player crosses the start line.",
  ],
  resetInstructions: [
    "Loose balls are retrieved from the side without crossing neighbors.",
    "Odd numbers create one resting channel — rotate every round.",
  ],
  coachingPoints: [
    "One turn — not three small steps.",
    "Look at the open side before the turn.",
    "Explode on the first touch after turning.",
    "Keep the ball close through the turn.",
  ],
  commonMistakes: [
    {
      mistake: "Multiple pivots in the turn zone.",
      correction: "Shrink turn zone and require exit within two touches.",
    },
    {
      mistake: "Jogging the return leg.",
      correction: "Time the return — beat your previous sprint.",
    },
    {
      mistake: "Turning without looking.",
      correction: "Freeze players who turn before a visible shoulder check.",
    },
  ],
  progressions: [
    {
      title: "Weak-foot turns",
      description: "Every turn must use the non-dominant foot.",
    },
    {
      title: "Partner race",
      description: "Side-by-side channels — first clean turn wins.",
    },
  ],
  regressions: [
    {
      title: "Wider channel",
      description: "Expand to 12 yards wide and walk the approach.",
    },
    {
      title: "Known turn side",
      description: "Post turn direction on a cone before each rep.",
    },
    {
      title: "Uneven attendance",
      description:
        "Share channels in pairs — one dribbles, one calls turn direction.",
    },
  ],
  steps: [
    step(
      "warmup-channel-1",
      1,
      "setup",
      "Parallel channels",
      "Each player has a narrow channel with a turn zone at the far end.",
      [
        zone("warmup-channel", { x: 0.35, y: 0.25 }, { x: 0.65, y: 0.75 }),
        cone("warmup-c1", 0.35, 0.25),
        cone("warmup-c2", 0.65, 0.25),
        cone("warmup-c3", 0.35, 0.75),
        cone("warmup-c4", 0.65, 0.75),
        player("warmup-p1", "home", 0.42, 0.5, "P"),
        ball("warmup-ball", 0.44, 0.5),
        label("warmup-label", 0.5, 0.12, "Channel relay"),
      ],
      {
        coachCue: "One channel each — turn at the end.",
        playerAction: "Player identifies channel boundaries.",
        ballAction: "Ball at player's feet.",
        coachingPurpose: "Set spacing for isolated turns.",
      },
    ),
    step(
      "warmup-channel-2",
      2,
      "start",
      "Dribble to turn zone",
      "The player jogs forward keeping the ball available.",
      [
        zone("warmup-channel", { x: 0.35, y: 0.25 }, { x: 0.65, y: 0.75 }),
        player("warmup-p1", "home", 0.52, 0.5, "P"),
        ball("warmup-ball", 0.54, 0.5),
        arrow(
          "warmup-forward",
          { x: 0.46, y: 0.5 },
          { x: 0.58, y: 0.5 },
        ),
        label("warmup-label", 0.5, 0.12, "Approach the turn"),
      ],
      {
        coachCue: "Ball close — eyes forward.",
        playerAction: "Player dribbles toward turn zone.",
        ballAction: "Ball stays within one stride.",
        coachingPurpose: "Approach the turn under control.",
      },
    ),
    step(
      "warmup-channel-3",
      3,
      "action",
      "One sharp turn",
      "At the end the player checks over the shoulder and turns away in one motion.",
      [
        zone("warmup-turn", { x: 0.58, y: 0.35 }, { x: 0.65, y: 0.65 }),
        player("warmup-p1", "home", 0.6, 0.48, "P"),
        ball("warmup-ball", 0.58, 0.46),
        arrow(
          "warmup-turn-arrow",
          { x: 0.6, y: 0.5 },
          { x: 0.52, y: 0.42 },
          "#22c55e",
        ),
        label("warmup-label", 0.5, 0.12, "Look, turn"),
      ],
      {
        coachCue: "Check, one turn, go.",
        playerAction: "Player executes single decisive turn.",
        ballAction: "Ball stays close through the turn.",
        coachingPurpose: "Isolate efficient turn mechanics.",
      },
    ),
    step(
      "warmup-channel-4",
      4,
      "action",
      "Sprint the return",
      "The first touch after the turn explodes back toward the start.",
      [
        zone("warmup-channel", { x: 0.35, y: 0.25 }, { x: 0.65, y: 0.75 }),
        player("warmup-p1", "home", 0.48, 0.42, "P"),
        ball("warmup-ball", 0.44, 0.4),
        arrow(
          "warmup-sprint",
          { x: 0.56, y: 0.46 },
          { x: 0.4, y: 0.42 },
          "#22c55e",
        ),
        label("warmup-label", 0.5, 0.12, "Accelerate"),
      ],
      {
        coachCue: "First touch — burst.",
        playerAction: "Player sprints return leg.",
        ballAction: "Ball pushes into escape lane.",
        coachingPurpose: "Link turn to speed change.",
      },
    ),
    step(
      "warmup-channel-5",
      5,
      "rotation",
      "Tag the next player",
      "Returning player high-fives the next starter at the line.",
      [
        player("warmup-p1", "home", 0.38, 0.5, "P"),
        player("warmup-p2", "home", 0.36, 0.58, "2"),
        ball("warmup-ball", 0.36, 0.5),
        label("warmup-label", 0.5, 0.12, "Relay handoff"),
      ],
      {
        coachCue: "Clean handoff — next turn.",
        playerAction: "Next player starts immediately.",
        ballAction: "Ball transfers at the line.",
        coachingPurpose: "Maintain flow in relay format.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Keep four yards between parallel channels.",
    "Players turn away from neighbors at each end.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms channel spacing before approval.",
    ],
  },
  searchTags: ["turn", "speed", "channels", "warmup", "direction change"],
};

export const TURN_ESCAPE_TECHNICAL: AcademyActivity = {
  id: "academy-activity-turn-escape-corridor",
  version: 1,
  title: "Escape Corridor",
  summary:
    "Attackers dribble through a corridor while a defender chooses one side to block; the attacker must turn away and escape.",
  description:
    "An opposed corridor exercise where the attacker approaches a live defender who can jockey but must stay on one side. The attacker scans, turns away from the block, and accelerates out of the corridor.",
  category: "technical",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "foundation",
  formats: ["small_group", "9v9"],
  activityRole: "technical",
  activityType: "opposed_technical",
  playerCount: { min: 2, ideal: 8, max: 12 },
  durationMinutes: { min: 12, default: 15, max: 20 },
  field: {
    length: 15,
    width: 6,
    unit: "yards",
    guidance: "One 15-by-6-yard corridor per pair with a defender at the far end.",
  },
  equipment: ["one ball per pair", "four cones per corridor"],
  goalIds: [GOAL_ID, "u12-scan-before-receiving"],
  relatedActivityIds: [
    "academy-warmup-turn-escape-channels",
    "academy-ssg-turn-escape-ends",
  ],
  relatedLessonIds: [TURN_ESCAPE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-turn-escape"],
  relatedQuizIds: ["academy-quiz-turn-escape"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Scan before reaching the defender.",
    "Turn away from the blocked side in one motion.",
    "Accelerate out of the corridor within two touches.",
  ],
  setupInstructions: [
    "Mark a 15-by-6-yard corridor with cones.",
    "Attacker starts at one end with a ball; defender waits at the far end.",
    "Defender must choose left or right side before attacker enters last five yards.",
    "Attacker scores by exiting the corridor under control within five seconds.",
  ],
  organization: [
    "Work 30-second rounds then swap roles.",
    "Multiple corridors for larger groups.",
    "Defender announces blocked side with a hand raise.",
  ],
  howItWorks: [
    "Attacker dribbles through the corridor at pace.",
    "Defender shows which side is blocked before the attacker arrives.",
    "Attacker scans, turns away from the block, and escapes.",
    "Successful escape = exit under control; failed = defender touches ball.",
    "Swap roles after each attempt.",
  ],
  resetInstructions: [
    "Restart from the corridor start after each attempt.",
    "Waiting players rotate into defender role when numbers are uneven.",
  ],
  coachingPoints: [
    "Scan early — decide before the last five yards.",
    "Turn away from the raised hand, not into it.",
    "Protect with the body during the turn.",
    "Explode on the escape touch.",
  ],
  commonMistakes: [
    {
      mistake: "Attacker turns into the blocked side.",
      correction: "Defender holds the hand up until attacker commits correctly.",
    },
    {
      mistake: "Slow escape after the turn.",
      correction: "Time exits — under three seconds or restart.",
    },
    {
      mistake: "Defender blocks both sides.",
      correction: "Defender may only block one side per rep.",
    },
  ],
  progressions: [
    {
      title: "Live tackle",
      description: "Defender can win the ball after the attacker enters the zone.",
    },
    {
      title: "Reverse approach",
      description: "Attacker starts facing away and receives before the corridor.",
    },
  ],
  regressions: [
    {
      title: "Passive block",
      description: "Defender shows side but cannot move for three reps.",
    },
    {
      title: "Wider corridor",
      description: "Expand to eight yards wide.",
    },
    {
      title: "Uneven attendance",
      description:
        "Groups of three — third player calls blocked side from the sideline.",
    },
  ],
  steps: [
    step(
      "tech-corridor-1",
      1,
      "setup",
      "Corridor and defender",
      "Attacker faces a narrow corridor with a defender at the far end.",
      [
        zone("tech-corridor", { x: 0.32, y: 0.3 }, { x: 0.68, y: 0.7 }),
        player("tech-atk", "home", 0.36, 0.5, "A"),
        player("tech-def", "away", 0.64, 0.5, "D"),
        ball("tech-ball", 0.38, 0.5),
        label("tech-label", 0.5, 0.14, "Escape corridor"),
      ],
      {
        coachCue: "Corridor clear — defender picks a side.",
        playerAction: "Attacker identifies corridor and defender.",
        ballAction: "Ball at attacker's feet.",
        coachingPurpose: "Set opposed escape scenario.",
      },
    ),
    step(
      "tech-corridor-2",
      2,
      "start",
      "Approach with scan",
      "Attacker dribbles forward and checks over the shoulder.",
      [
        zone("tech-corridor", { x: 0.32, y: 0.3 }, { x: 0.68, y: 0.7 }),
        player("tech-atk", "home", 0.48, 0.5, "A"),
        player("tech-def", "away", 0.64, 0.48, "D"),
        ball("tech-ball", 0.5, 0.5),
        arrow(
          "tech-scan",
          { x: 0.48, y: 0.48 },
          { x: 0.6, y: 0.44 },
          "#94a3b8",
        ),
        label("tech-label", 0.5, 0.14, "Scan early"),
      ],
      {
        coachCue: "Look before the last five yards.",
        playerAction: "Attacker scans while dribbling.",
        ballAction: "Ball stays available.",
        coachingPurpose: "Build scan timing before the turn.",
      },
    ),
    step(
      "tech-corridor-3",
      3,
      "action",
      "Defender blocks right",
      "Defender raises hand to block right; attacker turns left away from pressure.",
      [
        zone("tech-corridor", { x: 0.32, y: 0.3 }, { x: 0.68, y: 0.7 }),
        player("tech-atk", "home", 0.56, 0.52, "A"),
        player("tech-def", "away", 0.64, 0.54, "D"),
        ball("tech-ball", 0.54, 0.5),
        arrow(
          "tech-block",
          { x: 0.64, y: 0.5 },
          { x: 0.64, y: 0.62 },
          "#f87171",
        ),
        arrow(
          "tech-turn",
          { x: 0.54, y: 0.5 },
          { x: 0.46, y: 0.38 },
          "#22c55e",
        ),
        label("tech-label", 0.5, 0.14, "Turn away"),
      ],
      {
        coachCue: "Away from the hand.",
        playerAction: "Attacker turns left in one motion.",
        ballAction: "Ball protected through the turn.",
        coachingPurpose: "Practice reading defender cue.",
      },
    ),
    step(
      "tech-corridor-4",
      4,
      "reset",
      "Burst out, then swap roles",
      "Attacker accelerates out of the corridor before defender recovers, then partners reset and swap.",
      [
        zone("tech-corridor", { x: 0.32, y: 0.3 }, { x: 0.68, y: 0.7 }),
        player("tech-atk", "home", 0.4, 0.36, "A"),
        player("tech-def", "away", 0.58, 0.5, "D"),
        ball("tech-ball", 0.36, 0.34),
        arrow(
          "tech-escape",
          { x: 0.46, y: 0.4 },
          { x: 0.34, y: 0.32 },
          "#22c55e",
        ),
        label("tech-label", 0.5, 0.14, "Escape and go"),
      ],
      {
        coachCue: "First touch — explode.",
        playerAction: "Attacker sprints out of corridor.",
        ballAction: "Ball pushed into open lane.",
        coachingPurpose: "Complete escape with acceleration.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Defender jockeys without reckless tackling in foundation rounds.",
    "Keep corridors four yards apart.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms defender constraints before approval.",
    ],
  },
  searchTags: ["turn", "opposed", "corridor", "escape", "acceleration"],
};

export const TURN_ESCAPE_SSG: AcademyActivity = {
  id: "academy-ssg-turn-escape-ends",
  version: 1,
  title: "End-Zone Turn Game",
  summary:
    "Teams score by turning away from pressure in the attacking end zone and connecting a pass to a teammate.",
  description:
    "A directional small-sided game where players must enter the end zone, execute one turn away from pressure, and complete a pass to a teammate to score.",
  category: "small_sided_game",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "foundation",
  formats: ["small_group", "9v9"],
  activityRole: "small_sided_game",
  activityType: "small_sided_game",
  playerCount: { min: 6, ideal: 10, max: 14 },
  durationMinutes: { min: 15, default: 20, max: 25 },
  field: {
    length: 32,
    width: 24,
    unit: "yards",
    guidance: "32-by-24-yard field with a six-yard end zone at each end.",
  },
  equipment: ["one ball", "eight cones"],
  goalIds: [GOAL_ID, "u12-control-across-surfaces"],
  relatedActivityIds: [
    "academy-warmup-turn-escape-channels",
    "academy-activity-turn-escape-corridor",
  ],
  relatedLessonIds: [TURN_ESCAPE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-turn-escape"],
  relatedQuizIds: ["academy-quiz-turn-escape"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Turn away from pressure in the end zone under game conditions.",
    "Accelerate after the turn to create a passing angle.",
    "Connect with a teammate after the escape turn.",
  ],
  setupInstructions: [
    "Mark a 32-by-24-yard field with six-yard end zones.",
    "Organize 4v4 or 5v5 equal teams.",
    "Score by entering the end zone, one turn away from pressure, and completing a pass.",
    "Keep spare balls on touchlines.",
  ],
  organization: [
    "Play 4-minute rounds with coaching between rounds.",
    "Restart from defending end zone after scores.",
    "Coach freezes to highlight clean escape turns.",
  ],
  howItWorks: [
    "Teams attack opposite end zones directionally.",
    "A player with the ball must enter the end zone under control.",
    "Inside the zone the player must turn away from the nearest defender once.",
    "Score requires a completed pass to a teammate after the turn.",
    "Turning into pressure or multiple pivots resets the attack.",
  ],
  resetInstructions: [
    "Defending team restarts from their end zone after a score.",
    "Use spare balls for out-of-bounds restarts.",
  ],
  coachingPoints: [
    "Enter the zone under control — not at full sprint.",
    "Scan before the turn inside the zone.",
    "Accelerate after the turn to open the passing lane.",
    "Support runners arrive at angles, not straight lines.",
  ],
  commonMistakes: [
    {
      mistake: "Player turns before entering the zone.",
      correction: "Turn only counts inside the shaded end zone.",
    },
    {
      mistake: "Multiple spins in the zone.",
      correction: "One turn rule — reset if broken.",
    },
    {
      mistake: "Teammates stand behind defenders.",
      correction: "Support from wide angles outside the zone.",
    },
  ],
  progressions: [
    {
      title: "Two-touch finish",
      description: "Pass after turn must happen within two touches.",
    },
    {
      title: "Weak-foot turn bonus",
      description: "Two points for escape turn on non-dominant foot.",
    },
  ],
  regressions: [
    {
      title: "Deeper end zones",
      description: "Expand end zones to eight yards.",
    },
    {
      title: "Unopposed turn first",
      description: "Defenders wait outside zone for two rounds.",
    },
    {
      title: "Uneven attendance",
      description: "Play 4v3 with a neutral attacker in the end zone.",
    },
  ],
  steps: [
    step(
      "ssg-ends-1",
      1,
      "setup",
      "End zones marked",
      "Teams face opposite six-yard end zones in a directional field.",
      [
        zone("ssg-field", { x: 0.1, y: 0.18 }, { x: 0.9, y: 0.82 }),
        zone("ssg-left", { x: 0.1, y: 0.18 }, { x: 0.22, y: 0.82 }, "#f59e0b30"),
        zone("ssg-right", { x: 0.78, y: 0.18 }, { x: 0.9, y: 0.82 }, "#f59e0b30"),
        player("ssg-h1", "home", 0.4, 0.4, "1"),
        player("ssg-h2", "home", 0.38, 0.55, "2"),
        player("ssg-a1", "away", 0.6, 0.42, "1"),
        player("ssg-a2", "away", 0.62, 0.58, "2"),
        ball("ssg-ball", 0.42, 0.5),
        label("ssg-label", 0.5, 0.1, "Turn to score"),
      ],
      {
        coachCue: "Enter zone, turn, pass.",
        playerAction: "Teams identify end zones and scoring rule.",
        ballAction: "Ball with home team.",
        coachingPurpose: "Create game context for escape turns.",
      },
    ),
    step(
      "ssg-ends-2",
      2,
      "start",
      "Drive into the zone",
      "H1 dribbles toward the attacking end zone with a defender closing.",
      [
        zone("ssg-right", { x: 0.78, y: 0.18 }, { x: 0.9, y: 0.82 }, "#f59e0b30"),
        player("ssg-h1", "home", 0.68, 0.45, "1"),
        player("ssg-a1", "away", 0.72, 0.5, "1"),
        ball("ssg-ball", 0.7, 0.46),
        arrow(
          "ssg-drive",
          { x: 0.6, y: 0.46 },
          { x: 0.72, y: 0.46 },
        ),
        label("ssg-label", 0.5, 0.1, "Enter under control"),
      ],
      {
        coachCue: "Control speed entering the zone.",
        playerAction: "H1 approaches zone with ball available.",
        ballAction: "Ball stays within one stride.",
        coachingPurpose: "Set up the turn moment.",
      },
    ),
    step(
      "ssg-ends-3",
      3,
      "action",
      "Turn away in the zone",
      "H1 scans and turns left away from A1 inside the end zone.",
      [
        zone("ssg-right", { x: 0.78, y: 0.18 }, { x: 0.9, y: 0.82 }, "#f59e0b30"),
        player("ssg-h1", "home", 0.82, 0.48, "1"),
        player("ssg-a1", "away", 0.8, 0.54, "1"),
        ball("ssg-ball", 0.8, 0.46),
        arrow(
          "ssg-turn",
          { x: 0.8, y: 0.48 },
          { x: 0.84, y: 0.38 },
          "#22c55e",
        ),
        label("ssg-label", 0.5, 0.1, "One turn away"),
      ],
      {
        coachCue: "Look, turn away, protect.",
        playerAction: "H1 executes single escape turn.",
        ballAction: "Ball protected through turn.",
        coachingPurpose: "Apply turn skill under pressure.",
      },
    ),
    step(
      "ssg-ends-4",
      4,
      "decision",
      "Pass after escape",
      "H1 accelerates and finds H2 after the turn.",
      [
        zone("ssg-right", { x: 0.78, y: 0.18 }, { x: 0.9, y: 0.82 }, "#f59e0b30"),
        player("ssg-h1", "home", 0.84, 0.36, "1"),
        player("ssg-h2", "home", 0.72, 0.28, "2"),
        player("ssg-a1", "away", 0.78, 0.48, "1"),
        ball("ssg-ball", 0.78, 0.32),
        arrow(
          "ssg-pass",
          { x: 0.82, y: 0.36 },
          { x: 0.74, y: 0.3 },
        ),
        label("ssg-label", 0.5, 0.1, "Connect after turn"),
      ],
      {
        coachCue: "Burst, then find support.",
        playerAction: "H1 passes to H2 after acceleration.",
        ballAction: "Ball reaches teammate — score.",
        coachingPurpose: "Reward complete escape sequence.",
      },
    ),
    step(
      "ssg-ends-5",
      5,
      "reset",
      "Defenders counter",
      "After turnover away turns and attacks opposite zone.",
      [
        zone("ssg-left", { x: 0.1, y: 0.18 }, { x: 0.22, y: 0.82 }, "#f59e0b30"),
        player("ssg-a2", "away", 0.48, 0.5, "2"),
        player("ssg-a1", "away", 0.32, 0.42, "1"),
        ball("ssg-ball", 0.44, 0.5),
        arrow(
          "ssg-counter",
          { x: 0.46, y: 0.5 },
          { x: 0.3, y: 0.42 },
          "#f87171",
        ),
        label("ssg-label", 0.5, 0.1, "Turnover — react"),
      ],
      {
        coachCue: "Ball free — turn and go.",
        playerAction: "Away transitions to attack.",
        ballAction: "Ball moves toward opposite zone.",
        coachingPurpose: "Reinforce transition habit from lesson one.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "End zones should not overlap with touchline hazards.",
    "Scale field for roster size.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms end-zone depth before approval.",
    ],
  },
  searchTags: ["small sided game", "turn", "end zone", "escape"],
};

export const TURN_ESCAPE_ASSIGNMENT: AcademyAssignmentTemplate = {
  id: "academy-assignment-turn-escape",
  version: 1,
  title: "Turn and Go at Home",
  description:
    "Practice one sharp turn and acceleration alone or with a partner, then note when a turn helped you escape pressure.",
  assignmentType: "practice_skill",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  linkedLessonId: TURN_ESCAPE_LESSON.id,
  linkedDrillId: TURN_ESCAPE_WARMUP.id,
  linkedQuizId: "academy-quiz-turn-escape",
  estimatedMinutes: 16,
  completionCriteria: [
    "Complete 10 turns on each foot with a glance up before every turn.",
    "Accelerate within one stride after each turn for all repetitions.",
    "Answer one reflection question about a turn that escaped pressure.",
  ],
  easierOption:
    "Walk through turns with a posted direction cone and no partner.",
  harderOption:
    "Add a partner who calls blocked side; race to a cone five yards away after each turn.",
  instructions: [
    "Place two cones eight steps apart as a mini corridor.",
    "Dribble from one cone to the other, glance over your shoulder, and turn away in one motion.",
    "Sprint back to the start cone — that is one rep.",
    "Do five reps turning left, five turning right, then switch leading foot.",
    "If a parent or partner is available, have them raise a hand for blocked side.",
    "Write or say: when did a turn help you get away from someone?",
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const TURN_ESCAPE_QUIZ_QUESTIONS: AcademyQuizQuestion[] = [
  {
    id: "academy-quiz-turn-escape-q1",
    questionType: "multiple_choice",
    prompt: "Before turning away from pressure, what should you do?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "scan", label: "Glance to see where pressure is" },
      { id: "close", label: "Close your eyes and spin fast" },
      { id: "stop", label: "Stop and ask the coach" },
    ],
    correctOptionIds: ["scan"],
    explanation: "A quick look tells you which side is free before you commit.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-turn-escape-q2",
    questionType: "multiple_choice",
    prompt: "Pressure is on your right. Which turn usually escapes best?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "left", label: "One sharp turn to the left" },
      { id: "right", label: "Turn into the defender on the right" },
      { id: "spin", label: "Three small pivots in place" },
    ],
    correctOptionIds: ["left"],
    explanation: "Turn away from pressure in one decisive motion.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-turn-escape-q3",
    questionType: "true_false",
    prompt: "After a good escape turn, you should jog slowly to rest.",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    correctOptionIds: ["false"],
    explanation:
      "Accelerate on the first touch after the turn so pressure cannot recover.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-turn-escape-q4",
    questionType: "multiple_choice",
    prompt:
      "You enter an end zone with a defender close behind. Best sequence?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      {
        id: "look-turn-go",
        label: "Scan, one turn away, accelerate, pass to support",
      },
      { id: "shoot", label: "Shoot immediately without looking" },
      { id: "spin", label: "Spin until the defender leaves" },
    ],
    correctOptionIds: ["look-turn-go"],
    explanation: "Look, turn, go — then use the space you created.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-turn-escape-q5",
    questionType: "multiple_choice",
    prompt: "What makes a turn an escape instead of just a spin?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      {
        id: "space",
        label: "You leave the defender and move into open space",
      },
      { id: "spot", label: "You stay in the same spot facing the defender" },
      { id: "slow", label: "You turn slowly without moving the ball" },
    ],
    correctOptionIds: ["space"],
    explanation: "Escape means getting away — turn plus acceleration into space.",
    editorial: { ...EDITORIAL },
  },
];

export const TURN_ESCAPE_QUIZ: AcademyQuiz = {
  id: "academy-quiz-turn-escape",
  version: 1,
  title: "Turn to Escape Check",
  description:
    "Five decision questions about scanning, turn direction, acceleration, and escaping pressure.",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  questionIds: TURN_ESCAPE_QUIZ_QUESTIONS.map((question) => question.id),
  editorial: { ...EDITORIAL },
};

export const TURN_ESCAPE_PRACTICE_PLAN: AcademyLessonPackagePracticePlan = {
  defaultMinutes: 75,
  shortMinutes: 45,
  sections: [
    {
      order: 1,
      role: "warm_up",
      activityId: "academy-warmup-turn-escape-channels",
      plannedMinutes: 15,
      shortMinutes: 10,
      objective: "One sharp turn at each channel end with acceleration back.",
    },
    {
      order: 2,
      role: "technical",
      activityId: "academy-activity-turn-escape-corridor",
      plannedMinutes: 25,
      shortMinutes: 15,
      objective: "Turn away from a live block and escape the corridor.",
    },
    {
      order: 3,
      role: "small_sided_game",
      activityId: "academy-ssg-turn-escape-ends",
      plannedMinutes: 35,
      shortMinutes: 20,
      objective: "Turn in the end zone and connect a pass to score.",
    },
  ],
  reflectionQuestions: [
    "Did you look before you turned today?",
    "Which turn direction worked best against pressure?",
    "Did you accelerate immediately after turning?",
  ],
};
