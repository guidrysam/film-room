"use client";

import { useEffect, useMemo, useState } from "react";
import TacticsBoardCanvas from "@/components/TacticsBoardCanvas";
import TacticsDrillCoachMode from "@/components/TacticsDrillCoachMode";
import TacticsPlaybackControls from "@/components/TacticsPlaybackControls";
import TacticsStepNotes from "@/components/TacticsStepNotes";
import { useTacticsPlayback } from "@/hooks/useTacticsPlayback";
import {
  PLAYBACK_SPEED_PRESETS,
  type PlaybackSpeedPreset,
} from "@/lib/tactics-animation";
import {
  PRESET_CATEGORY_LABELS,
  PRESET_DIFFICULTY_LABELS,
  PRESET_FORMAT_LABELS,
  type TacticsPreset,
  type TacticsPresetSourceType,
} from "@/lib/tactics-presets/types";

const button =
  "min-h-11 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-sm font-semibold text-zinc-100 hover:bg-white/[0.09] disabled:opacity-50";
const primary =
  "min-h-11 rounded-xl border border-blue-500/40 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50";

function DetailList({
  title,
  items,
  numbered = false,
}: {
  title: string;
  items?: string[];
  numbered?: boolean;
}) {
  if (!items?.length) return null;
  const Tag = numbered ? "ol" : "ul";
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </h3>
      <Tag
        className={`mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-300 ${
          numbered ? "list-decimal pl-5" : "list-disc pl-5"
        }`}
      >
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </Tag>
    </section>
  );
}

type TacticsPresetPreviewProps = {
  preset: TacticsPreset;
  sourceType: TacticsPresetSourceType;
  onUse: () => Promise<void> | void;
  onClose: () => void;
};

export default function TacticsPresetPreview(
  props: TacticsPresetPreviewProps,
) {
  if (props.preset.kind === "practice_drill") {
    return <TacticsDrillCoachMode {...props} />;
  }
  return <StandardTacticsPresetPreview {...props} />;
}

function StandardTacticsPresetPreview({
  preset,
  sourceType,
  onUse,
  onClose,
}: TacticsPresetPreviewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [usingPreset, setUsingPreset] = useState(false);
  const [loop, setLoop] = useState(preset.playbackSettings.loop);
  const [speed, setSpeed] = useState<PlaybackSpeedPreset>("normal");
  const settings = useMemo(
    () => ({
      ...preset.playbackSettings,
      transitionDurationMs: PLAYBACK_SPEED_PRESETS[speed],
      loop,
    }),
    [loop, preset.playbackSettings, speed],
  );
  const playback = useTacticsPlayback({
    steps: preset.steps,
    selectedIndex,
    settings,
    onDisplayIndexChange: setSelectedIndex,
  });
  const stopPlayback = playback.stop;
  const playbackActive = playback.isPlaybackActive;
  const displayIndex = playback.isPlaybackActive
    ? playback.captionIndex
    : selectedIndex;
  const activeStep = preset.steps[displayIndex] ?? preset.steps[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (playbackActive) stopPlayback();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, playbackActive, stopPlayback]);

  const equipment = preset.equipment
    ? [
        preset.equipment.balls !== undefined
          ? `Balls: ${preset.equipment.balls === "one-per-player" ? "one per player" : preset.equipment.balls}`
          : null,
        preset.equipment.cones !== undefined
          ? `Cones: ${preset.equipment.cones}`
          : null,
        preset.equipment.pinnies !== undefined
          ? `Pinnies: ${preset.equipment.pinnies}`
          : null,
        preset.equipment.goals !== undefined
          ? `Goals: ${preset.equipment.goals}`
          : null,
        preset.equipment.miniGoals !== undefined
          ? `Mini-goals: ${preset.equipment.miniGoals}`
          : null,
      ].filter((item): item is string => Boolean(item))
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-preview-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-zinc-950/95 px-4 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
              {sourceType === "built_in"
                ? "Film Room Preset"
                : "Team Preset"}
            </p>
            <h2
              id="preset-preview-title"
              className="mt-1 text-xl font-semibold text-white"
            >
              {preset.title}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {PRESET_FORMAT_LABELS[preset.format]} ·{" "}
              {PRESET_CATEGORY_LABELS[preset.category]} ·{" "}
              {PRESET_DIFFICULTY_LABELS[preset.difficulty]} ·{" "}
              {preset.steps.length}{" "}
              {preset.steps.length === 1 ? "step" : "steps"}
            </p>
          </div>
          <button
            type="button"
            className={button}
            onClick={onClose}
            aria-label="Close preset preview"
          >
            Cancel
          </button>
        </header>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.75fr)]">
          <div className="space-y-3">
            <TacticsPlaybackControls
              stepIndex={displayIndex}
              stepCount={preset.steps.length}
              isPlaying={playback.isPlaying}
              isPlaybackActive={playback.isPlaybackActive}
              loop={loop}
              speedPreset={speed}
              onPlayPause={playback.togglePlay}
              onPrevious={playback.previous}
              onNext={playback.next}
              onRestart={playback.restart}
              onToggleLoop={() => setLoop((value) => !value)}
              onSpeedChange={setSpeed}
              onExitPlayback={playback.stop}
            />

            <TacticsBoardCanvas
              orientation={preset.fieldOrientation}
              fieldView={preset.fieldView}
              objects={
                playback.isPlaybackActive
                  ? playback.renderObjects
                  : (activeStep?.objects ?? [])
              }
              tool="select"
              readOnly
            />

            <div className="flex gap-2 overflow-x-auto pb-1">
              {preset.steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`min-h-11 min-w-28 shrink-0 rounded-xl border px-3 text-left ${
                    index === displayIndex
                      ? "border-blue-500/50 bg-blue-600/20 text-white"
                      : "border-white/10 bg-white/[0.03] text-zinc-300"
                  }`}
                  onClick={() => {
                    playback.stop();
                    setSelectedIndex(index);
                  }}
                >
                  <span className="block text-[10px] uppercase text-zinc-500">
                    Step {index + 1}
                  </span>
                  <span className="block truncate text-xs font-semibold">
                    {step.title}
                  </span>
                </button>
              ))}
            </div>

            <TacticsStepNotes
              title={activeStep?.title ?? ""}
              notes={activeStep?.notes ?? ""}
              compact
            />
          </div>

          <aside className="space-y-5">
            <p className="text-sm leading-relaxed text-zinc-300">
              {preset.shortDescription}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {preset.playerCount ? (
                <div className="rounded-lg bg-white/[0.04] p-2 text-zinc-300">
                  Players: {preset.playerCount}
                </div>
              ) : null}
              {preset.estimatedMinutes ? (
                <div className="rounded-lg bg-white/[0.04] p-2 text-zinc-300">
                  Time: {preset.estimatedMinutes} min
                </div>
              ) : null}
              <div className="rounded-lg bg-white/[0.04] p-2 text-zinc-300">
                Area: {preset.fieldArea ?? "full"}
              </div>
              {preset.ageGuidance ? (
                <div className="rounded-lg bg-white/[0.04] p-2 text-zinc-300">
                  Ages: {preset.ageGuidance}
                </div>
              ) : null}
            </div>
            <DetailList title="Objectives" items={preset.objectives} />
            <DetailList
              title="Equipment"
              items={equipment}
            />
            <DetailList
              title="Setup"
              items={preset.setupInstructions}
              numbered
            />
            <DetailList
              title="How it works"
              items={preset.howItWorks ?? preset.activityInstructions}
              numbered
            />
            <DetailList
              title="Coaching points"
              items={preset.coachingPoints}
            />
            <DetailList
              title="Progressions"
              items={preset.progressions?.map((item) =>
                typeof item === "string" ? item : item.title,
              )}
            />
            <DetailList
              title="Regressions"
              items={preset.regressions?.map((item) =>
                typeof item === "string" ? item : item.title,
              )}
            />
            <DetailList title="Safety" items={preset.safetyNotes} />
          </aside>
        </div>

        <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-white/10 bg-zinc-950/95 px-4 py-3 backdrop-blur sm:px-6">
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={primary}
            disabled={usingPreset}
            onClick={() => {
              setUsingPreset(true);
              void Promise.resolve(onUse()).finally(() =>
                setUsingPreset(false),
              );
            }}
          >
            {usingPreset ? "Creating…" : "Use This Preset"}
          </button>
        </footer>
      </div>
    </div>
  );
}
