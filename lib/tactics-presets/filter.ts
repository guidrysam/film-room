import type {
  TacticsPreset,
  TacticsPresetCategory,
  TacticsPresetDifficulty,
  TacticsPresetFormat,
  TacticsPresetKind,
} from "@/lib/tactics-presets/types";

export type TacticsPresetFilters = {
  query?: string;
  formats?: TacticsPresetFormat[];
  categories?: TacticsPresetCategory[];
  kinds?: TacticsPresetKind[];
  difficulties?: TacticsPresetDifficulty[];
};

function searchableText(preset: TacticsPreset): string {
  return [
    preset.title,
    preset.shortDescription,
    ...preset.tags,
    ...preset.objectives,
    ...preset.coachingPoints,
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function filterTacticsPresets(
  presets: TacticsPreset[],
  filters: TacticsPresetFilters,
): TacticsPreset[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return presets.filter((preset) => {
    if (
      filters.formats?.length &&
      !filters.formats.includes(preset.format)
    ) {
      return false;
    }
    if (
      filters.categories?.length &&
      !filters.categories.includes(preset.category)
    ) {
      return false;
    }
    if (filters.kinds?.length && !filters.kinds.includes(preset.kind)) {
      return false;
    }
    if (
      filters.difficulties?.length &&
      !filters.difficulties.includes(preset.difficulty)
    ) {
      return false;
    }
    return !query || searchableText(preset).includes(query);
  });
}
