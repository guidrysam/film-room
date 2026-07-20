"use client";

import { useMemo, useState } from "react";
import TacticsBoardCanvas from "@/components/TacticsBoardCanvas";
import TacticsPlaybackControls from "@/components/TacticsPlaybackControls";
import { useTacticsPlayback } from "@/hooks/useTacticsPlayback";
import {
  DEFAULT_PLAYBACK_SETTINGS,
  PLAYBACK_SPEED_PRESETS,
  type PlaybackSpeedPreset,
} from "@/lib/tactics-animation";
import type { AcademyDrillStep } from "@/lib/academy/types";

export default function AcademyActivityBoardPlayer({
  title,
  steps,
}: {
  title: string;
  steps: readonly AcademyDrillStep[];
}) {
  const playableSteps = useMemo(
    () =>
      steps.filter((step) => Array.isArray(step.objects) && step.objects.length),
    [steps],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState<PlaybackSpeedPreset>("normal");
  const settings = useMemo(
    () => ({
      ...DEFAULT_PLAYBACK_SETTINGS,
      transitionDurationMs: PLAYBACK_SPEED_PRESETS[speed],
      holdDurationMs: Math.max(
        1600,
        DEFAULT_PLAYBACK_SETTINGS.holdDurationMs,
      ),
      loop,
    }),
    [loop, speed],
  );
  const playbackSteps = useMemo(
    () =>
      playableSteps.map((step) => ({
        objects: step.objects,
        durationMs: Math.max(1800, step.durationMs ?? 0),
      })),
    [playableSteps],
  );
  const playback = useTacticsPlayback({
    steps: playbackSteps,
    selectedIndex,
    settings,
    onDisplayIndexChange: setSelectedIndex,
  });

  if (!playableSteps.length) return null;

  const safeIndex = Math.min(
    selectedIndex,
    Math.max(0, playableSteps.length - 1),
  );
  const displayIndex = playback.isPlaybackActive
    ? playback.captionIndex
    : safeIndex;
  const activeStep = playableSteps[displayIndex] ?? playableSteps[0];
  const canvasObjects = playback.isPlaybackActive
    ? playback.renderObjects
    : (activeStep?.objects ?? []);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
      <div className="border-b border-white/10 bg-black/30 px-3 py-2">
        <TacticsPlaybackControls
          stepIndex={displayIndex}
          stepCount={playableSteps.length}
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
      </div>

      <TacticsBoardCanvas
        orientation="horizontal"
        fieldView="full"
        objects={canvasObjects}
        tool="select"
        readOnly
        className="!rounded-none !shadow-none"
      />

      <div className="flex gap-2 overflow-x-auto border-t border-white/10 bg-black/20 px-3 py-2">
        {playableSteps.map((step, index) => {
          const active = index === displayIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                playback.stop();
                setSelectedIndex(index);
              }}
              className={`min-h-11 min-w-28 shrink-0 rounded-lg border px-3 text-left ${
                active
                  ? "border-blue-500/50 bg-blue-600/20 text-white"
                  : "border-white/10 bg-white/[0.03] text-zinc-300"
              }`}
            >
              <span className="block text-[10px] uppercase text-zinc-500">
                Step {index + 1}
              </span>
              <span className="block truncate text-xs font-semibold">
                {step.title}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1 border-t border-white/10 bg-black/30 px-3 py-3">
        <p className="text-[11px] text-zinc-500">
          Tactical board · {title} · {playableSteps.length}{" "}
          {playableSteps.length === 1 ? "step" : "steps"}
        </p>
        <p className="text-sm font-medium text-white">{activeStep.title}</p>
        <p className="text-sm leading-6 text-zinc-300">
          {activeStep.explanation}
        </p>
        {activeStep.coachCue ? (
          <p className="text-xs text-cyan-300">Coach cue: {activeStep.coachCue}</p>
        ) : null}
        {activeStep.playerAction ? (
          <p className="text-xs text-zinc-400">
            Player action: {activeStep.playerAction}
          </p>
        ) : null}
      </div>
    </div>
  );
}
