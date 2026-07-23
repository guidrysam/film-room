import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
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

function googleModel(modelId: string) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MISSING_AI_API_KEY");
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google(modelId);
}

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

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

  const modelId =
    process.env.AI_SYNC_MODEL?.trim() ||
    process.env.AI_TAG_MODEL?.trim() ||
    "gemini-2.5-flash";
  const model = googleModel(modelId);

  const landmarksText = input.landmarks
    .slice(0, 20)
    .map(
      (d) =>
        `- ${d.kind} @ ${d.tSec}s conf=${d.confidence.toFixed(2)} "${d.label}"`,
    )
    .join("\n");

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: URL; mediaType: string }
  > = [
    {
      type: "text",
      text: [
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
        "Watch primary + each secondary (skim). Propose offsetFromGameTime per secondary sourceId.",
      ].join("\n"),
    },
    {
      type: "file",
      data: new URL(youtubeWatchUrl(input.primaryVideoId)),
      mediaType: "video/mp4",
    },
  ];

  for (const angle of input.angles.slice(0, 5)) {
    content.push({
      type: "text",
      text: `Secondary angle sourceId=${angle.sourceId} (${angle.label}):`,
    });
    content.push({
      type: "file",
      data: new URL(youtubeWatchUrl(angle.videoId)),
      mediaType: "video/mp4",
    });
  }

  try {
    const result = await generateObject({
      model,
      schema: aiSyncResultSchema,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    return result.object;
  } catch (err) {
    console.warn("[ai/sync-angles] video path failed, text fallback:", err);
    const result = await generateObject({
      model,
      schema: aiSyncResultSchema,
      system: `${SYSTEM}\nNo video available. Infer rough offsets only if landmarks text allows; otherwise return empty drafts with a note.`,
      prompt: content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n"),
    });
    return result.object;
  }
}
