/** Fixed kit angle slots for team vault uploads. */

export const ANGLE_SLOTS = [
  "main",
  "goal_a",
  "goal_b",
  "offense",
  "defense",
] as const;

export type AngleSlot = (typeof ANGLE_SLOTS)[number];

export const ANGLE_SLOT_LABELS: Record<AngleSlot, string> = {
  main: "Main",
  goal_a: "Goal A",
  goal_b: "Goal B",
  offense: "Offense",
  defense: "Defense",
};

export function isAngleSlot(value: unknown): value is AngleSlot {
  return (
    typeof value === "string" &&
    (ANGLE_SLOTS as readonly string[]).includes(value)
  );
}

export function labelForAngleSlot(slot: AngleSlot): string {
  return ANGLE_SLOT_LABELS[slot];
}
