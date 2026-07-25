import "server-only";

import {
  geminiTagGame,
} from "@/lib/ai/gemini-rest";
import {
  GEMINI_YOUTUBE_PUBLIC_REQUIRED,
  geminiCanWatchYoutubePrivacy,
  youtubePrivacyBlockReason,
} from "@/lib/ai/youtube-gemini-access";
import {
  mergeTagWindowResults,
  planTagWindows,
  shiftDraftsToVideoTime,
} from "@/lib/ai/tag-windows";
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

You are given a CLIPPED window of the match (see window start/end in the user prompt).
Watch that window carefully — not just kickoff/goals. Keep tagging as play develops.

PRIMARY (always include when visible in this window):
- kickoff, half_end, half_start (second-half restart), full_time
- every goal (both teams)

EXTENDED — include generously when you can see them (confidence ≥ ~0.45 is fine; coaches will approve/reject):
- shot — any attempt toward goal (on or off target), including blocked shots
- save — goalkeeper or desperate block of a shot
- corner — corner kick awarded or taken
- defensive_stop — tackle, interception, or clear block that ends a dangerous attack
- offensive_opportunity — clear chance (through ball, 1v1, overload in final third)
- turnover — meaningful possession loss that flips the attack

Use coach_mark only for other high-value teaching moments that do not fit above.
IMPORTANT: tSec must be seconds from the START OF THIS CLIP (0 = clip start), not wall-clock and not full-file time.
Within a ~30–45 minute window expect STRUCTURE (if present) + ALL goals + a dense set of EXTENDED events (often 12–40 drafts for that half). Prefer missing fewer clear shots/corners/saves over being sparse.
Do NOT emit routine passes, throw-ins, or every stoppage — only coach-useful moments.
For goals/shots/corners, set opponent=true when the event belongs to the away/opponent side if distinguishable.
If a moment is a bit uncertain, still include it with a lower confidence and/or lowEvidence=true rather than omitting it.
Optionally set suggestedKickoffOffsetSec only when this clip includes pre-game footage before kickoff.
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

  const windows = planTagWindows(input.durationSec);
  const baseMeta = [
    `Sport: ${input.sport?.trim() || "soccer"}`,
    `Title: ${input.title?.trim() || "(none)"}`,
    `FullDurationSec: ${input.durationSec ?? "unknown"}`,
    `Privacy: ${privacy || "unknown"}`,
    `Roster names (hints only): ${roster}`,
    input.description?.trim()
      ? `Description:\n${input.description.trim().slice(0, 2000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const windowParts: Array<{ drafts: AiTagResult["drafts"]; notes?: string }> =
      [];
    let modelId: string | undefined;

    for (const window of windows) {
      const userText = [
        baseMeta,
        "",
        `Window: ${window.label}`,
        `ClipStartSec (absolute in full video): ${window.startSec}`,
        `ClipEndSec (absolute in full video): ${window.endSec}`,
        `Clip duration ≈ ${Math.round((window.endSec - window.startSec) / 60)} minutes.`,
        "Return PRIMARY structure (if visible) + ALL goals + EXTENDED shots/saves/corners/stops/chances/turnovers in THIS clip.",
        "tSec is relative to clip start (0 = first frame of this clip).",
        "You MUST watch the attached YouTube clip. Do not invent timestamps from duration alone.",
      ].join("\n");

      const { object, modelId: mid } = await geminiTagGame({
        system: SYSTEM,
        userText,
        youtubeVideoId: input.videoId,
        videoClip: {
          startSec: window.startSec,
          endSec: window.endSec,
        },
      });
      modelId = mid;
      windowParts.push({
        drafts: shiftDraftsToVideoTime(object.drafts, window.startSec),
        notes: object.notes
          ? `${window.label}: ${object.notes}`
          : `${window.label}: ${object.drafts.length} drafts`,
      });
    }

    const merged = mergeTagWindowResults(windowParts);
    if (looksLikeDurationOnlyStructure(merged)) {
      throw new Error(
        "AI could not see the YouTube video pixels (often unlisted/private, or Gemini YouTube ingest failed). " +
          GEMINI_YOUTUBE_PUBLIC_REQUIRED,
      );
    }

    const passNote =
      windows.length > 1
        ? `Tagged in ${windows.length} half-windows for denser coverage.`
        : undefined;
    return {
      ...merged,
      notes: [passNote, merged.notes].filter(Boolean).join(" ").slice(0, 500),
      modelId,
      watchedVideo: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/token count exceeds|maximum number of tokens/i.test(msg)) {
      throw new Error(
        "This game film is too long for one AI pass at current settings. Try a shorter clip, or tag after the next deploy.",
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
