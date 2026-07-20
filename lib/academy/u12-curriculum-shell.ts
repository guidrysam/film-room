import type {
  AcademyCurriculum,
  AcademyLearningSequenceSlot,
  AcademyTrainingBlock,
} from "@/lib/academy/types";

const EDITORIAL = {
  status: "needs_coach_review" as const,
  originalWording: true,
  originalDiagram: true,
  generatedWithAssistance: true,
  editorialNotes: [
    "Phase B curriculum shell — learning sequences reference map lesson IDs; packages authored in Phase C.",
  ],
};

type CoreSlotInput = {
  order: number;
  lessonId: string;
  title: string;
  primaryGoalIds: string[];
  lessonPackageId?: string;
  notes?: string;
};

function coreSlots(inputs: CoreSlotInput[]): AcademyLearningSequenceSlot[] {
  return inputs.map((input) => ({
    order: input.order,
    kind: "core_lesson" as const,
    lessonId: input.lessonId,
    title: input.title,
    primaryGoalIds: input.primaryGoalIds,
    lessonPackageId: input.lessonPackageId,
    notes: input.notes,
  }));
}

function block(input: {
  id: string;
  order: number;
  title: string;
  objective: string;
  playerOutcomes: string[];
  corePrinciples: string[];
  prerequisiteBlockIds: string[];
  primaryGoalIds: string[];
  assessmentCriteria: string[];
  repeatOrAdvanceGuidance: string;
  transitionHabits: string[];
  recommendedDurationWeeks: { min: number; default: number; max: number };
  sequenceTitle: string;
  sequenceSummary: string;
  slots: CoreSlotInput[];
}): AcademyTrainingBlock {
  return {
    id: input.id,
    order: input.order,
    title: input.title,
    objective: input.objective,
    playerOutcomes: input.playerOutcomes,
    corePrinciples: input.corePrinciples,
    prerequisiteBlockIds: input.prerequisiteBlockIds,
    primaryGoalIds: input.primaryGoalIds,
    assessmentCriteria: input.assessmentCriteria,
    repeatOrAdvanceGuidance: input.repeatOrAdvanceGuidance,
    transitionHabits: input.transitionHabits,
    recommendedDurationWeeks: input.recommendedDurationWeeks,
    learningSequences: [
      {
        id: `${input.id}-seq-01`,
        title: input.sequenceTitle,
        summary: input.sequenceSummary,
        order: 1,
        slots: coreSlots(input.slots),
      },
    ],
  };
}

/**
 * Durable Phase B shell for the U12 pathway.
 * Lesson package refs are unresolved except for the published open-body package (L5).
 */
export const U12_DEVELOPMENT_CURRICULUM_SHELL: AcademyCurriculum = {
  id: "film-room-u12-development-v1",
  version: 1,
  title: "U12 Player Development Pathway",
  shortDescription:
    "Capability-based annual pathway: training blocks → learning sequences → lesson packages, with woven transition and ~10–15% club-identity flexibility.",
  ageBand: { minAge: 10, maxAge: 12, labels: ["U11", "U12"] },
  developmentStage: "game_training",
  defaultPlayingFormat: "9v9",
  ownership: { kind: "film_room" },
  philosophy: {
    summary:
      "Develop what players can do in the game — perceive, decide, execute, adapt — not isolated soccer topics.",
    playerExperiencePrinciples: [
      "Every block answers what the player should be able to do afterward.",
      "Transition habits become automatic through repetition, not one chapter.",
      "The year ends by playing the game: recognize, choose, adapt, solve.",
    ],
    coachingPrinciples: [
      "Technique counts when it changes a decision.",
      "Repeat when observational criteria fail; do not advance on schedule alone.",
      "Use the spiral mastery matrix to prevent gaps.",
    ],
    gamePrinciples: [
      "Opposition and decisions appear early.",
      "Shared activity families vary by constraint, not by reinventing drills.",
      "Club identity uses flex weeks and constraints without leaving the pathway.",
    ],
  },
  defaults: {
    practicesPerWeek: 2,
    practiceMinutes: 75,
    coreLessonCount: 40,
    flexibleWeekCount: 10,
    clubIdentityFlexPercent: { min: 10, max: 15 },
  },
  clubIdentityGuidance: {
    flexPercent: { min: 10, max: 15 },
    allowedEmphases: [
      "possession",
      "pressing",
      "counterattack",
      "balanced",
      "custom",
    ],
    notes: [
      "Keep core lesson order and spiral coverage.",
      "Express identity via flex weeks and session constraints, not new doctrine packages.",
      "Fork with ownership.kind club and pin a curriculumVersion per season.",
    ],
  },
  trainingBlocks: [
    block({
      id: "u12-curr-block-01-own-the-ball",
      order: 1,
      title: "Own the Ball",
      objective:
        "Establish safe ball security, bilateral comfort, and early scanning habits.",
      playerOutcomes: [
        "Control with both feet",
        "Change surface without panic",
        "Keep the ball playable while moving",
      ],
      corePrinciples: [
        "Ball stays available",
        "Eyes up between touches",
        "Retain with a purpose",
      ],
      prerequisiteBlockIds: [],
      primaryGoalIds: [
        "u12-control-across-surfaces",
        "u12-change-speed-direction",
        "u12-shield-and-retain",
      ],
      assessmentCriteria: [
        "Keeps the ball available while moving and can name one nearby pressure or teammate",
      ],
      repeatOrAdvanceGuidance:
        "Repeat if ball security collapses under light pressure; advance when both feet are usable in small games.",
      transitionHabits: [
        "Notice when the ball is free; no formal win/loss protocol yet",
      ],
      recommendedDurationWeeks: { min: 2, default: 3, max: 4 },
      sequenceTitle: "Own the Ball sequence",
      sequenceSummary: "Baseline security and early awareness.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-ball-available",
          title: "Keep the Ball Available",
          primaryGoalIds: ["u12-control-across-surfaces"],
          lessonPackageId: "academy-package-ball-available",
        },
        {
          order: 2,
          lessonId: "u12-lesson-turn-escape",
          title: "Turn to Escape",
          primaryGoalIds: ["u12-change-speed-direction"],
          lessonPackageId: "academy-package-turn-escape",
        },
        {
          order: 3,
          lessonId: "u12-lesson-shield-purpose",
          title: "Shield with a Purpose",
          primaryGoalIds: ["u12-shield-and-retain"],
          lessonPackageId: "academy-package-shield-purpose",
        },
      ],
    }),
    block({
      id: "u12-curr-block-02-see-next-play",
      order: 2,
      title: "See the Next Play",
      objective:
        "Prepare an open body, direct first touch away from pressure, and keep forward options alive.",
      playerOutcomes: [
        "Half-turn early",
        "First touch solves pressure",
        "Play forward or retain with intention",
      ],
      corePrinciples: [
        "Prepare before the ball arrives",
        "See ball and next space",
        "Progress with advantage",
      ],
      prerequisiteBlockIds: ["u12-curr-block-01-own-the-ball"],
      primaryGoalIds: [
        "u12-receive-open-body",
        "u12-first-touch-away-pressure",
        "u12-receive-between-lines",
        "u12-scan-beyond-next-action",
      ],
      assessmentCriteria: [
        "Opens before receiving and chooses a useful next action in a small game",
      ],
      repeatOrAdvanceGuidance:
        "Repeat closed receptions; advance when open shape appears without coach prompts.",
      transitionHabits: [
        "After loss: nearest player recovers goal-side",
        "After regain: first look forward, then secure if blocked",
      ],
      recommendedDurationWeeks: { min: 3, default: 4, max: 5 },
      sequenceTitle: "See the Next Play sequence",
      sequenceSummary: "Scanning, open receiving, and purposeful first touch.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-scan-early",
          title: "Scan Before the Ball Arrives",
          primaryGoalIds: ["u12-scan-before-receiving"],
        },
        {
          order: 2,
          lessonId: "academy-lesson-receive-open-body",
          title: "See the Next Play: Receive with an Open Body",
          primaryGoalIds: ["u12-receive-open-body"],
          lessonPackageId: "academy-package-receive-open-body",
          notes: "Canonical published package — do not replace.",
        },
        {
          order: 3,
          lessonId: "u12-lesson-first-touch-away",
          title: "First Touch Away from Pressure",
          primaryGoalIds: ["u12-first-touch-away-pressure"],
        },
        {
          order: 4,
          lessonId: "u12-lesson-receive-between",
          title: "Find the Window Between Lines",
          primaryGoalIds: ["u12-receive-between-lines"],
        },
      ],
    }),
    block({
      id: "u12-curr-block-03-keep-ball-moving",
      order: 3,
      title: "Keep the Ball Moving",
      objective:
        "Connect with useful weight and create angles that keep possession alive.",
      playerOutcomes: [
        "Receive with purpose",
        "Support the player on the ball",
        "Pass and move",
        "Play away from pressure",
      ],
      corePrinciples: [
        "Weight serves the receiver",
        "Angle before distance",
        "Secure when blocked",
      ],
      prerequisiteBlockIds: ["u12-curr-block-02-see-next-play"],
      primaryGoalIds: [
        "u12-pass-weight-accuracy",
        "u12-support-angle-distance",
        "u12-wall-pass-combination",
        "u12-choose-progress-retain",
      ],
      assessmentCriteria: [
        "Pair combines under light pressure without the first passer standing still",
      ],
      repeatOrAdvanceGuidance:
        "Repeat flat support; advance when support angles appear without calling.",
      transitionHabits: [
        "Ball lost → immediate reaction",
        "Ball won → first forward look",
      ],
      recommendedDurationWeeks: { min: 3, default: 4, max: 5 },
      sequenceTitle: "Keep the Ball Moving sequence",
      sequenceSummary: "Support, weight, and progress-or-retain decisions.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-pass-useful-weight",
          title: "Pass with Useful Weight",
          primaryGoalIds: ["u12-pass-weight-accuracy"],
        },
        {
          order: 2,
          lessonId: "u12-lesson-support-angle",
          title: "Create a Support Angle",
          primaryGoalIds: ["u12-support-angle-distance"],
        },
        {
          order: 3,
          lessonId: "u12-lesson-wall-pass",
          title: "Use a Wall Pass",
          primaryGoalIds: ["u12-wall-pass-combination"],
        },
        {
          order: 4,
          lessonId: "u12-lesson-progress-or-keep",
          title: "Choose Progress or Retention",
          primaryGoalIds: ["u12-choose-progress-retain"],
        },
      ],
    }),
    block({
      id: "u12-curr-block-04-beat-and-protect",
      order: 4,
      title: "Beat and Protect",
      objective: "Engage defenders with purpose and protect the ball after beating.",
      playerOutcomes: [
        "Approach under control",
        "Exploit weight transfer",
        "Protect the exit line",
        "Choose dribble or pass",
      ],
      corePrinciples: [
        "Dribble to create advantage",
        "Protect after the first step",
        "Release when cover arrives",
      ],
      prerequisiteBlockIds: [
        "u12-curr-block-01-own-the-ball",
        "u12-curr-block-03-keep-ball-moving",
      ],
      primaryGoalIds: [
        "u12-attack-defender-front-foot",
        "u12-protect-after-beating",
        "u12-escape-double-pressure",
        "u12-choose-dribble-pass",
      ],
      assessmentCriteria: [
        "Chooses dribble vs pass based on cover, not habit",
      ],
      repeatOrAdvanceGuidance:
        "Repeat move-from-too-far; advance when exit protection is consistent.",
      transitionHabits: [
        "After beating: protect, then decide",
        "After loss in the duel: recover goal-side immediately",
      ],
      recommendedDurationWeeks: { min: 3, default: 4, max: 5 },
      sequenceTitle: "Beat and Protect sequence",
      sequenceSummary: "1v1 attacking with purposeful exit protection.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-engage-1v1",
          title: "Engage the 1v1",
          primaryGoalIds: ["u12-attack-defender-front-foot"],
        },
        {
          order: 2,
          lessonId: "u12-lesson-protect-after-beat",
          title: "Protect After Beating",
          primaryGoalIds: ["u12-protect-after-beating"],
        },
        {
          order: 3,
          lessonId: "u12-lesson-escape-two",
          title: "Escape the Second Defender",
          primaryGoalIds: ["u12-escape-double-pressure"],
        },
        {
          order: 4,
          lessonId: "u12-lesson-dribble-or-pass",
          title: "Choose Dribble or Pass",
          primaryGoalIds: ["u12-choose-dribble-pass"],
        },
      ],
    }),
    block({
      id: "u12-curr-block-05-create-finish",
      order: 5,
      title: "Create and Finish",
      objective: "Create shooting pictures and finish under realistic pressure.",
      playerOutcomes: [
        "Arrive in useful finishing zones",
        "Select surface",
        "Reload after the shot",
      ],
      corePrinciples: [
        "Create before forcing",
        "Finish with the next picture in mind",
      ],
      prerequisiteBlockIds: [
        "u12-curr-block-03-keep-ball-moving",
        "u12-curr-block-04-beat-and-protect",
      ],
      primaryGoalIds: [
        "u12-third-player-combination",
        "u12-isolate-wide-defender",
      ],
      assessmentCriteria: [
        "Chances created by decision and movement, not only gifted dribblers",
      ],
      repeatOrAdvanceGuidance:
        "Repeat selfish isolation; advance when teammates create for each other.",
      transitionHabits: [
        "Chance ends → immediate rest-defense shape",
        "Regain in final third → first action to score or cut back",
      ],
      recommendedDurationWeeks: { min: 3, default: 4, max: 5 },
      sequenceTitle: "Create and Finish sequence",
      sequenceSummary: "Chance creation and finishing under pressure.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-isolate-wide",
          title: "Isolate the Wide Defender",
          primaryGoalIds: ["u12-isolate-wide-defender"],
        },
        {
          order: 2,
          lessonId: "u12-lesson-third-player",
          title: "Release the Third Player",
          primaryGoalIds: ["u12-third-player-combination"],
        },
        {
          order: 3,
          lessonId: "u12-lesson-create-shot",
          title: "Create the Shooting Picture",
          primaryGoalIds: [],
        },
        {
          order: 4,
          lessonId: "u12-lesson-finish-under-pressure",
          title: "Finish Under Pressure",
          primaryGoalIds: [],
        },
      ],
    }),
    block({
      id: "u12-curr-block-06-defend-with-purpose",
      order: 6,
      title: "Defend with Purpose",
      objective:
        "Delay with shape, defend the ball side, and challenge at the right moment.",
      playerOutcomes: [
        "Fast approach / slow arrival",
        "Protect dangerous space",
        "Recover goal-side",
        "Win and connect",
      ],
      corePrinciples: [
        "Protect danger first",
        "Patience creates tackle moments",
        "Recover inside",
      ],
      prerequisiteBlockIds: ["u12-curr-block-04-beat-and-protect"],
      primaryGoalIds: [
        "u12-delay-and-show",
        "u12-defend-ball-side",
        "u12-time-defensive-challenge",
        "u12-recover-goal-side",
      ],
      assessmentCriteria: [
        "Delays long enough for help without diving in",
      ],
      repeatOrAdvanceGuidance:
        "Repeat diving tackles; advance when delays create team recovery.",
      transitionHabits: [
        "Win the ball → first forward look",
        "Lose the duel → recover inside the ball line",
      ],
      recommendedDurationWeeks: { min: 3, default: 4, max: 5 },
      sequenceTitle: "Defend with Purpose sequence",
      sequenceSummary: "Individual and small-group defending habits.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-delay-show",
          title: "Delay and Show",
          primaryGoalIds: ["u12-delay-and-show"],
        },
        {
          order: 2,
          lessonId: "u12-lesson-defend-ball-side",
          title: "Defend the Ball Side",
          primaryGoalIds: ["u12-defend-ball-side"],
        },
        {
          order: 3,
          lessonId: "u12-lesson-time-challenge",
          title: "Time the Challenge",
          primaryGoalIds: ["u12-time-defensive-challenge"],
        },
        {
          order: 4,
          lessonId: "u12-lesson-recover-goal-side",
          title: "Recover Goal Side",
          primaryGoalIds: ["u12-recover-goal-side"],
        },
      ],
    }),
    block({
      id: "u12-curr-block-07-first-actions",
      order: 7,
      title: "First Actions After the Ball Changes",
      objective:
        "Make win/loss first actions automatic under game speed (emphasis period).",
      playerOutcomes: [
        "Urgent purposeful first actions after turnover",
        "Balance appears behind attacks",
      ],
      corePrinciples: [
        "First three seconds matter",
        "Attack with cover",
        "Defend with connection",
      ],
      prerequisiteBlockIds: [
        "u12-curr-block-05-create-finish",
        "u12-curr-block-06-defend-with-purpose",
      ],
      primaryGoalIds: ["u12-balance-behind-ball"],
      assessmentCriteria: [
        "After a regain, nearest player secures or progresses without freezing",
      ],
      repeatOrAdvanceGuidance:
        "Repeat ball-watching after loss; advance when first actions are automatic.",
      transitionHabits: [
        "Ball lost → immediate reaction",
        "Ball won → first forward look",
        "Rest defense while attacking",
      ],
      recommendedDurationWeeks: { min: 2, default: 3, max: 4 },
      sequenceTitle: "First Actions sequence",
      sequenceSummary:
        "Emphasis period for habits already woven through earlier blocks.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-first-seconds-regain",
          title: "First Seconds After a Regain",
          primaryGoalIds: [],
        },
        {
          order: 2,
          lessonId: "u12-lesson-react-after-loss",
          title: "React After Losing the Ball",
          primaryGoalIds: [],
        },
        {
          order: 3,
          lessonId: "u12-lesson-balance-behind",
          title: "Balance Behind the Attack",
          primaryGoalIds: ["u12-balance-behind-ball"],
        },
      ],
    }),
    block({
      id: "u12-curr-block-08-stretch-connect",
      order: 8,
      title: "Stretch and Connect",
      objective: "Stretch the field and combine to play through or around.",
      playerOutcomes: [
        "Hold useful width",
        "Provide connected depth",
        "Find third-player solutions",
        "Switch when crowded",
      ],
      corePrinciples: [
        "Make the field big",
        "Depth must stay connected",
        "Combine when numbers exist",
      ],
      prerequisiteBlockIds: ["u12-curr-block-03-keep-ball-moving"],
      primaryGoalIds: [
        "u12-use-full-team-width",
        "u12-provide-penetrating-depth",
        "u12-third-player-combination",
        "u12-switch-point-attack",
      ],
      assessmentCriteria: [
        "Width opens a central lane that teammates actually use",
      ],
      repeatOrAdvanceGuidance:
        "Repeat disconnected width; advance when far-side players reconnect.",
      transitionHabits: [
        "Switch or loss of the far side → immediate compactness",
        "Regain on the weak side → first forward look",
      ],
      recommendedDurationWeeks: { min: 3, default: 4, max: 5 },
      sequenceTitle: "Stretch and Connect sequence",
      sequenceSummary: "Width, depth, and combinations.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-make-field-big",
          title: "Make the Field Big",
          primaryGoalIds: ["u12-use-full-team-width"],
        },
        {
          order: 2,
          lessonId: "u12-lesson-penetrating-depth",
          title: "Provide Penetrating Depth",
          primaryGoalIds: ["u12-provide-penetrating-depth"],
        },
        {
          order: 3,
          lessonId: "u12-lesson-combine-through",
          title: "Combine Through Numbers",
          primaryGoalIds: ["u12-third-player-combination"],
        },
        {
          order: 4,
          lessonId: "u12-lesson-switch-point",
          title: "Switch the Point of Attack",
          primaryGoalIds: ["u12-switch-point-attack"],
        },
      ],
    }),
    block({
      id: "u12-curr-block-09-solve-press",
      order: 9,
      title: "Solve the Press",
      objective:
        "Solve compact pressure with scanning, open receiving, and secure circulation.",
      playerOutcomes: [
        "Recognize traps",
        "Escape or combine early",
        "Switch when crowded",
      ],
      corePrinciples: [
        "See the second defender",
        "Circulate before forcing",
        "Progress when advantage appears",
      ],
      prerequisiteBlockIds: [
        "u12-curr-block-02-see-next-play",
        "u12-curr-block-03-keep-ball-moving",
        "u12-curr-block-07-first-actions",
        "u12-curr-block-08-stretch-connect",
      ],
      primaryGoalIds: [
        "u12-escape-double-pressure",
        "u12-receive-between-lines",
        "u12-recognize-overload-isolation",
        "u12-switch-point-attack",
      ],
      assessmentCriteria: [
        "Under a high press, finds a free player without panic clearances",
      ],
      repeatOrAdvanceGuidance:
        "Repeat forced long balls; advance when secure first passes appear.",
      transitionHabits: [
        "Forced turnover under press → counter-press or recover shape together",
      ],
      recommendedDurationWeeks: { min: 2, default: 3, max: 4 },
      sequenceTitle: "Solve the Press sequence",
      sequenceSummary: "Integrated prior skills under compact pressure.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-recognize-trap",
          title: "Recognize the Trap",
          primaryGoalIds: ["u12-escape-double-pressure"],
        },
        {
          order: 2,
          lessonId: "u12-lesson-secure-then-go",
          title: "Secure First, Then Go",
          primaryGoalIds: ["u12-choose-progress-retain"],
        },
        {
          order: 3,
          lessonId: "u12-lesson-open-body-under-press",
          title: "Open Body Under the Press",
          primaryGoalIds: [
            "u12-receive-open-body",
            "u12-receive-between-lines",
          ],
          notes: "Spiral revisit of the published open-body package.",
        },
      ],
    }),
    block({
      id: "u12-curr-block-10-read-talk",
      order: 10,
      title: "Read and Talk the Game",
      objective:
        "Name pictures, communicate useful information, and transfer training to matches.",
      playerOutcomes: [
        "Give simple information",
        "Reflect on decisions",
        "Link match moments to training goals",
      ],
      corePrinciples: [
        "Language is short and useful",
        "Reflection is specific",
      ],
      prerequisiteBlockIds: ["u12-curr-block-09-solve-press"],
      primaryGoalIds: [],
      assessmentCriteria: [
        "Explains one successful and one failed decision without blaming teammates",
      ],
      repeatOrAdvanceGuidance:
        "Repeat vague language; advance when cues are actionable.",
      transitionHabits: [
        "Language cues for win/loss become automatic",
      ],
      recommendedDurationWeeks: { min: 2, default: 3, max: 4 },
      sequenceTitle: "Read and Talk the Game sequence",
      sequenceSummary: "Communication, reflection, and transfer.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-overload-or-isolate",
          title: "Overload or Isolate",
          primaryGoalIds: ["u12-recognize-overload-isolation"],
        },
        {
          order: 2,
          lessonId: "u12-lesson-useful-communication",
          title: "Say Something Useful",
          primaryGoalIds: [],
        },
        {
          order: 3,
          lessonId: "u12-lesson-match-to-training",
          title: "From Match to Next Training",
          primaryGoalIds: [],
        },
      ],
    }),
    block({
      id: "u12-curr-block-11-play-the-game",
      order: 11,
      title: "Play the Game",
      objective:
        "Bring the year together: recognize the moment, choose, adapt, and solve problems.",
      playerOutcomes: [
        "Recognize the moment",
        "Choose the right action",
        "Adapt when the picture changes",
        "Solve problems with teammates",
      ],
      corePrinciples: [
        "Assessment informs coaching, not talent labels",
        "Games over topic silos",
      ],
      prerequisiteBlockIds: [
        "u12-curr-block-01-own-the-ball",
        "u12-curr-block-10-read-talk",
      ],
      primaryGoalIds: [],
      assessmentCriteria: [
        "Pathway checklist is honest; next-step goals are clear",
      ],
      repeatOrAdvanceGuidance:
        "Stay until the checklist is honest; do not invent Block 12 content.",
      transitionHabits: [
        "Full-game win/loss habits under match-like constraints",
      ],
      recommendedDurationWeeks: { min: 3, default: 4, max: 5 },
      sequenceTitle: "Play the Game sequence",
      sequenceSummary:
        "Integrated recognition, choice, adaptation, and problem-solving.",
      slots: [
        {
          order: 1,
          lessonId: "u12-lesson-reinforce-receive-scan",
          title: "Recognize: Receive and Scan",
          primaryGoalIds: [],
        },
        {
          order: 2,
          lessonId: "u12-lesson-reinforce-support-defend",
          title: "Choose: Support and Defend",
          primaryGoalIds: [],
        },
        {
          order: 3,
          lessonId: "u12-lesson-pathway-games",
          title: "Adapt: Pathway Games",
          primaryGoalIds: [],
        },
        {
          order: 4,
          lessonId: "u12-lesson-pathway-review",
          title: "Solve: Pathway Review and Next Steps",
          primaryGoalIds: [],
        },
      ],
    }),
  ],
  conceptSpirals: [
    {
      conceptId: "scanning",
      label: "Scanning",
      introduceLessonId: "u12-lesson-scan-early",
      practiceLessonId: "u12-lesson-receive-between",
      applyLessonId: "u12-lesson-progress-or-keep",
      masterLessonId: "u12-lesson-open-body-under-press",
    },
    {
      conceptId: "receiving-open-body",
      label: "Receiving (open body)",
      introduceLessonId: "academy-lesson-receive-open-body",
      practiceLessonId: "u12-lesson-first-touch-away",
      applyLessonId: "u12-lesson-receive-between",
      masterLessonId: "u12-lesson-open-body-under-press",
    },
    {
      conceptId: "support",
      label: "Support",
      introduceLessonId: "u12-lesson-support-angle",
      practiceLessonId: "u12-lesson-wall-pass",
      applyLessonId: "u12-lesson-isolate-wide",
      masterLessonId: "u12-lesson-reinforce-support-defend",
    },
    {
      conceptId: "progress-vs-retain",
      label: "Progress vs retain",
      introduceLessonId: "u12-lesson-progress-or-keep",
      practiceLessonId: "u12-lesson-dribble-or-pass",
      applyLessonId: "u12-lesson-secure-then-go",
      masterLessonId: "u12-lesson-overload-or-isolate",
    },
    {
      conceptId: "protect-the-ball",
      label: "Protect the ball",
      introduceLessonId: "u12-lesson-shield-purpose",
      practiceLessonId: "u12-lesson-protect-after-beat",
      applyLessonId: "u12-lesson-escape-two",
      masterLessonId: "u12-lesson-reinforce-support-defend",
    },
    {
      conceptId: "defending",
      label: "Defending (delay / ball side)",
      introduceLessonId: "u12-lesson-delay-show",
      practiceLessonId: "u12-lesson-defend-ball-side",
      applyLessonId: "u12-lesson-recover-goal-side",
      masterLessonId: "u12-lesson-reinforce-support-defend",
    },
    {
      conceptId: "transition-first-actions",
      label: "Transition first actions",
      introduceLessonId: "u12-lesson-turn-escape",
      practiceLessonId: "u12-lesson-dribble-or-pass",
      applyLessonId: "u12-lesson-first-seconds-regain",
      masterLessonId: "u12-lesson-pathway-games",
    },
    {
      conceptId: "width-switch",
      label: "Width / switch",
      introduceLessonId: "u12-lesson-make-field-big",
      practiceLessonId: "u12-lesson-penetrating-depth",
      applyLessonId: "u12-lesson-switch-point",
      masterLessonId: "u12-lesson-overload-or-isolate",
    },
    {
      conceptId: "combinations",
      label: "Combinations",
      introduceLessonId: "u12-lesson-wall-pass",
      practiceLessonId: "u12-lesson-third-player",
      applyLessonId: "u12-lesson-combine-through",
      masterLessonId: "u12-lesson-pathway-games",
    },
  ],
  editorial: EDITORIAL,
};

export function createClubCurriculumCopy(input: {
  clubId: string;
  source: AcademyCurriculum;
  id: string;
  title?: string;
}): AcademyCurriculum {
  return {
    ...input.source,
    id: input.id,
    title: input.title ?? `${input.source.title} (${input.clubId})`,
    ownership: {
      kind: "club",
      clubId: input.clubId,
      sourceCurriculumId: input.source.id,
      sourceVersion: input.source.version,
    },
    editorial: {
      ...input.source.editorial,
      status: "draft",
      editorialNotes: [
        ...(input.source.editorial.editorialNotes ?? []),
        `Club copy of ${input.source.id}@v${input.source.version}`,
      ],
    },
  };
}
