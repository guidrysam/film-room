import type { AiTagDraft } from "@/lib/ai/tag-schema";

export type SyncAnchorKind = "kickoff" | "half_start" | "goal" | "none";

export type SyncLandmarkPlan = {
  /** Landmarks ordered for the model: anchors first, then verification events. */
  landmarks: AiTagDraft[];
  /** Preferred global anchor when kickoff is usable. */
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
]);

function bestOfKind(
  landmarks: AiTagDraft[],
  kind: AiTagDraft["kind"],
): AiTagDraft | null {
  const matches = landmarks.filter((d) => d.kind === kind);
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) =>
    cur.confidence > best.confidence ? cur : best,
  );
}

/**
 * Second-half restart: prefer half_start after half_end; else the latest half_start.
 */
export function pickSecondHalfStart(
  landmarks: AiTagDraft[],
): AiTagDraft | null {
  const halfStarts = landmarks
    .filter((d) => d.kind === "half_start")
    .sort((a, b) => a.tSec - b.tSec);
  if (halfStarts.length === 0) return null;

  const halfEnd = bestOfKind(landmarks, "half_end");
  if (halfEnd) {
    const after = halfStarts.filter((d) => d.tSec >= halfEnd.tSec - 30);
    if (after.length > 0) {
      return after.reduce((best, cur) =>
        cur.confidence > best.confidence ? cur : best,
      );
    }
  }
  return halfStarts[halfStarts.length - 1] ?? null;
}

/**
 * Build sync landmarks with kickoff → second-half start fallback guidance.
 */
export function planSyncLandmarks(landmarks: AiTagDraft[]): SyncLandmarkPlan {
  const usable = landmarks.filter(
    (d) => STRUCTURE_KINDS.has(d.kind) && d.confidence >= 0.25,
  );
  const kickoff = bestOfKind(usable, "kickoff");
  const halfStart = pickSecondHalfStart(usable);
  const halfEnd = bestOfKind(usable, "half_end");
  const goals = usable
    .filter((d) => d.kind === "goal")
    .sort((a, b) => a.tSec - b.tSec)
    .slice(0, 8);

  const kickoffUsable =
    kickoff != null && kickoff.confidence >= 0.45 && !kickoff.lowEvidence;

  let preferredAnchor: SyncAnchorKind = "none";
  if (kickoffUsable) preferredAnchor = "kickoff";
  else if (halfStart) preferredAnchor = "half_start";
  else if (goals[0]) preferredAnchor = "goal";

  const anchors: AiTagDraft[] = [];
  if (kickoff) anchors.push(kickoff);
  if (halfStart) anchors.push(halfStart);
  if (halfEnd) anchors.push(halfEnd);
  for (const g of goals) {
    if (!anchors.some((a) => a.kind === g.kind && a.tSec === g.tSec)) {
      anchors.push(g);
    }
  }

  // Dedupe by kind+tSec while keeping order; fill with remaining structure if sparse.
  const seen = new Set<string>();
  const ordered: AiTagDraft[] = [];
  for (const d of [...anchors, ...usable.sort((a, b) => a.tSec - b.tSec)]) {
    const key = `${d.kind}:${d.tSec}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(d);
    if (ordered.length >= 20) break;
  }

  const guidanceParts: string[] = [];
  if (preferredAnchor === "kickoff" && kickoff) {
    guidanceParts.push(
      `Primary sync anchor: kickoff @ ${kickoff.tSec}s (conf ${kickoff.confidence.toFixed(2)}).`,
    );
    if (halfStart) {
      guidanceParts.push(
        `FALLBACK: if kickoff is missing/unclear on a secondary angle (late start, no whistle, wrong end), align that angle on second-half half_start @ ${halfStart.tSec}s instead. Note the fallback in the draft note.`,
      );
    }
  } else if (preferredAnchor === "half_start" && halfStart) {
    guidanceParts.push(
      `Kickoff unavailable or low-confidence on primary landmarks. Primary sync anchor: second-half half_start @ ${halfStart.tSec}s (conf ${halfStart.confidence.toFixed(2)}).`,
    );
    if (kickoff) {
      guidanceParts.push(
        `Kickoff draft exists @ ${kickoff.tSec}s but treat it as weak; prefer half_start unless kickoff is clearly visible on both angles.`,
      );
    }
  } else if (preferredAnchor === "goal" && goals[0]) {
    guidanceParts.push(
      `No usable kickoff or half_start. Align on the clearest goal @ ${goals[0].tSec}s and cross-check other goals.`,
    );
  } else {
    guidanceParts.push(
      "Few structure landmarks. Use any shared visible events (goals, half changes) you can confirm visually.",
    );
  }

  return {
    landmarks: ordered,
    preferredAnchor,
    guidance: guidanceParts.join(" "),
  };
}
