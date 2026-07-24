import "server-only";

import {
  geminiGenerateObject,
  SYNC_RESULT_JSON_SCHEMA,
} from "@/lib/ai/gemini-rest";
import { planSyncLandmarks } from "@/lib/ai/sync-landmarks";
import {
  aiSyncResultSchema,
  type AiSyncResult,
  type AiTagDraft,
} from "@/lib/ai/tag-schema";

export type SyncAngleSource = {
  sourceId: string;
  videoId: string;
  label: string;
  privacyStatus?: string;
  currentOffsetSec?: number;
};

export type SyncAnglesInput = {
  landmarks: AiTagDraft[];
  primarySourceId: string;
  primaryVideoId: string;
  angles: SyncAngleSource[];
  sport?: string;
};

const SYSTEM = `You align secondary camera angles to a primary tagged soccer game timeline.
You are given landmark events (kickoff, half_end, half_start, goals, full time) with times in PRIMARY video seconds.
Attached videos: primary first, then each secondary angle in the listed order.

For each secondary angle, estimate offsetFromGameTime: seconds added to canonical game time to reach that source's playback time.
Convention: if secondary starts later than primary (missed kickoff), offset is typically larger positive or adjusted so landmarks line up.
If secondary has more pre-game footage, offset may be negative relative to an already-zeroed primary.

Sync anchors (in order):
1. Prefer kickoff on both angles when clearly visible.
2. FALLBACK — if kickoff cannot be found on a secondary (late start, no whistle, wrong end of field, pre-roll only), use second-half half_start as the sync opportunity. Match the primary half_start landmark time to the visible second-half restart on that secondary, then derive offsetFromGameTime from that pair.
3. If neither kickoff nor half_start works, use the clearest shared goal.

Skim visually around the chosen anchor (±2–3 minutes); do not re-tag the whole match.
Return one draft per secondary sourceId. In each draft note, say which anchor you used (kickoff | half_start | goal) and why if you fell back.`;

export async function runSyncAnglesAnalysis(
  input: SyncAnglesInput,
): Promise<AiSyncResult> {
  if (input.angles.length === 0) {
    return { drafts: [], notes: "No secondary angles." };
  }

  const plan = planSyncLandmarks(input.landmarks);
  const landmarksText = plan.landmarks
    .map(
      (d) =>
        `- ${d.kind} @ ${d.tSec}s conf=${d.confidence.toFixed(2)}${d.lowEvidence ? " lowEvidence" : ""} "${d.label}"`,
    )
    .join("\n");

  const userText = [
    `Sport: ${input.sport?.trim() || "soccer"}`,
    `Primary sourceId: ${input.primarySourceId} videoId: ${input.primaryVideoId}`,
    `Preferred anchor: ${plan.preferredAnchor}`,
    plan.guidance,
    "",
    "Landmarks (primary video time):",
    landmarksText || "(none)",
    "",
    "Secondary angles to sync (videos attached after primary, same order):",
    ...input.angles.map(
      (a) =>
        `- sourceId=${a.sourceId} label=${a.label} videoId=${a.videoId} currentOffset=${a.currentOffsetSec ?? 0}`,
    ),
    "",
    "Propose offsetFromGameTime per secondary sourceId as JSON. If kickoff fails on an angle, retry alignment on half_start before giving up.",
  ].join("\n");

  const extraYoutubeVideoIds = input.angles.map((a) => a.videoId).slice(0, 3);

  try {
    const { object } = await geminiGenerateObject({
      modelId: process.env.AI_SYNC_MODEL ?? process.env.AI_TAG_MODEL,
      system: SYSTEM,
      userText,
      youtubeVideoId: input.primaryVideoId,
      extraYoutubeVideoIds,
      schema: aiSyncResultSchema,
      responseJsonSchema: SYNC_RESULT_JSON_SCHEMA,
    });
    return {
      ...object,
      notes: [plan.guidance, object.notes].filter(Boolean).join(" ").slice(0, 500),
    };
  } catch (err) {
    console.warn("[ai/sync-angles] video path failed, text fallback:", err);
    const { object } = await geminiGenerateObject({
      modelId: process.env.AI_SYNC_MODEL ?? process.env.AI_TAG_MODEL,
      system: `${SYSTEM}\nNo video available. Infer rough offsets only if landmarks text allows; otherwise return empty drafts with a note. Still prefer half_start when kickoff is missing.`,
      userText,
      schema: aiSyncResultSchema,
      responseJsonSchema: SYNC_RESULT_JSON_SCHEMA,
    });
    return {
      ...object,
      notes: [plan.guidance, object.notes].filter(Boolean).join(" ").slice(0, 500),
    };
  }
}
