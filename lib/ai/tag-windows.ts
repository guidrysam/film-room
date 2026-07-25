import type { AiTagDraft, AiTagResult } from "@/lib/ai/tag-schema";

export type TagWindow = {
  label: string;
  startSec: number;
  endSec: number;
};

/**
 * Split a full match into overlapping half windows for denser Gemini sampling.
 * Short clips stay as a single window.
 */
export function planTagWindows(durationSec: number | undefined): TagWindow[] {
  const dur =
    typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec
      : 0;

  // Under ~40 minutes: one pass is enough for LOW media resolution.
  if (dur > 0 && dur < 40 * 60) {
    return [{ label: "full", startSec: 0, endSec: Math.ceil(dur) }];
  }

  if (dur <= 0) {
    // Unknown length — assume a typical youth match and still do two passes.
    return [
      { label: "first_half", startSec: 0, endSec: 40 * 60 },
      { label: "second_half", startSec: 30 * 60, endSec: 85 * 60 },
    ];
  }

  const mid = Math.floor(dur / 2);
  const overlap = 4 * 60;
  const firstEnd = Math.min(dur, mid + overlap);
  const secondStart = Math.max(0, mid - overlap);
  return [
    { label: "first_half", startSec: 0, endSec: firstEnd },
    { label: "second_half", startSec: secondStart, endSec: Math.ceil(dur) },
  ];
}

/** Shift draft times that were tagged inside a clipped window back to full-video time. */
export function shiftDraftsToVideoTime(
  drafts: AiTagDraft[],
  windowStartSec: number,
): AiTagDraft[] {
  if (windowStartSec <= 0) return drafts;
  return drafts.map((d) => ({
    ...d,
    tSec: Math.max(0, d.tSec + windowStartSec),
  }));
}

/**
 * Merge window results: prefer higher-confidence duplicates near the same time+kind.
 */
export function mergeTagWindowResults(
  parts: Array<{ drafts: AiTagDraft[]; notes?: string }>,
): AiTagResult {
  const all = parts.flatMap((p) => p.drafts);
  all.sort((a, b) => a.tSec - b.tSec || a.kind.localeCompare(b.kind));

  const merged: AiTagDraft[] = [];
  for (const d of all) {
    const near = merged.find(
      (m) => m.kind === d.kind && Math.abs(m.tSec - d.tSec) <= 8,
    );
    if (!near) {
      merged.push(d);
      continue;
    }
    if (d.confidence > near.confidence) {
      const idx = merged.indexOf(near);
      merged[idx] = d;
    }
  }

  const notes = parts
    .map((p) => p.notes?.trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);

  return {
    drafts: merged.slice(0, 120),
    ...(notes ? { notes } : {}),
  };
}
