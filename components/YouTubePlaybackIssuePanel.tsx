"use client";

import type { YouTubePlaybackDiagnosis } from "@/lib/youtube-playback-issue";

export type YouTubePlaybackIssuePanelProps = {
  diagnosis: YouTubePlaybackDiagnosis;
  compact?: boolean;
  onAutoFix?: () => void;
  onRecheck?: () => void;
  repairing?: boolean;
  repairError?: string | null;
  repairFixed?: boolean;
};

function panelShellClass(severity: YouTubePlaybackDiagnosis["severity"]): string {
  switch (severity) {
    case "ok":
      return "border-emerald-500/35 bg-emerald-950/30";
    case "info":
      return "border-sky-500/30 bg-sky-950/25";
    case "warning":
      return "border-amber-500/35 bg-amber-950/25";
    default:
      return "border-amber-500/40 bg-amber-950/25";
  }
}

function headlineClass(severity: YouTubePlaybackDiagnosis["severity"]): string {
  switch (severity) {
    case "ok":
      return "text-emerald-100";
    case "info":
      return "text-sky-100";
    default:
      return "text-amber-100";
  }
}

export default function YouTubePlaybackIssuePanel({
  diagnosis,
  compact = false,
  onAutoFix,
  onRecheck,
  repairing = false,
  repairError,
  repairFixed = false,
}: YouTubePlaybackIssuePanelProps) {
  if (diagnosis.code === "ok") {
    if (compact) return null;
    return (
      <div
        className={`rounded-md border px-2.5 py-2 ${panelShellClass(diagnosis.severity)}`}
      >
        <p className={`text-[11px] font-medium ${headlineClass(diagnosis.severity)}`}>
          {diagnosis.headline}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border px-2.5 py-2 ${panelShellClass(diagnosis.severity)}`}
    >
      <p className={`text-[11px] font-medium ${headlineClass(diagnosis.severity)}`}>
        {repairFixed ? "Fixed — it now plays inside Film Room" : diagnosis.headline}
      </p>
      {diagnosis.detail && !repairFixed ? (
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-300/90">
          {diagnosis.detail}
        </p>
      ) : null}
      {!repairFixed && diagnosis.steps.length > 0 ? (
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[10px] leading-snug text-zinc-300/90">
          {diagnosis.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {diagnosis.canAutoFix && onAutoFix && !repairFixed ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void onAutoFix()}
            disabled={repairing}
            className="rounded-md border border-amber-400/50 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50"
          >
            {repairing ? "Fixing…" : "Try auto-fix"}
          </button>
          {onRecheck ? (
            <button
              type="button"
              onClick={() => void onRecheck()}
              disabled={repairing}
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              Re-check
            </button>
          ) : null}
        </div>
      ) : onRecheck && !repairFixed ? (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => void onRecheck()}
            disabled={repairing}
            className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            {repairing ? "Checking…" : "Re-check"}
          </button>
        </div>
      ) : null}
      {repairError ? (
        <p className="mt-1 text-[10px] leading-snug text-amber-200/90">
          {repairError}
        </p>
      ) : null}
      {diagnosis.watchUrl ? (
        <a
          href={diagnosis.watchUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block text-[10px] font-semibold text-blue-300 underline-offset-2 hover:underline"
        >
          Open on YouTube
        </a>
      ) : null}
      {diagnosis.studioUrl && !compact ? (
        <a
          href={diagnosis.studioUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-3 inline-block text-[10px] font-semibold text-blue-300 underline-offset-2 hover:underline"
        >
          Open in YouTube Studio
        </a>
      ) : null}
    </div>
  );
}
