import "server-only";

import {
  geminiTagGame,
} from "@/lib/ai/gemini-rest";
import type { AiTagResult } from "@/lib/ai/tag-schema";

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

const SYSTEM = `You tag youth soccer (football) game film for a coach review timeline.

PRIMARY (always try): kickoff/start, half_end, half_start, full_time, goals.

EXTENDED (include when confidence ≥ ~0.6 and visually clear):
- shot — attempt on goal (on or off target)
- save — goalkeeper or last-ditch block of a shot
- corner — corner kick awarded / taken
- defensive_stop — clear tackle, interception, or block that ends a dangerous attack
- offensive_opportunity — clear chance created (through ball, 1v1, overload in final third) even if no shot
- turnover — possession lost in a meaningful way (giveaway under pressure, misplaced pass that flips attack)

Use coach_mark only for other high-value moments that do not fit above.
Timestamps are seconds from the start of THIS video file (not game clock).
Be conservative: omit uncertain events. Prefer fewer high-confidence drafts over noisy play-by-play.
For goals/shots/corners, set opponent=true when the event belongs to the away/opponent side if distinguishable.
If visual evidence is thin (metadata/captions only), set lowEvidence=true on drafts and keep EXTENDED sparse.
Optionally set suggestedKickoffOffsetSec if recording starts before kickoff (seconds of pre-game footage before kickoff).`;

export async function runTagGameAnalysis(
  input: TagGameInput,
): Promise<AiTagResult & { modelId?: string }> {
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
    "Return structured JSON drafts for PRIMARY + clear EXTENDED events (shots, saves, corners, defensive stops, offensive opportunities, turnovers).",
  ]
    .filter(Boolean)
    .join("\n");

  if (useYoutubeUrl && input.videoId) {
    try {
      const { object, modelId } = await geminiTagGame({
        system: SYSTEM,
        userText: textPrompt,
        youtubeVideoId: input.videoId,
      });
      return { ...object, modelId };
    } catch (err) {
      console.warn("[ai/tag-game] YouTube URL path failed, falling back:", err);
    }
  }

  const { object, modelId } = await geminiTagGame({
    system: `${SYSTEM}\nYou do NOT have video pixels. Use title/description/duration only. Mark lowEvidence=true on all drafts. Only emit events you can justify from text.`,
    userText: textPrompt,
  });

  return {
    ...object,
    modelId,
    drafts: object.drafts.map((d) => ({ ...d, lowEvidence: true })),
  };
}
