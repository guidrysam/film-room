"use client";

import { useEffect, useMemo, useState } from "react";
import TacticsBoardCanvas from "@/components/TacticsBoardCanvas";
import TacticsPlaybackControls from "@/components/TacticsPlaybackControls";
import { useTacticsPlayback } from "@/hooks/useTacticsPlayback";
import {
  PLAYBACK_SPEED_PRESETS,
  type PlaybackSpeedPreset,
} from "@/lib/tactics-animation";
import {
  PRESET_DIFFICULTY_LABELS,
  type DrillVariation,
  type TacticsPreset,
  type TacticsPresetSourceType,
} from "@/lib/tactics-presets/types";

type CoachSection =
  | "setup"
  | "walkthrough"
  | "coaching"
  | "variations"
  | "edit";

const secondaryButton =
  "min-h-11 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.09] disabled:opacity-50";
const primaryButton =
  "min-h-11 rounded-xl border border-blue-500/40 bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const sectionLabels: Array<[CoachSection, string]> = [
  ["setup", "Setup"],
  ["walkthrough", "Walkthrough"],
  ["coaching", "Coaching Points"],
  ["variations", "Variations"],
  ["edit", "Edit"],
];

function variationOf(value: DrillVariation | string): DrillVariation {
  return typeof value === "string"
    ? { title: value, description: value }
    : value;
}

function equipmentLines(preset: TacticsPreset): string[] {
  if (!preset.equipment) return [];
  const { balls, cones, pinnies, goals, miniGoals } = preset.equipment;
  return [
    balls !== undefined
      ? `Balls: ${balls === "one-per-player" ? "one per player" : balls}`
      : null,
    cones !== undefined ? `Cones: ${cones}` : null,
    pinnies !== undefined ? `Pinnies: ${pinnies}` : null,
    goals !== undefined ? `Goals: ${goals}` : null,
    miniGoals !== undefined ? `Mini-goals: ${miniGoals}` : null,
  ].filter((line): line is string => Boolean(line));
}

function VariationCards({
  title,
  items,
}: {
  title: string;
  items?: Array<DrillVariation | string>;
}) {
  if (!items?.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => {
          const variation = variationOf(item);
          return (
            <div
              key={`${variation.title}-${index}`}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
            >
              <p className="text-xs font-semibold text-zinc-100">
                {variation.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {variation.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function TacticsDrillCoachMode({
  preset,
  sourceType,
  onUse,
  onClose,
}: {
  preset: TacticsPreset;
  sourceType: TacticsPresetSourceType;
  onUse: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [section, setSection] = useState<CoachSection>("walkthrough");
  const [playMode, setPlayMode] = useState<"manual" | "auto">("manual");
  const [loop, setLoop] = useState(preset.playbackSettings.loop);
  const [speed, setSpeed] = useState<PlaybackSpeedPreset>("normal");
  const [usingPreset, setUsingPreset] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");
  const settings = useMemo(
    () => ({
      ...preset.playbackSettings,
      transitionDurationMs: PLAYBACK_SPEED_PRESETS[speed],
      holdDurationMs: Math.max(1400, preset.playbackSettings.holdDurationMs),
      loop,
    }),
    [loop, preset.playbackSettings, speed],
  );
  const playbackSteps = useMemo(
    () =>
      preset.steps.map((step) => ({
        objects: step.objects,
        durationMs: Math.max(2200, step.durationMs ?? 0),
      })),
    [preset.steps],
  );
  const playback = useTacticsPlayback({
    steps: playbackSteps,
    selectedIndex,
    settings,
    onDisplayIndexChange: setSelectedIndex,
  });
  const playbackActive = playback.isPlaybackActive;
  const stopPlayback = playback.stop;
  const displayIndex = playback.isPlaybackActive
    ? playback.captionIndex
    : selectedIndex;
  const activeStep = preset.steps[displayIndex] ?? preset.steps[0];

  useEffect(() => {
    if (playMode === "manual" && playbackActive) {
      stopPlayback();
    }
  }, [playMode, playbackActive, stopPlayback]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (playbackActive) stopPlayback();
      else onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, playbackActive, stopPlayback]);

  const handleUse = async () => {
    setUsingPreset(true);
    try {
      await onUse();
    } finally {
      setUsingPreset(false);
    }
  };

  const handleShare = async () => {
    const text = `${preset.title}: ${preset.shortDescription}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: preset.title, text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareLabel("Copied");
        window.setTimeout(() => setShareLabel("Share"), 1800);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setShareLabel("Could not share");
      }
    }
  };

  const equipment = equipmentLines(preset);
  const internalStatus =
    preset.editorialMetadata?.contentStatus === "internal_draft";
  const editorialLabel = internalStatus
    ? "Original Film Room teaching example · Internal draft"
    : preset.editorialMetadata?.sourceName
      ? `Source: ${preset.editorialMetadata.sourceName}`
      : preset.editorialMetadata?.contentStatus === "reviewed"
        ? "Reviewed teaching content"
        : preset.editorialMetadata?.contentStatus === "licensed"
          ? "Licensed teaching content"
          : preset.editorialMetadata?.contentStatus === "public_domain"
            ? "Public-domain teaching content"
            : null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-mode-title"
    >
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Coach Mode ·{" "}
              {sourceType === "built_in"
                ? "Film Room Preset"
                : "Team Preset"}
            </p>
            <h2
              id="coach-mode-title"
              className="mt-1 text-2xl font-semibold text-white"
            >
              {preset.title}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Practice Drill ·{" "}
              {PRESET_DIFFICULTY_LABELS[preset.difficulty]}
              {preset.estimatedMinutes
                ? ` · ${preset.estimatedMinutes} minutes`
                : ""}
              {preset.playerCount ? ` · ${preset.playerCount} players` : ""}
              {preset.ageGuidance ? ` · ${preset.ageGuidance}` : ""}
              {` · ${preset.steps.length} steps`}
            </p>
            {editorialLabel ? (
              <p className="mt-1 text-[10px] text-zinc-500">
                {editorialLabel}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                setPlayMode("auto");
                setSection("walkthrough");
                playback.play();
              }}
            >
              Play Walkthrough
            </button>
            <button
              type="button"
              className={primaryButton}
              disabled={usingPreset}
              onClick={() => void handleUse()}
            >
              {usingPreset ? "Creating…" : "Use This Drill"}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={usingPreset}
              onClick={() => void handleUse()}
            >
              Edit Copy
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => void handleShare()}
            >
              {shareLabel}
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
          <div className="space-y-3">
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-white/10 p-1">
                {(["manual", "auto"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${
                      playMode === mode
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    onClick={() => setPlayMode(mode)}
                  >
                    {mode === "manual" ? "Manual" : "Auto Play"}
                  </button>
                ))}
              </div>
              {playMode === "auto" ? (
                <div className="min-w-0 flex-1">
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
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={displayIndex === 0}
                    onClick={() => {
                      playback.stop();
                      setSelectedIndex((index) => Math.max(0, index - 1));
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={displayIndex >= preset.steps.length - 1}
                    onClick={() => {
                      playback.stop();
                      setSelectedIndex((index) =>
                        Math.min(preset.steps.length - 1, index + 1),
                      );
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">
              Step {displayIndex + 1} of {preset.steps.length}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {activeStep?.title}
            </h3>
            {activeStep?.explanation ? (
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                {activeStep.explanation}
              </p>
            ) : null}
            {activeStep?.coachCue ? (
              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Coach cue
                </p>
                <p className="mt-1 text-sm font-medium text-amber-50">
                  “{activeStep.coachCue}”
                </p>
              </div>
            ) : null}
            {activeStep?.playerAction ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-zinc-200">Players</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {activeStep.playerAction}
                </p>
              </div>
            ) : null}
            {activeStep?.ballAction ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-zinc-200">Ball</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {activeStep.ballAction}
                </p>
              </div>
            ) : null}
          </aside>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {preset.steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`min-h-14 min-w-40 shrink-0 rounded-xl border px-3 text-left ${
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

        <nav
          className="flex gap-2 overflow-x-auto border-b border-white/10 pb-3"
          aria-label="Coach Mode sections"
        >
          {sectionLabels.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold ${
                section === id
                  ? "bg-white/[0.1] text-white"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              }`}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6">
          {section === "setup" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="text-base font-semibold text-white">Setup</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
                  {preset.setupInstructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
                <p className="mt-4 rounded-xl bg-blue-500/[0.08] p-3 text-xs leading-relaxed text-blue-100">
                  Adjust the area based on age, ability, and desired pressure.
                </p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white">
                  Session details
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <dt className="text-xs text-zinc-500">Area</dt>
                    <dd className="mt-1 text-zinc-200">
                      {preset.fieldArea ?? "Custom"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <dt className="text-xs text-zinc-500">Players</dt>
                    <dd className="mt-1 text-zinc-200">
                      {preset.playerCount ?? "Adaptable"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <dt className="text-xs text-zinc-500">Time</dt>
                    <dd className="mt-1 text-zinc-200">
                      {preset.estimatedMinutes
                        ? `${preset.estimatedMinutes} minutes`
                        : "Flexible"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <dt className="text-xs text-zinc-500">Equipment</dt>
                    <dd className="mt-1 text-zinc-200">
                      {equipment.join(", ") || "As needed"}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {section === "walkthrough" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="text-base font-semibold text-white">
                  Objectives
                </h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">
                  {preset.objectives.map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white">
                  How it works
                </h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
                  {(preset.howItWorks ?? preset.activityInstructions ?? []).map(
                    (instruction) => (
                      <li key={instruction}>{instruction}</li>
                    ),
                  )}
                </ol>
              </section>
            </div>
          ) : null}

          {section === "coaching" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="text-base font-semibold text-white">
                  Coaching points
                </h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">
                  {preset.coachingPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="text-base font-semibold text-white">
                  Common mistakes
                </h3>
                <div className="mt-3 space-y-2">
                  {preset.commonMistakes?.map((item) => (
                    <div
                      key={item.mistake}
                      className="rounded-xl border border-rose-400/10 bg-rose-400/[0.04] p-3"
                    >
                      <p className="text-sm text-zinc-200">{item.mistake}</p>
                      {item.correction ? (
                        <p className="mt-1 text-xs text-emerald-300">
                          Correction: {item.correction}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {section === "variations" ? (
            <div className="space-y-6">
              <VariationCards
                title="Progressions"
                items={preset.progressions}
              />
              <VariationCards
                title="Regressions"
                items={preset.regressions}
              />
            </div>
          ) : null}

          {section === "edit" ? (
            <div>
              <h3 className="text-base font-semibold text-white">
                Make it your own
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                {sourceType === "built_in"
                  ? "Built-in drills are read-only teaching examples. Create a team copy to change player positions, field size, instructions, drawings, and sequence timing without changing the Film Room version."
                  : "Create an editable board from this team preset. Your new board is independent, so changes do not overwrite the reusable team preset."}
              </p>
              <button
                type="button"
                className={`${primaryButton} mt-4`}
                disabled={usingPreset}
                onClick={() => void handleUse()}
              >
                {usingPreset ? "Creating…" : "Edit Copy"}
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
