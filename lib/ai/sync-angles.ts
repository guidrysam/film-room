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
import { isBasketballSport, normalizeSportId } from "@/lib/sports";

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

const SYSTEM_SOCCER = `You align ONE secondary camera angle to a primary tagged soccer game timeline.
You are given landmark events (kickoff, half_end, half_start, goals, full time) with times in PRIMARY video seconds.
The attached video is the SECONDARY angle only — find the same landmarks in it and compute the offset.

Estimate offsetFromGameTime: seconds added to canonical game time to reach that source's playback time.
Convention: if secondary starts later than primary (missed kickoff), offset is typically larger positive or adjusted so landmarks line up.
If secondary has more pre-game footage, offset may be negative relative to an already-zeroed primary.

Sync anchors (in order):
1. Prefer kickoff when clearly visible on the secondary.
2. FALLBACK — if kickoff cannot be found (late start, no whistle, wrong end of field, pre-roll only), use second-half half_start. Match the primary half_start landmark to the visible second-half restart on the secondary, then derive offsetFromGameTime.
3. If neither kickoff nor half_start works, use the clearest shared goal.

You MUST watch the attached YouTube video. Do not invent offsets.
Skim visually around the chosen anchor (±2–3 minutes); do not re-tag the whole match.
Return exactly one draft for the secondary sourceId. In the draft note, say which anchor you used (kickoff | half_start | goal).
If you cannot see video pixels, return confidence 0 and explain — do not guess.`;

const SYSTEM_BASKETBALL = `You align ONE secondary camera angle to a primary tagged basketball game timeline.
You are given landmark events (tipoff, period_end, period_start, field goals, full time) with times in PRIMARY video seconds.
The attached video is the SECONDARY angle only — find the same landmarks in it and compute the offset.

Estimate offsetFromGameTime: seconds added to canonical game time to reach that source's playback time.
Convention: if secondary starts later than primary (missed tipoff), offset is typically larger positive or adjusted so landmarks line up.

Sync anchors (in order):
1. Prefer tipoff when clearly visible on the secondary.
2. FALLBACK — if tipoff cannot be found (late start, no whistle), use period_start (next period/quarter restart). Match the primary period_start landmark to the visible restart on the secondary, then derive offsetFromGameTime.
3. If neither tipoff nor period_start works, use the clearest shared field_goal / make.

You MUST watch the attached YouTube video. Do not invent offsets.
Skim visually around the chosen anchor (±2–3 minutes); do not re-tag the whole game.
Return exactly one draft for the secondary sourceId. In the draft note, say which anchor you used (tipoff | period_start | field_goal).
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
  const sportId =
    normalizeSportId(input.sport) ?? (input.sport?.trim() || "soccer");
  const basketball = isBasketballSport(sportId);
  const retryHint = basketball
    ? "Propose offsetFromGameTime for this secondary sourceId as JSON. If tipoff fails, retry alignment on period_start before giving up."
    : "Propose offsetFromGameTime for this secondary sourceId as JSON. If kickoff fails, retry alignment on half_start before giving up.";
  const userText = [
    `Sport: ${sportId}`,
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
    retryHint,
  ].join("\n");

  const { object } = await geminiGenerateObject({
    modelId: process.env.AI_SYNC_MODEL ?? process.env.AI_TAG_MODEL,
    system: basketball ? SYSTEM_BASKETBALL : SYSTEM_SOCCER,
    userText,
    // Watch the secondary angle only — primary landmarks are text times.
    // Dual long YouTube attachments often trip Gemini "invalid argument".
    youtubeVideoId: input.angle.videoId,
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
        " Try Sync angles → Audio sync, or make both videos Public and re-tag.",
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
      if (/invalid argument/i.test(msg)) {
        throw new Error(
          `AI Sync failed for "${angle.label}" (${msg}). ` +
            "Prefer Sync angles → Audio sync for alignment; AI Sync is best-effort on long dual YouTube film.",
        );
      }
      throw new Error(`AI Sync failed for "${angle.label}" (${msg}).`);
    }
  }

  return {
    drafts,
    notes: notes.filter(Boolean).join(" ").slice(0, 500),
  };
}
