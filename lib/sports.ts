/**
 * Sport packs for coach marks, review quick-tags, and product gating.
 *
 * Canonical ids: soccer | basketball | football | hockey | general
 * Free-text ("Basketball", "Youth Soccer") normalizes to these ids when possible.
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

/** Primary sports offered in create selectors (thin pack + soccer). */
export const SELECTOR_SPORTS: SportDef[] = SPORTS.filter(
  (s) => s.id === "soccer" || s.id === "basketball",
);

const ALIASES: Record<string, string> = {
  soccer: "soccer",
  football_soccer: "soccer",
  futbol: "soccer",
  "association football": "soccer",
  basketball: "basketball",
  hoop: "basketball",
  hoops: "basketball",
  bball: "basketball",
  "youth basketball": "basketball",
  football: "football",
  "american football": "football",
  hockey: "hockey",
  "ice hockey": "hockey",
  general: "general",
  other: "general",
};

/** Map free-text or id to a canonical sport id, or null if unknown. */
export function normalizeSportId(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (SPORTS.some((s) => s.id === trimmed)) return trimmed;
  const alias = ALIASES[trimmed];
  if (alias) return alias;
  // Soft match: "Youth Soccer Club" contains soccer
  if (/\bsoccer\b|\bfutbol\b/.test(trimmed)) return "soccer";
  if (/\bbasketball\b|\bhoops?\b/.test(trimmed)) return "basketball";
  if (/\bhockey\b/.test(trimmed)) return "hockey";
  if (/\bamerican football\b|\bgridiron\b/.test(trimmed)) return "football";
  return null;
}

/** Canonicalize for storage: known id, else trimmed free-text, else undefined. */
export function canonicalizeSportForStorage(
  raw: string | null | undefined,
): string | undefined {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return undefined;
  return normalizeSportId(trimmed) ?? trimmed;
}

export function sportLabel(raw: string | null | undefined): string {
  const id = normalizeSportId(raw);
  if (id) return getSportById(id).name;
  const t = (raw ?? "").trim();
  return t || getSportById(DEFAULT_SPORT_ID).name;
}

export function getSportById(id: string | null | undefined): SportDef {
  const normalized = normalizeSportId(id) ?? id;
  const found = SPORTS.find((s) => s.id === normalized);
  return found ?? SPORTS.find((s) => s.id === DEFAULT_SPORT_ID)!;
}

/** Resolve effective sport for a game (game → team → club → default). */
export function resolveSportId(input: {
  gameSport?: string | null;
  teamSport?: string | null;
  clubSport?: string | null;
}): string {
  return (
    normalizeSportId(input.gameSport) ||
    normalizeSportId(input.teamSport) ||
    normalizeSportId(input.clubSport) ||
    DEFAULT_SPORT_ID
  );
}

/** Soccer-only surfaces (Academy, tactics boards, ball-mastery). */
export function isSoccerCurriculumSport(
  raw: string | null | undefined,
): boolean {
  const id = normalizeSportId(raw);
  // Unknown / unset defaults to soccer curriculum available.
  return id == null || id === "soccer";
}

export function isBasketballSport(raw: string | null | undefined): boolean {
  return normalizeSportId(raw) === "basketball";
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
    const canonical = normalizeSportId(id) ?? id;
    if (!SPORTS.some((s) => s.id === canonical)) return;
    ls.setItem(SPORT_STORAGE_KEY, canonical);
  } catch {
    /* private mode / quota */
  }
}
