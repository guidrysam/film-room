import type { HighlightMoment } from "@/lib/highlight-draft";

export const REEL_PLAYER_OVERLAY_SEC = 3;

function playerName(
  id: string,
  nameForId: (playerId: string) => string | undefined,
): string | null {
  const name = nameForId(id)?.trim();
  return name || null;
}

/**
 * Build on-screen text for goal / assist highlight segments.
 * Returns null when no roster names resolve.
 */
export function formatReelPlayerOverlay(
  moment: Pick<
    HighlightMoment,
    "label" | "playerIds" | "goalPlayerIds" | "assistPlayerIds"
  >,
  nameForId: (playerId: string) => string | undefined,
): string | null {
  const label = (moment.label ?? "").toLowerCase();
  const goalIds = moment.goalPlayerIds ?? [];
  const assistIds = moment.assistPlayerIds ?? [];
  const parts: string[] = [];

  if (goalIds.length > 0) {
    for (const id of goalIds) {
      const name = playerName(id, nameForId);
      if (name) parts.push(`Goal — ${name}`);
    }
  }
  if (assistIds.length > 0) {
    for (const id of assistIds) {
      const name = playerName(id, nameForId);
      if (name) parts.push(`Assist — ${name}`);
    }
  }

  if (parts.length > 0) return parts.join(" · ");

  const fallbackIds = moment.playerIds ?? [];
  if (fallbackIds.length === 0) return null;

  if (label.includes("goal") && label.includes("assist")) {
    const names = fallbackIds
      .map((id) => playerName(id, nameForId))
      .filter((n): n is string => !!n);
    return names.length > 0 ? names.join(" · ") : null;
  }
  if (label.includes("goal")) {
    const name = playerName(fallbackIds[0]!, nameForId);
    return name ? `Goal — ${name}` : null;
  }
  if (label.includes("assist")) {
    const name = playerName(fallbackIds[0]!, nameForId);
    return name ? `Assist — ${name}` : null;
  }

  return null;
}

function isGoalAssistMoment(
  moment: Pick<
    HighlightMoment,
    "label" | "goalPlayerIds" | "assistPlayerIds"
  >,
): boolean {
  if (moment.goalPlayerIds?.length || moment.assistPlayerIds?.length) {
    return true;
  }
  const label = (moment.label ?? "").toLowerCase();
  return label.includes("goal") || label.includes("assist");
}

function shouldAttachStatInterstitial(
  moment: HighlightMoment,
  index: number,
  moments: HighlightMoment[],
  nameForId: (playerId: string) => string | undefined,
  seenTimelineEventIds: Set<string>,
): boolean {
  const eventId = moment.timelineEventId?.trim();
  if (eventId) {
    if (seenTimelineEventIds.has(eventId)) return false;
    seenTimelineEventIds.add(eventId);
    return true;
  }
  if (index > 0) {
    const prev = moments[index - 1];
    if (prev && isGoalAssistMoment(prev)) {
      const overlay = formatReelPlayerOverlay(moment, nameForId);
      const prevOverlay = formatReelPlayerOverlay(prev, nameForId);
      if (overlay && overlay === prevOverlay) return false;
    }
  }
  return true;
}

export function enrichReelStepsWithPlayerOverlays<
  T extends {
    momentId: string;
    sourceId: string;
    sourceStartTime: number;
    sourceEndTime: number;
    speed: number;
    repeat: number;
    label?: string;
  },
>(
  steps: T[],
  moments: HighlightMoment[],
  nameForId: (playerId: string) => string | undefined,
): Array<T & { playerOverlay?: string; playerOverlaySec?: number }> {
  const seenTimelineEventIds = new Set<string>();
  return steps.map((step, index) => {
    const moment = moments[index];
    if (!moment || !isGoalAssistMoment(moment)) return step;
    if (!shouldAttachStatInterstitial(
      moment,
      index,
      moments,
      nameForId,
      seenTimelineEventIds,
    )) {
      return step;
    }
    const overlay = formatReelPlayerOverlay(moment, nameForId);
    if (!overlay) return step;
    return {
      ...step,
      playerOverlay: overlay,
      playerOverlaySec: REEL_PLAYER_OVERLAY_SEC,
    };
  });
}
