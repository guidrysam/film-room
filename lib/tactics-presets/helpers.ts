import type {
  TacticsAreaLabelObject,
  TacticsBallObject,
  TacticsBoardObject,
  TacticsConeObject,
  TacticsDrawingObject,
  TacticsMiniGoalObject,
  TacticsPlayerObject,
  TacticsPlayerTeam,
} from "@/lib/tactics-boards";
import type {
  TacticsPreset,
  TacticsPresetStep,
} from "@/lib/tactics-presets/types";

export const DEFAULT_PRESET_PLAYBACK = {
  transitionDurationMs: 900,
  holdDurationMs: 700,
  loop: false,
} as const;

export function player(
  id: string,
  team: TacticsPlayerTeam,
  x: number,
  y: number,
  label: string,
  color?: string,
): TacticsPlayerObject {
  return {
    id,
    type: "player",
    team,
    x,
    y,
    label,
    ...(color ? { color } : {}),
    visible: true,
  };
}

export function ball(id: string, x: number, y: number): TacticsBallObject {
  return { id, type: "ball", x, y, visible: true };
}

export function cone(
  id: string,
  x: number,
  y: number,
  color = "#f97316",
): TacticsConeObject {
  return { id, type: "cone", x, y, color, visible: true };
}

export function miniGoal(
  id: string,
  x: number,
  y: number,
  rotation = 0,
): TacticsMiniGoalObject {
  return { id, type: "mini_goal", x, y, rotation, visible: true };
}

export function areaLabel(
  id: string,
  x: number,
  y: number,
  text: string,
): TacticsAreaLabelObject {
  return { id, type: "area_label", x, y, text, visible: true };
}

export function drawing(
  id: string,
  type: TacticsDrawingObject["type"],
  points: Array<{ x: number; y: number }>,
  color = "#fbbf24",
): TacticsDrawingObject {
  return { id, type, points, color, visible: true };
}

export function step(
  id: string,
  order: number,
  title: string,
  objects: TacticsBoardObject[],
  notes?: string,
): TacticsPresetStep {
  return {
    id,
    order,
    title,
    ...(notes ? { notes } : {}),
    objects,
  };
}

export function withMovedObjects(
  objects: TacticsBoardObject[],
  moves: Record<string, { x: number; y: number }>,
): TacticsBoardObject[] {
  return objects.map((object) => {
    const move = moves[object.id];
    if (
      !move ||
      !(
        object.type === "player" ||
        object.type === "ball" ||
        object.type === "cone" ||
        object.type === "mini_goal" ||
        object.type === "area_label"
      )
    ) {
      return clonePresetObject(object);
    }
    return { ...object, x: move.x, y: move.y };
  });
}

export function clonePresetObject(
  object: TacticsBoardObject,
): TacticsBoardObject {
  if (
    object.type === "line" ||
    object.type === "arrow" ||
    object.type === "circle" ||
    object.type === "zone"
  ) {
    return {
      ...object,
      points: object.points.map((point) => ({ ...point })),
    };
  }
  return { ...object };
}

export function formationPreset(
  input: Omit<
    TacticsPreset,
    | "version"
    | "kind"
    | "category"
    | "difficulty"
    | "fieldOrientation"
    | "fieldView"
    | "fieldArea"
    | "playbackSettings"
  > & {
    difficulty?: TacticsPreset["difficulty"];
  },
): TacticsPreset {
  return {
    version: 1,
    kind: "formation",
    category: "formations",
    difficulty: input.difficulty ?? "foundation",
    fieldOrientation: "horizontal",
    fieldView: "full",
    fieldArea: "full",
    playbackSettings: { ...DEFAULT_PRESET_PLAYBACK },
    ...input,
  };
}
