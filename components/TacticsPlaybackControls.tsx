"use client";

import {
  PLAYBACK_SPEED_PRESETS,
  type PlaybackSpeedPreset,
} from "@/lib/tactics-animation";

const btn =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40";

const btnActive =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-blue-500/45 bg-blue-600/25 px-3 text-xs font-semibold text-white";

export type TacticsPlaybackControlsProps = {
  stepIndex: number;
  stepCount: number;
  isPlaying: boolean;
  isPlaybackActive: boolean;
  loop: boolean;
  speedPreset: PlaybackSpeedPreset;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRestart: () => void;
  onToggleLoop: () => void;
  onSpeedChange: (preset: PlaybackSpeedPreset) => void;
  onExitPlayback?: () => void;
  canEditSpeed?: boolean;
};

export default function TacticsPlaybackControls({
  stepIndex,
  stepCount,
  isPlaying,
  isPlaybackActive,
  loop,
  speedPreset,
  onPlayPause,
  onPrevious,
  onNext,
  onRestart,
  onToggleLoop,
  onSpeedChange,
  onExitPlayback,
  canEditSpeed = true,
}: TacticsPlaybackControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-zinc-950/50 px-3 py-2">
      <button type="button" className={btn} onClick={onPrevious} aria-label="Previous step">
        Previous
      </button>
      <button
        type="button"
        className={btnActive}
        onClick={onPlayPause}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <button type="button" className={btn} onClick={onNext} aria-label="Next step">
        Next
      </button>
      <button type="button" className={btn} onClick={onRestart} aria-label="Restart from step 1">
        Restart
      </button>
      <button
        type="button"
        className={loop ? btnActive : btn}
        onClick={onToggleLoop}
        aria-pressed={loop}
        aria-label="Loop playback"
      >
        Loop
      </button>
      <span className="mx-1 text-[11px] font-medium text-zinc-400" aria-live="polite">
        Step {Math.min(stepCount, stepIndex + 1)} of {Math.max(1, stepCount)}
      </span>
      <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        Speed
        <select
          aria-label="Playback speed"
          value={speedPreset}
          disabled={!canEditSpeed && false}
          onChange={(e) => onSpeedChange(e.target.value as PlaybackSpeedPreset)}
          className="min-h-11 rounded-lg border border-white/12 bg-black/40 px-2 text-xs font-semibold text-white"
        >
          {(Object.keys(PLAYBACK_SPEED_PRESETS) as PlaybackSpeedPreset[]).map(
            (key) => (
              <option key={key} value={key}>
                {key[0]!.toUpperCase() + key.slice(1)}
              </option>
            ),
          )}
        </select>
      </label>
      {isPlaybackActive && onExitPlayback ? (
        <button type="button" className={btn} onClick={onExitPlayback}>
          Edit
        </button>
      ) : null}
    </div>
  );
}
