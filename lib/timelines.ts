/**
 * Coach Mark timelines — recorded live, synced to video later.
 *
 * A timeline is a list of events captured in real time during a game/practice.
 * Each event stores `offsetSec` = seconds elapsed since the coach started the
 * timeline. There is no video here: the coach just taps buttons. Later, in
 * Timeline Sync, the offsets are aligned to a recorded YouTube video.
 *
 * Storage is per-browser localStorage so the tool works on the sideline with no
 * sign-in and survives a refresh / accidental tab close.
 */

export type CoachTimelineEvent = {
  id: string;
  label: string;
  /** Seconds since the timeline clock started. */
  offsetSec: number;
  /**
   * Canonical wall-clock timestamp (epoch ms) of the moment this mark was
   * tapped. This is the shared reference that lets any video with a known
   * recording start time auto-place the mark — no manual line-up needed.
   * Optional for legacy timelines (derive via `markEpochMs`).
   */
  atMs?: number;
};

export type CoachTimeline = {
  id: string;
  name: string;
  sportId: string;
  /** Epoch ms when the timeline was first started. */
  createdAt: number;
  /** Epoch ms when saved (finished). */
  savedAt: number;
  /** Total recorded length in seconds. */
  durationSec: number;
  events: CoachTimelineEvent[];
};

/** In-progress recording, persisted continuously so a refresh never loses marks. */
export type CoachTimelineDraft = {
  sportId: string;
  /** Epoch ms when the clock started; null while idle. */
  startedAt: number | null;
  events: CoachTimelineEvent[];
};

const TIMELINES_KEY = "film-room-coach-timelines";
const DRAFT_KEY = "film-room-coach-mark-draft";

/**
 * Returns a usable Storage or null. Guards SSR/prerender where `localStorage`
 * may be undefined or a non-functional stub (Next.js server runtime).
 */
function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    if (typeof localStorage.getItem !== "function") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isEvent(v: unknown): v is CoachTimelineEvent {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.atMs !== undefined) {
    if (typeof o.atMs !== "number" || !Number.isFinite(o.atMs)) return false;
  }
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.offsetSec === "number" &&
    Number.isFinite(o.offsetSec)
  );
}

/**
 * Canonical wall-clock time (epoch ms) of a mark. Uses the explicit per-mark
 * timestamp when present, otherwise reconstructs it from the timeline anchor
 * (`createdAt` / `startedAt`) plus the relative offset — so every timeline,
 * old or new, resolves to a real-world instant.
 */
export function markEpochMs(
  anchorMs: number,
  event: Pick<CoachTimelineEvent, "offsetSec" | "atMs">,
): number {
  if (typeof event.atMs === "number" && Number.isFinite(event.atMs)) {
    return event.atMs;
  }
  return anchorMs + event.offsetSec * 1000;
}

function isTimeline(v: unknown): v is CoachTimeline {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.sportId === "string" &&
    typeof o.createdAt === "number" &&
    Array.isArray(o.events) &&
    o.events.every(isEvent)
  );
}

/** All saved timelines, newest first. */
export function listTimelines(): CoachTimeline[] {
  const ls = storage();
  if (!ls) return [];
  const arr = safeParse<unknown[]>(ls.getItem(TIMELINES_KEY));
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(isTimeline)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function getTimeline(id: string): CoachTimeline | null {
  return listTimelines().find((t) => t.id === id) ?? null;
}

/** Insert or replace a timeline by id. Returns the stored timeline. */
export function saveTimeline(timeline: CoachTimeline): CoachTimeline {
  const ls = storage();
  if (!ls) return timeline;
  const all = listTimelines().filter((t) => t.id !== timeline.id);
  all.unshift(timeline);
  try {
    ls.setItem(TIMELINES_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
  return timeline;
}

export function deleteTimeline(id: string): void {
  const ls = storage();
  if (!ls) return;
  const all = listTimelines().filter((t) => t.id !== id);
  try {
    ls.setItem(TIMELINES_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}

export function readDraft(): CoachTimelineDraft | null {
  const ls = storage();
  if (!ls) return null;
  const d = safeParse<CoachTimelineDraft>(ls.getItem(DRAFT_KEY));
  if (!d || typeof d !== "object") return null;
  if (!Array.isArray(d.events) || !d.events.every(isEvent)) return null;
  return {
    sportId: typeof d.sportId === "string" ? d.sportId : "soccer",
    startedAt:
      typeof d.startedAt === "number" && Number.isFinite(d.startedAt)
        ? d.startedAt
        : null,
    events: d.events,
  };
}

export function writeDraft(draft: CoachTimelineDraft): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearDraft(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(DRAFT_KEY);
  } catch {
    /* private mode */
  }
}

/** `m:ss` (or `h:mm:ss`) for an elapsed-seconds value. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}
