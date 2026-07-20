import publishedCatalogJson from "@/data/academy/catalog-published/catalog.json";
import { CANONICAL_SEED_ACTIVITY_CATALOG } from "@/lib/academy/drill-catalog";
import type {
  AcademyActivity,
  AcademyDrillMetadata,
  AcademyPracticeSectionKind,
  PracticeActivityRole,
  PublishedAcademyCatalog,
} from "@/lib/academy/types";

export const PUBLISHED_ACADEMY_CATALOG =
  publishedCatalogJson as PublishedAcademyCatalog;

function sectionsForRole(
  role: PracticeActivityRole,
): AcademyPracticeSectionKind[] {
  switch (role) {
    case "arrival":
    case "warm_up":
      return ["warm_up"];
    case "technical":
      return ["technical"];
    case "opposed":
    case "positioning_game":
      return ["small_group", "conditioned_game"];
    case "directional_game":
    case "game_training":
      return ["conditioned_game", "scrimmage"];
    case "small_sided_game":
    case "training_game":
      return ["scrimmage"];
    case "review":
      return ["reflection"];
  }
}

function toRuntimeMetadata(activity: AcademyActivity): AcademyDrillMetadata {
  return {
    id: activity.id,
    canonicalObjectId: activity.id,
    title: activity.title,
    developmentGoalIds: [...activity.goalIds],
    ageRange: { ...activity.ageRange },
    difficulty: activity.difficulty,
    equipment: [...activity.equipment],
    players: {
      minimumRoster: activity.playerCount.min,
      groupSize: activity.playerCount.ideal ?? activity.playerCount.min,
      goalkeeperCount: activity.goalkeeperCount?.min ?? 0,
    },
    minimumFieldSize: {
      length: activity.field.length ?? 0,
      width: activity.field.width ?? 0,
      unit: activity.field.unit,
    },
    durationMinutes: activity.durationMinutes.default,
    setupInstructions: [...activity.setupInstructions],
    coachingCues: [...activity.coachingPoints],
    commonErrors: activity.commonMistakes.map((mistake) => ({
      error: mistake.mistake,
      correction: mistake.correction,
    })),
    progressions: [...activity.progressions],
    regressions: [...activity.regressions],
    suitableSections: sectionsForRole(activity.activityRole),
    editorialStatus: "reviewed",
  };
}

export const PUBLISHED_ACADEMY_ACTIVITY_CATALOG: readonly AcademyDrillMetadata[] =
  PUBLISHED_ACADEMY_CATALOG.objects
    .filter((object) =>
      [
        "activity",
        "drill",
        "warmup",
        "small_sided_game",
        "conditioned_game",
      ].includes(object.objectType),
    )
    .map((object) => toRuntimeMetadata(object.payload as AcademyActivity));

/**
 * Runtime generation sees canonical published activities first, followed by
 * the original Film Room seed bindings. Source indexes and PDFs are never read.
 */
export const ACADEMY_RUNTIME_DRILL_CATALOG: readonly AcademyDrillMetadata[] = [
  ...new Map(
    [
      ...CANONICAL_SEED_ACTIVITY_CATALOG,
      ...PUBLISHED_ACADEMY_ACTIVITY_CATALOG,
    ].map((drill) => [drill.id, drill]),
  ).values(),
];

