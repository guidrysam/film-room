import type { AcademyDrillStep } from "@/lib/academy/types";
import type { TacticsBoardObject } from "@/lib/tactics-boards";

export function player(
  id: string,
  team: "home" | "away",
  x: number,
  y: number,
  label: string,
): TacticsBoardObject {
  return { id, type: "player", team, x, y, label };
}

export function ball(id: string, x: number, y: number): TacticsBoardObject {
  return { id, type: "ball", x, y };
}

export function cone(id: string, x: number, y: number): TacticsBoardObject {
  return { id, type: "cone", x, y };
}

export function arrow(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = "#fbbf24",
): TacticsBoardObject {
  return { id, type: "arrow", points: [from, to], color };
}

export function zone(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color = "#3b82f628",
): TacticsBoardObject {
  return { id, type: "zone", points: [from, to], color };
}

export function label(
  id: string,
  x: number,
  y: number,
  text: string,
): TacticsBoardObject {
  return { id, type: "area_label", x, y, text };
}

export function step(
  id: string,
  order: number,
  phase: AcademyDrillStep["phase"],
  title: string,
  explanation: string,
  objects: TacticsBoardObject[],
  details: Pick<
    AcademyDrillStep,
    "coachCue" | "playerAction" | "ballAction" | "coachingPurpose"
  >,
): AcademyDrillStep {
  return {
    id,
    order,
    phase,
    title,
    explanation,
    durationMs: 1800,
    objects,
    ...details,
  };
}
