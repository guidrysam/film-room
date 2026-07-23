import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import {
  aiTagResultSchema,
  type AiTagResult,
} from "@/lib/ai/tag-schema";

export type TagGameInput = {
  videoId: string;
  title?: string;
  description?: string;
  durationSec?: number;
  privacyStatus?: string;
  sport?: string;
  rosterNames?: string[];
  /** Prefer Gemini YouTube URL when public. */
  allowYoutubeUrl?: boolean;
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

const SYSTEM = `You tag youth soccer (football) game film for a coach review timeline.
Primary events only (required focus): kickoff/start, half_end, half_start, full_time, goals.
Bonus kinds (shot, save, coach_mark) only if high confidence.
Timestamps are seconds from the start of THIS video file (not game clock).
Be conservative: omit uncertain events. Prefer fewer high-confidence drafts.
For goals, set opponent=true when the scoring team appears to be the away/opponent side if distinguishable; otherwise omit.
If visual evidence is thin (metadata/captions only), set lowEvidence=true on drafts.
Optionally set suggestedKickoffOffsetSec if recording starts before kickoff (seconds of pre-game footage before kickoff).`;

export async function runTagGameAnalysis(
  input: TagGameInput,
): Promise<AiTagResult> {
  const modelId =
    process.env.AI_TAG_MODEL?.trim() || "gemini-2.5-flash";
  const model = googleModel(modelId);

  const privacy = (input.privacyStatus ?? "").toLowerCase();
  const useYoutubeUrl =
    input.allowYoutubeUrl !== false &&
    (privacy === "public" || privacy === "" || privacy === "unlisted");

  const roster =
    input.rosterNames && input.rosterNames.length > 0
      ? input.rosterNames.slice(0, 40).join(", ")
      : "(unknown)";

  const textPrompt = [
    `Sport: ${input.sport?.trim() || "soccer"}`,
    `Title: ${input.title?.trim() || "(none)"}`,
    `DurationSec: ${input.durationSec ?? "unknown"}`,
    `Privacy: ${privacy || "unknown"}`,
    `Roster names (hints only): ${roster}`,
    input.description?.trim()
      ? `Description:\n${input.description.trim().slice(0, 2000)}`
      : "",
    "",
    "Return structured drafts for primary timeline events.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    if (useYoutubeUrl && input.videoId) {
      const result = await generateObject({
        model,
        schema: aiTagResultSchema,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: textPrompt },
              {
                type: "file",
                data: new URL(youtubeWatchUrl(input.videoId)),
                mediaType: "video/mp4",
              },
            ],
          },
        ],
      });
      return result.object;
    }
  } catch (err) {
    // Fall through to metadata-only if YouTube URL path fails (unlisted/private/API).
    console.warn("[ai/tag-game] YouTube URL path failed, falling back:", err);
  }

  const result = await generateObject({
    model,
    schema: aiTagResultSchema,
    system: `${SYSTEM}\nYou do NOT have video pixels. Use title/description/duration only. Mark lowEvidence=true on all drafts. Only emit events you can justify from text.`,
    prompt: textPrompt,
  });

  return {
    ...result.object,
    drafts: result.object.drafts.map((d) => ({ ...d, lowEvidence: true })),
  };
}
