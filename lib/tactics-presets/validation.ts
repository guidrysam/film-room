import type { TacticsBoardObject } from "@/lib/tactics-boards";
import type { TacticsPreset } from "@/lib/tactics-presets/types";

export type PresetValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type PresetValidationOptions = {
  /** Preserve legacy team presets while built-in content uses strict lessons. */
  allowLegacyDrill?: boolean;
};

function inBounds(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateObject(
  object: TacticsBoardObject,
  path: string,
): string[] {
  const errors: string[] = [];
  if (!object || typeof object !== "object") {
    return [`${path}: object must be an object`];
  }
  if (typeof object.id !== "string" || !object.id.trim()) {
    errors.push(`${path}: object id is required`);
  }
  const supportedTypes = new Set([
    "player",
    "ball",
    "line",
    "arrow",
    "circle",
    "zone",
    "cone",
    "mini_goal",
    "area_label",
  ]);
  if (!supportedTypes.has(object.type)) {
    errors.push(`${path}: unsupported object type`);
    return errors;
  }
  if (
    object.type === "player" ||
    object.type === "ball" ||
    object.type === "cone" ||
    object.type === "mini_goal" ||
    object.type === "area_label"
  ) {
    if (!inBounds(object.x) || !inBounds(object.y)) {
      errors.push(`${path}/${object.id}: coordinates must be between 0 and 1`);
    }
  }
  if (
    object.type === "line" ||
    object.type === "arrow" ||
    object.type === "circle" ||
    object.type === "zone"
  ) {
    if (!Array.isArray(object.points) || object.points.length < 2) {
      errors.push(`${path}/${object.id}: drawing requires at least two points`);
    } else if (
      object.points.some(
        (point) =>
          !point ||
          typeof point !== "object" ||
          !inBounds(point.x) ||
          !inBounds(point.y),
      )
    ) {
      errors.push(
        `${path}/${object.id}: drawing points must be between 0 and 1`,
      );
    }
  }
  if (
    object.type === "area_label" &&
    (typeof object.text !== "string" || !object.text.trim())
  ) {
    errors.push(`${path}/${object.id}: area label text is required`);
  }
  return errors;
}

export function validateTacticsPreset(
  preset: TacticsPreset,
  options: PresetValidationOptions = {},
): PresetValidationResult {
  const errors: string[] = [];
  if (!preset || typeof preset !== "object") {
    return {
      valid: false,
      errors: ["preset: value must be an object"],
      warnings: [],
    };
  }
  const id = typeof preset.id === "string" ? preset.id : "";
  const path = `preset:${id || "(missing)"}`;
  const warnings: string[] = [];
  if (!id.trim()) errors.push(`${path}: id is required`);
  if (!Number.isInteger(preset.version) || preset.version < 1) {
    errors.push(`${path}: version must be a positive integer`);
  }
  if (typeof preset.title !== "string" || !preset.title.trim()) {
    errors.push(`${path}: title is required`);
  }
  if (
    typeof preset.shortDescription !== "string" ||
    !preset.shortDescription.trim()
  ) {
    errors.push(`${path}: shortDescription is required`);
  }
  for (const [name, value] of [
    ["objectives", preset.objectives],
    ["setupInstructions", preset.setupInstructions],
    ["coachingPoints", preset.coachingPoints],
    ["tags", preset.tags],
  ] as const) {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      errors.push(`${path}: ${name} must be a string array`);
    }
  }
  if (
    preset.commonMistakes !== undefined &&
    (!Array.isArray(preset.commonMistakes) ||
      preset.commonMistakes.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          typeof item.mistake !== "string" ||
          !item.mistake.trim() ||
          (item.correction !== undefined &&
            typeof item.correction !== "string"),
      ))
  ) {
    errors.push(`${path}: commonMistakes must contain structured mistakes`);
  }
  for (const [name, variations] of [
    ["progressions", preset.progressions],
    ["regressions", preset.regressions],
  ] as const) {
    if (
      variations !== undefined &&
      (!Array.isArray(variations) ||
        variations.some(
          (item) =>
            !(
              typeof item === "string" ||
              (item &&
                typeof item === "object" &&
                typeof item.title === "string" &&
                item.title.trim() &&
                typeof item.description === "string" &&
                item.description.trim())
            ),
        ))
    ) {
      errors.push(`${path}: ${name} must contain valid drill variations`);
    }
  }
  const steps = Array.isArray(preset.steps) ? preset.steps : [];
  if (steps.length === 0) {
    errors.push(`${path}: at least one step is required`);
  }
  if (
    preset.playerCount !== undefined &&
    (!Number.isInteger(preset.playerCount) || preset.playerCount < 1)
  ) {
    errors.push(`${path}: playerCount must be a positive integer`);
  }
  if (
    preset.goalkeeperCount !== undefined &&
    (!Number.isInteger(preset.goalkeeperCount) ||
      preset.goalkeeperCount < 0 ||
      (preset.playerCount !== undefined &&
        preset.goalkeeperCount > preset.playerCount))
  ) {
    errors.push(`${path}: goalkeeperCount is invalid`);
  }
  if (
    preset.editorialMetadata &&
    ![
      "internal_draft",
      "reviewed",
      "licensed",
      "public_domain",
    ].includes(preset.editorialMetadata.contentStatus)
  ) {
    errors.push(`${path}: editorial contentStatus is invalid`);
  }
  const enforceDrillLesson =
    preset.kind === "practice_drill" && !options.allowLegacyDrill;
  if (enforceDrillLesson) {
    if (steps.length < 4) {
      errors.push(`${path}: practice drills require at least four steps`);
    }
    if (!Array.isArray(preset.setupInstructions) || preset.setupInstructions.length === 0) {
      errors.push(`${path}: practice drills require setup instructions`);
    }
    if (!Array.isArray(preset.objectives) || preset.objectives.length === 0) {
      errors.push(`${path}: practice drills require objectives`);
    }
    if (!Array.isArray(preset.coachingPoints) || preset.coachingPoints.length === 0) {
      errors.push(`${path}: practice drills require coaching points`);
    }
    if (
      (!Array.isArray(preset.progressions) || preset.progressions.length === 0) &&
      (!Array.isArray(preset.regressions) || preset.regressions.length === 0)
    ) {
      errors.push(
        `${path}: practice drills require at least one progression or regression`,
      );
    }
    if (!Array.isArray(preset.howItWorks) || preset.howItWorks.length === 0) {
      errors.push(`${path}: practice drills require howItWorks instructions`);
    }
    if (!preset.equipment) {
      warnings.push(`${path}: equipment data is recommended`);
    }
    if (!preset.ageGuidance?.trim()) {
      warnings.push(`${path}: age guidance is recommended`);
    }
    if (preset.playerCount === undefined) {
      warnings.push(`${path}: player count metadata is recommended`);
    }
    if ((preset.commonMistakes?.length ?? 0) < 3) {
      warnings.push(`${path}: at least three common mistakes are recommended`);
    }
  }

  const stepIds = new Set<string>();
  const objectTypeById = new Map<string, string>();
  let previousDrillObjectSignature: string | null = null;
  const firstOrder = steps[0]?.order ?? 0;
  if (firstOrder !== 0 && firstOrder !== 1) {
    errors.push(`${path}: step ordering must start at 0 or 1`);
  }
  steps.forEach((step, index) => {
    const stepPath = `${path}/step:${step.id || index}`;
    const expectedOrder = firstOrder + index;
    if (step.order !== expectedOrder) {
      errors.push(
        `${stepPath}: expected order ${expectedOrder}, got ${step.order}`,
      );
    }
    if (typeof step.id !== "string" || !step.id.trim()) {
      errors.push(`${stepPath}: step id is required`);
    }
    if (stepIds.has(step.id)) {
      errors.push(`${stepPath}: duplicate step id ${step.id}`);
    }
    stepIds.add(step.id);
    if (typeof step.title !== "string" || !step.title.trim()) {
      errors.push(`${stepPath}: title is required`);
    }
    if (
      enforceDrillLesson &&
      (typeof step.explanation !== "string" || !step.explanation.trim())
    ) {
      errors.push(`${stepPath}: drill steps require an explanation`);
    }
    if (
      enforceDrillLesson &&
      (typeof step.coachCue !== "string" || !step.coachCue.trim())
    ) {
      warnings.push(`${stepPath}: a coach cue is recommended`);
    }

    const objectIds = new Set<string>();
    const objects = Array.isArray(step.objects) ? step.objects : [];
    if (!Array.isArray(step.objects)) {
      errors.push(`${stepPath}: objects must be an array`);
    }
    if (enforceDrillLesson) {
      const signature = JSON.stringify(objects);
      if (signature === previousDrillObjectSignature) {
        errors.push(
          `${stepPath}: drill steps must show a distinct visual state`,
        );
      }
      previousDrillObjectSignature = signature;
    }
    for (const object of objects) {
      if (objectIds.has(object.id)) {
        errors.push(`${stepPath}: duplicate object id ${object.id}`);
      }
      objectIds.add(object.id);
      const priorType = objectTypeById.get(object.id);
      if (priorType && priorType !== object.type) {
        errors.push(
          `${stepPath}/${object.id}: stable id changed type from ${priorType} to ${object.type}`,
        );
      }
      objectTypeById.set(object.id, object.type);
      errors.push(...validateObject(object, stepPath));
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

export function validatePresetCatalog(
  presets: TacticsPreset[],
): PresetValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const preset of presets) {
    if (ids.has(preset.id)) {
      errors.push(`catalog: duplicate preset id ${preset.id}`);
    }
    ids.add(preset.id);
    const result = validateTacticsPreset(preset);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Invalid built-ins are excluded in production, while development/test fails
 * loudly so malformed version-controlled content cannot ship unnoticed.
 */
export function validatedPresetCatalog(
  presets: TacticsPreset[],
): TacticsPreset[] {
  const catalogResult = validatePresetCatalog(presets);
  if (catalogResult.valid) {
    if (
      catalogResult.warnings.length > 0 &&
      process.env.NODE_ENV !== "production"
    ) {
      console.warn(
        `Tactics preset quality warnings:\n${catalogResult.warnings.join("\n")}`,
      );
    }
    return presets;
  }
  const message = `Invalid tactics preset catalog:\n${catalogResult.errors.join("\n")}`;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(message);
  }
  console.error(message);
  return presets.filter((preset) => validateTacticsPreset(preset).valid);
}
