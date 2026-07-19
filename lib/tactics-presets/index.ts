import { DRILL_PRESETS } from "@/lib/tactics-presets/drills";
import { FORMATION_PRESETS_11V11 } from "@/lib/tactics-presets/formations-11v11";
import { FORMATION_PRESETS_9V9 } from "@/lib/tactics-presets/formations-9v9";
import { SET_PIECE_PRESETS } from "@/lib/tactics-presets/set-pieces";
import { TACTICAL_PRESETS_11V11 } from "@/lib/tactics-presets/tactics-11v11";
import { TACTICAL_PRESETS_9V9 } from "@/lib/tactics-presets/tactics-9v9";
import type { TacticsPreset } from "@/lib/tactics-presets/types";
import { validatedPresetCatalog } from "@/lib/tactics-presets/validation";

const rawCatalog: TacticsPreset[] = [
  ...FORMATION_PRESETS_9V9,
  ...FORMATION_PRESETS_11V11,
  ...TACTICAL_PRESETS_9V9,
  ...TACTICAL_PRESETS_11V11,
  ...SET_PIECE_PRESETS,
  ...DRILL_PRESETS,
];

export const BUILT_IN_TACTICS_PRESETS =
  validatedPresetCatalog(rawCatalog);

export function getBuiltInTacticsPreset(
  presetId: string,
): TacticsPreset | null {
  return (
    BUILT_IN_TACTICS_PRESETS.find((preset) => preset.id === presetId) ?? null
  );
}

export * from "@/lib/tactics-presets/types";
