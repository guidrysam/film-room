/**
 * Default player placements for tactics boards (normalized 0–1 field space).
 * Home occupies the left half; away mirrors to the right.
 */

import {
  generateTacticsObjectId,
  TACTICS_AWAY_COLOR,
  TACTICS_HOME_COLOR,
  type TacticsBoardObject,
  type TacticsPlayerObject,
  type TacticsPlayerTeam,
} from "@/lib/tactics-boards";

export const TACTICS_PLAYER_COUNT_OPTIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
] as const;

export type TacticsPlayerCount = (typeof TACTICS_PLAYER_COUNT_OPTIONS)[number];

/** Formation slots in the home half (x 0–0.5, y 0–1). Index 0 is typically the keeper. */
function homeFormationSlots(count: number): Array<{ x: number; y: number }> {
  const n = Math.min(11, Math.max(0, Math.floor(count)));
  // Rows from own goal (left) toward midfield. Values are [x, ...y positions].
  const shapes: Record<number, Array<[number, number]>> = {
    0: [],
    1: [[0.22, 0.5]],
    2: [
      [0.1, 0.5],
      [0.32, 0.5],
    ],
    3: [
      [0.1, 0.5],
      [0.3, 0.32],
      [0.3, 0.68],
    ],
    4: [
      [0.1, 0.5],
      [0.26, 0.28],
      [0.26, 0.72],
      [0.38, 0.5],
    ],
    5: [
      [0.1, 0.5],
      [0.24, 0.22],
      [0.24, 0.5],
      [0.24, 0.78],
      [0.4, 0.5],
    ],
    6: [
      [0.09, 0.5],
      [0.22, 0.22],
      [0.22, 0.5],
      [0.22, 0.78],
      [0.38, 0.35],
      [0.38, 0.65],
    ],
    7: [
      [0.09, 0.5],
      [0.22, 0.2],
      [0.22, 0.5],
      [0.22, 0.8],
      [0.36, 0.28],
      [0.36, 0.5],
      [0.36, 0.72],
    ],
    8: [
      [0.08, 0.5],
      [0.2, 0.18],
      [0.2, 0.4],
      [0.2, 0.6],
      [0.2, 0.82],
      [0.36, 0.3],
      [0.36, 0.5],
      [0.36, 0.7],
    ],
    9: [
      [0.08, 0.5],
      [0.2, 0.16],
      [0.2, 0.38],
      [0.2, 0.62],
      [0.2, 0.84],
      [0.34, 0.28],
      [0.34, 0.5],
      [0.34, 0.72],
      [0.44, 0.5],
    ],
    10: [
      [0.08, 0.5],
      [0.2, 0.14],
      [0.2, 0.34],
      [0.2, 0.66],
      [0.2, 0.86],
      [0.32, 0.22],
      [0.32, 0.4],
      [0.32, 0.6],
      [0.32, 0.78],
      [0.44, 0.5],
    ],
    11: [
      [0.08, 0.5],
      [0.2, 0.12],
      [0.2, 0.34],
      [0.2, 0.66],
      [0.2, 0.88],
      [0.32, 0.22],
      [0.32, 0.4],
      [0.32, 0.6],
      [0.32, 0.78],
      [0.44, 0.38],
      [0.44, 0.62],
    ],
  };
  return (shapes[n] ?? shapes[11]!.slice(0, n)).map(([x, y]) => ({ x, y }));
}

function slotsForTeam(
  team: TacticsPlayerTeam,
  count: number,
): Array<{ x: number; y: number }> {
  const home = homeFormationSlots(count);
  if (team === "home") return home;
  // Mirror across the halfway line for the away side.
  return home.map((p) => ({ x: 1 - p.x, y: p.y }));
}

export function countPlayersOnSide(
  objects: TacticsBoardObject[],
  team: TacticsPlayerTeam,
): number {
  return objects.filter((o) => o.type === "player" && o.team === team).length;
}

/**
 * Set how many players appear on one side. Repositions that side into a
 * default shape; keeps jersey numbers/colors for players that remain.
 * Drawings and the ball are preserved.
 */
export function setPlayersOnSide(
  objects: TacticsBoardObject[],
  team: TacticsPlayerTeam,
  count: number,
): TacticsBoardObject[] {
  const n = Math.min(11, Math.max(0, Math.floor(count)));
  const slots = slotsForTeam(team, n);
  const existing = objects.filter(
    (o): o is TacticsPlayerObject => o.type === "player" && o.team === team,
  );
  const others = objects.filter(
    (o) => !(o.type === "player" && o.team === team),
  );

  const color = team === "home" ? TACTICS_HOME_COLOR : TACTICS_AWAY_COLOR;
  const nextPlayers: TacticsPlayerObject[] = slots.map((slot, i) => {
    const prev = existing[i];
    if (prev) {
      return {
        ...prev,
        x: slot.x,
        y: slot.y,
        color: prev.color || color,
      };
    }
    return {
      id: generateTacticsObjectId(),
      type: "player",
      team,
      x: slot.x,
      y: slot.y,
      label: String(i + 1),
      color,
    };
  });

  return [...others, ...nextPlayers];
}
