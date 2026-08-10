import { parseGameStat } from "@/lib/game-stats";
import type { AddHighlightMomentInput } from "@/lib/highlight-draft";
import type { GameTimelineEvent } from "@/lib/games";
import {
  generatePresetMoments,
  type HighlightPresetId,
} from "@/lib/highlight-presets";
import { getEventPlayerIds, withEventPlayerIds } from "@/lib/timeline-players";
import { isGoalTimelineEvent } from "@/lib/goal-lookback";

export const HIGHLIGHT_MARK_EVENT_TYPES = new Set<GameTimelineEvent["type"]>([
  "coach_mark",
  "stat",
  "tag",
]);

const DEFAULT_START_OFFSET = -5;
const DEFAULT_END_OFFSET = 10;
/** Goals stored with lookback: clip from event.t through the press + pad. */
const GOAL_LOOKBACK_END_PAD_SEC = 5;
/** Goal and assist on the same play are usually marked within one second. */
const GOAL_ASSIST_MERGE_WINDOW_SEC = 1;
export const HIGHLIGHT_GOAL_PLAYER_IDS_KEY = "highlightGoalPlayerIds";
export const HIGHLIGHT_ASSIST_PLAYER_IDS_KEY = "highlightAssistPlayerIds";

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim() !== "",
  );
}

function highlightPlayerIdsFromMark(event: GameTimelineEvent): {
  goalPlayerIds?: string[];
  assistPlayerIds?: string[];
} {
  const payload = event.payload;
  const goalFromPayload = parseIdList(payload?.[HIGHLIGHT_GOAL_PLAYER_IDS_KEY]);
  const assistFromPayload = parseIdList(
    payload?.[HIGHLIGHT_ASSIST_PLAYER_IDS_KEY],
  );
  if (goalFromPayload.length > 0 || assistFromPayload.length > 0) {
    return {
      ...(goalFromPayload.length > 0 ? { goalPlayerIds: goalFromPayload } : {}),
      ...(assistFromPayload.length > 0
        ? { assistPlayerIds: assistFromPayload }
        : {}),
    };
  }
  const kind = statTypeKey(event);
  const ids = getEventPlayerIds(event);
  if (kind === "goal" && ids.length > 0) return { goalPlayerIds: ids };
  if (kind === "assist" && ids.length > 0) return { assistPlayerIds: ids };
  return {};
}

function statTypeKey(event: GameTimelineEvent): string | null {
  if (event.type !== "stat") return null;
  const stat = parseGameStat(event);
  if (!stat) return null;
  return stat.statType.trim().toLowerCase();
}

/**
 * Merge goal + assist marks on the same play into one highlight moment.
 */
export function mergeGoalAssistMarks(
  events: GameTimelineEvent[],
): GameTimelineEvent[] {
  const marks = events.filter(isHighlightMarkEvent).sort((a, b) => a.t - b.t);
  const consumed = new Set<string>();
  const merged: GameTimelineEvent[] = [];

  for (const event of marks) {
    if (consumed.has(event.id)) continue;
    const kind = statTypeKey(event);
    if (kind !== "goal" && kind !== "assist") {
      merged.push(event);
      continue;
    }

    const partner = marks.find((other) => {
      if (other.id === event.id || consumed.has(other.id)) return false;
      if (Math.abs(other.t - event.t) > GOAL_ASSIST_MERGE_WINDOW_SEC) {
        return false;
      }
      const otherKind = statTypeKey(other);
      return (
        (kind === "goal" && otherKind === "assist") ||
        (kind === "assist" && otherKind === "goal")
      );
    });

    if (!partner) {
      merged.push(event);
      continue;
    }

    consumed.add(event.id);
    consumed.add(partner.id);
    const goal = kind === "goal" ? event : partner;
    const assist = kind === "assist" ? event : partner;
    const goalPlayerIds = getEventPlayerIds(goal);
    const assistPlayerIds = getEventPlayerIds(assist);
    const playerIds = [
      ...new Set([...goalPlayerIds, ...assistPlayerIds]),
    ];
    merged.push({
      ...goal,
      t: goal.t,
      label: "Goal + Assist",
      sourceId: goal.sourceId ?? assist.sourceId,
      payload: withEventPlayerIds(
        {
          ...(goal.payload ?? {}),
          mergedAssistEventId: assist.id,
          mergedGoalEventId: goal.id,
          [HIGHLIGHT_GOAL_PLAYER_IDS_KEY]: goalPlayerIds,
          [HIGHLIGHT_ASSIST_PLAYER_IDS_KEY]: assistPlayerIds,
        },
        playerIds,
      ),
    });
  }

  return merged;
}

export function isHighlightMarkEvent(event: GameTimelineEvent): boolean {
  return HIGHLIGHT_MARK_EVENT_TYPES.has(event.type) && Number.isFinite(event.t);
}

export function formatHighlightMarkLabel(event: GameTimelineEvent): string {
  if (event.type === "stat") {
    const stat = parseGameStat(event);
    if (stat) {
      const base = stat.label?.trim() || stat.statType;
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
  }
  if (typeof event.label === "string" && event.label.trim() !== "") {
    return event.label.trim();
  }
  switch (event.type) {
    case "coach_mark":
      return "Mark";
    case "tag":
      return "Tag";
    case "stat":
      return "Stat";
    default:
      return "Highlight";
  }
}

/** Resolve which camera angle to use for a mark's clip segment. */
export function resolveHighlightMarkSourceId(
  event: GameTimelineEvent,
  playableSourceIds: string[],
  primarySourceId: string,
): string {
  const sid = event.sourceId?.trim();
  if (sid && playableSourceIds.includes(sid)) return sid;
  if (primarySourceId && playableSourceIds.includes(primarySourceId)) {
    return primarySourceId;
  }
  return playableSourceIds[0] ?? primarySourceId;
}

export type HighlightFromMarksOptions = {
  primarySourceId: string;
  playableSourceIds: string[];
  startOffsetSec?: number;
  endOffsetSec?: number;
  presetId?: HighlightPresetId;
  /** Force a specific angle for this mark (AI propose-cut). */
  activeSourceIdOverride?: string;
};

/**
 * Turn one Review mark into highlight reel segment(s) for the chosen preset.
 */
export function highlightMomentsFromGameMark(
  event: GameTimelineEvent,
  opts: HighlightFromMarksOptions,
): AddHighlightMomentInput[] {
  let startOffsetSec = opts.startOffsetSec ?? DEFAULT_START_OFFSET;
  let endOffsetSec = opts.endOffsetSec ?? DEFAULT_END_OFFSET;

  // Goals with lookback: event.t is already clip start; end through press + pad.
  if (
    opts.startOffsetSec == null &&
    opts.endOffsetSec == null &&
    isGoalTimelineEvent(event)
  ) {
    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : {};
    const markedAt =
      typeof payload.markedAtSec === "number" && Number.isFinite(payload.markedAtSec)
        ? payload.markedAtSec
        : null;
    if (markedAt != null) {
      startOffsetSec = 0;
      endOffsetSec = Math.max(
        DEFAULT_END_OFFSET,
        markedAt - event.t + GOAL_LOOKBACK_END_PAD_SEC,
      );
    } else {
      // Legacy goal marks still at press time → start 10s earlier.
      startOffsetSec = -10;
      endOffsetSec = Math.max(endOffsetSec, 5);
    }
  }

  const presetId = opts.presetId ?? "single";
  const playable = new Set(opts.playableSourceIds);

  const override = opts.activeSourceIdOverride?.trim();
  const primarySourceId =
    override && playable.has(override)
      ? override
      : resolveHighlightMarkSourceId(
          event,
          opts.playableSourceIds,
          opts.primarySourceId,
        );
  if (!primarySourceId || !playable.has(primarySourceId)) return [];

  const label = formatHighlightMarkLabel(event);
  const playerIds = getEventPlayerIds(event);
  const { goalPlayerIds, assistPlayerIds } = highlightPlayerIdsFromMark(event);
  const generated = generatePresetMoments(
    presetId,
    {
      gameTime: Math.max(0, event.t),
      startOffsetSec,
      endOffsetSec,
      primarySourceId,
      label,
      ...(playerIds.length > 0 ? { playerIds } : {}),
      ...(goalPlayerIds ? { goalPlayerIds } : {}),
      ...(assistPlayerIds ? { assistPlayerIds } : {}),
    },
    opts.playableSourceIds,
  );

  return generated.map((moment) => ({
    ...moment,
    timelineEventId: event.id,
    ...(goalPlayerIds ? { goalPlayerIds } : {}),
    ...(assistPlayerIds ? { assistPlayerIds } : {}),
  }));
}

/** Ordered highlight marks with goal + assist merged into one event. */
export function listHighlightReelMarks(
  events: GameTimelineEvent[],
): GameTimelineEvent[] {
  return mergeGoalAssistMarks(events);
}

/**
 * Turn Review coach marks, stats, and tags into ordered highlight reel segments.
 * One mark may expand to multiple segments when a multi-beat preset is chosen.
 */
export function highlightMomentsFromGameMarks(
  events: GameTimelineEvent[],
  opts: HighlightFromMarksOptions,
): AddHighlightMomentInput[] {
  const marks = mergeGoalAssistMarks(events);
  const out: AddHighlightMomentInput[] = [];

  for (const event of marks) {
    out.push(...highlightMomentsFromGameMark(event, opts));
  }

  return out;
}

export type CutProposalOverride = {
  timelineEventId: string;
  activeSourceId: string;
  startOffsetSec: number;
  endOffsetSec: number;
};

/**
 * Build highlight moments from AI propose-cut overrides (approve gate).
 * Only marks with a matching proposal are included.
 */
export function highlightMomentsFromCutProposals(
  events: GameTimelineEvent[],
  proposals: CutProposalOverride[],
  opts: Pick<
    HighlightFromMarksOptions,
    "primarySourceId" | "playableSourceIds" | "presetId"
  >,
): AddHighlightMomentInput[] {
  const byId = new Map(
    proposals.map((p) => [p.timelineEventId, p] as const),
  );
  const marks = mergeGoalAssistMarks(events);
  const out: AddHighlightMomentInput[] = [];

  for (const event of marks) {
    const proposal = byId.get(event.id);
    if (!proposal) continue;
    out.push(
      ...highlightMomentsFromGameMark(event, {
        ...opts,
        activeSourceIdOverride: proposal.activeSourceId,
        startOffsetSec: proposal.startOffsetSec,
        endOffsetSec: proposal.endOffsetSec,
      }),
    );
  }

  return out;
}
