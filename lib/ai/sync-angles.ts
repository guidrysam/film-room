import "server-only";

import {
  geminiGenerateObject,
  SYNC_RESULT_JSON_SCHEMA,
} from "@/lib/ai/gemini-rest";
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
You are given landmark events (kickoff, half, goals, full time) with times in PRIMARY video seconds.
For each secondary angle, estimate offsetFromGameTime: seconds added to canonical game time to reach that source's playback time.
Convention: if secondary starts later than primary (missed kickoff), offset is typically larger positive or adjusted so landmarks line up.
If secondary has more pre-game footage, offset may be negative relative to an already-zeroed primary.
Skim visually around landmark times; do not re-tag the whole match.
Return one draft per secondary sourceId.`;

export async function runSyncAnglesAnalysis(
  input: SyncAnglesInput,
): Promise<AiSyncResult> {
  if (input.angles.length === 0) {
    return { drafts: [], notes: "No secondary angles." };
  }

  const landmarksText = input.landmarks
    .slice(0, 20)
    .map(
      (d) =>
        `- ${d.kind} @ ${d.tSec}s conf=${d.confidence.toFixed(2)} "${d.label}"`,
    )
    .join("\n");

  const userText = [
    `Sport: ${input.sport?.trim() || "soccer"}`,
    `Primary sourceId: ${input.primarySourceId} videoId: ${input.primaryVideoId}`,
    "Landmarks (primary video time):",
    landmarksText || "(none)",
    "",
    "Secondary angles to sync:",
    ...input.angles.map(
      (a) =>
        `- sourceId=${a.sourceId} label=${a.label} videoId=${a.videoId} currentOffset=${a.currentOffsetSec ?? 0}`,
    ),
    "",
    "Propose offsetFromGameTime per secondary sourceId as JSON.",
  ].join("\n");

  // Primary + first secondary for visual skim (REST supports multiple file parts).
  try {
    const { object } = await geminiGenerateObject({
      modelId: process.env.AI_SYNC_MODEL ?? process.env.AI_TAG_MODEL,
      system: SYSTEM,
      userText,
      youtubeVideoId: input.primaryVideoId,
      schema: aiSyncResultSchema,
      responseJsonSchema: SYNC_RESULT_JSON_SCHEMA,
    });
    return object;
  } catch (err) {
    console.warn("[ai/sync-angles] video path failed, text fallback:", err);
    const { object } = await geminiGenerateObject({
      modelId: process.env.AI_SYNC_MODEL ?? process.env.AI_TAG_MODEL,
      system: `${SYSTEM}\nNo video available. Infer rough offsets only if landmarks text allows; otherwise return empty drafts with a note.`,
      userText,
      schema: aiSyncResultSchema,
      responseJsonSchema: SYNC_RESULT_JSON_SCHEMA,
    });
    return object;
  }
}
