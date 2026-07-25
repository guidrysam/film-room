import "server-only";

import {
  geminiGenerateObject,
  SYNC_RESULT_JSON_SCHEMA,
} from "@/lib/ai/gemini-rest";
import { planSyncLandmarks } from "@/lib/ai/sync-landmarks";
import {
  GEMINI_YOUTUBE_PUBLIC_REQUIRED,
  geminiCanWatchYoutubePrivacy,
  youtubePrivacyBlockReason,
} from "@/lib/ai/youtube-gemini-access";
import {
  aiSyncResultSchema,
  type AiSyncDraft,
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
  primaryPrivacyStatus?: string;
  angles: SyncAngleSource[];
  sport?: string;
};

const SYSTEM = `You align ONE secondary camera angle to a primary tagged soccer game timeline.
You are given landmark events (kickoff, half_end, half_start, goals, full time) with times in PRIMARY video seconds.
Attached videos: primary first, then the single secondary angle.

Estimate offsetFromGameTime: seconds added to canonical game time to reach that source's playback time.
Convention: if secondary starts later than primary (missed kickoff), offset is typically larger positive or adjusted so landmarks line up.
If secondary has more pre-game footage, offset may be negative relative to an already-zeroed primary.

Sync anchors (in order):
1. Prefer kickoff on both angles when clearly visible.
2. FALLBACK — if kickoff cannot be found on the secondary (late start, no whistle, wrong end of field, pre-roll only), use second-half half_start as the sync opportunity. Match the primary half_start landmark time to the visible second-half restart on that secondary, then derive offsetFromGameTime from that pair.
3. If neither kickoff nor half_start works, use the clearest shared goal.

You MUST watch both attached YouTube videos. Do not invent offsets.
Skim visually around the chosen anchor (±2–3 minutes); do not re-tag the whole match.
Return exactly one draft for the secondary sourceId. In the draft note, say which anchor you used (kickoff | half_start | goal).
If you cannot see video pixels, return confidence 0 and explain — do not guess.`;

function assertPublicForGemini(
  privacy: string | undefined,
  label: string,
): void {
  if (geminiCanWatchYoutubePrivacy(privacy)) return;
  throw new Error(
    youtubePrivacyBlockReason(privacy, label) ?? GEMINI_YOUTUBE_PUBLIC_REQUIRED,
  );
}

async function syncOneAngle(input: {
  landmarksText: string;
  guidance: string;
  preferredAnchor: string;
  primarySourceId: string;
  primaryVideoId: string;
  angle: SyncAngleSource;
  sport?: string;
}): Promise<AiSyncDraft> {
  const userText = [
    `Sport: ${input.sport?.trim() || "soccer"}`,
    `Primary sourceId: ${input.primarySourceId} videoId: ${input.primaryVideoId}`,
    `Preferred anchor: ${input.preferredAnchor}`,
    input.guidance,
    "",
    "Landmarks (primary video time):",
    input.landmarksText || "(none)",
    "",
    "Secondary angle to sync (second attached video):",
    `- sourceId=${input.angle.sourceId} label=${input.angle.label} videoId=${input.angle.videoId} currentOffset=${input.angle.currentOffsetSec ?? 0}`,
    "",
    "Propose offsetFromGameTime for this secondary sourceId as JSON. If kickoff fails, retry alignment on half_start before giving up.",
  ].join("\n");

  const { object } = await geminiGenerateObject({
    modelId: process.env.AI_SYNC_MODEL ?? process.env.AI_TAG_MODEL,
    system: SYSTEM,
    userText,
    youtubeVideoId: input.primaryVideoId,
    extraYoutubeVideoIds: [input.angle.videoId],
    schema: aiSyncResultSchema,
    responseJsonSchema: SYNC_RESULT_JSON_SCHEMA,
  });

  const draft =
    object.drafts.find((d) => d.sourceId === input.angle.sourceId) ??
    object.drafts[0];
  if (!draft) {
    throw new Error(
      `AI Sync returned no offset for ${input.angle.label}. ${object.notes ?? ""}`.trim(),
    );
  }

  const note = (draft.note ?? object.notes ?? "").toLowerCase();
  if (
    draft.confidence < 0.2 ||
    /no video|without video|cannot see|could not see|unable to confirm/i.test(
      note,
    )
  ) {
    throw new Error(
      `AI Sync could not watch or align "${input.angle.label}"` +
        (draft.note ? `: ${draft.note}` : ".") +
        ` ${GEMINI_YOUTUBE_PUBLIC_REQUIRED}`,
    );
  }

  return {
    ...draft,
    sourceId: input.angle.sourceId,
  };
}

export async function runSyncAnglesAnalysis(
  input: SyncAnglesInput,
): Promise<AiSyncResult> {
  if (input.angles.length === 0) {
    return { drafts: [], notes: "No secondary angles." };
  }

  const landmarkAllLow =
    input.landmarks.length > 0 &&
    input.landmarks.every((d) => d.lowEvidence);
  if (landmarkAllLow) {
    throw new Error(
      "AI Tag drafts are low-evidence (video was not watched). Re-run AI Tag on a public YouTube angle before syncing.",
    );
  }

  assertPublicForGemini(input.primaryPrivacyStatus, "Primary angle");
  for (const angle of input.angles) {
    assertPublicForGemini(angle.privacyStatus, angle.label);
  }

  const plan = planSyncLandmarks(input.landmarks);
  const landmarksText = plan.landmarks
    .map(
      (d) =>
        `- ${d.kind} @ ${d.tSec}s conf=${d.confidence.toFixed(2)}${d.lowEvidence ? " lowEvidence" : ""} "${d.label}"`,
    )
    .join("\n");

  const drafts: AiSyncDraft[] = [];
  const notes: string[] = [plan.guidance];

  // One secondary per request so Gemini can actually watch both long videos.
  for (const angle of input.angles) {
    try {
      const draft = await syncOneAngle({
        landmarksText,
        guidance: plan.guidance,
        preferredAnchor: plan.preferredAnchor,
        primarySourceId: input.primarySourceId,
        primaryVideoId: input.primaryVideoId,
        angle,
        sport: input.sport,
      });
      drafts.push(draft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/token count exceeds|maximum number of tokens/i.test(msg)) {
        throw new Error(
          `AI Sync ran out of context comparing primary + "${angle.label}". Try syncing fewer angles or shorter clips.`,
        );
      }
      if (
        /public YouTube|unlisted|private|could not watch|could not see/i.test(
          msg,
        )
      ) {
        throw err instanceof Error ? err : new Error(msg);
      }
      console.warn("[ai/sync-angles] angle failed:", angle.sourceId, err);
      throw new Error(
        `AI Sync failed for "${angle.label}" (${msg}). ${GEMINI_YOUTUBE_PUBLIC_REQUIRED}`,
      );
    }
  }

  return {
    drafts,
    notes: notes.filter(Boolean).join(" ").slice(0, 500),
  };
}
