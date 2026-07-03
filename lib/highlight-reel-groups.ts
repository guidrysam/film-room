import type {
  AddHighlightMomentInput,
  HighlightMoment,
} from "@/lib/highlight-draft";
import type { GameTimelineEvent } from "@/lib/games";
import { highlightMomentsFromGameMark } from "@/lib/highlight-from-marks";
import {
  generatePresetMoments,
  type HighlightPresetId,
} from "@/lib/highlight-presets";

/** One coach-mark event in the reel (may contain live + replay beats). */
export type ReelMomentGroup = {
  startIndex: number;
  moments: HighlightMoment[];
  timelineEventId?: string;
};

/** Group consecutive moments that share a timeline event id. */
export function groupHighlightMoments(
  moments: HighlightMoment[],
): ReelMomentGroup[] {
  const groups: ReelMomentGroup[] = [];
  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i]!;
    const eventId = moment.timelineEventId?.trim();
    const prev = groups[groups.length - 1];
    if (
      eventId &&
      prev?.timelineEventId === eventId &&
      prev.startIndex + prev.moments.length === i
    ) {
      prev.moments.push(moment);
      continue;
    }
    groups.push({
      startIndex: i,
      moments: [moment],
      ...(eventId ? { timelineEventId: eventId } : {}),
    });
  }
  return groups;
}

export function countReelEventGroups(moments: HighlightMoment[]): number {
  return groupHighlightMoments(moments).length;
}

export function isMultiBeatReelGroup(group: ReelMomentGroup): boolean {
  return group.moments.length > 1;
}

export function reelGroupDisplayLabel(group: ReelMomentGroup): string {
  const primary = group.moments[0];
  return primary?.label?.trim() || "Highlight";
}

export function reelGroupStyleLabel(group: ReelMomentGroup): string | null {
  if (!isMultiBeatReelGroup(group)) return null;
  const replayish = group.moments.slice(1).every(
    (m) => (m.speed ?? 1) < 1 || /replay|slow/i.test(m.label ?? ""),
  );
  if (replayish && group.moments.length === 2) return "Live + replay";
  if (group.moments.length === 2) return "2 beats";
  return `${group.moments.length} beats`;
}

/** Swap two adjacent event groups in the flattened moment list. */
export function moveReelMomentGroup(
  moments: HighlightMoment[],
  groupIndex: number,
  dir: -1 | 1,
): HighlightMoment[] | null {
  const groups = groupHighlightMoments(moments);
  const target = groupIndex + dir;
  if (target < 0 || target >= groups.length) return null;
  const nextGroups = [...groups];
  [nextGroups[groupIndex], nextGroups[target]] = [
    nextGroups[target]!,
    nextGroups[groupIndex]!,
  ];
  return nextGroups.flatMap((g) => g.moments);
}

/** Remove every beat in an event group. */
export function removeReelMomentGroup(
  moments: HighlightMoment[],
  group: ReelMomentGroup,
): HighlightMoment[] {
  const ids = new Set(group.moments.map((m) => m.id));
  return moments.filter((m) => !ids.has(m.id));
}

/** Apply a patch to every beat in a group (e.g. shared angle). */
export function patchReelMomentGroup(
  moments: HighlightMoment[],
  group: ReelMomentGroup,
  patch: Partial<HighlightMoment>,
): HighlightMoment[] {
  const ids = new Set(group.moments.map((m) => m.id));
  return moments.map((m) => (ids.has(m.id) ? { ...m, ...patch } : m));
}

/** Best-effort preset id for an existing event group (for the style dropdown). */
export function inferReelGroupPresetId(group: ReelMomentGroup): HighlightPresetId {
  const beats = group.moments;
  if (beats.length === 1) {
    const m = beats[0]!;
    if ((m.repeat ?? 1) >= 3) return "loop";
    return "single";
  }
  if (beats.length === 2) {
    const [live, replay] = beats;
    if (
      live!.activeSourceId === replay!.activeSourceId &&
      (replay!.speed ?? 1) < 1
    ) {
      return "replay";
    }
    if (
      live!.activeSourceId !== replay!.activeSourceId &&
      (live!.speed ?? 1) === 1 &&
      (replay!.speed ?? 1) === 1
    ) {
      return "every_angle";
    }
    return "single";
  }

  const speeds = beats.map((m) => m.speed ?? 1);
  if ((speeds[0] ?? 1) === 1 && speeds.slice(1).every((s) => s < 1)) {
    return "showcase";
  }
  if (speeds.every((s) => s === 1)) return "every_angle";
  return "replay";
}

export type RegenerateReelGroupPresetOpts = {
  playableSourceIds: string[];
  primarySourceId: string;
  /** When the group came from a coach mark / stat / tag. */
  event?: GameTimelineEvent | null;
};

/**
 * Rebuild segment inputs for a reel event group with a new highlight preset.
 * Keeps game time, trim window, label, players, and timeline link.
 */
export function regenerateReelGroupPresetInputs(
  group: ReelMomentGroup,
  presetId: HighlightPresetId,
  opts: RegenerateReelGroupPresetOpts,
): AddHighlightMomentInput[] {
  const primary = group.moments[0]!;
  const label = reelGroupDisplayLabel(group);
  const primarySourceId =
    primary.activeSourceId?.trim() ||
    opts.primarySourceId ||
    opts.playableSourceIds[0] ||
    "";

  if (group.timelineEventId && opts.event) {
    const inputs = highlightMomentsFromGameMark(opts.event, {
      primarySourceId,
      playableSourceIds: opts.playableSourceIds,
      presetId,
      startOffsetSec: primary.startOffsetSec,
      endOffsetSec: primary.endOffsetSec,
    });
    if (inputs.length === 0) return [];
    if (label && label !== "Highlight") {
      inputs[0] = { ...inputs[0]!, label };
    }
    return inputs;
  }

  const inputs = generatePresetMoments(
    presetId,
    {
      gameTime: primary.gameTime,
      startOffsetSec: primary.startOffsetSec,
      endOffsetSec: primary.endOffsetSec,
      primarySourceId,
      label,
      ...(primary.playerIds?.length ? { playerIds: primary.playerIds } : {}),
      ...(primary.goalPlayerIds?.length
        ? { goalPlayerIds: primary.goalPlayerIds }
        : {}),
      ...(primary.assistPlayerIds?.length
        ? { assistPlayerIds: primary.assistPlayerIds }
        : {}),
    },
    opts.playableSourceIds,
  );

  return inputs.map((moment) => ({
    ...moment,
    ...(group.timelineEventId
      ? { timelineEventId: group.timelineEventId }
      : {}),
  }));
}

/** Replace one event group's beats in the flattened moment list. */
export function replaceReelMomentGroup(
  moments: HighlightMoment[],
  group: ReelMomentGroup,
  replacement: HighlightMoment[],
): HighlightMoment[] {
  const before = moments.slice(0, group.startIndex);
  const after = moments.slice(group.startIndex + group.moments.length);
  return [...before, ...replacement, ...after];
}
