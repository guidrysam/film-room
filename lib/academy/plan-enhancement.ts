import type {
  GeneratedAcademyGamePlan,
  GeneratedAcademyPractice,
} from "@/lib/academy/types";

export type AcademyLanguageEnhancementContext = {
  audience: "coach" | "player" | "family";
  tone?: "concise" | "encouraging" | "instructional";
  personalizationNotes?: string;
};

export type AcademyLanguageEnhancer<T> = (
  deterministicDraft: T,
  context: AcademyLanguageEnhancementContext,
) => Promise<T>;

function practiceAuthoritySignature(plan: GeneratedAcademyPractice): string {
  return JSON.stringify({
    id: plan.id,
    durationMinutes: plan.durationMinutes,
    primaryGoalIds: plan.primaryGoalIds,
    supportingGoalIds: plan.supportingGoalIds,
    sections: plan.sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      durationMinutes: section.durationMinutes,
      developmentGoalIds: section.developmentGoalIds,
      drillId: section.drillId,
      sourcePresetId: section.sourcePresetId,
      academyLessonIds: section.academyLessonIds,
    })),
  });
}

function gamePlanAuthoritySignature(plan: GeneratedAcademyGamePlan): string {
  return JSON.stringify({
    id: plan.id,
    ageBand: plan.ageBand,
    selectedGoalIds: plan.selectedGoalIds,
    evidenceGoalIds: plan.evidenceGoalIds,
  });
}

/**
 * Optional AI hook. The enhancer may rewrite language, but cannot change the
 * authoritative goals, drill refs, section structure, or durations.
 */
export async function enhancePracticeLanguage(
  draft: GeneratedAcademyPractice,
  enhancer: AcademyLanguageEnhancer<GeneratedAcademyPractice>,
  context: AcademyLanguageEnhancementContext,
): Promise<GeneratedAcademyPractice> {
  const enhanced = await enhancer(structuredClone(draft), context);
  if (
    practiceAuthoritySignature(enhanced) !== practiceAuthoritySignature(draft)
  ) {
    throw new Error(
      "Practice enhancement changed authoritative goals, drills, or structure.",
    );
  }
  return enhanced;
}

/**
 * Optional AI hook. Selected/evidence goals remain immutable; only coaching
 * language may be improved.
 */
export async function enhanceGamePlanLanguage(
  draft: GeneratedAcademyGamePlan,
  enhancer: AcademyLanguageEnhancer<GeneratedAcademyGamePlan>,
  context: AcademyLanguageEnhancementContext,
): Promise<GeneratedAcademyGamePlan> {
  const enhanced = await enhancer(structuredClone(draft), context);
  if (
    gamePlanAuthoritySignature(enhanced) !==
    gamePlanAuthoritySignature(draft)
  ) {
    throw new Error(
      "Game-plan enhancement changed authoritative Development Goals.",
    );
  }
  return enhanced;
}

