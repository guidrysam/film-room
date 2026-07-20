import type {
  AcademyActivity,
  AcademyAssignmentTemplate,
  AcademyDrillStep,
  AcademyQuiz,
  AcademyQuizQuestion,
  AcademyTacticalLesson,
} from "@/lib/academy/types";
import type { TacticsBoardObject } from "@/lib/tactics-boards";

const GOAL_ID = "u12-receive-open-body";
const RELATED_GOAL_IDS = [
  "u12-first-touch-away-pressure",
  "u12-scan-before-receiving",
];
const EVIDENCE_TAG_IDS = [
  "u12-receive-open-body-evidence-positive",
  "u12-receive-open-body-evidence-improvement",
];

const EDITORIAL = {
  status: "needs_coach_review" as const,
  originalWording: true,
  originalDiagram: true,
  generatedWithAssistance: true,
};

function player(
  id: string,
  team: "home" | "away",
  x: number,
  y: number,
  label: string,
): TacticsBoardObject {
  return { id, type: "player", team, x, y, label };
}

function ball(id: string, x: number, y: number): TacticsBoardObject {
  return { id, type: "ball", x, y };
}

function cone(id: string, x: number, y: number): TacticsBoardObject {
  return { id, type: "cone", x, y };
}

function arrow(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = "#fbbf24",
): TacticsBoardObject {
  return { id, type: "arrow", points: [from, to], color };
}

function zone(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = "#3b82f628",
): TacticsBoardObject {
  return { id, type: "zone", points: [from, to], color };
}

function label(
  id: string,
  x: number,
  y: number,
  text: string,
): TacticsBoardObject {
  return { id, type: "area_label", x, y, text };
}

function step(
  id: string,
  order: number,
  phase: AcademyDrillStep["phase"],
  title: string,
  explanation: string,
  objects: TacticsBoardObject[],
  details: Pick<
    AcademyDrillStep,
    "coachCue" | "playerAction" | "ballAction" | "coachingPurpose"
  >,
): AcademyDrillStep {
  return {
    id,
    order,
    phase,
    title,
    explanation,
    durationMs: 1800,
    objects,
    ...details,
  };
}

export const RECEIVE_OPEN_BODY_LESSON: AcademyTacticalLesson = {
  id: "academy-lesson-receive-open-body",
  version: 1,
  title: "See the Next Play: Receive with an Open Body",
  summary:
    "Players learn to prepare side-on before the pass arrives, receive across the body, and keep both a forward option and a safe option visible.",
  ageBands: ["U11-U12"],
  formats: ["small_group", "9v9"],
  difficulty: "foundation",
  goalIds: [GOAL_ID],
  relatedGoalIds: RELATED_GOAL_IDS,
  estimatedMinutes: 8,
  learningObjective:
    "Prepare an open body shape before receiving so the first touch can support the best available next action.",
  successCriteria: [
    "The player scans before the pass travels or while it travels.",
    "The player arrives side-on with hips able to see the passer and next space.",
    "The player receives across the body when that touch protects a forward view.",
    "The player can play forward or retain possession without first turning through pressure.",
  ],
  coachingPoints: [
    "Scan before receiving, then adjust the feet early.",
    "Open the hips enough to see the ball and the next space.",
    "Let the ball travel across the body when the far foot is safe.",
    "Use the first touch to preserve two options, not to force forward play.",
  ],
  commonErrors: [
    {
      title: "Closed body shape",
      description:
        "The receiver faces only the passer, hiding the next space behind the body.",
      correction:
        "Move one foot back and turn the hips before the ball arrives.",
    },
    {
      title: "Receiving square",
      description:
        "Both feet point at the passer, so the player needs an extra touch to turn.",
      correction:
        "Arrive on a half-turn with one shoulder closer to the next action.",
    },
    {
      title: "First touch into pressure",
      description:
        "The receiver opens but pushes the ball toward the nearest defender.",
      correction:
        "Scan the pressure first and choose the safe side of the body.",
    },
    {
      title: "Watching only the ball",
      description:
        "The receiver never checks the defender or next option before contact.",
      correction:
        "Use a quick shoulder check before the pass, then return the eyes to the ball.",
    },
  ],
  observableEvidence: [
    "Checks a shoulder before setting the receiving stance.",
    "Receives side-on when pressure and the passing angle allow.",
    "Uses the farther foot to let the ball travel across the body.",
    "Keeps a forward and retaining option available after the first touch.",
  ],
  progression:
    "Move from unopposed body preparation to a live defender who changes the safe receiving side.",
  introduction: [
    "Ask players to show a closed shape, then turn one step so they can see the passer and a target ahead.",
    "Explain that an open body does not mean always turning forward; it means seeing enough information to choose.",
  ],
  steps: [
    step(
      "lesson-open-body-1",
      1,
      "setup",
      "Closed picture",
      "The receiver faces the passer squarely and cannot see the defender or forward target.",
      [
        player("lesson-passer", "home", 0.22, 0.5, "P"),
        player("lesson-receiver", "home", 0.5, 0.5, "R"),
        player("lesson-defender", "away", 0.7, 0.5, "D"),
        ball("lesson-ball", 0.26, 0.5),
        label("lesson-label", 0.5, 0.14, "Closed picture"),
      ],
      {
        coachCue: "What can the receiver see?",
        playerAction: "Receiver notices that the next space is behind the body.",
        ballAction: "Ball remains with the passer.",
        coachingPurpose: "Make the cost of a square receiving shape visible.",
      },
    ),
    step(
      "lesson-open-body-2",
      2,
      "start",
      "Scan and prepare",
      "Before the pass, the receiver checks the defender and opens one shoulder toward the next space.",
      [
        player("lesson-passer", "home", 0.22, 0.5, "P"),
        player("lesson-receiver", "home", 0.5, 0.46, "R"),
        player("lesson-defender", "away", 0.7, 0.58, "D"),
        ball("lesson-ball", 0.26, 0.5),
        arrow(
          "lesson-scan",
          { x: 0.5, y: 0.46 },
          { x: 0.65, y: 0.57 },
          "#94a3b8",
        ),
        label("lesson-label", 0.5, 0.14, "Scan, then open"),
      ],
      {
        coachCue: "Shoulder check, feet ready.",
        playerAction: "Receiver scans and adjusts to a side-on stance.",
        ballAction: "Passer waits until the receiver is prepared.",
        coachingPurpose: "Connect scanning to early body preparation.",
      },
    ),
    step(
      "lesson-open-body-3",
      3,
      "action",
      "Receive across the body",
      "The pass travels to the far foot so the receiver can cushion the ball toward the visible forward space.",
      [
        player("lesson-passer", "home", 0.22, 0.5, "P"),
        player("lesson-receiver", "home", 0.52, 0.45, "R"),
        player("lesson-defender", "away", 0.7, 0.6, "D"),
        ball("lesson-ball", 0.5, 0.48),
        arrow(
          "lesson-pass",
          { x: 0.26, y: 0.5 },
          { x: 0.5, y: 0.48 },
        ),
        zone(
          "lesson-next-space",
          { x: 0.53, y: 0.2 },
          { x: 0.82, y: 0.42 },
        ),
        label("lesson-label", 0.5, 0.14, "Across the body"),
      ],
      {
        coachCue: "Far foot, soft touch.",
        playerAction: "Receiver cushions with the foot farther from the passer.",
        ballAction: "Ball travels across the body into the safe forward lane.",
        coachingPurpose: "Show how body shape and receiving foot work together.",
      },
    ),
    step(
      "lesson-open-body-4",
      4,
      "decision",
      "Choose the next action",
      "The receiver sees pressure and chooses either the forward target or the safe return pass.",
      [
        player("lesson-passer", "home", 0.25, 0.62, "P"),
        player("lesson-receiver", "home", 0.53, 0.45, "R"),
        player("lesson-forward", "home", 0.8, 0.28, "F"),
        player("lesson-defender", "away", 0.68, 0.58, "D"),
        ball("lesson-ball", 0.56, 0.43),
        arrow(
          "lesson-forward-option",
          { x: 0.56, y: 0.43 },
          { x: 0.77, y: 0.3 },
        ),
        arrow(
          "lesson-safe-option",
          { x: 0.53, y: 0.47 },
          { x: 0.28, y: 0.6 },
          "#94a3b8",
        ),
        label("lesson-label", 0.5, 0.14, "Two visible options"),
      ],
      {
        coachCue: "Forward if open; keep it if closed.",
        playerAction: "Receiver selects from two visible options.",
        ballAction: "Ball stays playable on the safe side of the defender.",
        coachingPurpose: "Prevent open-body receiving from becoming a forced turn.",
      },
    ),
  ],
  coachQuestions: [
    "What information should the receiver collect before the pass?",
    "When would receiving across the body be unsafe?",
    "Can the player still retain the ball after opening the body?",
  ],
  playerQuestions: [
    "Could you see both the ball and your next option?",
    "Which foot kept the ball farthest from pressure?",
    "What would tell you to play back instead of turning?",
  ],
  activityIds: [
    "academy-warmup-open-body-gates",
    "academy-activity-open-body-diamond",
    "academy-ssg-open-body-end-zones",
  ],
  relatedAssignmentIds: ["academy-assignment-open-body-three-moments"],
  relatedQuizIds: ["academy-quiz-receive-open-body"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const OPEN_BODY_WARMUP: AcademyActivity = {
  id: "academy-warmup-open-body-gates",
  version: 1,
  title: "Open-Body Gate Check",
  summary:
    "Pairs pass through a gate while the receiver scans, opens, and takes the first touch toward a called exit.",
  description:
    "A continuous partner warmup that introduces scanning and open-body receiving without opposition. The passer supplies a late directional cue so the receiver must prepare early, control the ball through a safe exit, and reset quickly.",
  category: "warmup",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "foundation",
  formats: ["small_group", "9v9"],
  activityRole: "warm_up",
  activityType: "warmup",
  playerCount: { min: 2, ideal: 12, max: 16 },
  durationMinutes: { min: 8, default: 10, max: 12 },
  field: {
    length: 20,
    width: 20,
    unit: "yards",
    guidance: "Use one four-yard gate per pair with six yards behind each side.",
  },
  equipment: ["one ball per pair", "two cones per pair"],
  goalIds: [GOAL_ID, "u12-scan-before-receiving"],
  relatedActivityIds: ["academy-activity-open-body-diamond"],
  relatedLessonIds: [RECEIVE_OPEN_BODY_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-open-body-three-moments"],
  relatedQuizIds: ["academy-quiz-receive-open-body"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Scan before the partner passes.",
    "Prepare a side-on stance outside the gate.",
    "Receive across the body toward the called exit.",
  ],
  setupInstructions: [
    "Create one four-yard cone gate per pair.",
    "Place partners six yards apart on opposite sides with one ball.",
    "Name the two exit directions behind each receiver.",
    "Leave at least three yards between neighboring pairs.",
  ],
  organization: [
    "Work in pairs with one active ball and one gate.",
    "Both players alternate passer and receiver roles after every repetition.",
    "Run 60-second rounds with a short reset between rounds.",
  ],
  howItWorks: [
    "The receiver checks both exits before the pass.",
    "The passer calls left or right as the ball travels.",
    "The receiver opens, takes the ball through the gate toward that exit, then passes back from the new angle.",
    "Partners alternate receiving roles continuously.",
  ],
  resetInstructions: [
    "If the ball leaves the area, the nearest player retrieves it while the partner restores the gate position.",
    "Switch the starting passer after each 60-second round.",
  ],
  coachingPoints: [
    "Scan before the pass starts.",
    "Move the feet early; do not wait for the ball to fix the body shape.",
    "Use the foot farther from the passer when it keeps the exit visible.",
    "Cushion the first touch within one stride.",
  ],
  commonMistakes: [
    {
      mistake: "Receiver waits square inside the gate.",
      correction: "Start just outside and arrive side-on as the pass travels.",
    },
    {
      mistake: "Player turns before controlling the ball.",
      correction: "Watch the final part of the pass and cushion before accelerating.",
    },
    {
      mistake: "First touch crosses into the neighboring pair.",
      correction: "Shorten the touch and enlarge spacing between gates.",
    },
  ],
  progressions: [
    {
      title: "Late visual cue",
      description: "The passer points to an exit instead of calling it.",
    },
    {
      title: "Two-touch return",
      description: "Receive through the exit and return the pass in two touches.",
    },
  ],
  regressions: [
    {
      title: "Known exit",
      description: "Choose the receiving direction before the pass.",
    },
    {
      title: "Wider gate",
      description: "Increase the gate to six yards and shorten the pass.",
    },
  ],
  steps: [
    step(
      "warmup-open-body-1",
      1,
      "setup",
      "Set the gate",
      "Partners begin opposite a clear gate with space behind both exits.",
      [
        cone("warmup-c1", 0.46, 0.4),
        cone("warmup-c2", 0.46, 0.6),
        player("warmup-passer", "home", 0.24, 0.5, "P"),
        player("warmup-receiver", "home", 0.58, 0.5, "R"),
        ball("warmup-ball", 0.28, 0.5),
        label("warmup-label", 0.5, 0.16, "Gate check"),
      ],
      {
        coachCue: "Space beyond both exits.",
        playerAction: "Receiver starts outside the gate and scans both directions.",
        ballAction: "Ball begins under the passer's control.",
        coachingPurpose: "Establish safe spacing and two possible exits.",
      },
    ),
    step(
      "warmup-open-body-2",
      2,
      "start",
      "Open before the pass",
      "The receiver checks over the shoulder and turns the hips toward the called exit.",
      [
        cone("warmup-c1", 0.46, 0.4),
        cone("warmup-c2", 0.46, 0.6),
        player("warmup-passer", "home", 0.24, 0.5, "P"),
        player("warmup-receiver", "home", 0.58, 0.47, "R"),
        ball("warmup-ball", 0.28, 0.5),
        arrow(
          "warmup-scan",
          { x: 0.58, y: 0.47 },
          { x: 0.68, y: 0.34 },
          "#94a3b8",
        ),
        label("warmup-label", 0.5, 0.16, "Scan and prepare"),
      ],
      {
        coachCue: "Check, then open.",
        playerAction: "Receiver adjusts the feet before the ball travels.",
        ballAction: "Passer prepares a firm ground pass.",
        coachingPurpose: "Make preparation happen before contact.",
      },
    ),
    step(
      "warmup-open-body-3",
      3,
      "action",
      "Receive through the exit",
      "The receiver uses the far foot and guides the first touch through the selected side.",
      [
        cone("warmup-c1", 0.46, 0.4),
        cone("warmup-c2", 0.46, 0.6),
        player("warmup-passer", "home", 0.24, 0.5, "P"),
        player("warmup-receiver", "home", 0.61, 0.42, "R"),
        ball("warmup-ball", 0.63, 0.39),
        arrow(
          "warmup-pass",
          { x: 0.28, y: 0.5 },
          { x: 0.56, y: 0.47 },
        ),
        arrow(
          "warmup-touch",
          { x: 0.56, y: 0.47 },
          { x: 0.64, y: 0.37 },
          "#22c55e",
        ),
        label("warmup-label", 0.5, 0.16, "Across and out"),
      ],
      {
        coachCue: "Far foot, through the exit.",
        playerAction: "Receiver cushions into the called lane.",
        ballAction: "Ball crosses the body and exits under control.",
        coachingPurpose: "Coordinate body shape, foot choice, and first touch.",
      },
    ),
    step(
      "warmup-open-body-4",
      4,
      "rotation",
      "Pass back and change roles",
      "The receiver turns to face the partner, returns the ball, and becomes the next passer.",
      [
        cone("warmup-c1", 0.46, 0.4),
        cone("warmup-c2", 0.46, 0.6),
        player("warmup-passer", "home", 0.25, 0.5, "R"),
        player("warmup-receiver", "home", 0.66, 0.37, "P"),
        ball("warmup-ball", 0.3, 0.49),
        arrow(
          "warmup-return",
          { x: 0.63, y: 0.39 },
          { x: 0.3, y: 0.49 },
        ),
        label("warmup-label", 0.5, 0.16, "Return and repeat"),
      ],
      {
        coachCue: "Reset quickly; new receiver scans.",
        playerAction: "Partners exchange passer and receiver roles.",
        ballAction: "Ball returns through the gate.",
        coachingPurpose: "Create continuous, alternating repetitions.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Keep at least three yards between neighboring gates.",
    "Players retrieve loose balls only after checking adjacent working lanes.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms gate spacing and collision guidance before approval.",
    ],
  },
  searchTags: ["receiving", "open body", "half turn", "first touch", "pairs"],
};

export const OPEN_BODY_TECHNICAL_ACTIVITY: AcademyActivity = {
  id: "academy-activity-open-body-diamond",
  version: 1,
  title: "Open-Body Receiving Diamond",
  summary:
    "Players check away, receive across the body, and choose the next side of a passing diamond.",
  description:
    "A repeatable passing pattern that develops the timing and mechanics of arriving side-on. Players check away, receive on the far foot, prepare the next pass with the first touch, and follow their pass around the diamond.",
  category: "technical",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "foundation",
  formats: ["small_group", "9v9"],
  activityRole: "technical",
  activityType: "technical_exercise",
  playerCount: { min: 4, ideal: 8, max: 16 },
  durationMinutes: { min: 12, default: 15, max: 18 },
  field: {
    length: 15,
    width: 15,
    unit: "yards",
    guidance: "Build one 12-to-15-yard diamond per group of four to six.",
  },
  equipment: ["one ball per diamond", "four cones per diamond"],
  goalIds: [GOAL_ID, "u12-first-touch-away-pressure"],
  relatedActivityIds: [
    OPEN_BODY_WARMUP.id,
    "academy-ssg-open-body-end-zones",
  ],
  relatedLessonIds: [RECEIVE_OPEN_BODY_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-open-body-three-moments"],
  relatedQuizIds: ["academy-quiz-receive-open-body"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Check away and arrive as the passer looks up.",
    "Receive on a half-turn with the next cone visible.",
    "Use the first touch to prepare the next pass.",
  ],
  setupInstructions: [
    "Place four cones in a 12-to-15-yard diamond.",
    "Put one player at each cone; extra players queue behind the starting cone.",
    "Start one ball at the top cone.",
    "Pass clockwise, then reverse direction between rounds.",
  ],
  organization: [
    "Use groups of four to six with one active ball per diamond.",
    "Players follow their pass to preserve one player at each cone.",
    "Run in both directions so players receive with both feet.",
  ],
  howItWorks: [
    "The next receiver checks away from the cone and returns side-on.",
    "The passer plays to the receiver's safe far foot.",
    "The receiver takes the first touch across the body toward the next cone.",
    "The receiver passes to the next player while the original passer follows the pass.",
  ],
  resetInstructions: [
    "A loose ball is recovered by the nearest player while everyone holds the next open cone.",
    "Restart from the nearest occupied cone rather than returning to the beginning.",
  ],
  coachingPoints: [
    "Check away early enough to arrive, not wait.",
    "See the passer and next cone in the same body shape.",
    "Receive with the far foot when pressure and angle allow.",
    "First touch points the body toward the next pass.",
  ],
  commonMistakes: [
    {
      mistake: "Receiver stands flat on the cone.",
      correction: "Check away, then return with one shoulder toward the next side.",
    },
    {
      mistake: "Receiver uses the near foot and closes the hips.",
      correction: "Let the ball travel to the far foot before cushioning.",
    },
    {
      mistake: "First touch stops under the body.",
      correction: "Guide it one step toward the next cone.",
    },
  ],
  progressions: [
    {
      title: "Two-touch rhythm",
      description: "Use one touch to receive and one to pass.",
    },
    {
      title: "Pressure cue",
      description:
        "A passive defender points left or right, changing the safe receiving foot.",
    },
  ],
  regressions: [
    {
      title: "Shorter sides",
      description: "Reduce each pass to eight yards.",
    },
    {
      title: "Pause the picture",
      description: "Stop after receiving so players can check body orientation.",
    },
  ],
  steps: [
    step(
      "technical-open-body-1",
      1,
      "setup",
      "Build the diamond",
      "One player occupies each cone with the ball at the top.",
      [
        cone("technical-c1", 0.5, 0.2),
        cone("technical-c2", 0.75, 0.5),
        cone("technical-c3", 0.5, 0.8),
        cone("technical-c4", 0.25, 0.5),
        player("technical-p1", "home", 0.5, 0.24, "1"),
        player("technical-p2", "home", 0.7, 0.5, "2"),
        player("technical-p3", "home", 0.5, 0.76, "3"),
        player("technical-p4", "home", 0.3, 0.5, "4"),
        ball("technical-ball", 0.5, 0.28),
        label("technical-label", 0.5, 0.1, "Receiving diamond"),
      ],
      {
        coachCue: "See the ball and the next side.",
        playerAction: "Players prepare side-on at each cone.",
        ballAction: "Ball begins at the top.",
        coachingPurpose: "Make the next passing direction visible.",
      },
    ),
    step(
      "technical-open-body-2",
      2,
      "start",
      "Check away and arrive",
      "The right-side receiver moves away, scans, then returns as the passer looks up.",
      [
        cone("technical-c1", 0.5, 0.2),
        cone("technical-c2", 0.75, 0.5),
        cone("technical-c3", 0.5, 0.8),
        cone("technical-c4", 0.25, 0.5),
        player("technical-p1", "home", 0.5, 0.24, "1"),
        player("technical-p2", "home", 0.74, 0.43, "2"),
        player("technical-p3", "home", 0.5, 0.76, "3"),
        player("technical-p4", "home", 0.3, 0.5, "4"),
        ball("technical-ball", 0.5, 0.28),
        arrow(
          "technical-check",
          { x: 0.7, y: 0.5 },
          { x: 0.74, y: 0.43 },
          "#94a3b8",
        ),
        label("technical-label", 0.5, 0.1, "Away, scan, arrive"),
      ],
      {
        coachCue: "Check away; arrive open.",
        playerAction: "Receiver creates separation and returns side-on.",
        ballAction: "Passer holds until the receiver arrives.",
        coachingPurpose: "Teach timing before receiving technique.",
      },
    ),
    step(
      "technical-open-body-3",
      3,
      "action",
      "Receive toward the next side",
      "The receiver takes the ball across the body toward the bottom cone.",
      [
        cone("technical-c1", 0.5, 0.2),
        cone("technical-c2", 0.75, 0.5),
        cone("technical-c3", 0.5, 0.8),
        cone("technical-c4", 0.25, 0.5),
        player("technical-p1", "home", 0.56, 0.32, "1"),
        player("technical-p2", "home", 0.7, 0.54, "2"),
        player("technical-p3", "home", 0.5, 0.76, "3"),
        player("technical-p4", "home", 0.3, 0.5, "4"),
        ball("technical-ball", 0.67, 0.57),
        arrow(
          "technical-pass",
          { x: 0.5, y: 0.28 },
          { x: 0.68, y: 0.5 },
        ),
        arrow(
          "technical-touch",
          { x: 0.68, y: 0.5 },
          { x: 0.66, y: 0.6 },
          "#22c55e",
        ),
        label("technical-label", 0.5, 0.1, "Far foot, next side"),
      ],
      {
        coachCue: "Across the body, into the next pass.",
        playerAction: "Receiver opens and guides the first touch clockwise.",
        ballAction: "Ball moves to the far foot and into useful space.",
        coachingPurpose: "Join body orientation to the next action.",
      },
    ),
    step(
      "technical-open-body-4",
      4,
      "rotation",
      "Pass and follow",
      "The receiver passes to the bottom cone while the original passer fills the right cone.",
      [
        cone("technical-c1", 0.5, 0.2),
        cone("technical-c2", 0.75, 0.5),
        cone("technical-c3", 0.5, 0.8),
        cone("technical-c4", 0.25, 0.5),
        player("technical-p1", "home", 0.68, 0.47, "1"),
        player("technical-p2", "home", 0.61, 0.64, "2"),
        player("technical-p3", "home", 0.5, 0.76, "3"),
        player("technical-p4", "home", 0.3, 0.5, "4"),
        ball("technical-ball", 0.52, 0.73),
        arrow(
          "technical-next-pass",
          { x: 0.66, y: 0.6 },
          { x: 0.52, y: 0.73 },
        ),
        arrow(
          "technical-follow",
          { x: 0.56, y: 0.32 },
          { x: 0.7, y: 0.48 },
          "#94a3b8",
        ),
        label("technical-label", 0.5, 0.1, "Pass and follow"),
      ],
      {
        coachCue: "First touch out, pass on, follow quickly.",
        playerAction: "Receiver completes the next pass; passer follows.",
        ballAction: "Ball continues around the diamond.",
        coachingPurpose: "Create repeatable receiving rhythm and rotation.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Place extra players behind, not beside, the starting cone.",
    "Pause the pattern before retrieving a ball that enters another group's area.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms queue spacing and ball-retrieval rules before approval.",
    ],
  },
  searchTags: [
    "receiving",
    "open body",
    "diamond",
    "far foot",
    "first touch",
  ],
};

export const OPEN_BODY_SMALL_SIDED_GAME: AcademyActivity = {
  id: "academy-ssg-open-body-end-zones",
  version: 1,
  title: "Open to Play Forward",
  summary:
    "A directional end-zone game that rewards receiving side-on and connecting forward without forcing the turn.",
  description:
    "A directional game in which teams score by finding a teammate arriving in an end zone. Bonus scoring rewards a prepared side-on reception followed by a controlled forward action, while safe retention remains a valid decision when pressure closes the route.",
  category: "small_sided_game",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "developing",
  formats: ["small_group", "9v9"],
  activityRole: "small_sided_game",
  activityType: "small_sided_game",
  playerCount: { min: 6, ideal: 12, max: 16 },
  durationMinutes: { min: 15, default: 20, max: 25 },
  field: {
    length: 30,
    width: 22,
    unit: "yards",
    guidance:
      "Use a four-yard end zone at each end; play 3v3 to 6v6 depending on roster.",
  },
  equipment: ["one ball", "eight cones", "two sets of pinnies", "spare balls"],
  goalIds: [
    GOAL_ID,
    "u12-scan-before-receiving",
    "u12-first-touch-away-pressure",
  ],
  relatedActivityIds: [
    OPEN_BODY_WARMUP.id,
    OPEN_BODY_TECHNICAL_ACTIVITY.id,
  ],
  relatedLessonIds: [RECEIVE_OPEN_BODY_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-open-body-three-moments"],
  relatedQuizIds: ["academy-quiz-receive-open-body"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Create a side-on receiving position between opponents.",
    "Recognize when the first touch can go forward.",
    "Retain possession when pressure closes the forward route.",
  ],
  setupInstructions: [
    "Mark a 30-by-22-yard field with a four-yard end zone at each end.",
    "Organize equal teams from 3v3 to 6v6.",
    "A team scores by completing a pass to a teammate arriving in the attacking end zone.",
    "Keep spare balls on both touchlines for immediate restarts.",
  ],
  organization: [
    "Play equal teams from 3v3 to 6v6 in one directional field.",
    "Teams attack opposite end zones and restart from their own end after a score.",
    "Use short rounds with coaching between rounds rather than during live play.",
  ],
  howItWorks: [
    "Teams play directionally and may score only with a controlled reception in the end zone.",
    "A reception that begins side-on and connects forward within two touches earns two points.",
    "A normal controlled end-zone reception earns one point.",
    "If the forward route is closed, retaining the ball remains live and is never penalized.",
    "Coach interventions use brief freezes only when the receiver's preparation is clearly visible.",
  ],
  resetInstructions: [
    "After a score, the defending team restarts immediately from its end zone.",
    "After the ball leaves the field, use the nearest spare ball and restart with a pass.",
  ],
  coachingPoints: [
    "Move outside the defender's cover shadow before asking for the ball.",
    "Scan while the pass travels and adjust the receiving stance.",
    "Open enough to see forward, but protect the safe return option.",
    "First touch forward only when the space is genuinely available.",
  ],
  commonMistakes: [
    {
      mistake: "Receiver waits in the end zone with a closed body.",
      correction: "Arrive from outside as the passer looks up.",
    },
    {
      mistake: "Players force a forward turn into pressure for the bonus.",
      correction: "Award the bonus only when the receiver keeps possession.",
    },
    {
      mistake: "Support stands directly behind a defender.",
      correction: "Move sideways until the passer can see both feet.",
    },
  ],
  progressions: [
    {
      title: "Midfield receiving bonus",
      description:
        "Award one point when a player receives between defenders and connects forward within two touches.",
    },
    {
      title: "Touch pressure",
      description:
        "Use a three-touch maximum only after players consistently scan and prepare.",
    },
  ],
  regressions: [
    {
      title: "Neutral support",
      description: "Add one neutral who plays with the team in possession.",
    },
    {
      title: "Deeper end zones",
      description: "Increase both end zones to six yards.",
    },
  ],
  steps: [
    step(
      "ssg-open-body-1",
      1,
      "setup",
      "Set two end zones",
      "Teams begin in a directional field with clear scoring zones.",
      [
        zone("ssg-field", { x: 0.14, y: 0.2 }, { x: 0.86, y: 0.8 }),
        zone(
          "ssg-left-zone",
          { x: 0.14, y: 0.2 },
          { x: 0.25, y: 0.8 },
          "#f59e0b30",
        ),
        zone(
          "ssg-right-zone",
          { x: 0.75, y: 0.2 },
          { x: 0.86, y: 0.8 },
          "#f59e0b30",
        ),
        player("ssg-h1", "home", 0.35, 0.32, "1"),
        player("ssg-h2", "home", 0.38, 0.5, "2"),
        player("ssg-h3", "home", 0.35, 0.68, "3"),
        player("ssg-a1", "away", 0.64, 0.32, "1"),
        player("ssg-a2", "away", 0.62, 0.5, "2"),
        player("ssg-a3", "away", 0.64, 0.68, "3"),
        ball("ssg-ball", 0.4, 0.5),
        label("ssg-label", 0.5, 0.11, "Open to play forward"),
      ],
      {
        coachCue: "Direction clear; arrive in the zone.",
        playerAction: "Teams spread and identify their attacking end zone.",
        ballAction: "Ball starts with the central home player.",
        coachingPurpose: "Create a directional reason to receive open.",
      },
    ),
    step(
      "ssg-open-body-2",
      2,
      "start",
      "Create the receiving lane",
      "A wide player moves outside the defender's cover shadow and scans before the pass.",
      [
        zone("ssg-field", { x: 0.14, y: 0.2 }, { x: 0.86, y: 0.8 }),
        zone(
          "ssg-right-zone",
          { x: 0.75, y: 0.2 },
          { x: 0.86, y: 0.8 },
          "#f59e0b30",
        ),
        player("ssg-h1", "home", 0.48, 0.28, "1"),
        player("ssg-h2", "home", 0.42, 0.5, "2"),
        player("ssg-h3", "home", 0.38, 0.68, "3"),
        player("ssg-a1", "away", 0.57, 0.34, "1"),
        player("ssg-a2", "away", 0.6, 0.5, "2"),
        player("ssg-a3", "away", 0.63, 0.68, "3"),
        ball("ssg-ball", 0.44, 0.5),
        arrow(
          "ssg-support-run",
          { x: 0.35, y: 0.32 },
          { x: 0.48, y: 0.28 },
          "#94a3b8",
        ),
        label("ssg-label", 0.5, 0.11, "Move into view"),
      ],
      {
        coachCue: "Out of the shadow; shoulder check.",
        playerAction: "H1 creates a visible diagonal lane and scans.",
        ballAction: "H2 protects the ball until the lane opens.",
        coachingPurpose: "Connect support movement to receiving orientation.",
      },
    ),
    step(
      "ssg-open-body-3",
      3,
      "action",
      "Receive side-on",
      "The receiver opens to see the forward runner and the safe return pass.",
      [
        zone("ssg-field", { x: 0.14, y: 0.2 }, { x: 0.86, y: 0.8 }),
        zone(
          "ssg-right-zone",
          { x: 0.75, y: 0.2 },
          { x: 0.86, y: 0.8 },
          "#f59e0b30",
        ),
        player("ssg-h1", "home", 0.5, 0.3, "1"),
        player("ssg-h2", "home", 0.45, 0.5, "2"),
        player("ssg-h3", "home", 0.58, 0.7, "3"),
        player("ssg-a1", "away", 0.58, 0.37, "1"),
        player("ssg-a2", "away", 0.62, 0.52, "2"),
        player("ssg-a3", "away", 0.67, 0.68, "3"),
        ball("ssg-ball", 0.52, 0.31),
        arrow(
          "ssg-pass",
          { x: 0.45, y: 0.5 },
          { x: 0.52, y: 0.31 },
        ),
        label("ssg-label", 0.5, 0.11, "See two options"),
      ],
      {
        coachCue: "Open hips; see forward and back.",
        playerAction: "H1 receives with both next actions visible.",
        ballAction: "Ball arrives on H1's safe foot.",
        coachingPurpose: "Make choice—not forced turning—the reward.",
      },
    ),
    step(
      "ssg-open-body-4",
      4,
      "decision",
      "Play forward when open",
      "The receiver connects with a runner arriving in the end zone.",
      [
        zone("ssg-field", { x: 0.14, y: 0.2 }, { x: 0.86, y: 0.8 }),
        zone(
          "ssg-right-zone",
          { x: 0.75, y: 0.2 },
          { x: 0.86, y: 0.8 },
          "#f59e0b30",
        ),
        player("ssg-h1", "home", 0.55, 0.31, "1"),
        player("ssg-h2", "home", 0.49, 0.5, "2"),
        player("ssg-h3", "home", 0.78, 0.68, "3"),
        player("ssg-a1", "away", 0.61, 0.39, "1"),
        player("ssg-a2", "away", 0.64, 0.52, "2"),
        player("ssg-a3", "away", 0.7, 0.62, "3"),
        ball("ssg-ball", 0.76, 0.67),
        arrow(
          "ssg-score-pass",
          { x: 0.55, y: 0.31 },
          { x: 0.76, y: 0.67 },
        ),
        label("ssg-label", 0.5, 0.11, "Forward picture open"),
      ],
      {
        coachCue: "See it, then connect.",
        playerAction: "H3 arrives in the zone as H1 releases the pass.",
        ballAction: "Ball reaches the end-zone runner under control.",
        coachingPurpose: "Reward transfer from receiving shape to penetration.",
      },
    ),
    step(
      "ssg-open-body-5",
      5,
      "reset",
      "Retain when the route closes",
      "After a restart or turnover, the new receiver keeps the safe option instead of forcing forward.",
      [
        zone("ssg-field", { x: 0.14, y: 0.2 }, { x: 0.86, y: 0.8 }),
        zone(
          "ssg-left-zone",
          { x: 0.14, y: 0.2 },
          { x: 0.25, y: 0.8 },
          "#f59e0b30",
        ),
        player("ssg-h1", "home", 0.56, 0.34, "1"),
        player("ssg-h2", "home", 0.52, 0.5, "2"),
        player("ssg-h3", "home", 0.58, 0.68, "3"),
        player("ssg-a1", "away", 0.48, 0.32, "1"),
        player("ssg-a2", "away", 0.42, 0.5, "2"),
        player("ssg-a3", "away", 0.47, 0.68, "3"),
        ball("ssg-ball", 0.45, 0.5),
        arrow(
          "ssg-retain",
          { x: 0.45, y: 0.5 },
          { x: 0.48, y: 0.32 },
          "#94a3b8",
        ),
        label("ssg-label", 0.5, 0.11, "Closed? Keep it."),
      ],
      {
        coachCue: "Open body, honest decision.",
        playerAction: "Away retains through support because forward is blocked.",
        ballAction: "Ball moves safely away from immediate pressure.",
        coachingPurpose: "Protect decision quality from the scoring constraint.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Maintain a clear buffer beyond both end lines.",
    "Use touchline spare balls only after the previous ball is clearly out of play.",
    "Scale field size to roster size to avoid repeated high-speed collisions.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms field size, end-zone depth, and restart safety before approval.",
    ],
  },
  searchTags: [
    "small sided game",
    "receiving",
    "open body",
    "end zone",
    "decision making",
  ],
};

export const OPEN_BODY_ASSIGNMENT: AcademyAssignmentTemplate = {
  id: "academy-assignment-open-body-three-moments",
  version: 1,
  title: "Find Three Open-Body Moments",
  description:
    "Practice the receiving shape at home, then identify where it could help in the next game.",
  assignmentType: "practice_skill",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  linkedLessonId: RECEIVE_OPEN_BODY_LESSON.id,
  linkedDrillId: OPEN_BODY_WARMUP.id,
  linkedQuizId: "academy-quiz-receive-open-body",
  instructions: [
    "Place two shoes three steps apart as a receiving gate and use a wall or partner.",
    "Before each of 20 passes, check over one shoulder, open the hips, and receive across the body through either side of the gate.",
    "Afterward, write or record one answer: what information helped you choose the receiving side?",
    "Ask a parent or partner to watch five repetitions and identify when they could see both your chest and your next direction.",
    "Before the next game, choose one personal reminder: scan early, open early, or first touch away from pressure.",
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const OPEN_BODY_QUIZ_QUESTIONS: AcademyQuizQuestion[] = [
  {
    id: "academy-quiz-receive-open-body-q1",
    questionType: "multiple_choice",
    prompt: "When should a player begin preparing an open body shape?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "before", label: "Before or while the pass travels" },
      { id: "after", label: "Only after stopping the ball" },
      { id: "never", label: "Only when the coach calls" },
    ],
    correctOptionIds: ["before"],
    explanation:
      "Early preparation gives the receiver time to see pressure and the next space.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-receive-open-body-q2",
    questionType: "multiple_choice",
    prompt: "What should an open receiving shape help the player see?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "two", label: "The ball and at least one next option" },
      { id: "ball", label: "Only the ball" },
      { id: "coach", label: "Only the coach" },
    ],
    correctOptionIds: ["two"],
    explanation:
      "The purpose is to keep the arriving ball and the next decision in the same picture.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-receive-open-body-q3",
    questionType: "true_false",
    prompt: "An open body shape means the player must always turn forward.",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    correctOptionIds: ["false"],
    explanation:
      "Opening gives information. If forward play is closed, retaining possession can be the best decision.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-receive-open-body-q4",
    questionType: "multiple_choice",
    prompt:
      "Pressure is arriving from the receiver's right. Which first touch is usually safer?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "left", label: "Away to the left, if that space is clear" },
      { id: "right", label: "Toward the pressure on the right" },
      { id: "stop", label: "A hard touch straight ahead every time" },
    ],
    correctOptionIds: ["left"],
    explanation:
      "The scan determines the safe side; the first touch should protect the ball from immediate pressure.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-receive-open-body-q5",
    questionType: "multiple_choice",
    prompt: "Why might a player receive with the foot farther from the passer?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      {
        id: "across",
        label: "To let the ball travel across the body toward the next action",
      },
      { id: "style", label: "Because it always looks better" },
      { id: "rule", label: "Because the near foot is never allowed" },
    ],
    correctOptionIds: ["across"],
    explanation:
      "The far foot is useful when it keeps the body open and the ball protected, but the game picture still decides.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-receive-open-body-q6",
    questionType: "true_false",
    prompt:
      "A shoulder check is useful only if the player adjusts the body or decision afterward.",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    correctOptionIds: ["true"],
    explanation:
      "Scanning should change preparation or confirm that the current receiving picture is safe.",
    editorial: { ...EDITORIAL },
  },
];

export const OPEN_BODY_QUIZ: AcademyQuiz = {
  id: "academy-quiz-receive-open-body",
  version: 1,
  title: "Receive with an Open Body Check",
  description:
    "Six game-understanding questions about scanning, body orientation, receiving foot, and choosing the next action.",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  questionIds: OPEN_BODY_QUIZ_QUESTIONS.map((question) => question.id),
  editorial: { ...EDITORIAL },
};

