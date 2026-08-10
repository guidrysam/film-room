import "server-only";

import { z } from "zod";
import {
  geminiGenerateObject,
} from "@/lib/ai/gemini-rest";
import type { AiCutProposalDraft } from "@/lib/ai/cut-schema";
import {
  GEMINI_YOUTUBE_PUBLIC_REQUIRED,
  geminiCanWatchYoutubePrivacy,
  youtubePrivacyBlockReason,
} from "@/lib/ai/youtube-gemini-access";
import { isBasketballSport, normalizeSportId } from "@/lib/sports";

export type { AiCutProposalDraft };

export type ProposeCutAngle = {
  sourceId: string;
  videoId: string;
  label: string;
  angleSlot?: string;
  offsetFromGameTime: number;
  privacyStatus?: string;
};

export type ProposeCutMark = {
  timelineEventId: string;
  gameTimeSec: number;
  label: string;
  eventType: string;
};

export type ProposeCutInput = {
  marks: ProposeCutMark[];
  angles: ProposeCutAngle[];
  sport?: string;
  /** Default pad before mark (game seconds). */
  defaultStartOffsetSec?: number;
  /** Default pad after mark (game seconds). */
  defaultEndOffsetSec?: number;
};

const cutProposalSchema = z.object({
  activeSourceId: z.string(),
  startOffsetSec: z.number(),
  endOffsetSec: z.number(),
  confidence: z.number(),
  note: z.string().optional(),
});

const CUT_PROPOSAL_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    activeSourceId: { type: "string" },
    startOffsetSec: { type: "number" },
    endOffsetSec: { type: "number" },
    confidence: { type: "number" },
    note: { type: "string" },
  },
  required: ["activeSourceId", "startOffsetSec", "endOffsetSec", "confidence"],
};

const SYSTEM_SOCCER = `You pick the best camera angle and refine the clip window for ONE soccer highlight mark.
You see multiple YouTube angle proxies of the same play. Choose the clearest angle for the action (goal → goal camera if ball enters net; build-up → wide/main; save → goal).
startOffsetSec / endOffsetSec are relative to the mark's game time (negative = before the mark).
Default window is about -5..+10 seconds; tighten or widen slightly for the sport beat (goals often need +8–12 after the ball crosses).
Return activeSourceId exactly matching one provided sourceId. Do not invent ids.
If you cannot see pixels, confidence 0 and explain.`;

const SYSTEM_BASKETBALL = `You pick the best camera angle and refine the clip window for ONE basketball highlight mark.
You see multiple YouTube angle proxies of the same play. Prefer the angle that shows the finish (make/miss) and key defenders.
startOffsetSec / endOffsetSec are relative to the mark's game time (negative = before the mark).
Default window is about -5..+8 seconds; adjust for the beat.
Return activeSourceId exactly matching one provided sourceId. Do not invent ids.
If you cannot see pixels, confidence 0 and explain.`;

function assertPublicForGemini(
  privacy: string | undefined,
  label: string,
): void {
  if (geminiCanWatchYoutubePrivacy(privacy)) return;
  throw new Error(
    youtubePrivacyBlockReason(privacy, label) ?? GEMINI_YOUTUBE_PUBLIC_REQUIRED,
  );
}

function clampWindow(
  startOffsetSec: number,
  endOffsetSec: number,
  defaults: { start: number; end: number },
): { startOffsetSec: number; endOffsetSec: number } {
  let start = Number.isFinite(startOffsetSec)
    ? startOffsetSec
    : defaults.start;
  let end = Number.isFinite(endOffsetSec) ? endOffsetSec : defaults.end;
  start = Math.max(-30, Math.min(0, start));
  end = Math.max(2, Math.min(45, end));
  if (end <= start + 1) {
    start = defaults.start;
    end = defaults.end;
  }
  return { startOffsetSec: start, endOffsetSec: end };
}

async function proposeOneMark(input: {
  mark: ProposeCutMark;
  angles: ProposeCutAngle[];
  sport?: string;
  defaultStart: number;
  defaultEnd: number;
}): Promise<AiCutProposalDraft> {
  const sportId =
    normalizeSportId(input.sport) ?? (input.sport?.trim() || "soccer");
  const basketball = isBasketballSport(sportId);
  const system = basketball ? SYSTEM_BASKETBALL : SYSTEM_SOCCER;

  const primary = input.angles[0];
  if (!primary) {
    return {
      timelineEventId: input.mark.timelineEventId,
      activeSourceId: "",
      startOffsetSec: input.defaultStart,
      endOffsetSec: input.defaultEnd,
      confidence: 0,
      note: "No AI-analyzable angles.",
    };
  }

  for (const a of input.angles) {
    assertPublicForGemini(a.privacyStatus, a.label);
  }

  const angleLines = input.angles
    .map(
      (a) =>
        `- sourceId=${a.sourceId} label="${a.label}" slot=${a.angleSlot ?? "n/a"} offsetFromGameTime=${a.offsetFromGameTime} videoId=${a.videoId}`,
    )
    .join("\n");

  const t = Math.max(0, input.mark.gameTimeSec);
  // Clip primary proxy around the mark in source time for Gemini.
  const primarySourceT = t + primary.offsetFromGameTime;
  const clipStart = Math.max(0, primarySourceT + input.defaultStart - 5);
  const clipEnd = Math.max(clipStart + 5, primarySourceT + input.defaultEnd + 8);

  const userText = [
    `Sport: ${sportId}`,
    `Mark id: ${input.mark.timelineEventId}`,
    `Mark type: ${input.mark.eventType}`,
    `Mark label: ${input.mark.label}`,
    `Mark gameTimeSec: ${t}`,
    `Default window: startOffsetSec=${input.defaultStart} endOffsetSec=${input.defaultEnd}`,
    `Angles:`,
    angleLines,
    `Primary clip attached around source time ~${clipStart.toFixed(1)}–${clipEnd.toFixed(1)}s (may include other angles).`,
    `Pick best activeSourceId and refine startOffsetSec/endOffsetSec relative to the mark.`,
  ].join("\n");

  const { object } = await geminiGenerateObject({
    system,
    userText,
    youtubeVideoId: primary.videoId,
    extraYoutubeVideoIds: input.angles.slice(1).map((a) => a.videoId),
    videoClip: { startSec: clipStart, endSec: clipEnd },
    schema: cutProposalSchema,
    responseJsonSchema: CUT_PROPOSAL_JSON_SCHEMA,
  });

  const validIds = new Set(input.angles.map((a) => a.sourceId));
  const activeSourceId = validIds.has(object.activeSourceId)
    ? object.activeSourceId
    : primary.sourceId;
  const window = clampWindow(
    object.startOffsetSec,
    object.endOffsetSec,
    { start: input.defaultStart, end: input.defaultEnd },
  );

  return {
    timelineEventId: input.mark.timelineEventId,
    activeSourceId,
    startOffsetSec: window.startOffsetSec,
    endOffsetSec: window.endOffsetSec,
    confidence: Math.max(0, Math.min(1, object.confidence)),
    ...(object.note?.trim() ? { note: object.note.trim().slice(0, 400) } : {}),
  };
}

/**
 * Propose best angle + clip window for each mark (YouTube proxies only).
 */
export async function runProposeCutAnalysis(
  input: ProposeCutInput,
): Promise<{ proposals: AiCutProposalDraft[]; notes?: string }> {
  const defaultStart = input.defaultStartOffsetSec ?? -5;
  const defaultEnd = input.defaultEndOffsetSec ?? 10;
  if (input.angles.length === 0) {
    return { proposals: [], notes: "No analyzable angles." };
  }
  if (input.marks.length === 0) {
    return { proposals: [], notes: "No marks to cut." };
  }

  const proposals: AiCutProposalDraft[] = [];
  for (const mark of input.marks) {
    try {
      proposals.push(
        await proposeOneMark({
          mark,
          angles: input.angles,
          sport: input.sport,
          defaultStart,
          defaultEnd,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "propose failed";
      proposals.push({
        timelineEventId: mark.timelineEventId,
        activeSourceId: input.angles[0]!.sourceId,
        startOffsetSec: defaultStart,
        endOffsetSec: defaultEnd,
        confidence: 0,
        note: msg.slice(0, 400),
      });
    }
  }

  const low = proposals.filter((p) => p.confidence < 0.35).length;
  return {
    proposals,
    ...(low > 0
      ? {
          notes: `${low} of ${proposals.length} proposals have low confidence — review before approving.`,
        }
      : {}),
  };
}
