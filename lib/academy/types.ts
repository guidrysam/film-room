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

export type AcademyGoalDomainId =
  | "ball-mastery"
  | "receiving-first-touch"
  | "passing-combination-play"
  | "scanning-decision-making"
  | "support-width-depth"
  | "one-v-one-attacking"
  | "one-v-one-defending"
  | "building-from-goalkeeper"
  | "creating-finishing-chances"
  | "team-defending"
  | "transition-to-attack"
  | "transition-to-defense"
  | "goalkeeping"
  | "communication-leadership"
  | "reflection-game-understanding";

export type AcademyPositionGroup =
  | "all"
  | "goalkeeper"
  | "defender"
  | "outside_defender"
  | "central_defender"
  | "midfielder"
  | "wide_player"
  | "forward";

export type AcademyGoalSuitability =
  | "team"
  | "position_group"
  | "individual";

export type AcademyGoalDomain = {
  id: AcademyGoalDomainId;
  title: string;
  description: string;
  order: number;
};

export type AcademySeasonBlockDefinition = {
  id: string;
  title: string;
  weekStart: number;
  weekEnd: number;
  description: string;
};

export type AcademyGameEvidenceEventType =
  | "goal"
  | "shot"
  | "corner"
  | "turnover"
  | "recovery"
  | "pass"
  | "receive"
  | "duel"
  | "transition"
  | "buildup"
  | "defensive_action"
  | "coach_clip";

export type AcademyGameEvidenceTag = {
  id: string;
  label: string;
  description: string;
  category: "positive" | "improvement" | "neutral_context";
  applicableGoalIds: string[];
  applicableEventTypes: AcademyGameEvidenceEventType[];
};

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
  domainId: AcademyGoalDomainId;
  type: AcademyGoalType;
  ageBands: string[];
  formats: PlayingFormat[];
  principles: string[];
  coachCues: string[];
  observableIndicators: string[];
  commonFailurePatterns: Array<{
    title: string;
    description: string;
  }>;
  coachFeedbackExamples: string[];
  gameEvidenceTags: string[];
  prerequisiteGoalIds: string[];
  relatedGoalIds: string[];
  recommendedLessonCount: number;
  recommendedDrillCount: number;
  suitableFor: AcademyGoalSuitability | AcademyGoalSuitability[];
  positionRelevance: Array<{
    positionGroup: AcademyPositionGroup;
    relevance: "primary" | "secondary";
    note?: string;
  }>;
  individualLearningSupport: {
    homePractice: boolean;
    partnerPractice: boolean;
    filmStudy: boolean;
    quiz: boolean;
    reflection: boolean;
  };
  recommendedResourceTopics: string[];
  seasonalPlacement: Array<{
    blockId: string;
    role: "primary" | "supporting" | "reinforcement";
  }>;
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

export type AcademyActivityCategory =
  | "warmup"
  | "technical"
  | "possession"
  | "small_sided_game"
  | "finishing"
  | "defending"
  | "transition"
  | "goalkeeper"
  | "conditioned_game";

export type AcademyActivityType =
  | "warmup"
  | "ball_mastery"
  | "technical_exercise"
  | "unopposed_technical"
  | "opposed_technical"
  | "rondo"
  | "possession_game"
  | "positional_game"
  | "directional_game"
  | "conditioned_game"
  | "small_sided_game"
  | "finishing"
  | "transition_game"
  | "goalkeeping"
  | "conditioning"
  | "team_building"
  | "tactical_walkthrough";

export type AcademyActivity = {
  id: string;
  version: number;
  title: string;
  summary: string;
  description: string;
  category: AcademyActivityCategory;
  activityType: AcademyActivityType;
  ageBands: string[];
  ageRange: { min: number; max: number };
  difficulty: "foundation" | "developing" | "advanced";
  formats: PlayingFormat[];
  activityRole: PracticeActivityRole;
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
  relatedActivityIds: string[];
  relatedLessonIds: string[];
  relatedPracticeTemplateIds: string[];
  relatedAssignmentIds: string[];
  relatedQuizIds: string[];
  evidenceTagIds: string[];
  objectives: string[];
  setupInstructions: string[];
  organization: string[];
  howItWorks: string[];
  resetInstructions: string[];
  coachingPoints: string[];
  commonMistakes: Array<{ mistake: string; correction: string }>;
  progressions: Array<{ title: string; description: string }>;
  regressions: Array<{ title: string; description: string }>;
  steps: AcademyDrillStep[];
  sourceProvenance: SourceInfluence[];
  editorial: AcademyEditorialMetadata;
  safetyNotes: string[];
  safetyReview: AcademySafetyReview;
  searchTags: string[];
};

/** @deprecated Use AcademyActivity for canonical library content. */
export type AcademyDrill = AcademyActivity;

export type AcademyTacticalLesson = {
  id: string;
  version: number;
  title: string;
  summary: string;
  ageBands: string[];
  formats: PlayingFormat[];
  difficulty: "foundation" | "developing" | "advanced";
  goalIds: string[];
  relatedGoalIds: string[];
  estimatedMinutes: number;
  learningObjective: string;
  successCriteria: string[];
  coachingPoints: string[];
  commonErrors: Array<{
    title: string;
    description: string;
    correction: string;
  }>;
  observableEvidence: string[];
  progression: string;
  introduction: string[];
  steps: AcademyDrillStep[];
  coachQuestions: string[];
  playerQuestions: string[];
  activityIds: string[];
  relatedAssignmentIds: string[];
  relatedQuizIds: string[];
  evidenceTagIds: string[];
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

export type AcademyCanonicalObjectType =
  | "development_goal"
  | "lesson"
  | "activity"
  | "drill"
  | "warmup"
  | "small_sided_game"
  | "conditioned_game"
  | "practice"
  | "seasonal_program"
  | "curriculum"
  | "coaching_cue"
  | "common_error"
  | "progression"
  | "regression"
  | "assignment"
  | "quiz"
  | "quiz_question"
  | "lesson_package";

export type AcademyCanonicalLifecycle =
  | "draft"
  | "needs_review"
  | "approved"
  | "published"
  | "archived"
  | "rejected";

/** Coach/editor-facing workflow states used by Phase 3C CLI transitions. */
export type AcademyWorkflowStatus =
  | "draft"
  | "needs_coach_review"
  | "approved"
  | "published"
  | "rejected";

export type AcademyEditorialAuditEntry = {
  id: string;
  objectId: string;
  objectType: AcademyCanonicalObjectType;
  previousStatus: AcademyWorkflowStatus;
  newStatus: AcademyWorkflowStatus;
  actor: string;
  timestamp: string;
  reason?: string;
  note?: string;
  objectVersion: number;
};

export type AcademyKnowledgeCandidate = {
  id: string;
  suggestedObjectTypes: AcademyCanonicalObjectType[];
  workingTitle: string;
  normalizedTitle: string;
  identityFingerprint: string;
  sourceProvenance: SourceInfluence[];
  extractedSignals: {
    ageTags: string[];
    skillTags: string[];
    tacticalTags: string[];
    playerCountMin?: number;
    playerCountMax?: number;
    durationMinutes?: number;
    equipment: string[];
  };
  status: "extracted" | "clustered" | "drafted" | "rejected";
  potentialDuplicateCandidateIds: string[];
  confidence: "low" | "medium" | "high";
};

export type AcademyDeduplicationReview = {
  identityFingerprint: string;
  decision: "needs_review" | "unique" | "merge_into";
  mergeTargetId?: string;
  comparedCanonicalIds: string[];
  confidence: number;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string[];
};

export type AcademyCanonicalVersionEntry = {
  version: number;
  changedAt: string;
  changedBy: string;
  summary: string;
};

/**
 * Editorial envelope around any canonical Academy payload. Source provenance
 * and editorial notes are private and are removed by the publication step.
 */
export type AcademyCanonicalRecord = {
  id: string;
  objectType: AcademyCanonicalObjectType;
  version: number;
  title: string;
  lifecycle: AcademyCanonicalLifecycle;
  payload: unknown;
  sourceProvenance: SourceInfluence[];
  sourceCandidateIds: string[];
  editorialNotes: string[];
  originality: {
    originalWording: boolean;
    originalDiagram: boolean;
    attestedBy?: string;
    attestedAt?: string;
  };
  deduplication: AcademyDeduplicationReview;
  versionHistory: AcademyCanonicalVersionEntry[];
  createdAt?: string;
  updatedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  publishedBy?: string;
  publishedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
};

export type PublishedAcademyObject = {
  id: string;
  objectType: AcademyCanonicalObjectType;
  version: number;
  title: string;
  identityFingerprint: string;
  payload: unknown;
};

export type PublishedAcademyCatalog = {
  schemaVersion: 1;
  catalogId: string;
  catalogVersion: number;
  objects: PublishedAcademyObject[];
};

export type AcademyEditorialStatus =
  | "draft"
  | "needs_animation"
  | "needs_revision"
  | "needs_coach_review"
  | "approved"
  | "published"
  | "archived"
  | "rejected";

export type AcademyEditorialMetadata = {
  status: AcademyEditorialStatus;
  originalWording: boolean;
  originalDiagram: boolean;
  generatedWithAssistance?: boolean;
  createdAt?: string;
  updatedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  publishedBy?: string;
  publishedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  editorialNotes?: string[];
  warnings?: string[];
};

export type AcademyLessonPackageCurriculumPlacement = {
  curriculumId: string;
  trainingBlockId: string;
  learningSequenceId: string;
  sequenceSlotOrder: number;
};

export type AcademyLessonPackagePracticePlan = {
  defaultMinutes: number;
  shortMinutes: number;
  sections: Array<{
    order: number;
    role: PracticeActivityRole;
    activityId: string;
    plannedMinutes: number;
    shortMinutes: number;
    objective: string;
  }>;
  reflectionQuestions: string[];
};

export type AcademyLessonPackageManifest = {
  id: string;
  version: number;
  title: string;
  summary: string;
  primaryGoalId: string;
  memberIds: string[];
  lessonId: string;
  activityIds: string[];
  assignmentId: string;
  quizId: string;
  questionIds: string[];
  /** Optional pathway placement for curriculum-shell validation. */
  curriculumPlacement?: AcademyLessonPackageCurriculumPlacement;
  priorLessonIds?: string[];
  nextLessonIds?: string[];
  practicePlan?: AcademyLessonPackagePracticePlan;
  editorial: AcademyEditorialMetadata;
};

/**
 * Annual / pathway curriculum shell. Distinct from `AcademyPreset`
 * (`seasonal_program`), which places goals into older week-templated blocks.
 *
 * Hierarchy: Curriculum → Training Block → Learning Sequence → Lesson Package.
 * Calendar slots are optional so clubs can map sequences onto 1× / 2× / 3× weeks.
 */
export type AcademyCurriculumOwnership =
  | { kind: "film_room" }
  | {
      kind: "club";
      clubId: string;
      sourceCurriculumId: string;
      sourceVersion: number;
    }
  | {
      kind: "team_adaptation";
      teamId: string;
      clubCurriculumId?: string;
      sourceCurriculumId: string;
      sourceVersion: number;
    };

export type AcademyClubIdentityEmphasis =
  | "possession"
  | "pressing"
  | "counterattack"
  | "balanced"
  | "custom";

export type AcademyLearningSequenceSlotKind =
  | "core_lesson"
  | "flexible"
  | "assessment";

export type AcademyLearningSequenceSlot = {
  order: number;
  kind: AcademyLearningSequenceSlotKind;
  title: string;
  primaryGoalIds: string[];
  /** Map lesson identity; may exist before the package is authored. */
  lessonId?: string;
  /** Resolved lesson package id when authored / published. */
  lessonPackageId?: string;
  flexibleWeekId?: string;
  notes?: string;
};

export type AcademyLearningSequence = {
  id: string;
  title: string;
  summary: string;
  order: number;
  slots: AcademyLearningSequenceSlot[];
};

export type AcademyTrainingBlock = {
  id: string;
  order: number;
  /** Capability-oriented title (what players should be able to do). */
  title: string;
  objective: string;
  playerOutcomes: string[];
  corePrinciples: string[];
  prerequisiteBlockIds: string[];
  primaryGoalIds: string[];
  assessmentCriteria: string[];
  repeatOrAdvanceGuidance: string;
  /** Win/loss habits woven into the block (not a standalone chapter). */
  transitionHabits: string[];
  learningSequences: AcademyLearningSequence[];
  recommendedDurationWeeks: { min: number; default: number; max: number };
};

export type AcademyConceptSpiral = {
  conceptId: string;
  label: string;
  introduceLessonId: string;
  practiceLessonId: string;
  applyLessonId: string;
  masterLessonId: string;
};

export type AcademyCurriculumCalendarSlot = {
  id: string;
  order: number;
  label: string;
  trainingBlockId: string;
  learningSequenceId: string;
  sequenceSlotOrder: number;
};

export type AcademyCurriculum = {
  id: string;
  version: number;
  title: string;
  shortDescription: string;
  ageBand: { minAge: number; maxAge: number; labels: string[] };
  developmentStage: AcademyDevelopmentStage;
  defaultPlayingFormat: PlayingFormat;
  ownership: AcademyCurriculumOwnership;
  philosophy: {
    summary: string;
    playerExperiencePrinciples: string[];
    coachingPrinciples: string[];
    gamePrinciples: string[];
  };
  defaults: {
    practicesPerWeek: 1 | 2 | 3;
    practiceMinutes: number;
    coreLessonCount: number;
    flexibleWeekCount: number;
    clubIdentityFlexPercent: { min: number; max: number };
  };
  clubIdentityGuidance: {
    flexPercent: { min: number; max: number };
    allowedEmphases: AcademyClubIdentityEmphasis[];
    notes: string[];
  };
  trainingBlocks: AcademyTrainingBlock[];
  conceptSpirals: AcademyConceptSpiral[];
  /** Optional week/calendar mapping over learning-sequence slots. */
  calendarSlots?: AcademyCurriculumCalendarSlot[];
  editorial: AcademyEditorialMetadata;
};

/** Team pin to a curriculum version for a season (stub for later product wiring). */
export type TeamCurriculumPin = {
  id: string;
  teamId: string;
  curriculumId: string;
  curriculumVersion: number;
  status: "draft" | "active" | "completed" | "archived";
  assignedAt: string;
  assignedBy: string;
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
  /** Estimated independent work time for the player. */
  estimatedMinutes?: number;
  completionCriteria?: string[];
  easierOption?: string;
  harderOption?: string;
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

/**
 * Points at a Film Room moment. Game clock fields use seconds to match
 * `GameTimelineEvent.t` and `HighlightMoment.gameTime`.
 */
export type AcademyFilmReference = {
  gameId: string;
  sourceId?: string;
  /** Timeline event id when the evidence was created from a mark/stat. */
  timelineEventId?: string;
  /** Highlight reel / draft id when the evidence references a highlight. */
  highlightId?: string;
  /** Highlight moment id within that highlight draft. */
  momentId?: string;
  /** Canonical game clock seconds. */
  gameTimeSec?: number;
};

/**
 * Coach-attached bridge from a film moment to one or more development goals
 * via canonical evidence tags. This is the primary teaching link; product
 * content (lessons/drills) is recommended later from the resolved goals.
 */
export type AcademyFilmEvidenceAttachment = {
  id: string;
  teamId: string;
  /** Catalog that defined the evidence tags at save time. */
  catalogId: string;
  catalogVersion: number;
  playerIds?: string[];
  personIds?: string[];
  filmReference: AcademyFilmReference;
  /** Canonical AcademyGameEvidenceTag ids. */
  evidenceTagIds: string[];
  /** Explicit goal overrides; otherwise derived from tags. */
  goalIds?: string[];
  note?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
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
  /** Optional link back to a film evidence attachment. */
  filmEvidenceAttachmentId?: string;
  evidenceTagIds?: string[];
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

export type AcademyPracticeEvidenceReference = {
  evidenceId: string;
  gameId: string;
  timelineEventId?: string;
  highlightId?: string;
  momentId?: string;
  gameTimeSec?: number;
  evidenceTagIds: string[];
};

export type AcademyPublishedPracticeDraft = {
  id: string;
  teamId: string;
  title: string;
  status: "draft";
  developmentGoalId: string;
  lessonId: string;
  publishedRelease: {
    catalogId: string;
    catalogVersion: number;
    lessonVersion: number;
  };
  activitySequence: Array<{
    activityId: string;
    activityVersion: number;
    order: number;
    durationMinutes: number;
  }>;
  estimatedTotalDurationMinutes: number;
  equipment: string[];
  coachingPoints: string[];
  supportingEvidence: AcademyPracticeEvidenceReference[];
  coachNotes: string;
  coachModifications: {
    activityDurations?: Record<string, number>;
    removedActivityIds?: string[];
  };
  createdBy: string;
  createdAt: Timestamp;
  updatedBy: string;
  updatedAt: Timestamp;
  /** Existing academyPlans rules require a stable preset/release reference. */
  academyPresetId: string;
  academyPresetVersion: number;
};

export type AcademyPublishedAssignmentRecord = {
  id: string;
  teamId: string;
  assignmentId: string;
  assignmentVersion: number;
  lessonId: string;
  developmentGoalId: string;
  audience: "players" | "team";
  assignedPlayerIds: string[];
  assignedBy: string;
  assignedAt: Timestamp;
  dueAt?: Timestamp;
  completionByPlayerId: Record<
    string,
    {
      status: "assigned" | "in_progress" | "completed" | "reviewed";
      completedAt?: Timestamp;
    }
  >;
  publishedRelease: {
    catalogId: string;
    catalogVersion: number;
  };
};

export type AcademyQuizSubmissionRecord = {
  id: string;
  teamId: string;
  quizId: string;
  quizVersion: number;
  lessonId: string;
  developmentGoalId: string;
  submittedBy: string;
  playerId?: string;
  submittedAt: Timestamp;
  score: number;
  correctCount: number;
  questionCount: number;
  status: "completed";
  /** Scores demonstrate lesson understanding, not on-field mastery. */
  interpretation: "knowledge_check_only";
  publishedRelease: {
    catalogId: string;
    catalogVersion: number;
  };
};

export type PracticeGenerationRequest = {
  academyPresetId: string;
  ageBand: string;
  durationMinutes: 45 | 60 | 75 | 90;
  playerCount: number;
  goalkeeperCount: number;
  primaryGoalIds: string[];
  supportingGoalIds?: string[];
  /** Optional film-evidence tag ids that should influence goal priority. */
  evidenceTagIds?: string[];
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

export type AcademyPracticeSectionKind =
  | "warm_up"
  | "technical"
  | "small_group"
  | "conditioned_game"
  | "scrimmage"
  | "reflection";

export type AcademyFieldSize = {
  length: number;
  width: number;
  unit: "yards" | "meters";
};

/**
 * Academy metadata layered over an existing built-in practice drill.
 * `sourcePresetId` points at the canonical tactics preset; no drill is copied.
 */
export type AcademyDrillMetadata = {
  id: string;
  canonicalObjectId: string;
  /** Present only for the original tactics-preset seed catalog. */
  sourcePresetId?: string;
  title: string;
  developmentGoalIds: string[];
  ageRange: { min: number; max: number };
  difficulty: "foundation" | "developing" | "advanced";
  equipment: string[];
  players: {
    minimumRoster: number;
    groupSize: number;
    goalkeeperCount: number;
  };
  minimumFieldSize: AcademyFieldSize;
  durationMinutes: number;
  setupInstructions: string[];
  coachingCues: string[];
  commonErrors: Array<{ error: string; correction?: string }>;
  progressions: Array<{ title: string; description: string }>;
  regressions: Array<{ title: string; description: string }>;
  suitableSections: AcademyPracticeSectionKind[];
  editorialStatus: "internal_draft" | "reviewed";
};

export type AcademyPracticeSection = {
  id: string;
  kind: AcademyPracticeSectionKind;
  title: string;
  durationMinutes: number;
  developmentGoalIds: string[];
  drillId?: string;
  sourcePresetId?: string;
  academyLessonIds: string[];
  coachingPoints: string[];
  setupInstructions: string[];
  progressions: Array<{ title: string; description: string }>;
  regressions: Array<{ title: string; description: string }>;
  reflectionPrompts?: string[];
};

export type GeneratedAcademyPractice = {
  id: string;
  title: string;
  ageBand: string;
  durationMinutes: number;
  rosterSize: number;
  fieldSize?: AcademyFieldSize;
  availableEquipment: string[];
  primaryGoalIds: string[];
  supportingGoalIds: string[];
  sections: AcademyPracticeSection[];
  recommendationWarnings: string[];
  generatedBy: "deterministic";
};

export type AcademyGamePlanGenerationRequest = {
  ageBand: string;
  selectedGoalIds: string[];
  opponentNotes?: string;
  /** Confirmed evidence tags only; these resolve to goals before planning. */
  previousGameEvidenceTagIds?: string[];
  formationName?: string;
};

export type GeneratedAcademyGamePlan = {
  id: string;
  title: string;
  ageBand: string;
  selectedGoalIds: string[];
  evidenceGoalIds: string[];
  opponentNotes?: string;
  pregameObjectives: string[];
  coachingFocus: string[];
  keyReminders: string[];
  warmUpFocus: string[];
  formationNotes?: string[];
  transitionEmphasis: string[];
  benchReminders: string[];
  halftimeDiscussionPoints: string[];
  postgameReflectionPrompts: string[];
  generatedBy: "deterministic";
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

export type AcademyGoalGraphCatalog = {
  id: string;
  version: number;
  title: string;
  ageBand: string;
  primaryFormat: PlayingFormat;
  seasonWeeks: number;
  practicesPerWeek: number;
  typicalRoster: { min: number; max: number };
  goalkeepers: { min: number; max: number };
  domains: AcademyGoalDomain[];
  blocks: AcademySeasonBlockDefinition[];
  goals: AcademyGoal[];
  evidenceTags: AcademyGameEvidenceTag[];
};
