import { z } from "zod";

export const aiTagKindSchema = z.enum([
  "kickoff",
  "half_end",
  "half_start",
  "full_time",
  "goal",
  "shot",
  "save",
  "coach_mark",
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
  drafts: z.array(aiTagDraftSchema).max(80),
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

export const PRIMARY_TAG_KINDS: AiTagKind[] = [
  "kickoff",
  "half_end",
  "half_start",
  "full_time",
  "goal",
];

export function isPrimaryTagKind(kind: string): boolean {
  return (PRIMARY_TAG_KINDS as string[]).includes(kind);
}
