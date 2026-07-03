import type { AddHighlightMomentInput } from "@/lib/highlight-draft";

/**
 * Highlight presets: pick a style and we auto-generate a multi-angle, multi-
 * speed cut from a single key moment. Presets are pure functions over a base
 * moment + the game's available angles, so they are easy to test and the
 * builder just persists whatever segments they return.
 */

export type HighlightPresetId =
  | "single"
  | "replay"
  | "every_angle"
  | "showcase"
  | "loop"
  | "ken_burns";

/** The key moment a preset styles around. */
export type PresetBaseMoment = {
  gameTime: number;
  /** Default window before/after the key moment (negative = before). */
  startOffsetSec: number;
  endOffsetSec: number;
  primarySourceId: string;
  label?: string;
  playerIds?: string[];
  goalPlayerIds?: string[];
  assistPlayerIds?: string[];
};

export type HighlightPreset = {
  id: HighlightPresetId;
  name: string;
  description: string;
  /**
   * Generate the styled segment list. `angleIds` is every available source id
   * (any order); the primary is taken from `base.primarySourceId`.
   */
  generate: (
    base: PresetBaseMoment,
    angleIds: string[],
  ) => AddHighlightMomentInput[];
};

/** Tight window (seconds, relative to the key moment) used for slow-mo beats. */
const KEY_WINDOW = { start: -2, end: 3 } as const;

/** Primary first, then the remaining angles in their given order, deduped. */
function orderedAngles(base: PresetBaseMoment, angleIds: string[]): string[] {
  const others = angleIds.filter(
    (id) => id && id !== base.primarySourceId,
  );
  const ordered = [base.primarySourceId, ...others];
  return [...new Set(ordered.filter(Boolean))];
}

function baseLabel(base: PresetBaseMoment, fallback: string): string {
  return base.label?.trim() || fallback;
}

function presetPlayerFields(
  base: PresetBaseMoment,
): Pick<
  AddHighlightMomentInput,
  "playerIds" | "goalPlayerIds" | "assistPlayerIds"
> {
  return {
    ...(base.playerIds ? { playerIds: base.playerIds } : {}),
    ...(base.goalPlayerIds ? { goalPlayerIds: base.goalPlayerIds } : {}),
    ...(base.assistPlayerIds ? { assistPlayerIds: base.assistPlayerIds } : {}),
  };
}

export const HIGHLIGHT_PRESETS: Record<HighlightPresetId, HighlightPreset> = {
  single: {
    id: "single",
    name: "Quick clip",
    description: "One angle, real time. The simplest cut.",
    generate: (base) => [
      {
        gameTime: base.gameTime,
        activeSourceId: base.primarySourceId,
        startOffsetSec: base.startOffsetSec,
        endOffsetSec: base.endOffsetSec,
        speed: 1,
        repeat: 1,
        label: baseLabel(base, "Highlight"),
        ...(presetPlayerFields(base)),
      },
    ],
  },

  replay: {
    id: "replay",
    name: "Instant replay",
    description: "Live speed once, then a slow-motion replay from the same angle.",
    generate: (base) => [
      {
        gameTime: base.gameTime,
        activeSourceId: base.primarySourceId,
        startOffsetSec: base.startOffsetSec,
        endOffsetSec: base.endOffsetSec,
        speed: 1,
        repeat: 1,
        label: baseLabel(base, "Live"),
        ...(presetPlayerFields(base)),
      },
      {
        gameTime: base.gameTime,
        activeSourceId: base.primarySourceId,
        startOffsetSec: base.startOffsetSec,
        endOffsetSec: base.endOffsetSec,
        speed: 0.5,
        repeat: 1,
        label: "Slow-mo replay",
        ...(presetPlayerFields(base)),
      },
    ],
  },

  every_angle: {
    id: "every_angle",
    name: "Every angle",
    description: "The same moment shown once from each camera, in real time.",
    generate: (base, angleIds) =>
      orderedAngles(base, angleIds).map((id, i) => ({
        gameTime: base.gameTime,
        activeSourceId: id,
        startOffsetSec: base.startOffsetSec,
        endOffsetSec: base.endOffsetSec,
        speed: 1,
        repeat: 1,
        label: i === 0 ? baseLabel(base, "Highlight") : `Angle ${i + 1}`,
        ...(presetPlayerFields(base)),
      })),
  },

  showcase: {
    id: "showcase",
    name: "Slow-mo showcase",
    description:
      "Live primary angle, then a slow-motion beat from every other camera.",
    generate: (base, angleIds) => {
      const ordered = orderedAngles(base, angleIds);
      const segments: AddHighlightMomentInput[] = [
        {
          gameTime: base.gameTime,
          activeSourceId: base.primarySourceId,
          startOffsetSec: base.startOffsetSec,
          endOffsetSec: base.endOffsetSec,
          speed: 1,
          repeat: 1,
          label: baseLabel(base, "Highlight"),
          ...(presetPlayerFields(base)),
        },
      ];
      const others = ordered.slice(1);
      const slowAngles = others.length > 0 ? others : [base.primarySourceId];
      slowAngles.forEach((id, i) => {
        segments.push({
          gameTime: base.gameTime,
          activeSourceId: id,
          startOffsetSec: KEY_WINDOW.start,
          endOffsetSec: KEY_WINDOW.end,
          speed: 0.5,
          repeat: 1,
          label: others.length > 0 ? `Slow-mo · angle ${i + 2}` : "Slow-mo",
          ...(presetPlayerFields(base)),
        });
      });
      return segments;
    },
  },

  loop: {
    id: "loop",
    name: "Looping clip",
    description: "One tight angle repeated three times — great for socials.",
    generate: (base) => [
      {
        gameTime: base.gameTime,
        activeSourceId: base.primarySourceId,
        startOffsetSec: KEY_WINDOW.start,
        endOffsetSec: KEY_WINDOW.end,
        speed: 1,
        repeat: 3,
        label: baseLabel(base, "Highlight"),
        ...(presetPlayerFields(base)),
      },
    ],
  },

  ken_burns: {
    id: "ken_burns",
    name: "Ken Burns zoom",
    description:
      "One angle with a slow 50% push-in over the clip — cinematic focus on the moment.",
    generate: (base) => [
      {
        gameTime: base.gameTime,
        activeSourceId: base.primarySourceId,
        startOffsetSec: base.startOffsetSec,
        endOffsetSec: base.endOffsetSec,
        speed: 1,
        repeat: 1,
        kenBurns: true,
        label: baseLabel(base, "Highlight"),
        ...(presetPlayerFields(base)),
      },
    ],
  },
};

export const HIGHLIGHT_PRESET_LIST: HighlightPreset[] =
  Object.values(HIGHLIGHT_PRESETS);

/** Generate styled segments for a preset id (empty when the id is unknown). */
export function generatePresetMoments(
  presetId: HighlightPresetId,
  base: PresetBaseMoment,
  angleIds: string[],
): AddHighlightMomentInput[] {
  const preset = HIGHLIGHT_PRESETS[presetId];
  if (!preset) return [];
  return preset.generate(base, angleIds);
}

/** UI label for a preset id (replay uses the friendlier “Live + replay” name). */
export function highlightPresetLabel(presetId: HighlightPresetId): string {
  if (presetId === "replay") return "Live + replay";
  return HIGHLIGHT_PRESETS[presetId]?.name ?? presetId;
}
