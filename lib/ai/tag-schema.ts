import { z } from "zod";

export const aiTagKindSchema = z.enum([
  // Soccer structure / scoring
  "kickoff",
  "half_end",
  "half_start",
  "full_time",
  "goal",
  "shot",
  "save",
  "corner",
  "defensive_stop",
  "offensive_opportunity",
  "turnover",
  "coach_mark",
  // Basketball structure / scoring
  "tipoff",
  "period_start",
  "period_end",
  "field_goal",
  "three_pointer",
  "rebound",
  "block",
  "steal",
  "assist",
  "foul",
  "open_look",
]);

export type AiTagKind = z.infer<typeof aiTagKindSchema>;

export const aiTagDraftSchema = z.object({
  tSec: z.number().finite().nonnegative(),
  kind: aiTagKindSchema,
  label: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
  opponent: z.boolean().optional(),
  lowEvidence: z.boolean().optional(),
  playerHints: z.array(z.string()).optional(),
});

export type AiTagDraft = z.infer<typeof aiTagDraftSchema>;

export const aiTagResultSchema = z.object({
  drafts: z.array(aiTagDraftSchema).max(120),
  notes: z.string().max(500).optional(),
  suggestedKickoffOffsetSec: z.number().finite().optional(),
});

export type AiTagResult = z.infer<typeof aiTagResultSchema>;

export const aiSyncDraftSchema = z.object({
  sourceId: z.string().min(1),
  /** Seconds to add to game time to reach this source's playback time. */
  offsetFromGameTime: z.number().finite(),
  confidence: z.number().min(0).max(1),
  note: z.string().max(300).optional(),
});

export type AiSyncDraft = z.infer<typeof aiSyncDraftSchema>;

export const aiSyncResultSchema = z.object({
  drafts: z.array(aiSyncDraftSchema).max(20),
  notes: z.string().max(500).optional(),
});

export type AiSyncResult = z.infer<typeof aiSyncResultSchema>;

/** Must-try structure + scoring (soccer). */
export const PRIMARY_TAG_KINDS: AiTagKind[] = [
  "kickoff",
  "half_end",
  "half_start",
  "full_time",
  "goal",
];

/** High-value extended events — include when confidence is solid. */
export const EXTENDED_TAG_KINDS: AiTagKind[] = [
  "shot",
  "save",
  "corner",
  "defensive_stop",
  "offensive_opportunity",
  "turnover",
];

export const BASKETBALL_PRIMARY_TAG_KINDS: AiTagKind[] = [
  "tipoff",
  "period_end",
  "period_start",
  "full_time",
  "field_goal",
];

export const BASKETBALL_EXTENDED_TAG_KINDS: AiTagKind[] = [
  "three_pointer",
  "shot",
  "rebound",
  "block",
  "steal",
  "assist",
  "foul",
  "open_look",
  "turnover",
];

export const ALL_AI_TAG_KINDS: AiTagKind[] = aiTagKindSchema.options;

export function isPrimaryTagKind(kind: string): boolean {
  return (
    (PRIMARY_TAG_KINDS as string[]).includes(kind) ||
    (BASKETBALL_PRIMARY_TAG_KINDS as string[]).includes(kind)
  );
}

export function isExtendedTagKind(kind: string): boolean {
  return (
    (EXTENDED_TAG_KINDS as string[]).includes(kind) ||
    (BASKETBALL_EXTENDED_TAG_KINDS as string[]).includes(kind)
  );
}

/** Map AI draft kind → optional GameStatType for approval. */
export function statTypeForAiTagKind(kind: AiTagKind): string | undefined {
  switch (kind) {
    case "goal":
      return "goal";
    case "field_goal":
      return "field_goal";
    case "three_pointer":
      return "three_pointer";
    case "shot":
      return "shot";
    case "save":
      return "save";
    case "block":
      return "block";
    case "steal":
      return "steal";
    case "rebound":
      return "rebound";
    case "assist":
      return "assist";
    case "foul":
      return "foul";
    case "turnover":
      return "turnover";
    case "defensive_stop":
      return "defensive_stop";
    case "corner":
      return "corner";
    default:
      return undefined;
  }
}
