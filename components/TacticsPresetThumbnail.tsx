"use client";

import TacticsBoardCanvas from "@/components/TacticsBoardCanvas";
import type { TacticsPreset } from "@/lib/tactics-presets/types";

export default function TacticsPresetThumbnail({
  preset,
  className,
}: {
  preset: TacticsPreset;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl ${className ?? ""}`}>
      <TacticsBoardCanvas
        orientation={preset.fieldOrientation}
        fieldView={preset.fieldView}
        objects={preset.steps[0]?.objects ?? []}
        tool="select"
        readOnly
        className="!rounded-xl !shadow-none"
      />
      {preset.steps.length > 1 ? (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
          ▶ {preset.steps.length} steps
        </span>
      ) : null}
    </div>
  );
}
