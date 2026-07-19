"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TacticsBoardCanvas from "@/components/TacticsBoardCanvas";
import TacticsPlaybackControls from "@/components/TacticsPlaybackControls";
import TacticsStepNotes from "@/components/TacticsStepNotes";
import TacticsStepTimeline from "@/components/TacticsStepTimeline";
import { useTacticsPlayback } from "@/hooks/useTacticsPlayback";
import {
  PLAYBACK_SPEED_PRESETS,
  type PlaybackSpeedPreset,
} from "@/lib/tactics-animation";
import {
  getTacticsBoardByShareToken,
  type TacticsBoardShareDoc,
} from "@/lib/tactics-board-share";
import type { TacticsStep } from "@/lib/tactics-steps";

function speedFromMs(ms: number): "slow" | "normal" | "fast" {
  if (ms >= 1200) return "slow";
  if (ms <= 650) return "fast";
  return "normal";
}

export default function SharedTacticsPage() {
  const params = useParams();
  const shareToken =
    typeof params.shareToken === "string" ? params.shareToken : "";

  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState<TacticsBoardShareDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [speedPreset, setSpeedPreset] = useState<PlaybackSpeedPreset>("normal");

  useEffect(() => {
    if (!shareToken) {
      setError("Invalid link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await getTacticsBoardByShareToken(shareToken);
      if (cancelled) return;
      if (result.ok) {
        setShare(result.share);
        const steps = result.share.payload.steps;
        setActiveStepId(steps[0]?.id ?? null);
        setLoop(result.share.payload.playbackSettings.loop);
        setSpeedPreset(
          speedFromMs(
            result.share.payload.playbackSettings.transitionDurationMs,
          ),
        );
        setError(null);
      } else if (result.kind === "revoked") {
        setError("This share link has been revoked.");
      } else if (result.kind === "query_failed") {
        setError(result.message);
      } else {
        setError("Board not found.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const stepsAsTactics: TacticsStep[] = useMemo(() => {
    if (!share) return [];
    return share.payload.steps.map((s) => ({
      id: s.id,
      boardId: share.boardId,
      order: s.order,
      title: s.title,
      ...(s.notes ? { notes: s.notes } : {}),
      objects: s.objects,
      version: 1,
      createdAt: null,
      updatedAt: null,
      createdBy: share.createdBy,
      updatedBy: share.createdBy,
    }));
  }, [share]);

  const selectedIndex = Math.max(
    0,
    stepsAsTactics.findIndex((s) => s.id === activeStepId),
  );

  const playbackSettings = useMemo(
    () => ({
      transitionDurationMs: PLAYBACK_SPEED_PRESETS[speedPreset],
      holdDurationMs:
        share?.payload.playbackSettings.holdDurationMs ?? 700,
      loop,
    }),
    [loop, share, speedPreset],
  );

  const playback = useTacticsPlayback({
    steps: stepsAsTactics,
    selectedIndex,
    settings: playbackSettings,
    onDisplayIndexChange: (index) => {
      const step = stepsAsTactics[index];
      if (step) setActiveStepId(step.id);
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        playback.togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        playback.previous();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        playback.next();
      } else if (e.key === "Escape") {
        playback.stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030306] text-sm text-zinc-400">
        Loading shared board…
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030306] px-4 text-center text-zinc-50">
        <p className="text-sm text-rose-200">{error ?? "Not found."}</p>
        <Link href="/" className="mt-4 text-xs text-zinc-400 hover:text-zinc-200">
          ← Home
        </Link>
      </div>
    );
  }

  const caption = stepsAsTactics[playback.captionIndex];

  return (
    <div className="min-h-screen bg-[#030306] px-4 py-8 text-zinc-50">
      <div className="mx-auto max-w-4xl space-y-4">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          Shared tactics board
        </p>
        <h1 className="text-xl font-semibold text-white">
          {share.payload.title}
        </h1>
        <p className="text-xs text-zinc-500">
          View only · {stepsAsTactics.length} steps
          {share.payload.updatedByName
            ? ` · Last edited by ${share.payload.updatedByName}`
            : share.payload.createdByName
              ? ` · Created by ${share.payload.createdByName}`
              : ""}
        </p>

        <TacticsPlaybackControls
          stepIndex={
            playback.isPlaybackActive ? playback.captionIndex : selectedIndex
          }
          stepCount={stepsAsTactics.length}
          isPlaying={playback.isPlaying}
          isPlaybackActive={playback.isPlaybackActive}
          loop={loop}
          speedPreset={speedPreset}
          onPlayPause={playback.togglePlay}
          onPrevious={playback.previous}
          onNext={playback.next}
          onRestart={playback.restart}
          onToggleLoop={() => setLoop((v) => !v)}
          onSpeedChange={setSpeedPreset}
          onExitPlayback={playback.stop}
        />

        <TacticsStepTimeline
          steps={stepsAsTactics}
          selectedStepId={activeStepId}
          canEdit={false}
          onSelect={setActiveStepId}
          onAddStep={() => undefined}
          onRename={() => undefined}
          onDuplicate={() => undefined}
          onInsertAfter={() => undefined}
          onMove={() => undefined}
          onDelete={() => undefined}
        />

        <TacticsStepNotes
          title={caption?.title ?? ""}
          notes={caption?.notes ?? ""}
          compact
        />

        <TacticsBoardCanvas
          orientation={share.payload.fieldOrientation}
          fieldView={share.payload.fieldView ?? "full"}
          objects={
            playback.isPlaybackActive
              ? playback.renderObjects
              : (stepsAsTactics[selectedIndex]?.objects ?? [])
          }
          tool="select"
          readOnly
        />
        <p className="mt-6 text-center text-[11px] text-zinc-600">
          Film Room · Tactics
        </p>
      </div>
    </div>
  );
}
