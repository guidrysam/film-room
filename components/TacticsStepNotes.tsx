"use client";

export type TacticsStepNotesProps = {
  title: string;
  notes: string;
  readOnly?: boolean;
  compact?: boolean;
  onTitleChange?: (title: string) => void;
  onNotesChange?: (notes: string) => void;
};

export default function TacticsStepNotes({
  title,
  notes,
  readOnly = false,
  compact = false,
  onTitleChange,
  onNotesChange,
}: TacticsStepNotesProps) {
  if (compact) {
    if (!title && !notes) return null;
    return (
      <div className="rounded-xl border border-white/[0.07] bg-zinc-950/40 px-3 py-2">
        {title ? (
          <p className="text-xs font-semibold text-white">{title}</p>
        ) : null}
        {notes ? (
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
            {notes}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-xl border border-white/[0.07] bg-zinc-950/40 px-3 py-2 sm:grid-cols-2">
      <label className="text-[11px] text-zinc-400">
        Step title
        <input
          type="text"
          value={title}
          disabled={readOnly}
          onChange={(e) => onTitleChange?.(e.target.value)}
          placeholder="e.g. Starting shape"
          className="mt-1 block w-full rounded-lg border border-white/12 bg-black/40 px-2 py-2 text-sm text-white disabled:opacity-60"
        />
      </label>
      <label className="text-[11px] text-zinc-400">
        Coaching note
        <input
          type="text"
          value={notes}
          disabled={readOnly}
          onChange={(e) => onNotesChange?.(e.target.value)}
          placeholder="Optional tip for this step"
          className="mt-1 block w-full rounded-lg border border-white/12 bg-black/40 px-2 py-2 text-sm text-white disabled:opacity-60"
        />
      </label>
    </div>
  );
}
