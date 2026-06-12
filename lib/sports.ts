/**
 * Sport definitions for the Coach Mark feature.
 *
 * Each sport exposes a set of quick "event" buttons the coach taps to drop a
 * mark on the live/VOD timeline. Marks reuse the existing room mark pipeline
 * (`rooms/{roomId}/marks`), so a sport event is just a preset label.
 */

export type SportEvent = {
  /** Stored as the mark label and shown on the button. */
  label: string;
  /** Optional shorter caption for tight button layouts. */
  short?: string;
};

export type SportDef = {
  id: string;
  name: string;
  events: SportEvent[];
};

export const SPORTS: SportDef[] = [
  {
    id: "soccer",
    name: "Soccer",
    events: [
      { label: "Goal" },
      { label: "Corner kick", short: "Corner" },
      { label: "Save" },
      { label: "Shot" },
      { label: "Offsides" },
      { label: "Start" },
      { label: "End" },
    ],
  },
  {
    id: "basketball",
    name: "Basketball",
    events: [
      { label: "Bucket" },
      { label: "3-pointer", short: "3PT" },
      { label: "Assist" },
      { label: "Rebound" },
      { label: "Turnover" },
      { label: "Foul" },
      { label: "Start" },
      { label: "End" },
    ],
  },
  {
    id: "football",
    name: "Football",
    events: [
      { label: "Touchdown", short: "TD" },
      { label: "First down", short: "1st" },
      { label: "Sack" },
      { label: "Interception", short: "INT" },
      { label: "Fumble" },
      { label: "Penalty" },
      { label: "Start" },
      { label: "End" },
    ],
  },
  {
    id: "hockey",
    name: "Hockey",
    events: [
      { label: "Goal" },
      { label: "Assist" },
      { label: "Save" },
      { label: "Shot" },
      { label: "Penalty" },
      { label: "Faceoff" },
      { label: "Start" },
      { label: "End" },
    ],
  },
  {
    id: "general",
    name: "General",
    events: [
      { label: "Mark" },
      { label: "Highlight" },
      { label: "Mistake" },
      { label: "Transition" },
      { label: "Set piece" },
      { label: "Start" },
      { label: "End" },
    ],
  },
];

export const DEFAULT_SPORT_ID = "soccer";

export function getSportById(id: string | null | undefined): SportDef {
  const found = SPORTS.find((s) => s.id === id);
  return found ?? SPORTS[0];
}

const SPORT_STORAGE_KEY = "film-room-coach-mark-sport";

/** Usable Storage or null (guards SSR / non-functional server stub). */
function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    if (typeof localStorage.getItem !== "function") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Reads the coach's last-selected sport (per-browser). Falls back to default. */
export function readPreferredSportId(): string {
  const ls = storage();
  if (!ls) return DEFAULT_SPORT_ID;
  try {
    const v = ls.getItem(SPORT_STORAGE_KEY);
    if (v && SPORTS.some((s) => s.id === v)) return v;
  } catch {
    /* private mode / quota */
  }
  return DEFAULT_SPORT_ID;
}

export function writePreferredSportId(id: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(SPORT_STORAGE_KEY, id);
  } catch {
    /* private mode / quota */
  }
}
