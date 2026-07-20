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

const GOAL_ID = "u12-shield-and-retain";
const RELATED_GOAL_IDS = [
  "u12-control-across-surfaces",
  "u12-change-speed-direction",
];
const EVIDENCE_TAG_IDS = [
  "u12-shield-and-retain-evidence-positive",
  "u12-shield-and-retain-evidence-improvement",
];

const EDITORIAL = {
  status: "needs_coach_review" as const,
  originalWording: true,
  originalDiagram: true,
  generatedWithAssistance: true,
};

export const SHIELD_PURPOSE_LESSON: AcademyTacticalLesson = {
  id: "u12-lesson-shield-purpose",
  version: 1,
  title: "Shield with a Purpose",
  summary:
    "Players learn to use the body between the ball and the defender, retain possession with intention, and release the ball when support arrives or space opens.",
  ageBands: ["U11-U12"],
  formats: ["small_group", "9v9"],
  difficulty: "foundation",
  goalIds: [GOAL_ID],
  relatedGoalIds: RELATED_GOAL_IDS,
  estimatedMinutes: 8,
  learningObjective:
    "Place the body between the ball and pressure, keep the ball playable while shielding, and release to a teammate or into space when the purpose is clear.",
  successCriteria: [
    "The player gets side-on with the body between ball and defender.",
    "The player keeps the ball within one stride while shielding.",
    "The player can name why they are shielding — wait, turn, or release.",
    "The player releases the ball within three seconds when support arrives.",
  ],
  coachingPoints: [
    "Low center of gravity — knees bent, arm legal and steady.",
    "Ball on the safe foot, body on the pressure side.",
    "Shield to keep, not to hide — eyes up for support.",
    "Release when the purpose is achieved, not when panic arrives.",
  ],
  commonErrors: [
    {
      title: "Standing tall",
      description: "The player is upright and the defender reaches around.",
      correction: "Drop the hips and widen the base.",
    },
    {
      title: "Ball on pressure foot",
      description: "The ball sits on the same side as the defender.",
      correction: "Roll to the far foot and keep the body in between.",
    },
    {
      title: "Shielding forever",
      description: "The player holds the ball with no plan.",
      correction: "Name the purpose: wait for support, turn, or play out.",
    },
    {
      title: "Illegal holding",
      description: "The player grabs or pushes the defender.",
      correction: "Use the body position, not the hands.",
    },
  ],
  observableEvidence: [
    "Gets side-on with body between ball and defender.",
    "Keeps ball on the foot farther from pressure.",
    "Glances up for support while shielding.",
    "Releases with a pass or turn when support arrives.",
  ],
  progression:
    "Move from paired shield holds to a retain game where the shielder must connect within three seconds or turn away.",
  introduction: [
    "Ask: when is shielding useful — and when is it just hiding?",
    "Shield with a purpose means you know what you are waiting for.",
    "Coach cue: Body in, ball out — when the moment comes.",
  ],
  steps: [
    step(
      "lesson-shield-1",
      1,
      "setup",
      "Ball exposed",
      "The player faces the defender squarely with the ball in front — easy to poke.",
      [
        player("lesson-p1", "home", 0.5, 0.5, "P"),
        player("lesson-d1", "away", 0.58, 0.5, "D"),
        ball("lesson-ball", 0.52, 0.5),
        label("lesson-label", 0.5, 0.14, "Ball exposed"),
      ],
      {
        coachCue: "Where is the ball relative to the body?",
        playerAction: "Player sees the ball is unprotected.",
        ballAction: "Ball sits in front of both feet.",
        coachingPurpose: "Show unprotected possession.",
      },
    ),
    step(
      "lesson-shield-2",
      2,
      "start",
      "Side-on shield",
      "The player turns side-on with the body between ball and defender.",
      [
        player("lesson-p1", "home", 0.5, 0.48, "P"),
        player("lesson-d1", "away", 0.58, 0.52, "D"),
        ball("lesson-ball", 0.48, 0.5),
        label("lesson-label", 0.5, 0.14, "Body in between"),
      ],
      {
        coachCue: "Hips low, body between.",
        playerAction: "Player drops hips and shields with the body.",
        ballAction: "Ball moves to the far foot.",
        coachingPurpose: "Establish shield body shape.",
      },
    ),
    step(
      "lesson-shield-3",
      3,
      "action",
      "Retain with purpose",
      "The player holds while glancing up for a teammate arriving wide.",
      [
        player("lesson-p1", "home", 0.5, 0.48, "P"),
        player("lesson-d1", "away", 0.58, 0.52, "D"),
        player("lesson-s1", "home", 0.35, 0.35, "S"),
        ball("lesson-ball", 0.48, 0.5),
        arrow(
          "lesson-support",
          { x: 0.32, y: 0.38 },
          { x: 0.42, y: 0.44 },
          "#94a3b8",
        ),
        label("lesson-label", 0.5, 0.14, "Wait for support"),
      ],
      {
        coachCue: "Hold — support is coming.",
        playerAction: "Player shields and scans for support.",
        ballAction: "Ball stays playable on the safe foot.",
        coachingPurpose: "Connect shielding to a clear purpose.",
      },
    ),
    step(
      "lesson-shield-4",
      4,
      "decision",
      "Release when ready",
      "Support arrives; the player rolls out and passes away from pressure.",
      [
        player("lesson-p1", "home", 0.5, 0.48, "P"),
        player("lesson-d1", "away", 0.58, 0.52, "D"),
        player("lesson-s1", "home", 0.38, 0.38, "S"),
        ball("lesson-ball", 0.4, 0.4),
        arrow(
          "lesson-release",
          { x: 0.48, y: 0.48 },
          { x: 0.4, y: 0.4 },
          "#22c55e",
        ),
        label("lesson-label", 0.5, 0.14, "Body in, ball out"),
      ],
      {
        coachCue: "Purpose done — play out.",
        playerAction: "Player releases to support.",
        ballAction: "Ball moves away from pressure.",
        coachingPurpose: "Complete the shield with intentional release.",
      },
    ),
  ],
  coachQuestions: [
    "Why were you shielding in that moment?",
    "How long is too long to hold?",
    "When should you turn instead of passing?",
  ],
  playerQuestions: [
    "Was the ball on your safe foot?",
    "Did you see support before you released?",
    "What was your purpose — wait, turn, or play?",
  ],
  activityIds: [
    "academy-warmup-shield-purpose-pairs",
    "academy-activity-shield-purpose-box",
    "academy-ssg-shield-purpose-retain",
  ],
  relatedAssignmentIds: ["academy-assignment-shield-purpose"],
  relatedQuizIds: ["academy-quiz-shield-purpose"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const SHIELD_PURPOSE_WARMUP: AcademyActivity = {
  id: "academy-warmup-shield-purpose-pairs",
  version: 1,
  title: "Pair Shield Hold",
  summary:
    "Partners take turns shielding for three seconds while the other applies light shoulder pressure, then release with a pass.",
  description:
    "A paired warmup that teaches low body shape and safe foot placement. The shielder must call their purpose — wait, turn, or release — before the hold begins.",
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
    length: 8,
    width: 8,
    unit: "yards",
    guidance: "One eight-yard circle or square per pair.",
  },
  equipment: ["one ball per pair", "four cones per pair optional"],
  goalIds: [GOAL_ID, "u12-control-across-surfaces"],
  relatedActivityIds: ["academy-activity-shield-purpose-box"],
  relatedLessonIds: [SHIELD_PURPOSE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-shield-purpose"],
  relatedQuizIds: ["academy-quiz-shield-purpose"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Get side-on with body between ball and partner pressure.",
    "Keep the ball on the safe foot for three seconds.",
    "Release with a firm pass when the coach calls release.",
  ],
  setupInstructions: [
    "Pair players with one ball in an eight-yard square.",
    "Shielder starts with ball; partner applies light shoulder pressure.",
    "Shielder calls purpose: wait, turn, or release before each hold.",
    "Coach counts three seconds then calls release.",
  ],
  organization: [
    "30-second work rounds then swap roles.",
    "Partners stay in the same square for four rounds.",
    "Rotate pairs if numbers are uneven.",
  ],
  howItWorks: [
    "Shielder gets side-on and holds for three seconds.",
    "Partner applies legal shoulder pressure without tackling.",
    "On release call, shielder plays a pass to the partner.",
    "Partners swap shielder and pressure roles each round.",
  ],
  resetInstructions: [
    "Loose balls restart from the center of the square.",
    "Extra players wait behind squares and rotate in.",
  ],
  coachingPoints: [
    "Low hips, wide base, legal arms.",
    "Ball on the foot farther from pressure.",
    "Eyes up once during the hold.",
    "Release decisively — no extra dribbles.",
  ],
  commonMistakes: [
    {
      mistake: "Partner pushes with hands.",
      correction: "Shoulder pressure only — hands behind back.",
    },
    {
      mistake: "Shielder stands upright.",
      correction: "Coach freezes and resets until hips drop.",
    },
    {
      mistake: "Holding past the release call.",
      correction: "Count aloud — release on three.",
    },
  ],
  progressions: [
    {
      title: "Named support",
      description: "Third player becomes support; release must find them.",
    },
    {
      title: "Turn release",
      description: "Shielder turns away instead of passing on release.",
    },
  ],
  regressions: [
    {
      title: "No pressure",
      description: "Solo shield hold against a cone as imaginary defender.",
    },
    {
      title: "Longer hold",
      description: "Extend to five seconds for body shape focus only.",
    },
    {
      title: "Uneven attendance",
      description:
        "Trios with two shielders alternating; third calls purpose and counts.",
    },
  ],
  steps: [
    step(
      "warmup-shield-1",
      1,
      "setup",
      "Pair square",
      "Shielder and partner face each other in an eight-yard square.",
      [
        zone("warmup-square", { x: 0.35, y: 0.32 }, { x: 0.65, y: 0.68 }),
        player("warmup-shield", "home", 0.5, 0.5, "S"),
        player("warmup-press", "away", 0.56, 0.52, "P"),
        ball("warmup-ball", 0.52, 0.5),
        label("warmup-label", 0.5, 0.14, "Shield hold"),
      ],
      {
        coachCue: "Purpose first — then hold.",
        playerAction: "Shielder names wait, turn, or release.",
        ballAction: "Ball at shielder's feet.",
        coachingPurpose: "Introduce purposeful shielding.",
      },
    ),
    step(
      "warmup-shield-2",
      2,
      "start",
      "Side-on shape",
      "Shielder drops hips and places body between ball and partner.",
      [
        zone("warmup-square", { x: 0.35, y: 0.32 }, { x: 0.65, y: 0.68 }),
        player("warmup-shield", "home", 0.5, 0.48, "S"),
        player("warmup-press", "away", 0.57, 0.52, "P"),
        ball("warmup-ball", 0.47, 0.5),
        label("warmup-label", 0.5, 0.14, "Body between"),
      ],
      {
        coachCue: "Low, wide, legal.",
        playerAction: "Shielder gets side-on with ball on safe foot.",
        ballAction: "Ball rolls to far foot.",
        coachingPurpose: "Teach shield body mechanics.",
      },
    ),
    step(
      "warmup-shield-3",
      3,
      "action",
      "Hold for three",
      "Partner applies shoulder pressure; shielder retains for three seconds.",
      [
        zone("warmup-square", { x: 0.35, y: 0.32 }, { x: 0.65, y: 0.68 }),
        player("warmup-shield", "home", 0.5, 0.48, "S"),
        player("warmup-press", "away", 0.56, 0.5, "P"),
        ball("warmup-ball", 0.47, 0.5),
        arrow(
          "warmup-pressure",
          { x: 0.56, y: 0.5 },
          { x: 0.52, y: 0.49 },
          "#f87171",
        ),
        label("warmup-label", 0.5, 0.14, "Hold — eyes up"),
      ],
      {
        coachCue: "Hold, glance, stay low.",
        playerAction: "Shielder retains and scans once.",
        ballAction: "Ball stays within one stride.",
        coachingPurpose: "Build retain under light pressure.",
      },
    ),
    step(
      "warmup-shield-4",
      4,
      "decision",
      "Release on call",
      "Coach calls release; shielder passes firmly to partner.",
      [
        zone("warmup-square", { x: 0.35, y: 0.32 }, { x: 0.65, y: 0.68 }),
        player("warmup-shield", "home", 0.5, 0.48, "S"),
        player("warmup-press", "away", 0.42, 0.44, "P"),
        ball("warmup-ball", 0.4, 0.42),
        arrow(
          "warmup-pass",
          { x: 0.47, y: 0.48 },
          { x: 0.4, y: 0.42 },
        ),
        label("warmup-label", 0.5, 0.14, "Body in, ball out"),
      ],
      {
        coachCue: "Release — firm pass.",
        playerAction: "Shielder plays out to partner.",
        ballAction: "Ball leaves pressure cleanly.",
        coachingPurpose: "Complete shield with intentional release.",
      },
    ),
    step(
      "warmup-shield-5",
      5,
      "rotation",
      "Swap roles",
      "Former presser becomes shielder for the next round.",
      [
        player("warmup-shield", "away", 0.5, 0.5, "P"),
        player("warmup-press", "home", 0.56, 0.52, "S"),
        ball("warmup-ball", 0.52, 0.5),
        label("warmup-label", 0.5, 0.14, "Switch roles"),
      ],
      {
        coachCue: "New shielder — name purpose.",
        playerAction: "Partners swap roles.",
        ballAction: "Ball transfers to new shielder.",
        coachingPurpose: "Give both players shield repetitions.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Shoulder pressure only — no pushing with hands.",
    "Keep squares four yards apart.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms contact rules before approval.",
    ],
  },
  searchTags: ["shield", "retain", "pairs", "warmup", "body shape"],
};

export const SHIELD_PURPOSE_TECHNICAL: AcademyActivity = {
  id: "academy-activity-shield-purpose-box",
  version: 1,
  title: "Purpose Box Retain",
  summary:
    "Shielders retain in a box against a live defender and must release to a target player within three seconds.",
  description:
    "An opposed box exercise where the shielder receives under pressure, holds with a stated purpose, and plays to a target on the sideline or turns away before the three-second count ends.",
  category: "technical",
  ageBands: ["U11-U12"],
  ageRange: { min: 11, max: 12 },
  difficulty: "foundation",
  formats: ["small_group", "9v9"],
  activityRole: "technical",
  activityType: "opposed_technical",
  playerCount: { min: 3, ideal: 9, max: 12 },
  durationMinutes: { min: 12, default: 15, max: 20 },
  field: {
    length: 12,
    width: 12,
    unit: "yards",
    guidance: "One 12-yard square per trio with a target on one sideline.",
  },
  equipment: ["one ball per group", "four cones per box", "one target cone"],
  goalIds: [GOAL_ID, "u12-change-speed-direction"],
  relatedActivityIds: [
    "academy-warmup-shield-purpose-pairs",
    "academy-ssg-shield-purpose-retain",
  ],
  relatedLessonIds: [SHIELD_PURPOSE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-shield-purpose"],
  relatedQuizIds: ["academy-quiz-shield-purpose"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Shield side-on with body between ball and defender.",
    "State and execute a purpose: release to target or turn away.",
    "Connect within three seconds or lose possession.",
  ],
  setupInstructions: [
    "Mark a 12-yard square with a target cone on one sideline.",
    "Shielder starts in center with ball; defender applies live pressure.",
    "Target player moves along the sideline to create a passing angle.",
    "Coach counts three seconds from first touch.",
  ],
  organization: [
    "Trios rotate shielder, defender, and target roles.",
    "Multiple boxes for larger groups.",
    "Shielder must call purpose before receiving the pass.",
  ],
  howItWorks: [
    "Target passes to shielder who receives under pressure.",
    "Shielder holds with stated purpose while defender tries to win ball.",
    "Within three seconds shielder passes to target or turns away successfully.",
    "Failed retain or late release = defender becomes shielder.",
  ],
  resetInstructions: [
    "Restart from target pass after each attempt.",
    "Uneven numbers use a coach as target or rotate waiting player.",
  ],
  coachingPoints: [
    "Receive already side-on when possible.",
    "Ball on safe foot before pressure arrives.",
    "Glance at target once during the hold.",
    "Release firm and away from pressure.",
  ],
  commonMistakes: [
    {
      mistake: "Shielder dribbles in circles without purpose.",
      correction: "Must call wait, turn, or release before the pass in.",
    },
    {
      mistake: "Target stands directly behind defender.",
      correction: "Target stays wide on the sideline.",
    },
    {
      mistake: "Defender fouls with hands.",
      correction: "Legal challenge only — coach resets on foul.",
    },
  ],
  progressions: [
    {
      title: "Two defenders",
      description: "Add a second defender after three successful releases.",
    },
    {
      title: "Turn-only purpose",
      description: "Shielder must turn away — no pass option this round.",
    },
  ],
  regressions: [
    {
      title: "Passive defender",
      description: "Defender jockeys without tackling for two rounds.",
    },
    {
      title: "Five-second count",
      description: "Extend time limit while learning body shape.",
    },
    {
      title: "Uneven attendance",
      description:
        "Quartets with rotating target; waiting player counts aloud.",
    },
  ],
  steps: [
    step(
      "tech-shield-1",
      1,
      "setup",
      "Box with target",
      "Shielder, defender, and sideline target set in a 12-yard square.",
      [
        zone("tech-box", { x: 0.3, y: 0.28 }, { x: 0.7, y: 0.72 }),
        player("tech-shield", "home", 0.5, 0.5, "S"),
        player("tech-def", "away", 0.56, 0.52, "D"),
        player("tech-target", "home", 0.3, 0.5, "T"),
        cone("tech-target-marker", 0.28, 0.5),
        ball("tech-ball", 0.32, 0.5),
        label("tech-label", 0.5, 0.14, "Purpose box"),
      ],
      {
        coachCue: "Target wide — purpose named.",
        playerAction: "Shielder calls wait, turn, or release.",
        ballAction: "Ball with target to pass in.",
        coachingPurpose: "Set opposed retain scenario.",
      },
    ),
    step(
      "tech-shield-2",
      2,
      "start",
      "Receive under pressure",
      "Target passes in; shielder receives side-on as defender closes.",
      [
        zone("tech-box", { x: 0.3, y: 0.28 }, { x: 0.7, y: 0.72 }),
        player("tech-shield", "home", 0.48, 0.48, "S"),
        player("tech-def", "away", 0.54, 0.5, "D"),
        player("tech-target", "home", 0.32, 0.5, "T"),
        ball("tech-ball", 0.44, 0.48),
        arrow(
          "tech-pass-in",
          { x: 0.32, y: 0.5 },
          { x: 0.42, y: 0.48 },
        ),
        label("tech-label", 0.5, 0.14, "Receive and shield"),
      ],
      {
        coachCue: "Side-on before contact.",
        playerAction: "Shielder receives on safe foot.",
        ballAction: "Ball arrives as defender closes.",
        coachingPurpose: "Link receiving to immediate shield.",
      },
    ),
    step(
      "tech-shield-3",
      3,
      "action",
      "Hold with purpose",
      "Shielder drops hips and retains while glancing at target.",
      [
        zone("tech-box", { x: 0.3, y: 0.28 }, { x: 0.7, y: 0.72 }),
        player("tech-shield", "home", 0.5, 0.46, "S"),
        player("tech-def", "away", 0.56, 0.5, "D"),
        player("tech-target", "home", 0.3, 0.42, "T"),
        ball("tech-ball", 0.47, 0.48),
        arrow(
          "tech-look",
          { x: 0.5, y: 0.44 },
          { x: 0.34, y: 0.42 },
          "#94a3b8",
        ),
        label("tech-label", 0.5, 0.14, "Hold — count 3"),
      ],
      {
        coachCue: "Low, look, keep.",
        playerAction: "Shielder retains and scans target.",
        ballAction: "Ball on safe foot under pressure.",
        coachingPurpose: "Practice timed purposeful hold.",
      },
    ),
    step(
      "tech-shield-4",
      4,
      "reset",
      "Release to target, then rotate",
      "Shielder plays firm pass to target before count ends, then roles rotate.",
      [
        zone("tech-box", { x: 0.3, y: 0.28 }, { x: 0.7, y: 0.72 }),
        player("tech-shield", "home", 0.5, 0.46, "S"),
        player("tech-def", "away", 0.56, 0.5, "D"),
        player("tech-target", "home", 0.32, 0.4, "T"),
        ball("tech-ball", 0.34, 0.42),
        arrow(
          "tech-release",
          { x: 0.47, y: 0.46 },
          { x: 0.34, y: 0.42 },
          "#22c55e",
        ),
        label("tech-label", 0.5, 0.14, "Play out"),
      ],
      {
        coachCue: "Body in, ball out.",
        playerAction: "Shielder releases to target.",
        ballAction: "Pass beats pressure.",
        coachingPurpose: "Complete retain with connection.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Legal challenges only in the box.",
    "Target stays on sideline, not inside contest area.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms contact and spacing rules before approval.",
    ],
  },
  searchTags: ["shield", "retain", "opposed", "box", "release"],
};

export const SHIELD_PURPOSE_SSG: AcademyActivity = {
  id: "academy-ssg-shield-purpose-retain",
  version: 1,
  title: "Retain to Connect",
  summary:
    "Possession teams score by shielding under pressure and connecting five passes within ten seconds.",
  description:
    "A keep-ball game where a player who receives under pressure must shield with a stated purpose before the team completes five passes. Turnovers happen when shielding exceeds three seconds without release or turn.",
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
    length: 28,
    width: 22,
    unit: "yards",
    guidance: "28-by-22-yard field split into two equal zones optional.",
  },
  equipment: ["one ball", "eight cones"],
  goalIds: [GOAL_ID, "u12-control-across-surfaces"],
  relatedActivityIds: [
    "academy-warmup-shield-purpose-pairs",
    "academy-activity-shield-purpose-box",
  ],
  relatedLessonIds: [SHIELD_PURPOSE_LESSON.id],
  relatedPracticeTemplateIds: [],
  relatedAssignmentIds: ["academy-assignment-shield-purpose"],
  relatedQuizIds: ["academy-quiz-shield-purpose"],
  evidenceTagIds: EVIDENCE_TAG_IDS,
  objectives: [
    "Shield with a clear purpose when pressed in a game.",
    "Release or turn within three seconds under live pressure.",
    "Connect team passes after a successful retain.",
  ],
  setupInstructions: [
    "Mark a 28-by-22-yard field.",
    "Organize 5v5 or 4v4 with one ball.",
    "Team in possession must complete five passes to score a point.",
    "Any player pressed must shield and release within three seconds.",
  ],
  organization: [
    "Play 3-minute rounds; highest pass chains wins.",
    "Coach counts aloud when a shield begins.",
    "Freeze briefly to highlight purposeful releases.",
  ],
  howItWorks: [
    "Teams keep possession in the field.",
    "When a player is pressed, they must get side-on and shield.",
    "Within three seconds they pass, turn away, or lose the ball.",
    "Five consecutive team passes = one point.",
    "Shielding without a visible purpose resets the pass count.",
  ],
  resetInstructions: [
    "Turnover restarts with the defending team in the center.",
    "Use spare balls for out-of-bounds.",
  ],
  coachingPoints: [
    "Call your purpose when pressed — teammates adjust.",
    "Support angles wide, not straight behind pressure.",
    "Release firm; soft passes invite another press.",
    "Turn away when no pass is on — that counts as release.",
  ],
  commonMistakes: [
    {
      mistake: "Shielding until turnover without trying to release.",
      correction: "Coach counts three — turnover if no release.",
    },
    {
      mistake: "Teammates hide behind the presser.",
      correction: "Support must show outside shoulder of pressure.",
    },
    {
      mistake: "Illegal holding under pressure.",
      correction: "Reset and coach legal body position.",
    },
  ],
  progressions: [
    {
      title: "Two-touch after shield",
      description: "After release, team must finish chain in two touches each.",
    },
    {
      title: "Bonus for turn release",
      description: "Two points if shield ends with a successful turn away.",
    },
  ],
  regressions: [
    {
      title: "Neutral overload",
      description: "Add neutral who always plays with possession team.",
    },
    {
      title: "Three-pass chain",
      description: "Reduce required passes from five to three.",
    },
    {
      title: "Uneven attendance",
      description: "Play 4v3 with a neutral or rotate floater every goal.",
    },
  ],
  steps: [
    step(
      "ssg-retain-1",
      1,
      "setup",
      "Keep-ball field",
      "Equal teams spread in a possession field.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-h1", "home", 0.35, 0.35, "1"),
        player("ssg-h2", "home", 0.38, 0.55, "2"),
        player("ssg-h3", "home", 0.42, 0.68, "3"),
        player("ssg-a1", "away", 0.6, 0.38, "1"),
        player("ssg-a2", "away", 0.62, 0.55, "2"),
        ball("ssg-ball", 0.4, 0.5),
        label("ssg-label", 0.5, 0.11, "Retain to connect"),
      ],
      {
        coachCue: "Five passes — shield when pressed.",
        playerAction: "Teams identify possession rules.",
        ballAction: "Ball with home team.",
        coachingPurpose: "Create game need for purposeful shielding.",
      },
    ),
    step(
      "ssg-retain-2",
      2,
      "start",
      "Press arrives",
      "H2 receives as A2 closes; must prepare to shield.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-h2", "home", 0.48, 0.52, "2"),
        player("ssg-a2", "away", 0.54, 0.5, "2"),
        player("ssg-h1", "home", 0.35, 0.4, "1"),
        ball("ssg-ball", 0.5, 0.5),
        arrow(
          "ssg-press",
          { x: 0.58, y: 0.5 },
          { x: 0.52, y: 0.51 },
          "#f87171",
        ),
        label("ssg-label", 0.5, 0.11, "Pressed — shield"),
      ],
      {
        coachCue: "Side-on before they arrive.",
        playerAction: "H2 gets body between ball and A2.",
        ballAction: "Ball moves to safe foot.",
        coachingPurpose: "Apply shield under live press.",
      },
    ),
    step(
      "ssg-retain-3",
      3,
      "action",
      "Hold and scan",
      "H2 shields for two seconds and sees H1 wide.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-h2", "home", 0.5, 0.5, "2"),
        player("ssg-a2", "away", 0.55, 0.52, "2"),
        player("ssg-h1", "home", 0.28, 0.35, "1"),
        ball("ssg-ball", 0.48, 0.5),
        arrow(
          "ssg-scan",
          { x: 0.5, y: 0.48 },
          { x: 0.32, y: 0.36 },
          "#94a3b8",
        ),
        label("ssg-label", 0.5, 0.11, "Purpose: release"),
      ],
      {
        coachCue: "Hold — support wide.",
        playerAction: "H2 scans and finds H1.",
        ballAction: "Ball retained on safe foot.",
        coachingPurpose: "Connect shield to support picture.",
      },
    ),
    step(
      "ssg-retain-4",
      4,
      "decision",
      "Release and chain",
      "H2 plays out to H1; team continues pass count.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-h2", "home", 0.5, 0.5, "2"),
        player("ssg-h1", "home", 0.32, 0.38, "1"),
        player("ssg-a2", "away", 0.54, 0.52, "2"),
        ball("ssg-ball", 0.34, 0.4),
        arrow(
          "ssg-out",
          { x: 0.48, y: 0.5 },
          { x: 0.34, y: 0.4 },
        ),
        label("ssg-label", 0.5, 0.11, "Body in, ball out"),
      ],
      {
        coachCue: "Release — keep counting.",
        playerAction: "H2 connects pass chain.",
        ballAction: "Ball away from pressure.",
        coachingPurpose: "Reward purposeful release in game.",
      },
    ),
    step(
      "ssg-retain-5",
      5,
      "reset",
      "Late shield turnover",
      "Away wins ball when shield exceeds three seconds without release.",
      [
        zone("ssg-field", { x: 0.12, y: 0.2 }, { x: 0.88, y: 0.8 }),
        player("ssg-a2", "away", 0.48, 0.5, "2"),
        player("ssg-h2", "home", 0.52, 0.52, "2"),
        ball("ssg-ball", 0.46, 0.5),
        label("ssg-label", 0.5, 0.11, "Too long — turnover"),
      ],
      {
        coachCue: "Three seconds max — notice turnover.",
        playerAction: "Away wins possession.",
        ballAction: "Ball available for away team.",
        coachingPurpose: "Limit hiding; reward decisive release.",
      },
    ),
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
  safetyNotes: [
    "Coach enforces legal contact during shielding.",
    "Scale field to avoid congestion.",
  ],
  safetyReview: {
    status: "not_reviewed",
    concerns: [],
    recommendedChanges: [
      "Coach reviewer confirms contact rules before approval.",
    ],
  },
  searchTags: ["small sided game", "shield", "retain", "possession"],
};

export const SHIELD_PURPOSE_ASSIGNMENT: AcademyAssignmentTemplate = {
  id: "academy-assignment-shield-purpose",
  version: 1,
  title: "Shield with Purpose at Home",
  description:
    "Practice shield body shape alone or with a partner, name your purpose each hold, and reflect on when shielding helped you keep the ball.",
  assignmentType: "practice_skill",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  linkedLessonId: SHIELD_PURPOSE_LESSON.id,
  linkedDrillId: SHIELD_PURPOSE_WARMUP.id,
  linkedQuizId: "academy-quiz-shield-purpose",
  estimatedMinutes: 17,
  completionCriteria: [
    "Complete eight shield holds of three seconds with correct body shape.",
    "Name a purpose (wait, turn, or release) before each hold.",
    "Successfully release with a pass or turn on at least six of eight holds.",
  ],
  easierOption:
    "Solo shield against a wall or cone with no pressure; focus on low hips and safe foot.",
  harderOption:
    "Partner applies shoulder pressure; release must reach a target cone five steps away within three seconds.",
  instructions: [
    "Stand side-on to an imaginary defender with the ball on your far foot.",
    "Drop your hips, widen your base, and hold for three seconds.",
    "Before each hold, say your purpose aloud: wait, turn, or release.",
    "On release, pass to a wall, partner, or target cone — firm and away from pressure.",
    "Repeat eight times, switching the foot you shield with every two reps.",
    "Write or tell someone: when did shielding help you keep the ball today?",
  ],
  sourceProvenance: [],
  editorial: { ...EDITORIAL },
};

export const SHIELD_PURPOSE_QUIZ_QUESTIONS: AcademyQuizQuestion[] = [
  {
    id: "academy-quiz-shield-purpose-q1",
    questionType: "multiple_choice",
    prompt: "Why do you shield the ball?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      {
        id: "purpose",
        label: "To keep the ball while you wait, turn, or find support",
      },
      { id: "hide", label: "To hide from the game until the whistle" },
      { id: "show", label: "To show tricks to the crowd" },
    ],
    correctOptionIds: ["purpose"],
    explanation:
      "Shielding has a job — retain until you can release with intention.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-shield-purpose-q2",
    questionType: "multiple_choice",
    prompt: "Where should the ball be while you shield?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "far", label: "On the foot farther from the defender" },
      { id: "near", label: "On the same foot as the defender" },
      { id: "behind", label: "Directly behind your legs where you cannot see it" },
    ],
    correctOptionIds: ["far"],
    explanation: "Keep the ball on the safe foot with your body in between.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-shield-purpose-q3",
    questionType: "true_false",
    prompt: "Good shielding means holding the ball as long as possible no matter what.",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    correctOptionIds: ["false"],
    explanation:
      "Release or turn when your purpose is done — shielding is not hiding.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-shield-purpose-q4",
    questionType: "multiple_choice",
    prompt: "Support is arriving wide while you are pressed. Best action?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      {
        id: "release",
        label: "Shield briefly, glance at support, then play out firmly",
      },
      { id: "spin", label: "Spin in place until the defender leaves" },
      { id: "kick", label: "Kick the ball away randomly" },
    ],
    correctOptionIds: ["release"],
    explanation: "Hold with purpose, then release when support is available.",
    editorial: { ...EDITORIAL },
  },
  {
    id: "academy-quiz-shield-purpose-q5",
    questionType: "multiple_choice",
    prompt: "What body shape helps you shield legally and effectively?",
    ageBands: ["U11-U12"],
    goalIds: [GOAL_ID],
    options: [
      { id: "low", label: "Low hips, side-on, body between ball and defender" },
      { id: "tall", label: "Standing tall facing the defender squarely" },
      { id: "hands", label: "Grabbing the defender with both hands" },
    ],
    correctOptionIds: ["low"],
    explanation: "Low and side-on keeps the ball protected without fouling.",
    editorial: { ...EDITORIAL },
  },
];

export const SHIELD_PURPOSE_QUIZ: AcademyQuiz = {
  id: "academy-quiz-shield-purpose",
  version: 1,
  title: "Shield with a Purpose Check",
  description:
    "Five decision questions about body shape, safe foot, purpose, and releasing under pressure.",
  ageBands: ["U11-U12"],
  goalIds: [GOAL_ID],
  questionIds: SHIELD_PURPOSE_QUIZ_QUESTIONS.map((question) => question.id),
  editorial: { ...EDITORIAL },
};

export const SHIELD_PURPOSE_PRACTICE_PLAN: AcademyLessonPackagePracticePlan = {
  defaultMinutes: 75,
  shortMinutes: 45,
  sections: [
    {
      order: 1,
      role: "warm_up",
      activityId: "academy-warmup-shield-purpose-pairs",
      plannedMinutes: 15,
      shortMinutes: 10,
      objective: "Three-second shield holds with named purpose and release.",
    },
    {
      order: 2,
      role: "technical",
      activityId: "academy-activity-shield-purpose-box",
      plannedMinutes: 25,
      shortMinutes: 15,
      objective: "Retain in the box and release to target within three seconds.",
    },
    {
      order: 3,
      role: "small_sided_game",
      activityId: "academy-ssg-shield-purpose-retain",
      plannedMinutes: 35,
      shortMinutes: 20,
      objective: "Shield when pressed and connect five-pass chains.",
    },
  ],
  reflectionQuestions: [
    "What was your purpose each time you shielded?",
    "Did you release before or after pressure won the ball?",
    "Which support angle made release easiest?",
  ],
};
