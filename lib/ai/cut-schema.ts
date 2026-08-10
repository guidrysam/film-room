/** Shared propose-cut draft shape (client + server). */

export type AiCutProposalDraft = {
  timelineEventId: string;
  activeSourceId: string;
  startOffsetSec: number;
  endOffsetSec: number;
  confidence: number;
  note?: string;
};
