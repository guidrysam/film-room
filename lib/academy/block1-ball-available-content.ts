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

const GOAL_ID = "u12-control-across-surfaces";
const RELATED_GOAL_IDS = [
  "u12-scan-before-receiving",
  "u12-change-speed-direction",
];
const EVIDENCE_TAG_IDS = [
  "u12-control-across-surfaces-evidence-positive",
  "u12-control-across-surfaces-evidence-improvement",
];

const EDITORIAL = {
  status: "needs_coach_review" as const,
  originalWording: true,
  originalDiagram: true,
  generatedWithAssistance: true,
};

export const BALL_AVAILABLE_LESSON: AcademyTacticalLesson = {
  id: "u12-lesson-ball-available",
  version: 1,
  title: "Keep the Ball Available",
  summary:
    "Players learn to move the ball across different surfaces while keeping it playable, glancing up between touches, and noticing when the ball is free.",
  ageBands: ["U11-U12"],
  formats: ["small_group", "9v9"],
  difficulty: "foundation",
  goalIds: [GOAL_ID],
  relatedGoalIds: RELATED_GOAL_IDS,
  estimatedMinutes: 8,
  learningObjective:
    "Move the ball across both feet and the sole while keeping it within one stride and glancing up to notice nearby space.",
  successCriteria: [
    "The player changes surface without trapping the ball under the body.",
    "The player glances up briefly between touches without losing control.",
    "The player keeps the ball playable while walking or jogging.",
    "The player can name when the ball is free versus when a defender is close.",
  ],
  coachingPoints: [
    "Soft touches keep the ball close enough to protect.",
    "Use the sole to pause, then push to the safe foot.",
    "Glance up between touches, not during contact.",
    "Notice when the ball is free — that is the moment to look forward.",
  ],
  commonErrors: [
    {
      title: "Heavy touches",
      description: "The ball bounces too far and invites a tackle.",
      correction: "Cushion with the inside of the foot and shorten the stride.",
    },
    {
      title: "Head down the whole time",
      description: "The player never sees teammates or pressure.",
      correction: "Look at the ball on contact, then lift the eyes on the next step.",
    },
    {
      title: "Only one foot",
      description: "The player panics when the ball arrives on the weaker foot.",
      correction: "Alternate surfaces deliberately in unopposed reps.",
    },
    {
      title: "Standing on the ball",
      description: "The player stops moving and loses forward options.",
      correction: "Use the sole to settle, then push into motion within one second.",
    },
  ],
  observableEvidence: [
    "Alternates inside, outside, and sole without stopping play.",
    "Glances up between touches during movement.",
    "Keeps the ball within one stride while changing direction.",
    "Calls out or points when the ball is free.",
  ],
  progression:
    "Move from solo surface switches to a lightly opposed box where the player must keep the ball available under a passive shadow.",
  introduction: [
    "Ask players to dribble with their head down, then again with a glance up every two touches — which felt safer?",
    "Explain that available means playable: close enough to protect, free enough to pass or turn.",
    "Coach cue: Ball free? Eyes up. Ball tight? Protect first.",
  ],
  steps: [
    step(
      "lesson-ball-available-1",
      1,
      "setup",
      "Ball trapped underfoot",
      "The player stops on the ball with both feet square and cannot see forward.",
      [
        player("lesson-p1", "home", 0.5, 0.5, "P"),
        ball("lesson-ball", 0.5, 0.52),
        cone("lesson-c1", 0.72, 0.35),
        cone("lesson-c2", 0.72, 0.65),
        label("lesson-label", 0.5, 0.14, "Ball stuck"),
      ],
      {
        coachCue: "Can you still move?",
        playerAction: "Player notices the ball is trapped and vision is blocked.",
        ballAction: "Ball sits under the standing foot.",
        coachingPurpose: "Show the cost of stopping on the ball.",
      },
    ),
    step(
      "lesson-ball-available-2",
      2,
      "start",
      "Sole settle, push out",
      "The player uses the sole to pause, then pushes the ball to the inside of the safe foot.",
      [
        player("lesson-p1", "home", 0.46, 0.5, "P"),
        ball("lesson-ball", 0.5, 0.48),
        arrow(
          "lesson-push",
          { x: 0.5, y: 0.48 },
          { x: 0.54, y: 0.46 },
          "#22c55e",
        ),
        label("lesson-label", 0.5, 0.14, "Settle and push"),
      ],
      {
        coachCue: "Sole pause, inside push.",
        playerAction: "Player settles with the sole and releases to the inside foot.",
        ballAction: "Ball moves from underfoot to a playable distance.",
        coachingPurpose: "Introduce sole as a reset, not a stop.",
      },
    ),
    step(
      "lesson-ball-available-3",
      3,
      "action",
      "Switch surfaces on the move",
      "The player moves forward using inside, outside, and sole while keeping the ball within one stride.",
      [
        player("lesson-p1", "home", 0.55, 0.44, "P"),
        ball("lesson-ball", 0.58, 0.46),
        arrow(
          "lesson-inside",
          { x: 0.52, y: 0.48 },
          { x: 0.58, y: 0.46 },
        ),
        arrow(
          "lesson-outside",
          { x: 0.58, y: 0.46 },
          { x: 0.62, y: 0.42 },
          "#94a3b8",
        ),
        label("lesson-label", 0.5, 0.14, "Both feet, both surfaces"),
      ],
      {
        coachCue: "Soft touches, same distance.",
        playerAction: "Player alternates surfaces while jogging.",
        ballAction: "Ball stays within one stride of the body.",
        coachingPurpose: "Build bilateral comfort without panic.",
      },
    ),
    step(
      "lesson-ball-available-4",
      4,
      "decision",
      "Glance up when free",
      "After two controlled touches, the player looks up and sees open space ahead.",
      [
        player("lesson-p1", "home", 0.62, 0.42, "P"),
        ball("lesson-ball", 0.64, 0.44),
        zone("lesson-space", { x: 0.68, y: 0.25 }, { x: 0.88, y: 0.55 }),
        arrow(
          "lesson-eyes",
          { x: 0.62, y: 0.4 },
          { x: 0.78, y: 0.32 },
          "#94a3b8",
        ),
        label("lesson-label", 0.5, 0.14, "Ball free — look"),
      ],
      {
        coachCue: "Two touches, then scan.",
        playerAction: "Player glances up and identifies free space.",
        ballAction: "Ball remains playable during the scan.",
        coachingPurpose: "Connect control to early awareness.",
      },
    ),
  ],
  coachQuestions: [
    "What tells you the ball is available versus trapped?",
    "When is the sole useful instead of a big touch?",
    "What did you see when you looked up?",
  ],
  playerQuestions: [
    "Could you keep the ball within one stride on both feet?",
    "When did you notice the ball was free?",
    "Which surface helped you change direction fastest?",
  ],
  activityIds: [
    "academy-warmup-ball-available-surfaces",
    "academy-activity-ball-available-box",
    "academy-ssg-ball-available-keep",
  ],
  relatedAssignmentIds: ["academy-assignment-ball-available"],
  relatedQuizIds: ["academy-quiz-ball-available"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const BALL_AVAILABLE_WARMUP: AcademyActivity = {
  id: "academy-warmup-ball-available-surfaces",
  version: 1,
  title: "Surface Switch Lane",
  summary:
    "Players move through a cone lane switching inside, outside, and sole touches while glancing up at each gate.",
  description:
    "An individual or paired warmup that builds comfort changing surfaces on the move. Each gate prompts a called surface so players cannot rely on one foot or one touch pattern.",
  category: "warmup",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "foundation",
  formats: ["small_group", "9v9"],
  activityRole: "warm_up",
  activityType: "warmup",
  playerCount: { min: 1, ideal: 12, max: 16 },
  durationMinutes: { min: 8, default: 10, max: 12 },
  field: {
    length: 25,
    width: 12,
    unit: "yards",
    guidance: "One 25-yard lane per pair with a cone gate every five yards.",
  },
  equipment: ["one ball per player or pair", "six cones per lane"],
  goalIds: [GOAL_ID, "u12-scan-before-receiving"],
  relatedActivityIds: ["academy-activity-ball-available-box"],
  relatedLessonIds: [BALL_AVAILABLE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-ball-available"],
  relatedQuizIds: ["academy-quiz-ball-available"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Switch inside, outside, and sole without stopping.",
    "Glance up at each gate while keeping the ball close.",
    "Keep the ball within one stride through the lane.",
  ],
  setupInstructions: [
    "Mark a 25-by-12-yard lane with cones every five yards.",
    "Place one player per lane or pairs sharing one ball.",
    "Coach calls the surface at each gate: inside, outside, or sole.",
    "Leave three yards between parallel lanes.",
  ],
  organization: [
    "Players dribble down the lane and return jogging.",
    "Alternate starting foot each repetition.",
    "Run 60-second rounds with 20-second resets.",
  ],
  howItWorks: [
    "The player dribbles toward the first gate on the coach's called surface.",
    "At each gate the player glances up, then performs the next called touch.",
    "At the end the player turns and returns using the opposite surfaces.",
    "Partners alternate if sharing one ball.",
  ],
  resetInstructions: [
    "Retrieve loose balls from the side of the lane before restarting.",
    "Rotate starting positions if numbers are uneven.",
  ],
  coachingPoints: [
    "Soft touches — the ball should not outrun the player.",
    "Glance up at the gate, not at the coach.",
    "Use the sole only to settle, then push forward.",
    "Both feet must appear in every round.",
  ],
  commonMistakes: [
    {
      mistake: "Big touches into the next lane.",
      correction: "Shorten touches and widen lane spacing.",
    },
    {
      mistake: "Player watches the coach instead of scanning forward.",
      correction: "Point to the gate as the look-up target.",
    },
    {
      mistake: "Only using the dominant foot.",
      correction: "Require the weaker foot at two gates per rep.",
    },
  ],
  progressions: [
    {
      title: "Partner mirror",
      description: "Pairs call surfaces to each other instead of the coach.",
    },
    {
      title: "Speed change",
      description: "Jog the lane, then sprint the return with the same control.",
    },
  ],
  regressions: [
    {
      title: "Known sequence",
      description: "Post the surface order on a cone before each rep.",
    },
    {
      title: "Wider lane",
      description: "Expand to 15 yards wide and slow to walking pace.",
    },
    {
      title: "Uneven attendance",
      description:
        "Run individual lanes with shared balls; extra players become gate callers.",
    },
  ],
  steps: [
    step(
      "warmup-surfaces-1",
      1,
      "setup",
      "Set the lane",
      "Cones mark gates every five yards with space to turn at the end.",
      [
        cone("warmup-c1", 0.3, 0.35),
        cone("warmup-c2", 0.3, 0.65),
        cone("warmup-c3", 0.5, 0.35),
        cone("warmup-c4", 0.5, 0.65),
        cone("warmup-c5", 0.7, 0.35),
        cone("warmup-c6", 0.7, 0.65),
        player("warmup-p1", "home", 0.18, 0.5, "P"),
        ball("warmup-ball", 0.2, 0.5),
        label("warmup-label", 0.5, 0.12, "Surface lane"),
      ],
      {
        coachCue: "Gates every five yards.",
        playerAction: "Player identifies gate spacing and turn zone.",
        ballAction: "Ball starts at the player's feet.",
        coachingPurpose: "Establish rhythm and spacing.",
      },
    ),
    step(
      "warmup-surfaces-2",
      2,
      "start",
      "Inside through gate one",
      "The player uses the inside of the foot and glances up at the first gate.",
      [
        cone("warmup-c1", 0.3, 0.35),
        cone("warmup-c2", 0.3, 0.65),
        player("warmup-p1", "home", 0.24, 0.5, "P"),
        ball("warmup-ball", 0.26, 0.5),
        arrow(
          "warmup-inside",
          { x: 0.2, y: 0.5 },
          { x: 0.28, y: 0.5 },
        ),
        label("warmup-label", 0.5, 0.12, "Inside + look"),
      ],
      {
        coachCue: "Touch, look, next gate.",
        playerAction: "Player glances at the gate while cushioning inside.",
        ballAction: "Ball stays within one stride.",
        coachingPurpose: "Pair surface work with early scanning.",
      },
    ),
    step(
      "warmup-surfaces-3",
      3,
      "action",
      "Outside at gate two",
      "The coach calls outside; the player shifts the ball to the other foot.",
      [
        cone("warmup-c3", 0.5, 0.35),
        cone("warmup-c4", 0.5, 0.65),
        player("warmup-p1", "home", 0.46, 0.48, "P"),
        ball("warmup-ball", 0.5, 0.46),
        arrow(
          "warmup-outside",
          { x: 0.46, y: 0.5 },
          { x: 0.52, y: 0.44 },
          "#94a3b8",
        ),
        label("warmup-label", 0.5, 0.12, "Switch foot"),
      ],
      {
        coachCue: "Outside foot, same distance.",
        playerAction: "Player changes foot without breaking stride.",
        ballAction: "Ball moves laterally under control.",
        coachingPurpose: "Build bilateral surface comfort.",
      },
    ),
    step(
      "warmup-surfaces-4",
      4,
      "action",
      "Sole settle at gate three",
      "The player pauses on the sole, glances up, then pushes forward.",
      [
        cone("warmup-c5", 0.7, 0.35),
        cone("warmup-c6", 0.7, 0.65),
        player("warmup-p1", "home", 0.66, 0.5, "P"),
        ball("warmup-ball", 0.68, 0.52),
        arrow(
          "warmup-sole",
          { x: 0.68, y: 0.52 },
          { x: 0.72, y: 0.48 },
          "#22c55e",
        ),
        label("warmup-label", 0.5, 0.12, "Sole reset"),
      ],
      {
        coachCue: "Pause, look, push.",
        playerAction: "Player uses sole to settle then releases.",
        ballAction: "Ball resets without stopping play.",
        coachingPurpose: "Teach sole as a control surface, not a trap.",
      },
    ),
    step(
      "warmup-surfaces-5",
      5,
      "rotation",
      "Turn and return",
      "The player turns at the end and returns with the opposite foot leading.",
      [
        player("warmup-p1", "home", 0.78, 0.5, "P"),
        ball("warmup-ball", 0.76, 0.5),
        arrow(
          "warmup-turn",
          { x: 0.78, y: 0.5 },
          { x: 0.72, y: 0.5 },
          "#94a3b8",
        ),
        label("warmup-label", 0.5, 0.12, "Return other foot"),
      ],
      {
        coachCue: "Other foot leads back.",
        playerAction: "Player turns and switches leading foot.",
        ballAction: "Ball stays close through the turn.",
        coachingPurpose: "Reinforce both-foot availability.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Keep three yards between parallel lanes.",
    "Players turn away from neighbors at the end line.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms lane spacing before approval.",
    ],
  },
  searchTags: ["ball mastery", "surfaces", "scanning", "warmup", "control"],
};

export const BALL_AVAILABLE_TECHNICAL: AcademyActivity = {
  id: "academy-activity-ball-available-box",
  version: 1,
  title: "Available Ball Box",
  summary:
    "Players keep the ball available inside a square while a passive defender shadows and the coach calls surface changes.",
  description:
    "A lightly opposed technical box where one player maintains playable distance from the ball while a shadow defender follows without tackling. The active player must switch surfaces on command and glance up every three touches.",
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
    length: 10,
    width: 10,
    unit: "yards",
    guidance: "One 10-yard square per pair; add squares for larger groups.",
  },
  equipment: ["one ball per pair", "four cones per square"],
  goalIds: [GOAL_ID, "u12-change-speed-direction"],
  relatedActivityIds: [
    "academy-warmup-ball-available-surfaces",
    "academy-ssg-ball-available-keep",
  ],
  relatedLessonIds: [BALL_AVAILABLE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-ball-available"],
  relatedQuizIds: ["academy-quiz-ball-available"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Keep the ball within one stride under a passive shadow.",
    "Change surface on command without trapping the ball.",
    "Glance up every three touches to notice when the ball is free.",
  ],
  setupInstructions: [
    "Mark a 10-yard square with four cones.",
    "Pair players: one ball carrier, one passive shadow.",
    "Shadow follows at arm's length without tackling for the first round.",
    "Coach stands outside and calls surface changes.",
  ],
  organization: [
    "Work 45-second rounds then swap roles.",
    "Use multiple squares if numbers exceed six pairs.",
    "Progress to active jockeying only after three clean rounds.",
  ],
  howItWorks: [
    "The carrier moves anywhere in the box keeping the ball available.",
    "The shadow mirrors movement without winning the ball initially.",
    "Every three touches the carrier glances up and calls free or tight.",
    "On coach command the carrier switches surface immediately.",
    "Partners swap after each round.",
  ],
  resetInstructions: [
    "If the ball leaves the box, the carrier retrieves it and restarts from the center.",
    "Rotate waiting players into shadow roles to balance uneven numbers.",
  ],
  coachingPoints: [
    "Available means close — not glued to the foot.",
    "Use the sole to escape a tight moment, then push away.",
    "Glance up on the step after contact, not during it.",
    "Shadow stays honest — no tackles until the coach upgrades pressure.",
  ],
  commonMistakes: [
    {
      mistake: "Carrier stops on the ball when shadow closes.",
      correction: "Sole settle and push to the far foot in one motion.",
    },
    {
      mistake: "Shadow tackles too early.",
      correction: "Shadow keeps hands behind back and mirrors only.",
    },
    {
      mistake: "Carrier never looks up.",
      correction: "Require a verbal free or tight call every three touches.",
    },
  ],
  progressions: [
    {
      title: "Active jockey",
      description: "Shadow can poke the ball after the carrier looks up twice.",
    },
    {
      title: "Smaller box",
      description: "Shrink to eight yards to increase pressure.",
    },
  ],
  regressions: [
    {
      title: "No shadow",
      description: "Solo work with coach calling surfaces from outside.",
    },
    {
      title: "Larger box",
      description: "Expand to 12 yards and walk before jogging.",
    },
    {
      title: "Uneven attendance",
      description:
        "Trios rotate shadow role; waiting player calls surface changes.",
    },
  ],
  steps: [
    step(
      "tech-box-1",
      1,
      "setup",
      "Mark the square",
      "Carrier and shadow begin in the center of a 10-yard box.",
      [
        zone("tech-box", { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }),
        player("tech-carrier", "home", 0.48, 0.5, "C"),
        player("tech-shadow", "away", 0.54, 0.52, "S"),
        ball("tech-ball", 0.5, 0.5),
        label("tech-label", 0.5, 0.14, "Available box"),
      ],
      {
        coachCue: "Ball close, shadow honest.",
        playerAction: "Carrier identifies box edges and shadow role.",
        ballAction: "Ball starts at carrier's feet.",
        coachingPurpose: "Define space and passive pressure.",
      },
    ),
    step(
      "tech-box-2",
      2,
      "start",
      "Move with the shadow",
      "The carrier dribbles while the shadow mirrors at arm's length.",
      [
        zone("tech-box", { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }),
        player("tech-carrier", "home", 0.42, 0.44, "C"),
        player("tech-shadow", "away", 0.46, 0.48, "S"),
        ball("tech-ball", 0.44, 0.46),
        arrow(
          "tech-move",
          { x: 0.4, y: 0.5 },
          { x: 0.44, y: 0.44 },
        ),
        label("tech-label", 0.5, 0.14, "Mirror movement"),
      ],
      {
        coachCue: "Stay available while moving.",
        playerAction: "Carrier keeps ball within one stride.",
        ballAction: "Ball moves with soft touches.",
        coachingPurpose: "Connect movement to playable distance.",
      },
    ),
    step(
      "tech-box-3",
      3,
      "action",
      "Surface change on command",
      "Coach calls outside; carrier shifts to the far foot without stopping.",
      [
        zone("tech-box", { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }),
        player("tech-carrier", "home", 0.55, 0.55, "C"),
        player("tech-shadow", "away", 0.58, 0.52, "S"),
        ball("tech-ball", 0.58, 0.54),
        arrow(
          "tech-switch",
          { x: 0.56, y: 0.56 },
          { x: 0.6, y: 0.5 },
          "#22c55e",
        ),
        label("tech-label", 0.5, 0.14, "Switch surface"),
      ],
      {
        coachCue: "Outside — now!",
        playerAction: "Carrier changes foot immediately.",
        ballAction: "Ball shifts laterally under control.",
        coachingPurpose: "Practice surface change under proximity.",
      },
    ),
    step(
      "tech-box-4",
      4,
      "reset",
      "Call free or tight, then rotate",
      "After three touches the carrier glances up, announces whether the ball is free, and roles rotate.",
      [
        zone("tech-box", { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }),
        player("tech-carrier", "home", 0.5, 0.42, "C"),
        player("tech-shadow", "away", 0.52, 0.48, "S"),
        ball("tech-ball", 0.52, 0.44),
        arrow(
          "tech-scan",
          { x: 0.5, y: 0.4 },
          { x: 0.62, y: 0.32 },
          "#94a3b8",
        ),
        label("tech-label", 0.5, 0.14, "Free or tight?"),
      ],
      {
        coachCue: "Three touches, then call it.",
        playerAction: "Carrier scans and calls free or tight.",
        ballAction: "Ball remains playable during the scan.",
        coachingPurpose: "Build the transition habit of noticing ball state.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Shadow players keep hands behind back in passive rounds.",
    "No tackling until coach announces active jockeying.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms shadow rules and box size before approval.",
    ],
  },
  searchTags: ["technical", "control", "surfaces", "box", "scanning"],
};

export const BALL_AVAILABLE_SSG: AcademyActivity = {
  id: "academy-ssg-ball-available-keep",
  version: 1,
  title: "Keep-Away Availability",
  summary:
    "Teams score by completing five consecutive available touches — ball within one stride with a glance up — before passing to a teammate.",
  description:
    "A directional keep-away game where possession teams earn a point when five touches stay available and include at least one look up. Defenders win the ball to attack the opposite goal.",
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
    length: 30,
    width: 22,
    unit: "yards",
    guidance: "30-by-22-yard field with two small goals on end lines.",
  },
  equipment: ["one ball", "two mini goals or cone goals", "eight cones"],
  goalIds: [GOAL_ID, "u12-scan-before-receiving"],
  relatedActivityIds: [
    "academy-warmup-ball-available-surfaces",
    "academy-activity-ball-available-box",
  ],
  relatedLessonIds: [BALL_AVAILABLE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-ball-available"],
  relatedQuizIds: ["academy-quiz-ball-available"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Keep the ball available under light pressure in a game.",
    "Glance up during possession before choosing a pass.",
    "Notice when the ball is free and exploit the space.",
  ],
  setupInstructions: [
    "Mark a 30-by-22-yard field with mini goals on each end line.",
    "Organize 4v4 or 5v5 with equal teams.",
    "Possession team must complete five available touches before shooting.",
    "Keep spare balls on both touchlines.",
  ],
  organization: [
    "Play 3-minute rounds with 1-minute coaching breaks.",
    "Teams switch roles after each round.",
    "Coach freezes only to highlight an available sequence.",
  ],
  howItWorks: [
    "The team in possession must keep the ball within one stride on each touch.",
    "At least one player must glance up during the five-touch build-up.",
    "After five available touches the team may pass into the goal or dribble through.",
    "Defenders win the ball and immediately attack the opposite goal.",
    "No points for a shot without five available touches.",
  ],
  resetInstructions: [
    "After a goal, restart with a pass from the scoring team's end line.",
    "Use touchline spare balls when the ball leaves the field.",
  ],
  coachingPoints: [
    "Available touches are soft and close — not wild dribbles.",
    "Look up on the step after contact.",
    "When the ball is free, attack the space quickly.",
    "Support players stay close enough to receive an available pass.",
  ],
  commonMistakes: [
    {
      mistake: "Players chase the goal without five available touches.",
      correction: "Reset the count when a touch is too heavy.",
    },
    {
      mistake: "Head stays down through the whole sequence.",
      correction: "Require a visible look up before the scoring pass.",
    },
    {
      mistake: "Teammates stand too far to link available passes.",
      correction: "Support within 10 yards and at angles, not straight lines.",
    },
  ],
  progressions: [
    {
      title: "Three-touch maximum after build-up",
      description: "After five available touches, finish within three team touches.",
    },
    {
      title: "Bonus for weak foot",
      description: "Two points if the scoring action uses the non-dominant foot.",
    },
  ],
  regressions: [
    {
      title: "Neutral floater",
      description: "Add one neutral who always plays with possession.",
    },
    {
      title: "Three-touch build-up",
      description: "Reduce required available touches from five to three.",
    },
    {
      title: "Uneven attendance",
      description:
        "Play 4v3 with a neutral or rotate floater every two minutes.",
    },
  ],
  steps: [
    step(
      "ssg-keep-1",
      1,
      "setup",
      "Two-goal keep-away",
      "Equal teams face opposite goals in a directional field.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        cone("ssg-g1", 0.12, 0.45),
        cone("ssg-g2", 0.12, 0.55),
        cone("ssg-g3", 0.88, 0.45),
        cone("ssg-g4", 0.88, 0.55),
        player("ssg-h1", "home", 0.4, 0.35, "1"),
        player("ssg-h2", "home", 0.38, 0.5, "2"),
        player("ssg-h3", "home", 0.4, 0.65, "3"),
        player("ssg-a1", "away", 0.6, 0.35, "1"),
        player("ssg-a2", "away", 0.62, 0.5, "2"),
        ball("ssg-ball", 0.42, 0.5),
        label("ssg-label", 0.5, 0.11, "Keep it available"),
      ],
      {
        coachCue: "Five available, then score.",
        playerAction: "Teams identify goals and possession rules.",
        ballAction: "Ball starts with home team.",
        coachingPurpose: "Create a game reason to keep the ball close.",
      },
    ),
    step(
      "ssg-keep-2",
      2,
      "start",
      "Build available touches",
      "Home links short passes keeping each touch within one stride.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-h1", "home", 0.45, 0.38, "1"),
        player("ssg-h2", "home", 0.48, 0.52, "2"),
        player("ssg-h3", "home", 0.42, 0.62, "3"),
        player("ssg-a1", "away", 0.55, 0.4, "1"),
        player("ssg-a2", "away", 0.58, 0.55, "2"),
        ball("ssg-ball", 0.46, 0.5),
        arrow(
          "ssg-pass",
          { x: 0.45, y: 0.4 },
          { x: 0.47, y: 0.5 },
        ),
        label("ssg-label", 0.5, 0.11, "Short and close"),
      ],
      {
        coachCue: "Soft passes, ready feet.",
        playerAction: "Home maintains close possession.",
        ballAction: "Ball moves in short links.",
        coachingPurpose: "Reward playable distance in a game.",
      },
    ),
    step(
      "ssg-keep-3",
      3,
      "action",
      "Look up mid-sequence",
      "H2 glances up during the build-up and sees space to advance.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-h2", "home", 0.52, 0.48, "2"),
        player("ssg-h3", "home", 0.58, 0.35, "3"),
        player("ssg-a2", "away", 0.56, 0.5, "2"),
        ball("ssg-ball", 0.54, 0.48),
        arrow(
          "ssg-scan",
          { x: 0.52, y: 0.46 },
          { x: 0.65, y: 0.32 },
          "#94a3b8",
        ),
        label("ssg-label", 0.5, 0.11, "Eyes up"),
      ],
      {
        coachCue: "Look on the step after touch.",
        playerAction: "H2 scans and sees forward space.",
        ballAction: "Ball stays available during the scan.",
        coachingPurpose: "Connect scanning to possession quality.",
      },
    ),
    step(
      "ssg-keep-4",
      4,
      "decision",
      "Ball free — attack",
      "After five available touches home plays forward into space.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-h2", "home", 0.58, 0.46, "2"),
        player("ssg-h3", "home", 0.72, 0.38, "3"),
        player("ssg-a1", "away", 0.65, 0.42, "1"),
        ball("ssg-ball", 0.68, 0.4),
        arrow(
          "ssg-attack",
          { x: 0.58, y: 0.46 },
          { x: 0.68, y: 0.4 },
        ),
        label("ssg-label", 0.5, 0.11, "Free — go"),
      ],
      {
        coachCue: "Available build-up, then penetrate.",
        playerAction: "Home exploits free ball moment.",
        ballAction: "Ball advances into space.",
        coachingPurpose: "Link availability to attacking decisions.",
      },
    ),
    step(
      "ssg-keep-5",
      5,
      "reset",
      "Turnover and transition",
      "Away wins the ball and attacks the opposite goal immediately.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-a2", "away", 0.5, 0.5, "2"),
        player("ssg-a1", "away", 0.38, 0.42, "1"),
        player("ssg-h2", "home", 0.52, 0.52, "2"),
        ball("ssg-ball", 0.48, 0.5),
        arrow(
          "ssg-counter",
          { x: 0.48, y: 0.5 },
          { x: 0.36, y: 0.42 },
          "#f87171",
        ),
        label("ssg-label", 0.5, 0.11, "Notice turnover"),
      ],
      {
        coachCue: "Ball free for the other team — react.",
        playerAction: "Away transitions to attack.",
        ballAction: "Ball moves toward opposite goal.",
        coachingPurpose: "Plant the transition habit: notice when ball is free.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Scale field to roster to avoid congestion.",
    "Use mini goals without nets if space is tight.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms field size and goal type before approval.",
    ],
  },
  searchTags: ["small sided game", "keep away", "availability", "scanning"],
};

export const BALL_AVAILABLE_ASSIGNMENT: AcademyAssignmentTemplate = {
  id: "academy-assignment-ball-available",
  version: 1,
  title: "Available Ball at Home",
  description:
    "Practice surface switches and glance-up habits alone or with a partner, then reflect on when the ball felt free.",
  assignmentType: "practice_skill",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  linkedLessonId: BALL_AVAILABLE_LESSON.id,
  linkedDrillId: BALL_AVAILABLE_WARMUP.id,
  linkedQuizId: "academy-quiz-ball-available",
  estimatedMinutes: 18,
  completionCriteria: [
    "Complete 30 surface switches using inside, outside, and sole on both feet.",
    "Glance up after every third touch for at least 10 repetitions.",
    "Answer one reflection question about when the ball felt free.",
  ],
  easierOption:
    "Walk through the lane slowly with a posted surface sequence and no time limit.",
  harderOption:
    "Jog the full sequence, add a passive partner shadow, and call free or tight aloud every five touches.",
  instructions: [
    "Set six cones in a line five steps apart in your yard or driveway.",
    "Dribble through using inside, outside, and sole — alternate feet at each cone.",
    "After every third touch, glance up and name one thing you see (space, wall, partner).",
    "Repeat three times, then switch to your weaker foot leading.",
    "Write or tell someone: when did the ball feel free versus tight?",
    "Before your next practice, pick one reminder word: soft, close, or look.",
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const BALL_AVAILABLE_QUIZ_QUESTIONS: AcademyQuizQuestion[] = [
  {
    id: "academy-quiz-ball-available-q1",
    questionType: "multiple_choice",
    prompt:
      "You are dribbling and the ball is two strides away. What should you do first?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "soften", label: "Soft touches to bring it back within one stride" },
      { id: "sprint", label: "Sprint to catch up without changing touch" },
      { id: "stop", label: "Stop and wait for a teammate" },
    ],
    correctOptionIds: ["soften"],
    explanation:
      "Available means playable and close enough to protect. Soft touches recover control.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-ball-available-q2",
    questionType: "multiple_choice",
    prompt: "When is the best moment to glance up while dribbling?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "between", label: "On the step after a controlled touch" },
      { id: "contact", label: "While the foot is on the ball" },
      { id: "never", label: "Only when the coach whistles" },
    ],
    correctOptionIds: ["between"],
    explanation:
      "Look up between touches so contact stays clean and the scan still happens.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-ball-available-q3",
    questionType: "true_false",
    prompt: "Using the sole to pause is the same as trapping the ball permanently.",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    correctOptionIds: ["false"],
    explanation:
      "The sole settles the ball so you can push into motion — not stop play.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-ball-available-q4",
    questionType: "multiple_choice",
    prompt:
      "A defender is two yards away on your right. Which touch usually keeps the ball most available?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "left", label: "Soft touch to the left foot away from pressure" },
      { id: "right", label: "Hard touch into the defender" },
      { id: "sole", label: "Stand on the ball until help arrives" },
    ],
    correctOptionIds: ["left"],
    explanation:
      "Move the ball to the safe side with a soft touch that stays within one stride.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-ball-available-q5",
    questionType: "multiple_choice",
    prompt: "What does it mean when the ball is free?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      {
        id: "playable",
        label: "You control it within one stride and can pass, turn, or advance",
      },
      { id: "alone", label: "No one else is on the field" },
      { id: "stopped", label: "You are standing still on the ball" },
    ],
    correctOptionIds: ["playable"],
    explanation:
      "Free means the ball is yours to use — that is the moment to look forward.",
    editorial: { ...EDITORIAL },
  },
];

export const BALL_AVAILABLE_QUIZ: AcademyQuiz = {
  id: "academy-quiz-ball-available",
  version: 1,
  title: "Keep the Ball Available Check",
  description:
    "Five decision questions about playable distance, surface choice, scanning, and noticing when the ball is free.",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  questionIds: BALL_AVAILABLE_QUIZ_QUESTIONS.map((question) => question.id),
  editorial: { ...EDITORIAL },
};

export const BALL_AVAILABLE_PRACTICE_PLAN: AcademyLessonPackagePracticePlan = {
  defaultMinutes: 75,
  shortMinutes: 45,
  sections: [
    {
      order: 1,
      role: "warm_up",
      activityId: "academy-warmup-ball-available-surfaces",
      plannedMinutes: 15,
      shortMinutes: 10,
      objective: "Switch surfaces on the move and glance up at each gate.",
    },
    {
      order: 2,
      role: "technical",
      activityId: "academy-activity-ball-available-box",
      plannedMinutes: 25,
      shortMinutes: 15,
      objective:
        "Keep the ball available inside the box under a passive shadow.",
    },
    {
      order: 3,
      role: "small_sided_game",
      activityId: "academy-ssg-ball-available-keep",
      plannedMinutes: 35,
      shortMinutes: 20,
      objective:
        "Build five available touches before scoring in keep-away.",
    },
  ],
  reflectionQuestions: [
    "When did your ball feel free today?",
    "Which surface helped you keep the ball closest?",
    "Did you look up before or after losing the ball?",
  ],
};
