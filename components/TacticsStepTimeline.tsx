"use client";

import { useEffect, useRef, useState } from "react";
import type { TacticsStep } from "@/lib/tactics-steps";

const stepBtn =
  "relative flex min-h-11 min-w-[7.5rem] shrink-0 flex-col justify-center rounded-xl border px-3 py-2 text-left transition";

export type TacticsStepTimelineProps = {
  steps: TacticsStep[];
  selectedStepId: string | null;
  canEdit: boolean;
  disabled?: boolean;
  onSelect: (stepId: string) => void;
  onAddStep: () => void;
  onRename: (stepId: string, title: string) => void;
  onDuplicate: (stepId: string) => void;
  onInsertAfter: (stepId: string) => void;
  onMove: (stepId: string, direction: "left" | "right") => void;
  onDelete: (stepId: string) => void;
};

export default function TacticsStepTimeline({
  steps,
  selectedStepId,
  canEdit,
  disabled = false,
  onSelect,
  onAddStep,
  onRename,
  onDuplicate,
  onInsertAfter,
  onMove,
  onDelete,
}: TacticsStepTimelineProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedStepId]);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-zinc-950/50 p-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {steps.map((step, index) => {
          const selected = step.id === selectedStepId;
          return (
            <div key={step.id} className="relative flex shrink-0 items-center gap-1.5">
              {index > 0 ? (
                <span className="px-0.5 text-zinc-600" aria-hidden>
                  →
                </span>
              ) : null}
              <button
                type="button"
                ref={selected ? selectedRef : undefined}
                disabled={disabled}
                onClick={() => onSelect(step.id)}
                className={`${stepBtn} ${
                  selected
                    ? "border-blue-500/50 bg-blue-600/25 text-white"
                    : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                }`}
                aria-current={selected ? "step" : undefined}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Step {index + 1}
                </span>
                {renamingId === step.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onRename(step.id, renameDraft);
                      setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => {
                        onRename(step.id, renameDraft);
                        setRenamingId(null);
                      }}
                      className="mt-0.5 w-full rounded border border-white/20 bg-black/50 px-1 py-0.5 text-xs text-white"
                    />
                  </form>
                ) : (
                  <span className="truncate text-xs font-semibold">
                    {step.title}
                  </span>
                )}
              </button>
              {canEdit ? (
                <div className="relative">
                  <button
                    type="button"
                    disabled={disabled}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/[0.06]"
                    aria-label={`More actions for step ${index + 1}`}
                    onClick={() =>
                      setMenuId((id) => (id === step.id ? null : step.id))
                    }
                  >
                    ⋯
                  </button>
                  {menuId === step.id ? (
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-white/10 bg-zinc-950 p-1.5 shadow-xl">
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                        onClick={() => {
                          setMenuId(null);
                          onSelect(step.id);
                        }}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                        onClick={() => {
                          setMenuId(null);
                          setRenamingId(step.id);
                          setRenameDraft(step.title);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                        onClick={() => {
                          setMenuId(null);
                          onDuplicate(step.id);
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                        onClick={() => {
                          setMenuId(null);
                          onInsertAfter(step.id);
                        }}
                      >
                        Insert after
                      </button>
                      <button
                        type="button"
                        disabled={index === 0}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
                        onClick={() => {
                          setMenuId(null);
                          onMove(step.id, "left");
                        }}
                      >
                        Move left
                      </button>
                      <button
                        type="button"
                        disabled={index >= steps.length - 1}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
                        onClick={() => {
                          setMenuId(null);
                          onMove(step.id, "right");
                        }}
                      >
                        Move right
                      </button>
                      <button
                        type="button"
                        disabled={steps.length <= 1}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                        onClick={() => {
                          setMenuId(null);
                          if (
                            steps.length > 1 &&
                            window.confirm(`Delete ${step.title}?`)
                          ) {
                            onDelete(step.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {canEdit ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onAddStep}
            className="ml-1 flex min-h-11 shrink-0 items-center rounded-xl border border-dashed border-blue-500/40 bg-blue-600/15 px-3 text-xs font-semibold text-blue-100 hover:bg-blue-600/25 disabled:opacity-40"
          >
            + Add Step
          </button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {selectedStepId
          ? `Selected ${steps.find((s) => s.id === selectedStepId)?.title ?? "step"}`
          : ""}
      </p>
    </div>
  );
}
