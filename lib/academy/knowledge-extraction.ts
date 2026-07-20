import {
  buildCanonicalIdentityFingerprint,
  normalizeCanonicalTitle,
  stableCatalogHash,
} from "@/lib/academy/catalog-deduplication";
import type {
  AcademyCanonicalObjectType,
  AcademyKnowledgeCandidate,
  AcademySourceItem,
} from "@/lib/academy/types";

const TYPE_SUGGESTIONS: Record<
  AcademySourceItem["contentType"],
  AcademyCanonicalObjectType[]
> = {
  development_principle: ["development_goal", "coaching_cue"],
  session_methodology: ["practice", "seasonal_program"],
  drill: ["activity", "drill"],
  tactical_concept: ["lesson", "conditioned_game"],
  season_structure: ["seasonal_program"],
  age_guidance: ["development_goal", "lesson"],
  coaching_guidance: ["coaching_cue", "common_error"],
};

function suggestedTypes(
  item: AcademySourceItem,
): AcademyCanonicalObjectType[] {
  const sample = `${item.sourceTitle} ${item.skillTags.join(" ")} ${item.tacticalTags.join(" ")}`.toLowerCase();
  if (item.contentType === "drill") {
    if (/\bwarm.?up\b/.test(sample)) return ["warmup", "activity"];
    if (/\bsmall.?sided\b/.test(sample)) {
      return ["small_sided_game", "activity"];
    }
    if (/\bconditioned\b/.test(sample)) {
      return ["conditioned_game", "activity"];
    }
  }
  return TYPE_SUGGESTIONS[item.contentType];
}

function extractionConfidence(
  item: AcademySourceItem,
): AcademyKnowledgeCandidate["confidence"] {
  const signals = [
    item.ageTags.length > 0,
    item.skillTags.length > 0 || item.tacticalTags.length > 0,
    item.playerCountMin !== undefined,
    item.durationMinutes !== undefined,
    Boolean(item.equipmentMentions?.length),
  ].filter(Boolean).length;
  if (signals >= 4) return "high";
  if (signals >= 2) return "medium";
  return "low";
}

/**
 * Converts a private source-index item into a private editorial candidate.
 * It does not draft product copy or create a publishable Academy object.
 */
export function extractKnowledgeCandidate(
  item: AcademySourceItem,
): AcademyKnowledgeCandidate {
  const suggestedObjectTypes = suggestedTypes(item);
  const normalizedTitle = normalizeCanonicalTitle(item.sourceTitle);
  const primaryType = suggestedObjectTypes[0]!;
  return {
    id: `candidate-${stableCatalogHash(item.id)}`,
    suggestedObjectTypes,
    workingTitle: item.sourceTitle,
    normalizedTitle,
    identityFingerprint: buildCanonicalIdentityFingerprint({
      objectType: primaryType,
      title: item.sourceTitle,
      playerCountMin: item.playerCountMin,
      playerCountMax: item.playerCountMax,
    }),
    sourceProvenance: [
      {
        sourceDocumentId: item.sourceDocumentId,
        sourceItemId: item.id,
        relationship: "concept_inspiration",
      },
    ],
    extractedSignals: {
      ageTags: [...item.ageTags],
      skillTags: [...item.skillTags],
      tacticalTags: [...item.tacticalTags],
      ...(item.playerCountMin !== undefined
        ? { playerCountMin: item.playerCountMin }
        : {}),
      ...(item.playerCountMax !== undefined
        ? { playerCountMax: item.playerCountMax }
        : {}),
      ...(item.durationMinutes !== undefined
        ? { durationMinutes: item.durationMinutes }
        : {}),
      equipment: [...(item.equipmentMentions ?? [])],
    },
    status: "extracted",
    potentialDuplicateCandidateIds: [],
    confidence: extractionConfidence(item),
  };
}

export function extractKnowledgeCandidates(
  items: readonly AcademySourceItem[],
): AcademyKnowledgeCandidate[] {
  return items
    .filter((item) => item.editorialStatus !== "rejected")
    .map(extractKnowledgeCandidate)
    .sort((left, right) => left.id.localeCompare(right.id));
}

