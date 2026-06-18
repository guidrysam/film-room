"use client";

import type { RosterImportResult } from "@/lib/roster-import";

export type RosterImportResultSummaryProps = {
  result: RosterImportResult;
  title?: string;
  description?: string;
  showTeamCreated?: boolean;
};

export default function RosterImportResultSummary({
  result,
  title = "Import complete",
  description = "Players appear on the team roster. Invite parents in Build Your Video Team below to upload video and build highlights.",
  showTeamCreated = false,
}: RosterImportResultSummaryProps) {
  const items = [
    ...(showTeamCreated
      ? [{ label: "Team created", value: 1 }]
      : []),
    { label: "Players created", value: result.playersCreated },
    { label: "Players updated", value: result.playersUpdated },
    { label: "Parent contacts created", value: result.parentsSaved },
    { label: "Invalid rows skipped", value: result.skipped },
  ];

  return (
    <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-3">
      <p className="mb-2 text-[11px] font-semibold text-emerald-100">{title}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(({ label, value }) => (
          <li
            key={label}
            className="rounded-md border border-white/[0.06] bg-black/25 px-2 py-2 text-center"
          >
            <p className="text-lg font-semibold text-white">{value}</p>
            <p className="text-[9px] uppercase tracking-wide text-zinc-500">
              {label}
            </p>
          </li>
        ))}
      </ul>
      {description ? (
        <p className="mt-2 text-[10px] leading-snug text-emerald-200/90">
          {description}
        </p>
      ) : null}
    </div>
  );
}
