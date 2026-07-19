import type { Timestamp } from "firebase/firestore";
import type { TacticsBoardObject } from "@/lib/tactics-boards";

export type AcademyDevelopmentStage =
  | "discovery"
  | "foundation"
  | "skill_acquisition"
  | "game_training"
  | "performance";

export type PlayingFormat =
  | "individual"
  | "small_group"
  | "4v4"
  | "5v5"
  | "7v7"
  | "9v9"
  | "11v11";

export type AcademyGoalType =
  | "technical"
  | "tactical"
  | "physical"
  | "psychological"
  | "social"
  | "goalkeeping";

export type AcademyPreset = {
  id: string;
  version: number;
  title: string;
  shortDescription: string;
  ageBand: { minAge: number; maxAge: number; labels: string[] };
  developmentStage: AcademyDevelopmentStage;
  defaultPlayingFormat: PlayingFormat;
  philosophy: {
    summary: string;
    playerExperiencePrinciples: string[];
    coachingPrinciples: string[];
    gamePrinciples: string[];
  };
  defaults: {
    seasonWeeks: number;
    practicesPerWeek: number;
    practiceMinutes: number;
    typicalPlayerCount?: number;
    goalkeeperCount?: number;
  };
  annualGoals: AcademyGoal[];
  seasonBlocks: AcademyBlock[];
  editorial: AcademyEditorialMetadata;
};

export type AcademyGoal = {
  id: string;
  title: string;
  description: string;
  type: AcademyGoalType;
  ageBands: string[];
  formats: PlayingFormat[];
  principles: string[];
  coachCues: string[];
  observableIndicators: string[];
  prerequisiteGoalIds?: string[];
  relatedGoalIds?: string[];
  sourceProvenance: SourceInfluence[];
  editorial: AcademyEditorialMetadata;
};

export type AcademyBlock = {
  id: string;
  title: string;
  weekStart: number;
  weekEnd: number;
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  learningOutcomes: string[];
  recommendedDrillIds: string[];
  recommendedTacticalLessonIds: string[];
  recommendedQuizIds: string[];
  recommendedAssignmentIds: string[];
  weekTemplates: AcademyWeekTemplate[];
  successIndicators: string[];
};

export type AcademyWeekTemplate = {
  id: string;
  weekNumber: number;
  title: string;
  theme: string;
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  practiceTemplates: AcademyPracticeTemplate[];
  tacticalLessonIds?: string[];
  quizIds?: string[];
  assignmentIds?: string[];
};

export type PracticeActivityRole =
  | "arrival"
  | "warm_up"
  | "technical"
  | "opposed"
  | "positioning_game"
  | "directional_game"
  | "game_training"
  | "small_sided_game"
  | "training_game"
  | "review";

export type AcademyPracticeTemplate = {
  id: string;
  title: string;
  summary: string;
  ageBands: string[];
  formats: PlayingFormat[];
  durationMinutes: number;
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  activities: PracticeActivitySlot[];
  coachIntroduction: string[];
  reviewQuestions: string[];
  requiredEquipment: string[];
  editorial: AcademyEditorialMetadata;
};

export type PracticeActivitySlot = {
  id: string;
  order: number;
  role: PracticeActivityRole;
  plannedMinutes: number;
  drillId?: string;
  tacticalLessonId?: string;
  objective: string;
  transitionInstructions?: string;
  optionalAlternatives?: Array<{ drillId: string; reason: string }>;
};

export type AcademyDrillStepPhase =
  | "setup"
  | "start"
  | "action"
  | "decision"
  | "transition"
  | "rotation"
  | "reset";

export type AcademyDrillStep = {
  id: string;
  order: number;
  phase: AcademyDrillStepPhase;
  title: string;
  explanation: string;
  coachCue?: string;
  playerAction?: string;
  ballAction?: string;
  coachingPurpose?: string;
  durationMs?: number;
  objects: TacticsBoardObject[];
};

export type AcademyDrill = {
  id: string;
  version: number;
  title: string;
  shortDescription: string;
  ageBands: string[];
  difficulty: "foundation" | "developing" | "advanced";
  formats: PlayingFormat[];
  activityRole: PracticeActivityRole;
  activityType:
    | "ball_mastery"
    | "unopposed_technical"
    | "opposed_technical"
    | "rondo"
    | "positional_game"
    | "directional_game"
    | "small_sided_game"
    | "finishing"
    | "transition_game"
    | "goalkeeping"
    | "tactical_walkthrough";
  playerCount: { min: number; ideal?: number; max: number };
  goalkeeperCount?: { min: number; ideal?: number; max: number };
  durationMinutes: { min: number; default: number; max: number };
  field: {
    length?: number;
    width?: number;
    unit: "yards" | "meters";
    guidance?: string;
  };
  equipment: string[];
  goalIds: string[];
  objectives: string[];
  setupInstructions: string[];
  howItWorks: string[];
  resetInstructions: string[];
  coachingPoints: string[];
  commonMistakes: Array<{ mistake: string; correction: string }>;
  progressions: Array<{ title: string; description: string }>;
  regressions: Array<{ title: string; description: string }>;
  steps: AcademyDrillStep[];
  sourceProvenance: SourceInfluence[];
  editorial: AcademyEditorialMetadata;
  safetyReview: AcademySafetyReview;
  searchTags: string[];
};

export type AcademyTacticalLesson = {
  id: string;
  version: number;
  title: string;
  summary: string;
  ageBands: string[];
  formats: PlayingFormat[];
  goalIds: string[];
  estimatedMinutes: number;
  introduction: string[];
  steps: AcademyDrillStep[];
  coachQuestions: string[];
  playerQuestions: string[];
  relatedDrillIds: string[];
  sourceProvenance: SourceInfluence[];
  editorial: AcademyEditorialMetadata;
};

export type AcademySourceDocument = {
  id: string;
  filename: string;
  title: string;
  author?: string;
  publisher?: string;
  year?: number;
  sourceType: "pdf" | "book" | "curriculum" | "manual" | "internal";
  licenseStatus:
    | "unknown"
    | "private_reference_only"
    | "licensed"
    | "public_domain"
    | "permission_granted";
  usageRestrictions: string[];
  importedAt: string;
};

export type AcademySourceItem = {
  id: string;
  sourceDocumentId: string;
  sourcePageStart?: number;
  sourcePageEnd?: number;
  sourceTitle: string;
  contentType:
    | "development_principle"
    | "session_methodology"
    | "drill"
    | "tactical_concept"
    | "season_structure"
    | "age_guidance"
    | "coaching_guidance";
  internalSummary: string;
  ageTags: string[];
  skillTags: string[];
  tacticalTags: string[];
  playerCountMin?: number;
  playerCountMax?: number;
  durationMinutes?: number;
  equipmentMentions?: string[];
  editorialStatus: "unprocessed" | "extracted" | "reviewed" | "rejected";
  publicationEligibility:
    | "reference_only"
    | "requires_original_rewrite"
    | "licensed_for_use";
};

export type SourceInfluence = {
  sourceDocumentId: string;
  sourceItemId?: string;
  relationship:
    | "general_reference"
    | "concept_inspiration"
    | "methodology_reference"
    | "licensed_adaptation";
};

export type AcademyEditorialStatus =
  | "draft"
  | "needs_animation"
  | "needs_coach_review"
  | "approved"
  | "archived"
  | "rejected";

export type AcademyEditorialMetadata = {
  status: AcademyEditorialStatus;
  originalWording: boolean;
  originalDiagram: boolean;
  generatedWithAssistance?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  warnings?: string[];
};

export type AcademySafetyReview = {
  status: "not_reviewed" | "safe" | "modify" | "do_not_publish";
  concerns: string[];
  recommendedChanges: string[];
};

export type AcademyPlayerAssignment = {
  id: string;
  teamId: string;
  playerId?: string;
  title: string;
  description: string;
  goalIds: string[];
  assignmentType:
    | "watch_lesson"
    | "watch_clip"
    | "complete_quiz"
    | "practice_skill"
    | "reflection";
  linkedLessonId?: string;
  linkedDrillId?: string;
  linkedGameId?: string;
  linkedClipIds?: string[];
  linkedQuizId?: string;
  dueAt?: Timestamp;
  status: "assigned" | "in_progress" | "completed" | "reviewed";
  assignedBy: string;
  assignedAt: Timestamp;
};

export type AcademyAssignmentTemplate = {
  id: string;
  version: number;
  title: string;
  description: string;
  assignmentType: AcademyPlayerAssignment["assignmentType"];
  ageBands: string[];
  goalIds: string[];
  linkedLessonId?: string;
  linkedDrillId?: string;
  linkedQuizId?: string;
  instructions: string[];
  sourceProvenance: SourceInfluence[];
  editorial: AcademyEditorialMetadata;
};

export type AcademyQuizQuestionType =
  | "multiple_choice"
  | "true_false"
  | "position_selection"
  | "sequence"
  | "reflection";

export type AcademyQuizQuestion = {
  id: string;
  questionType: AcademyQuizQuestionType;
  prompt: string;
  ageBands: string[];
  goalIds: string[];
  options?: Array<{ id: string; label: string }>;
  correctOptionIds?: string[];
  boardState?: {
    objects: TacticsBoardObject[];
    selectableZones?: Array<{
      id: string;
      label: string;
      points: Array<{ x: number; y: number }>;
    }>;
  };
  explanation?: string;
  editorial: AcademyEditorialMetadata;
};

export type AcademyQuiz = {
  id: string;
  version: number;
  title: string;
  description: string;
  ageBands: string[];
  goalIds: string[];
  questionIds: string[];
  editorial: AcademyEditorialMetadata;
};

export type AcademyFilmReference = {
  gameId: string;
  sourceId?: string;
  clipOrMomentId?: string;
  highlightId?: string;
  gameTimeMs?: number;
};

export type AcademyGoalEvidence = {
  id: string;
  teamId: string;
  playerId?: string;
  goalId: string;
  evidenceType:
    | "lesson_completion"
    | "quiz_result"
    | "coach_observation"
    | "player_reflection"
    | "film_clip"
    | "highlight"
    | "practice_attendance";
  referenceId?: string;
  filmReference?: AcademyFilmReference;
  note?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  createdBy: string;
  createdAt: Timestamp;
};

export type TeamAcademyPlan = {
  id: string;
  teamId: string;
  academyPresetId: string;
  academyPresetVersion: number;
  title: string;
  ageBand: string;
  playingFormat: PlayingFormat;
  seasonStartDate?: string;
  seasonEndDate?: string;
  practicesPerWeek: number;
  practiceMinutes: number;
  playerCount: number;
  goalkeeperCount: number;
  priorityGoalIds: string[];
  status: "draft" | "active" | "completed" | "archived";
  createdBy: string;
  createdAt: Timestamp;
  updatedBy: string;
  updatedAt: Timestamp;
};

export type PracticeGenerationRequest = {
  academyPresetId: string;
  ageBand: string;
  durationMinutes: 45 | 60 | 75 | 90;
  playerCount: number;
  goalkeeperCount: number;
  primaryGoalIds: string[];
  supportingGoalIds?: string[];
  availableEquipment?: string[];
  fieldSize?: {
    length?: number;
    width?: number;
    unit: "yards" | "meters";
  };
  completedDrillIds?: string[];
  recentGoalIds?: string[];
  competitionProximity?:
    | "none"
    | "day_before"
    | "two_days_before"
    | "day_after";
};

export type GeneratedPracticePlan = {
  title: string;
  summary: string;
  totalMinutes: number;
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  activities: PracticeActivitySlot[];
  introduction: string[];
  reviewQuestions: string[];
  validationWarnings: string[];
};

export type PlanningScope =
  | "practice"
  | "week"
  | "month"
  | "season"
  | "year";

export type AcademyPlanningRequest = {
  scope: PlanningScope;
  academyPresetId: string;
  ageBand: string;
  playingFormat: PlayingFormat;
  primaryGoalIds: string[];
  supportingGoalIds?: string[];
  practiceMinutes: 45 | 60 | 75 | 90;
  practicesPerWeek: 1 | 2 | 3;
  playerCount: number;
  goalkeeperCount: number;
  seasonWeeks?: number;
  seasonStartDate?: string;
  availableEquipment?: string[];
  completedDrillIds?: string[];
  recentGoalIds?: string[];
};

export type AcademyPlanOutlineNode = {
  id: string;
  scope: Exclude<PlanningScope, "year">;
  title: string;
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  weekStart?: number;
  weekEnd?: number;
  practiceTemplateIds?: string[];
  children?: AcademyPlanOutlineNode[];
};

export type GeneratedAcademyPlanOutline = {
  scope: PlanningScope;
  academyPresetId: string;
  title: string;
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  nodes: AcademyPlanOutlineNode[];
  validationWarnings: string[];
};

export type AcademyContentGraph = {
  goalIds: string[];
  prerequisiteGoalIdsByGoalId: Record<string, string[]>;
  relatedGoalIdsByGoalId: Record<string, string[]>;
  lessonIdsByGoalId: Record<string, string[]>;
  drillIdsByGoalId: Record<string, string[]>;
  practiceIdsByGoalId: Record<string, string[]>;
  assignmentIdsByGoalId: Record<string, string[]>;
  quizIdsByGoalId: Record<string, string[]>;
};
