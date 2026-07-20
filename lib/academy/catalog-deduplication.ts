import type {
  AcademyCanonicalObjectType,
  AcademyKnowledgeCandidate,
} from "@/lib/academy/types";

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "advanced",
  "basic",
  "beginner",
  "for",
  "of",
  "the",
  "to",
  "variation",
  "version",
]);

const ID_PREFIX: Record<AcademyCanonicalObjectType, string> = {
  development_goal: "goal",
  lesson: "lesson",
  activity: "activity",
  drill: "drill",
  warmup: "warmup",
  small_sided_game: "ssg",
  conditioned_game: "conditioned-game",
  practice: "practice",
  seasonal_program: "program",
  coaching_cue: "cue",
  common_error: "error",
  progression: "progression",
  regression: "regression",
  assignment: "assignment",
  quiz: "quiz",
  quiz_question: "quiz-question",
  lesson_package: "package",
};

export function normalizeCanonicalTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(
      (token) =>
        token && !TITLE_STOP_WORDS.has(token) && !/^\d+$/.test(token),
    )
    .join(" ");
}

export function stableCatalogHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return [first, second]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

export function buildCanonicalIdentityFingerprint(input: {
  objectType: AcademyCanonicalObjectType;
  title: string;
  goalIds?: readonly string[];
  activityType?: string;
  playerCountMin?: number;
  playerCountMax?: number;
}): string {
  const identity = [
    input.objectType,
    normalizeCanonicalTitle(input.title),
    input.activityType ?? "",
    [...(input.goalIds ?? [])].sort().join(","),
    input.playerCountMin ?? "",
    input.playerCountMax ?? "",
  ].join("|");
  return stableCatalogHash(identity);
}

export function createStableCanonicalId(
  objectType: AcademyCanonicalObjectType,
  title: string,
  reservedIds: ReadonlySet<string> = new Set(),
): string {
  const slug =
    normalizeCanonicalTitle(title).replace(/\s+/g, "-").slice(0, 72) ||
    "untitled";
  const base = `academy-${ID_PREFIX[objectType]}-${slug}`;
  if (!reservedIds.has(base)) return base;
  let suffix = 2;
  while (reservedIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function overlapScore(
  left: readonly string[],
  right: readonly string[],
): number {
  const leftSet = new Set(left.map((value) => value.toLowerCase()));
  const rightSet = new Set(right.map((value) => value.toLowerCase()));
  const union = new Set([...leftSet, ...rightSet]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  return intersection / union.size;
}

function rangesOverlap(
  leftMin?: number,
  leftMax?: number,
  rightMin?: number,
  rightMax?: number,
): boolean {
  if (
    leftMin === undefined ||
    leftMax === undefined ||
    rightMin === undefined ||
    rightMax === undefined
  ) {
    return false;
  }
  return leftMin <= rightMax && rightMin <= leftMax;
}

function isGenericCandidateTitle(title: string): boolean {
  return (
    !title ||
    title === "page reference" ||
    /^(page|section|chapter) reference$/.test(title) ||
    ["contents", "introduction", "notes"].includes(title)
  );
}

export function scoreKnowledgeCandidateSimilarity(
  left: AcademyKnowledgeCandidate,
  right: AcademyKnowledgeCandidate,
): number {
  if (
    !left.suggestedObjectTypes.some((type) =>
      right.suggestedObjectTypes.includes(type),
    )
  ) {
    return 0;
  }
  const titleScore =
    isGenericCandidateTitle(left.normalizedTitle) ||
    isGenericCandidateTitle(right.normalizedTitle)
      ? 0
      : overlapScore(
          left.normalizedTitle.split(" "),
          right.normalizedTitle.split(" "),
        );
  const themeScore = overlapScore(
    [
      ...left.extractedSignals.skillTags,
      ...left.extractedSignals.tacticalTags,
    ],
    [
      ...right.extractedSignals.skillTags,
      ...right.extractedSignals.tacticalTags,
    ],
  );
  const equipmentScore = overlapScore(
    left.extractedSignals.equipment,
    right.extractedSignals.equipment,
  );
  const playerScore = rangesOverlap(
    left.extractedSignals.playerCountMin,
    left.extractedSignals.playerCountMax,
    right.extractedSignals.playerCountMin,
    right.extractedSignals.playerCountMax,
  )
    ? 1
    : 0;
  const durationScore =
    left.extractedSignals.durationMinutes !== undefined &&
    right.extractedSignals.durationMinutes !== undefined &&
    Math.abs(
      left.extractedSignals.durationMinutes -
        right.extractedSignals.durationMinutes,
    ) <= 5
      ? 1
      : 0;
  return Number(
    (
      titleScore * 0.55 +
      themeScore * 0.25 +
      equipmentScore * 0.1 +
      playerScore * 0.05 +
      durationScore * 0.05
    ).toFixed(4),
  );
}

export function linkPotentialDuplicateCandidates(
  candidates: readonly AcademyKnowledgeCandidate[],
  threshold = 0.68,
): AcademyKnowledgeCandidate[] {
  const duplicateIds = new Map<string, Set<string>>(
    candidates.map((candidate) => [candidate.id, new Set()]),
  );
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const left = candidates[leftIndex]!;
      const right = candidates[rightIndex]!;
      if (scoreKnowledgeCandidateSimilarity(left, right) < threshold) continue;
      duplicateIds.get(left.id)?.add(right.id);
      duplicateIds.get(right.id)?.add(left.id);
    }
  }
  return candidates.map((candidate) => ({
    ...candidate,
    status: duplicateIds.get(candidate.id)?.size ? "clustered" : candidate.status,
    potentialDuplicateCandidateIds: [
      ...(duplicateIds.get(candidate.id) ?? []),
    ].sort(),
  }));
}

