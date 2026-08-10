import type { AiTagKind } from "@/lib/ai/tag-schema";

/** Mark already on the game timeline used as a prior for AI Tag. */
export type TagAnchorHint = {
  /** Absolute time on the video being tagged (source time). */
  tSec: number;
  kind: AiTagKind;
  label: string;
  /** Origin for prompt wording / UI. */
  source: "gamecap" | "timeline";
};

type TimelineEventLike = {
  id?: string;
  type?: string;
  t?: number;
  label?: string;
  sourceId?: string;
  payload?: Record<string, unknown> | null;
};

const GAMECAP_TO_KIND: Record<string, AiTagKind> = {
  goal: "goal",
  ownGoal: "goal",
  shot: "shot",
  save: "save",
  corner: "corner",
  foul: "foul",
  kickoff: "kickoff",
  half: "half_end",
  highlight: "coach_mark",
  madeBasket: "field_goal",
  missedBasket: "shot",
  threePointer: "three_pointer",
  freeThrow: "shot",
  rebound: "rebound",
  assist: "assist",
  steal: "steal",
  block: "block",
  turnover: "turnover",
  tipoff: "tipoff",
};

const LABEL_TO_KIND: Record<string, AiTagKind> = {
  goal: "goal",
  "own goal": "goal",
  shot: "shot",
  save: "save",
  corner: "corner",
  foul: "foul",
  kickoff: "kickoff",
  half: "half_end",
  "half end": "half_end",
  "half start": "half_start",
  "full time": "full_time",
  assist: "assist",
  "great play": "offensive_opportunity",
  "other team goal": "goal",
  "other team corner": "corner",
  tipoff: "tipoff",
  "field goal": "field_goal",
  "three pointer": "three_pointer",
  rebound: "rebound",
  steal: "steal",
  block: "block",
  turnover: "turnover",
};

function kindFromEvent(ev: TimelineEventLike): AiTagKind {
  const payload =
    ev.payload && typeof ev.payload === "object"
      ? (ev.payload as Record<string, unknown>)
      : {};
  const gameCapType =
    typeof payload.gameCapType === "string" ? payload.gameCapType.trim() : "";
  if (gameCapType && GAMECAP_TO_KIND[gameCapType]) {
    return GAMECAP_TO_KIND[gameCapType];
  }
  const label =
    typeof ev.label === "string" ? ev.label.trim().toLowerCase() : "";
  if (label && LABEL_TO_KIND[label]) return LABEL_TO_KIND[label];
  if (typeof ev.type === "string" && ev.type === "stat") {
    const st =
      typeof payload.statType === "string"
        ? payload.statType.trim().toLowerCase()
        : "";
    if (st && LABEL_TO_KIND[st]) return LABEL_TO_KIND[st];
  }
  return "coach_mark";
}

function isUsableTimelineEvent(ev: TimelineEventLike): boolean {
  if (typeof ev.t !== "number" || !Number.isFinite(ev.t) || ev.t < 0) {
    return false;
  }
  const type = typeof ev.type === "string" ? ev.type : "";
  // Skip sync metadata / layout noise.
  if (type === "sync_point" || type === "layout" || type === "camera_switch") {
    return false;
  }
  return true;
}

/**
 * Build absolute source-time anchors from existing game events (Game Cap
 * sidecar imports + coach tags). Game time → source time via offset.
 */
export function buildTagAnchorHints(
  events: TimelineEventLike[],
  opts: {
    /** Seconds added to game time to reach the tagged source's playback time. */
    sourceOffsetFromGameTime?: number;
    max?: number;
  } = {},
): TagAnchorHint[] {
  const offset =
    typeof opts.sourceOffsetFromGameTime === "number" &&
    Number.isFinite(opts.sourceOffsetFromGameTime)
      ? opts.sourceOffsetFromGameTime
      : 0;
  const max = opts.max ?? 100;

  const out: TagAnchorHint[] = [];
  for (const ev of events) {
    if (!isUsableTimelineEvent(ev)) continue;
    const tSec = Math.max(0, Math.round((Number(ev.t) + offset) * 10) / 10);
    const payload =
      ev.payload && typeof ev.payload === "object"
        ? (ev.payload as Record<string, unknown>)
        : {};
    const fromGameCap =
      payload.importedFrom === "gamecap_sidecar" ||
      typeof payload.gameCapType === "string";
    const kind = kindFromEvent(ev);
    const label =
      (typeof ev.label === "string" && ev.label.trim()) ||
      (typeof payload.gameCapType === "string"
        ? String(payload.gameCapType)
        : kind);
    out.push({
      tSec,
      kind,
      label,
      source: fromGameCap ? "gamecap" : "timeline",
    });
    // Prefer original press time for goal dedupe when lookback shifted `t`.
    const markedAt =
      typeof payload.markedAtSec === "number" &&
      Number.isFinite(payload.markedAtSec)
        ? Math.max(0, payload.markedAtSec)
        : null;
    if (
      markedAt != null &&
      Math.abs(markedAt - tSec) > 0.5 &&
      (kind === "goal" ||
        kind === "field_goal" ||
        kind === "three_pointer")
    ) {
      out.push({
        tSec: markedAt,
        kind,
        label: `${label} (mark)`,
        source: fromGameCap ? "gamecap" : "timeline",
      });
    }
  }

  out.sort((a, b) => a.tSec - b.tSec);
  return out.slice(0, max);
}

/** Marks that fall inside a tag window (with small padding). */
export function anchorsInWindow(
  anchors: TagAnchorHint[],
  startSec: number,
  endSec: number,
  padSec = 5,
): TagAnchorHint[] {
  const lo = startSec - padSec;
  const hi = endSec + padSec;
  return anchors.filter((a) => a.tSec >= lo && a.tSec <= hi);
}

/** Prompt block: absolute + clip-relative times for the current window. */
export function formatAnchorsForPrompt(
  anchors: TagAnchorHint[],
  windowStartSec: number,
): string {
  if (anchors.length === 0) {
    return "Known coach/Game Cap marks in this window: (none)";
  }
  const lines = anchors.map((a) => {
    const rel = Math.max(0, Math.round((a.tSec - windowStartSec) * 10) / 10);
    const origin = a.source === "gamecap" ? "gamecap" : "coach";
    return `- tSec=${rel} (abs ${a.tSec}) kind=${a.kind} label="${a.label}" [${origin}]`;
  });
  return [
    "Known coach/Game Cap marks in this window (trusted priors — times are relative to clip start):",
    ...lines,
    "Use these as strong priors: include matching drafts near these times (±~3s) when the video agrees.",
    "Do NOT invent extra copies of the same mark. Still add other clear events you see that are missing from the list.",
    "If a prior looks wrong after watching, prefer what you see and note the conflict briefly in notes.",
  ].join("\n");
}
