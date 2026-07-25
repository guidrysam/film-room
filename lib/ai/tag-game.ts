import "server-only";

import {
  geminiTagGame,
} from "@/lib/ai/gemini-rest";
import {
  GEMINI_YOUTUBE_PUBLIC_REQUIRED,
  geminiCanWatchYoutubePrivacy,
  youtubePrivacyBlockReason,
} from "@/lib/ai/youtube-gemini-access";
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

Watch the FULL video timeline (not just kickoff/goals). Work half-by-half and keep tagging as play develops.

PRIMARY (always include when visible):
- kickoff, half_end, half_start (second-half restart), full_time
- every goal (both teams)
half_start is especially important — angle sync falls back to it when kickoff is missing or unclear on another camera.

EXTENDED — include generously when you can see them (confidence ≥ ~0.45 is fine; coaches will approve/reject):
- shot — any attempt toward goal (on or off target), including blocked shots that leave the shooter
- save — goalkeeper or desperate block of a shot
- corner — corner kick awarded or taken
- defensive_stop — tackle, interception, or clear block that ends a dangerous attack
- offensive_opportunity — clear chance (through ball, 1v1, overload in final third) even without a shot
- turnover — meaningful possession loss that flips the attack

Use coach_mark only for other high-value teaching moments that do not fit above.
Timestamps are seconds from the start of THIS video file (not game clock).
For a typical 60–90 minute youth match, expect STRUCTURE + ALL goals + a dense set of EXTENDED events (often 25–80 drafts total). Prefer missing fewer clear shots/corners/saves over being sparse.
Do NOT emit routine passes, throw-ins, or every stoppage — only coach-useful moments.
For goals/shots/corners, set opponent=true when the event belongs to the away/opponent side if distinguishable.
If a moment is a bit uncertain, still include it with a lower confidence and/or lowEvidence=true rather than omitting it.
Optionally set suggestedKickoffOffsetSec if recording starts before kickoff (seconds of pre-game footage before kickoff).
Sort drafts by ascending tSec.`;

function looksLikeDurationOnlyStructure(result: AiTagResult): boolean {
  if (result.drafts.length === 0) return true;
  const allLow = result.drafts.every((d) => d.lowEvidence);
  const onlyStructure = result.drafts.every((d) =>
    ["kickoff", "half_end", "half_start", "full_time"].includes(d.kind),
  );
  const note = (result.notes ?? "").toLowerCase();
  const noteSaysGuess =
    /duration|lowEvidence|no video|without (watching|pixels|video)|standard match structure/i.test(
      note,
    );
  return allLow && onlyStructure && (noteSaysGuess || result.drafts.length <= 5);
}

export async function runTagGameAnalysis(
  input: TagGameInput,
): Promise<AiTagResult & { modelId?: string; watchedVideo: boolean }> {
  const privacy = (input.privacyStatus ?? "").toLowerCase();
  const wantYoutube =
    input.allowYoutubeUrl !== false && Boolean(input.videoId);

  if (!wantYoutube) {
    throw new Error(GEMINI_YOUTUBE_PUBLIC_REQUIRED);
  }

  if (!geminiCanWatchYoutubePrivacy(privacy)) {
    throw new Error(
      youtubePrivacyBlockReason(privacy, input.title) ??
        GEMINI_YOUTUBE_PUBLIC_REQUIRED,
    );
  }

  const roster =
    input.rosterNames && input.rosterNames.length > 0
      ? input.rosterNames.slice(0, 40).join(", ")
      : "(unknown)";

  const durationHint =
    typeof input.durationSec === "number" && input.durationSec > 0
      ? `Scan the full ${Math.round(input.durationSec / 60)} minutes.`
      : "Scan the full match duration.";

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
    `${durationHint} Return PRIMARY structure + ALL goals + EXTENDED shots/saves/corners/stops/chances/turnovers throughout — not goals alone.`,
    "You MUST watch the attached YouTube video. Do not invent timestamps from duration alone.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { object, modelId } = await geminiTagGame({
      system: SYSTEM,
      userText: textPrompt,
      youtubeVideoId: input.videoId,
    });

    if (looksLikeDurationOnlyStructure(object)) {
      throw new Error(
        "AI could not see the YouTube video pixels (often unlisted/private, or Gemini YouTube ingest failed). " +
          GEMINI_YOUTUBE_PUBLIC_REQUIRED,
      );
    }

    return { ...object, modelId, watchedVideo: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/token count exceeds|maximum number of tokens/i.test(msg)) {
      throw new Error(
        "This game film is too long for one AI pass at current settings. Try again after the next deploy, or tag a shorter clip.",
      );
    }
    if (/public YouTube|unlisted|private|could not see the YouTube/i.test(msg)) {
      throw err instanceof Error ? err : new Error(msg);
    }
    console.warn("[ai/tag-game] YouTube watch failed:", err);
    throw new Error(
      `AI could not watch this YouTube video (${msg}). ${GEMINI_YOUTUBE_PUBLIC_REQUIRED}`,
    );
  }
}
