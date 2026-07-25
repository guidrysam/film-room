import type { AiTagDraft } from "@/lib/ai/tag-schema";

/** Conceptual anchors (soccer names); basketball tipoff/period_start/field_goal map here. */
export type SyncAnchorKind = "kickoff" | "half_start" | "goal" | "none";

export type SyncLandmarkPlan = {
  /** Landmarks ordered for the model: anchors first, then verification events. */
  landmarks: AiTagDraft[];
  /** Preferred global anchor when kickoff/tipoff is usable. */
  preferredAnchor: SyncAnchorKind;
  /** Human/model guidance string. */
  guidance: string;
};

const STRUCTURE_KINDS = new Set([
  "kickoff",
  "half_end",
  "half_start",
  "full_time",
  "goal",
  "tipoff",
  "period_end",
  "period_start",
  "field_goal",
  "three_pointer",
]);

const OPENING_KINDS = new Set(["kickoff", "tipoff"]);
const PERIOD_END_KINDS = new Set(["half_end", "period_end"]);
const PERIOD_START_KINDS = new Set(["half_start", "period_start"]);
const SCORING_KINDS = new Set(["goal", "field_goal", "three_pointer"]);

function bestOfKinds(
  landmarks: AiTagDraft[],
  kinds: Set<string>,
): AiTagDraft | null {
  const matches = landmarks.filter((d) => kinds.has(d.kind));
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) =>
    cur.confidence > best.confidence ? cur : best,
  );
}

/**
 * Period/half restart: prefer start after a period/half end; else the latest start.
 */
export function pickSecondHalfStart(
  landmarks: AiTagDraft[],
): AiTagDraft | null {
  const starts = landmarks
    .filter((d) => PERIOD_START_KINDS.has(d.kind))
    .sort((a, b) => a.tSec - b.tSec);
  if (starts.length === 0) return null;

  const periodEnd = bestOfKinds(landmarks, PERIOD_END_KINDS);
  if (periodEnd) {
    const after = starts.filter((d) => d.tSec >= periodEnd.tSec - 30);
    if (after.length > 0) {
      return after.reduce((best, cur) =>
        cur.confidence > best.confidence ? cur : best,
      );
    }
  }
  return starts[starts.length - 1] ?? null;
}

/**
 * Build sync landmarks with opening → period restart → scoring fallback guidance.
 * Works for soccer (kickoff/half_start/goal) and basketball (tipoff/period_start/field_goal).
 */
export function planSyncLandmarks(landmarks: AiTagDraft[]): SyncLandmarkPlan {
  const usable = landmarks.filter(
    (d) => STRUCTURE_KINDS.has(d.kind) && d.confidence >= 0.25,
  );
  const opening = bestOfKinds(usable, OPENING_KINDS);
  const periodStart = pickSecondHalfStart(usable);
  const periodEnd = bestOfKinds(usable, PERIOD_END_KINDS);
  const scores = usable
    .filter((d) => SCORING_KINDS.has(d.kind))
    .sort((a, b) => a.tSec - b.tSec)
    .slice(0, 8);

  const openingUsable =
    opening != null && opening.confidence >= 0.45 && !opening.lowEvidence;

  let preferredAnchor: SyncAnchorKind = "none";
  if (openingUsable) preferredAnchor = "kickoff";
  else if (periodStart) preferredAnchor = "half_start";
  else if (scores[0]) preferredAnchor = "goal";

  const anchors: AiTagDraft[] = [];
  if (opening) anchors.push(opening);
  if (periodStart) anchors.push(periodStart);
  if (periodEnd) anchors.push(periodEnd);
  for (const g of scores) {
    if (!anchors.some((a) => a.kind === g.kind && a.tSec === g.tSec)) {
      anchors.push(g);
    }
  }

  const seen = new Set<string>();
  const ordered: AiTagDraft[] = [];
  for (const d of [...anchors, ...usable.sort((a, b) => a.tSec - b.tSec)]) {
    const key = `${d.kind}:${d.tSec}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(d);
    if (ordered.length >= 20) break;
  }

  const openingName = opening?.kind === "tipoff" ? "tipoff" : "kickoff";
  const restartName =
    periodStart?.kind === "period_start" ? "period_start" : "half_start";
  const scoreName =
    scores[0]?.kind === "field_goal" || scores[0]?.kind === "three_pointer"
      ? "field_goal"
      : "goal";

  const guidanceParts: string[] = [];
  if (preferredAnchor === "kickoff" && opening) {
    guidanceParts.push(
      `Primary sync anchor: ${openingName} @ ${opening.tSec}s (conf ${opening.confidence.toFixed(2)}).`,
    );
    if (periodStart) {
      guidanceParts.push(
        `FALLBACK: if ${openingName} is missing/unclear on a secondary angle (late start, no whistle), align that angle on ${restartName} @ ${periodStart.tSec}s instead. Note the fallback in the draft note.`,
      );
    }
  } else if (preferredAnchor === "half_start" && periodStart) {
    guidanceParts.push(
      `${openingName} unavailable or low-confidence on primary landmarks. Primary sync anchor: ${restartName} @ ${periodStart.tSec}s (conf ${periodStart.confidence.toFixed(2)}).`,
    );
    if (opening) {
      guidanceParts.push(
        `${openingName} draft exists @ ${opening.tSec}s but treat it as weak; prefer ${restartName} unless opening is clearly visible on both angles.`,
      );
    }
  } else if (preferredAnchor === "goal" && scores[0]) {
    guidanceParts.push(
      `No usable ${openingName} or ${restartName}. Align on the clearest ${scoreName} @ ${scores[0].tSec}s and cross-check other scoring events.`,
    );
  } else {
    guidanceParts.push(
      "Few structure landmarks. Use any shared visible events (scoring, period changes) you can confirm visually.",
    );
  }

  return {
    landmarks: ordered,
    preferredAnchor,
    guidance: guidanceParts.join(" "),
  };
}
