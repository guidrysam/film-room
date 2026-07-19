"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import TacticsBoardCanvas, {
  type TacticsTool,
} from "@/components/TacticsBoardCanvas";
import TacticsPlaybackControls from "@/components/TacticsPlaybackControls";
import TacticsStepNotes from "@/components/TacticsStepNotes";
import TacticsStepTimeline from "@/components/TacticsStepTimeline";
import { useTacticsPlayback } from "@/hooks/useTacticsPlayback";
import {
  PLAYBACK_SPEED_PRESETS,
  type PlaybackSpeedPreset,
} from "@/lib/tactics-animation";
import {
  ensureTacticsBoardSharing,
  revokeTacticsBoardShare,
  syncTacticsBoardShareSnapshot,
  tacticsBoardEditorUrl,
  tacticsSharedUrl,
} from "@/lib/tactics-board-share";
import {
  canEditTacticsBoard,
  deleteTacticsBoard,
  duplicateTacticsBoard,
  getTacticsBoard,
  relativeUpdatedLabel,
  TACTICS_AWAY_COLOR,
  TACTICS_DRAW_COLOR,
  TACTICS_HOME_COLOR,
  updateTacticsBoard,
  visibilityLabel,
  type TacticsBoard,
  type TacticsBoardObject,
  type TacticsFieldView,
  type TacticsVisibility,
} from "@/lib/tactics-boards";
import {
  downloadTacticsPng,
  exportTacticsPdfViaPrint,
  exportTacticsStepsStoryboard,
  shareTacticsImage,
} from "@/lib/tactics-export";
import {
  countPlayersOnSide,
  setPlayersOnSide,
  TACTICS_PLAYER_COUNT_OPTIONS,
} from "@/lib/tactics-formations";
import { ensureTacticsBoardMigrated } from "@/lib/tactics-migration";
import {
  saveBoardAsTeamPreset,
  updateTeamPresetFromBoard,
} from "@/lib/tactics-team-presets";
import {
  addTacticsStepAfter,
  deleteTacticsStep,
  duplicateTacticsStep,
  moveTacticsStep,
  renameTacticsStep,
  updateTacticsStep,
  type TacticsStep,
} from "@/lib/tactics-steps";
import type { Team } from "@/lib/teams";
import { teamTacticsUrl } from "@/lib/team-routes";

const toolBtn = (active: boolean) =>
  `rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
    active
      ? "border-blue-500/50 bg-blue-600/30 text-white"
      : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/18 hover:bg-white/[0.08]"
  }`;

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40";

const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40";

const TacticsPresetLibrary = dynamic(
  () => import("@/components/TacticsPresetLibrary"),
  { ssr: false },
);

export type TacticsBoardEditorProps = {
  team: Team;
  board: TacticsBoard;
  currentUid: string;
  displayName?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const MAX_HISTORY = 40;

function speedFromMs(ms: number): PlaybackSpeedPreset {
  if (ms >= 1200) return "slow";
  if (ms <= 650) return "fast";
  return "normal";
}

export default function TacticsBoardEditor({
  team,
  board: initialBoard,
  currentUid,
  displayName,
}: TacticsBoardEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startInPlay = searchParams.get("play") === "1";

  const [board, setBoard] = useState(initialBoard);
  const [steps, setSteps] = useState<TacticsStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(
    initialBoard.activeStepId ?? null,
  );
  const [objects, setObjects] = useState<TacticsBoardObject[]>([]);
  const [stepTitle, setStepTitle] = useState("");
  const [stepNotes, setStepNotes] = useState("");
  const [title, setTitle] = useState(initialBoard.title);
  const [tool, setTool] = useState<TacticsTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [conflictRemote, setConflictRemote] = useState<TacticsBoard | null>(null);
  const [stepConflict, setStepConflict] = useState<TacticsStep | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(true);
  const [showPrevPositions, setShowPrevPositions] = useState(false);
  const [newerPresetVersion, setNewerPresetVersion] = useState<number | null>(
    null,
  );
  const [loop, setLoop] = useState(initialBoard.playbackSettings.loop);
  const [speedPreset, setSpeedPreset] = useState<PlaybackSpeedPreset>(
    speedFromMs(initialBoard.playbackSettings.transitionDurationMs),
  );

  const historyRef = useRef<TacticsBoardObject[][]>([[]]);
  const historyIndexRef = useRef(0);
  const boardVersionRef = useRef(initialBoard.version);
  const stepVersionRef = useRef(1);
  const boardPendingRef = useRef(false);
  const stepPendingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const objectsRef = useRef<TacticsBoardObject[]>([]);
  const activeStepIdRef = useRef<string | null>(activeStepId);

  const canEdit = canEditTacticsBoard(board, team, currentUid);

  const selectedIndex = useMemo(() => {
    const idx = steps.findIndex((s) => s.id === activeStepId);
    return idx >= 0 ? idx : 0;
  }, [steps, activeStepId]);

  const activeStep = steps[selectedIndex] ?? null;

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  useEffect(() => {
    activeStepIdRef.current = activeStepId;
  }, [activeStepId]);
  useEffect(() => {
    const source = board.presetSource;
    if (!source || source.sourceType !== "built_in") return;
    let cancelled = false;
    void import("@/lib/tactics-presets").then(
      ({ getBuiltInTacticsPreset }) => {
        const current = getBuiltInTacticsPreset(source.presetId);
        if (
          !cancelled &&
          current &&
          current.version > source.presetVersion
        ) {
          setNewerPresetVersion(current.version);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [board.presetSource]);

  const loadStepIntoEditor = useCallback((step: TacticsStep) => {
    setActiveStepId(step.id);
    setObjects(step.objects);
    objectsRef.current = step.objects;
    setStepTitle(step.title);
    setStepNotes(step.notes ?? "");
    stepVersionRef.current = step.version;
    historyRef.current = [step.objects];
    historyIndexRef.current = 0;
    stepPendingRef.current = false;
    setSelectedId(null);
  }, []);

  // Migrate + load steps on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingSteps(true);
      try {
        const migrated = await ensureTacticsBoardMigrated(
          team.id,
          board.id,
          currentUid,
        );
        if (cancelled) return;
        setBoard(migrated.board);
        boardVersionRef.current = migrated.board.version;
        setSteps(migrated.steps);
        const initial =
          migrated.steps.find((s) => s.id === migrated.board.activeStepId) ??
          migrated.steps[0];
        if (initial) loadStepIntoEditor(initial);
        setLoop(migrated.board.playbackSettings.loop);
        setSpeedPreset(
          speedFromMs(migrated.board.playbackSettings.transitionDurationMs),
        );
      } catch (err) {
        if (!cancelled) {
          setSaveError(
            err instanceof Error ? err.message : "Could not load steps.",
          );
        }
      } finally {
        if (!cancelled) setLoadingSteps(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per board
  }, [team.id, board.id, currentUid]);

  const pushHistory = useCallback((next: TacticsBoardObject[]) => {
    const idx = historyIndexRef.current;
    const truncated = historyRef.current.slice(0, idx + 1);
    truncated.push(next);
    if (truncated.length > MAX_HISTORY) truncated.shift();
    historyRef.current = truncated;
    historyIndexRef.current = truncated.length - 1;
  }, []);

  const markStepDirty = useCallback(() => {
    stepPendingRef.current = true;
    setDirty(true);
    setSaveState("idle");
  }, []);

  const applyObjectsLive = useCallback((next: TacticsBoardObject[]) => {
    setObjects(next);
    objectsRef.current = next;
    stepPendingRef.current = true;
    setDirty(true);
    setSaveState("idle");
  }, []);

  const applyObjectsCommit = useCallback(
    (next: TacticsBoardObject[]) => {
      setObjects(next);
      objectsRef.current = next;
      pushHistory(next);
      markStepDirty();
    },
    [markStepDirty, pushHistory],
  );

  const persistStep = useCallback(async (): Promise<boolean> => {
    if (!canEdit || !activeStepIdRef.current || !stepPendingRef.current) {
      return true;
    }
    stepPendingRef.current = false;
    setSaveState("saving");
    setSaveError(null);
    try {
      const result = await updateTacticsStep(
        team.id,
        board.id,
        activeStepIdRef.current,
        currentUid,
        {
          objects: objectsRef.current,
          title: stepTitle,
          notes: stepNotes.trim() || null,
          expectedVersion: stepVersionRef.current,
          displayName,
        },
      );
      if (!result.ok) {
        setStepConflict(result.conflict.remote);
        setSaveState("error");
        stepPendingRef.current = true;
        return false;
      }
      stepVersionRef.current = result.step.version;
      setSteps((prev) =>
        prev.map((s) => (s.id === result.step.id ? result.step : s)),
      );
      setDirty(false);
      setSaveState("saved");
      const freshBoard = await getTacticsBoard(team.id, board.id);
      if (freshBoard) {
        setBoard(freshBoard);
        boardVersionRef.current = freshBoard.version;
        void syncTacticsBoardShareSnapshot(freshBoard, currentUid);
      }
      return true;
    } catch (err) {
      stepPendingRef.current = true;
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Could not save step.");
      return false;
    }
  }, [
    board.id,
    canEdit,
    currentUid,
    displayName,
    stepNotes,
    stepTitle,
    team.id,
  ]);

  const persistBoardMeta = useCallback(async (): Promise<boolean> => {
    if (!canEdit || !boardPendingRef.current) return true;
    boardPendingRef.current = false;
    setSaveState("saving");
    try {
      const result = await updateTacticsBoard(team.id, board.id, currentUid, {
        title,
        fieldOrientation: board.fieldOrientation,
        fieldView: board.fieldView,
        activeStepId: activeStepIdRef.current ?? undefined,
        playbackSettings: {
          transitionDurationMs: PLAYBACK_SPEED_PRESETS[speedPreset],
          holdDurationMs: board.playbackSettings.holdDurationMs,
          loop,
        },
        expectedVersion: boardVersionRef.current,
        displayName,
      });
      if (!result.ok) {
        setConflictRemote(result.conflict.remote);
        setSaveState("error");
        boardPendingRef.current = true;
        return false;
      }
      boardVersionRef.current = result.board.version;
      setBoard(result.board);
      setSaveState("saved");
      void syncTacticsBoardShareSnapshot(result.board, currentUid);
      return true;
    } catch (err) {
      boardPendingRef.current = true;
      setSaveState("error");
      setSaveError(
        err instanceof Error ? err.message : "Could not save board.",
      );
      return false;
    }
  }, [
    board.fieldOrientation,
    board.fieldView,
    board.id,
    board.playbackSettings.holdDurationMs,
    canEdit,
    currentUid,
    displayName,
    loop,
    speedPreset,
    team.id,
    title,
  ]);

  const persistAll = useCallback(async () => {
    const stepOk = await persistStep();
    if (!stepOk) return false;
    return persistBoardMeta();
  }, [persistBoardMeta, persistStep]);

  useEffect(() => {
    if (!stepPendingRef.current && !boardPendingRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistAll();
    }, 600);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [
    objects,
    stepTitle,
    stepNotes,
    title,
    board.fieldOrientation,
    board.fieldView,
    loop,
    speedPreset,
    persistAll,
  ]);

  const selectStep = useCallback(
    async (stepId: string) => {
      if (stepId === activeStepIdRef.current) return;
      await persistStep();
      const step = steps.find((s) => s.id === stepId);
      if (!step) return;
      loadStepIntoEditor(step);
      boardPendingRef.current = true;
      void updateTacticsBoard(team.id, board.id, currentUid, {
        activeStepId: stepId,
        expectedVersion: boardVersionRef.current,
        displayName,
      }).then((r) => {
        if (r.ok) {
          boardVersionRef.current = r.board.version;
          setBoard(r.board);
          boardPendingRef.current = false;
        }
      });
    },
    [
      board.id,
      currentUid,
      displayName,
      loadStepIntoEditor,
      persistStep,
      steps,
      team.id,
    ],
  );

  const onDisplayIndexChange = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;
      if (step.id === activeStepIdRef.current) return;
      loadStepIntoEditor(step);
    },
    [loadStepIntoEditor, steps],
  );

  const playbackSettings = useMemo(
    () => ({
      transitionDurationMs: PLAYBACK_SPEED_PRESETS[speedPreset],
      holdDurationMs: board.playbackSettings.holdDurationMs,
      loop,
    }),
    [board.playbackSettings.holdDurationMs, loop, speedPreset],
  );

  const playback = useTacticsPlayback({
    steps,
    selectedIndex,
    settings: playbackSettings,
    onDisplayIndexChange,
  });

  useEffect(() => {
    if (startInPlay && !loadingSteps && steps.length > 0) {
      playback.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on initial load
  }, [loadingSteps, startInPlay, steps.length]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
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
        if (playback.isPlaybackActive) {
          e.preventDefault();
          playback.stop();
        } else {
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback]);

  const editingLocked = playback.isPlaybackActive || !canEdit;

  const handleAddStep = async () => {
    if (!canEdit || !activeStepIdRef.current) return;
    await persistStep();
    try {
      const { steps: next, created } = await addTacticsStepAfter(
        team.id,
        board.id,
        currentUid,
        activeStepIdRef.current,
      );
      setSteps(next);
      loadStepIntoEditor(created);
      const fresh = await getTacticsBoard(team.id, board.id);
      if (fresh) {
        setBoard(fresh);
        boardVersionRef.current = fresh.version;
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not add step.");
    }
  };

  const handleUndo = () => {
    if (editingLocked || historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const prev = historyRef.current[historyIndexRef.current]!;
    setObjects(prev);
    objectsRef.current = prev;
    markStepDirty();
  };

  const handleRedo = () => {
    if (
      editingLocked ||
      historyIndexRef.current >= historyRef.current.length - 1
    ) {
      return;
    }
    historyIndexRef.current += 1;
    const next = historyRef.current[historyIndexRef.current]!;
    setObjects(next);
    objectsRef.current = next;
    markStepDirty();
  };

  const handleClear = () => {
    if (editingLocked) return;
    if (!window.confirm("Clear all players and drawings on this step?")) return;
    applyObjectsCommit([]);
    setSelectedId(null);
  };

  const selected = objects.find((o) => o.id === selectedId) ?? null;

  const updateSelectedPlayer = (patch: { label?: string; color?: string }) => {
    if (!selected || selected.type !== "player" || editingLocked) return;
    applyObjectsCommit(
      objects.map((o) =>
        o.id === selected.id && o.type === "player" ? { ...o, ...patch } : o,
      ),
    );
  };

  const deleteSelected = () => {
    if (!selectedId || editingLocked) return;
    applyObjectsCommit(objects.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  };

  const handleShareMode = async (
    mode: TacticsVisibility | "link_view" | "link_edit",
  ) => {
    if (!canEdit) return;
    setShareBusy(true);
    try {
      await persistAll();
      if (mode === "private" || mode === "team_coaches") {
        if (board.shareToken) {
          await revokeTacticsBoardShare(team.id, board.id, currentUid);
        } else {
          const fresh = await getTacticsBoard(team.id, board.id);
          if (fresh) {
            const r = await updateTacticsBoard(team.id, board.id, currentUid, {
              visibility: mode,
              expectedVersion: fresh.version,
              displayName,
            });
            if (r.ok) {
              boardVersionRef.current = r.board.version;
              setBoard(r.board);
            }
          }
        }
        const reloaded = await getTacticsBoard(team.id, board.id);
        if (reloaded) {
          boardVersionRef.current = reloaded.version;
          setBoard(reloaded);
        }
        return;
      }
      const permission = mode === "link_edit" ? "edit" : "view";
      const { shareToken } = await ensureTacticsBoardSharing(
        team.id,
        board.id,
        currentUid,
        permission,
      );
      const reloaded = await getTacticsBoard(team.id, board.id);
      if (reloaded) {
        boardVersionRef.current = reloaded.version;
        setBoard(reloaded);
      }
      const url = `${window.location.origin}${tacticsSharedUrl(shareToken)}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update sharing.");
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async () => {
    if (!board.shareToken) {
      await handleShareMode("link_view");
      return;
    }
    const url = `${window.location.origin}${tacticsSharedUrl(board.shareToken)}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2000);
  };

  const ghostObjects =
    showPrevPositions && selectedIndex > 0
      ? (steps[selectedIndex - 1]?.objects ?? [])
      : [];

  const canvasObjects = playback.isPlaybackActive
    ? playback.renderObjects
    : objects;

  if (loadingSteps) {
    return (
      <p className="text-sm text-zinc-400">Loading steps…</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={teamTacticsUrl(team.id)}
            className="text-xs text-zinc-400 transition hover:text-zinc-200"
          >
            ← All boards
          </Link>
          <input
            type="text"
            value={title}
            disabled={!canEdit || playback.isPlaybackActive}
            onChange={(e) => {
              setTitle(e.target.value);
              boardPendingRef.current = true;
              setDirty(true);
              setSaveState("idle");
            }}
            onBlur={() => void persistBoardMeta()}
            className="mt-1 w-full max-w-md rounded-lg border border-transparent bg-transparent px-0 py-1 text-lg font-semibold text-white outline-none focus:border-white/15 focus:bg-white/[0.04] focus:px-2 disabled:opacity-70"
            aria-label="Board title"
          />
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {board.updatedByName
              ? `Last edited by ${board.updatedByName}`
              : board.createdByName
                ? `Created by ${board.createdByName}`
                : "Tactics board"}
            {" · "}
            {relativeUpdatedLabel(board.updatedAt)}
            {" · "}
            {visibilityLabel(board.visibility)}
            {steps.length > 0 ? ` · ${steps.length} steps` : ""}
            {board.presetSource
              ? ` · From ${board.presetSource.sourceType === "built_in" ? "Film Room" : "team"} preset “${board.presetSource.presetTitle}”`
              : ""}
          </p>
          {newerPresetVersion ? (
            <p className="mt-1 text-[11px] text-amber-300">
              A newer Film Room version is available. Your customized board
              will not be changed.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-400">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : dirty
                    ? "Unsaved"
                    : "Saved"}
          </span>
          {canEdit ? (
            <>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => setPresetLibraryOpen(true)}
              >
                Start from Preset
              </button>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => setShareOpen((v) => !v)}
              >
                Share
              </button>
              <div className="relative">
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  More
                </button>
                {moreOpen ? (
                  <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-white/10 bg-zinc-950 p-1.5 shadow-xl">
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        void persistAll().then(async () => {
                          const presetTitle = window.prompt(
                            "Team preset name",
                            title,
                          );
                          if (!presetTitle?.trim()) return;
                          try {
                            await saveBoardAsTeamPreset(
                              team.id,
                              board.id,
                              currentUid,
                              { title: presetTitle },
                            );
                            setExportMsg("Saved as a Team Preset.");
                          } catch (error) {
                            alert(
                              error instanceof Error
                                ? error.message
                                : "Could not save team preset.",
                            );
                          }
                        });
                      }}
                    >
                      Save as Team Preset
                    </button>
                    {board.presetSource?.sourceType === "team" ? (
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                        onClick={() => {
                          setMoreOpen(false);
                          if (
                            !window.confirm(
                              `Update team preset “${board.presetSource?.presetTitle}” with this board?`,
                            )
                          ) {
                            return;
                          }
                          void persistAll()
                            .then(() =>
                              updateTeamPresetFromBoard(
                                team.id,
                                board.presetSource!.presetId,
                                board.id,
                                currentUid,
                              ),
                            )
                            .then(
                              () => setExportMsg("Team Preset updated."),
                              (error) =>
                                alert(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not update team preset.",
                                ),
                            );
                        }}
                      >
                        Update Team Preset
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        void duplicateTacticsBoard(team.id, board.id, currentUid, {
                          displayName,
                        }).then(
                          (copy) =>
                            router.push(tacticsBoardEditorUrl(team.id, copy.id)),
                          (err) =>
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Could not duplicate.",
                            ),
                        );
                      }}
                    >
                      Duplicate board
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        setBoard((b) => ({
                          ...b,
                          fieldOrientation:
                            b.fieldOrientation === "horizontal"
                              ? "vertical"
                              : "horizontal",
                        }));
                        boardPendingRef.current = true;
                        setDirty(true);
                      }}
                    >
                      Flip{" "}
                      {board.fieldOrientation === "horizontal"
                        ? "portrait"
                        : "landscape"}
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        void downloadTacticsPng(
                          svgRef,
                          `${title}-step-${selectedIndex + 1}`,
                        ).then(
                          () => setExportMsg("PNG downloaded."),
                          (err) =>
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Export failed.",
                            ),
                        );
                      }}
                    >
                      Export PNG (this step)
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        void exportTacticsPdfViaPrint(svgRef, title).catch(
                          (err) =>
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Export failed.",
                            ),
                        );
                      }}
                    >
                      Export PDF (this step)
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        void exportTacticsStepsStoryboard(
                          steps.map((s, i) => ({
                            title: s.title || `Step ${i + 1}`,
                            objects: s.objects,
                          })),
                          {
                            boardTitle: title,
                            orientation: board.fieldOrientation,
                            fieldView: board.fieldView,
                          },
                        ).then(
                          () => setExportMsg("Storyboard opened for print/PDF."),
                          (err) =>
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Export failed.",
                            ),
                        );
                      }}
                    >
                      Export all steps
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        void shareTacticsImage(svgRef, title)
                          .then((mode) =>
                            setExportMsg(
                              mode === "shared"
                                ? "Image shared."
                                : "Image downloaded.",
                            ),
                          )
                          .catch((err) => {
                            if (
                              err instanceof Error &&
                              err.name === "AbortError"
                            ) {
                              return;
                            }
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Share failed.",
                            );
                          });
                      }}
                    >
                      Share image
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/10"
                      onClick={() => {
                        setMoreOpen(false);
                        if (
                          !window.confirm(
                            `Delete “${board.title}”? This cannot be undone.`,
                          )
                        ) {
                          return;
                        }
                        void deleteTacticsBoard(team.id, board.id, currentUid)
                          .then(() => router.push(teamTacticsUrl(team.id)))
                          .catch((err) =>
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Could not delete.",
                            ),
                          );
                      }}
                    >
                      Delete board
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {saveError ? (
        <p className="text-xs text-rose-300">{saveError}</p>
      ) : null}
      {exportMsg ? (
        <p className="text-xs text-emerald-300/90">{exportMsg}</p>
      ) : null}

      {shareOpen ? (
        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/60 p-4">
          <p className="text-sm font-semibold text-white">Share</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Viewers with the link can play the sequence. Edit links remain limited
            to signed-in coaches on this team.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(
              [
                ["team_coaches", "All team coaches can edit"],
                ["private", "Only me"],
                ["link_view", "Anyone with the link can view"],
                ["link_edit", "Coaches with the link can edit"],
              ] as const
            ).map(([mode, label]) => {
              const active =
                (mode === "team_coaches" &&
                  board.visibility === "team_coaches") ||
                (mode === "private" && board.visibility === "private") ||
                (mode === "link_view" &&
                  board.visibility === "shared_link" &&
                  board.sharePermission !== "edit") ||
                (mode === "link_edit" &&
                  board.visibility === "shared_link" &&
                  board.sharePermission === "edit");
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={shareBusy || !canEdit}
                  onClick={() => void handleShareMode(mode)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    active
                      ? "border-blue-500/45 bg-blue-600/20 text-white"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {board.shareToken ? (
            <button
              type="button"
              className={`${primaryBtn} mt-3`}
              onClick={() => void copyShareLink()}
            >
              {shareCopied ? "Link copied" : "Copy share link"}
            </button>
          ) : null}
        </div>
      ) : null}

      {(conflictRemote || stepConflict) && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-950/40 p-4">
          <p className="text-sm font-semibold text-amber-100">
            This {stepConflict ? "step" : "board"} was updated by another coach.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryBtn}
              onClick={() => {
                if (stepConflict) {
                  loadStepIntoEditor(stepConflict);
                  setStepConflict(null);
                  setSaveState("saved");
                  setDirty(false);
                  return;
                }
                if (conflictRemote) {
                  setBoard(conflictRemote);
                  boardVersionRef.current = conflictRemote.version;
                  setConflictRemote(null);
                  setSaveState("saved");
                }
              }}
            >
              Load their version
            </button>
            <button
              type="button"
              className={ghostBtn}
              onClick={() => {
                void duplicateTacticsBoard(team.id, board.id, currentUid, {
                  title: `${title} — my version`,
                  displayName,
                }).then((copy) =>
                  router.push(tacticsBoardEditorUrl(team.id, copy.id)),
                );
              }}
            >
              Save mine as a copy
            </button>
          </div>
        </div>
      )}

      <TacticsPlaybackControls
        stepIndex={playback.isPlaybackActive ? playback.captionIndex : selectedIndex}
        stepCount={steps.length}
        isPlaying={playback.isPlaying}
        isPlaybackActive={playback.isPlaybackActive}
        loop={loop}
        speedPreset={speedPreset}
        onPlayPause={() => {
          void persistStep().then(() => playback.togglePlay());
        }}
        onPrevious={playback.previous}
        onNext={playback.next}
        onRestart={playback.restart}
        onToggleLoop={() => {
          setLoop((v) => !v);
          if (canEdit) {
            boardPendingRef.current = true;
            setDirty(true);
          }
        }}
        onSpeedChange={(preset) => {
          setSpeedPreset(preset);
          if (canEdit) {
            boardPendingRef.current = true;
            setDirty(true);
          }
        }}
        onExitPlayback={playback.stop}
        canEditSpeed
      />

      <TacticsStepTimeline
        steps={steps}
        selectedStepId={activeStepId}
        canEdit={canEdit && !playback.isPlaybackActive}
        disabled={playback.isPlaying}
        onSelect={(id) => void selectStep(id)}
        onAddStep={() => void handleAddStep()}
        onRename={(id, t) => {
          void renameTacticsStep(team.id, board.id, currentUid, id, t).then(
            (step) => {
              setSteps((prev) => prev.map((s) => (s.id === step.id ? step : s)));
              if (id === activeStepId) setStepTitle(step.title);
            },
          );
        }}
        onDuplicate={(id) => {
          void persistStep().then(() =>
            duplicateTacticsStep(team.id, board.id, currentUid, id).then(
              ({ steps: next, created }) => {
                setSteps(next);
                loadStepIntoEditor(created);
              },
            ),
          );
        }}
        onInsertAfter={(id) => {
          void persistStep().then(() =>
            addTacticsStepAfter(team.id, board.id, currentUid, id).then(
              ({ steps: next, created }) => {
                setSteps(next);
                loadStepIntoEditor(created);
              },
            ),
          );
        }}
        onMove={(id, dir) => {
          void persistStep().then(() =>
            moveTacticsStep(team.id, board.id, currentUid, id, dir).then(
              setSteps,
            ),
          );
        }}
        onDelete={(id) => {
          void deleteTacticsStep(team.id, board.id, currentUid, id).then(
            (next) => {
              setSteps(next);
              const keep =
                next.find((s) => s.id === activeStepId) ?? next[0];
              if (keep) loadStepIntoEditor(keep);
            },
          );
        }}
      />

      {playback.isPlaybackActive ? (
        <TacticsStepNotes
          title={steps[playback.captionIndex]?.title ?? ""}
          notes={steps[playback.captionIndex]?.notes ?? ""}
          compact
        />
      ) : canEdit ? (
        <TacticsStepNotes
          title={stepTitle}
          notes={stepNotes}
          onTitleChange={(t) => {
            setStepTitle(t);
            markStepDirty();
          }}
          onNotesChange={(n) => {
            setStepNotes(n);
            markStepDirty();
          }}
        />
      ) : (
        <TacticsStepNotes
          title={activeStep?.title ?? ""}
          notes={activeStep?.notes ?? ""}
          compact
        />
      )}

      {canEdit && !playback.isPlaybackActive ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/50 px-3 py-2">
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Field view"
          >
            {(
              [
                ["full", "Full field"],
                ["offensive", "Offensive"],
                ["defensive", "Defensive"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={toolBtn(board.fieldView === id)}
                onClick={() => {
                  setBoard((b) => ({ ...b, fieldView: id as TacticsFieldView }));
                  boardPendingRef.current = true;
                  setDirty(true);
                  setSaveState("idle");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-white/10 sm:block" />
          <label className="flex items-center gap-2 text-[11px] font-medium text-zinc-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: TACTICS_HOME_COLOR }}
              aria-hidden
            />
            Home
            <select
              aria-label="Home players"
              value={countPlayersOnSide(objects, "home")}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (!Number.isFinite(n)) return;
                applyObjectsCommit(setPlayersOnSide(objects, "home", n));
                setSelectedId(null);
              }}
              className="rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-xs font-semibold text-white"
            >
              <option value={0}>0</option>
              {TACTICS_PLAYER_COUNT_OPTIONS.map((n) => (
                <option key={`home-${n}`} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] font-medium text-zinc-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: TACTICS_AWAY_COLOR }}
              aria-hidden
            />
            Away
            <select
              aria-label="Away players"
              value={countPlayersOnSide(objects, "away")}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (!Number.isFinite(n)) return;
                applyObjectsCommit(setPlayersOnSide(objects, "away", n));
                setSelectedId(null);
              }}
              className="rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-xs font-semibold text-white"
            >
              <option value={0}>0</option>
              {TACTICS_PLAYER_COUNT_OPTIONS.map((n) => (
                <option key={`away-${n}`} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {selectedIndex > 0 ? (
            <label className="flex items-center gap-2 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={showPrevPositions}
                onChange={(e) => setShowPrevPositions(e.target.checked)}
              />
              Show previous positions
            </label>
          ) : null}
        </div>
      ) : null}

      {canEdit && !playback.isPlaybackActive ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.07] bg-zinc-950/50 p-2">
          {(
            [
              ["select", "Select"],
              ["home", "Home"],
              ["away", "Away"],
              ["ball", "Ball"],
              ["cone", "Cone"],
              ["mini_goal", "Mini goal"],
              ["area_label", "Area label"],
              ["arrow", "Arrow"],
              ["draw", "Draw"],
              ["circle", "Circle"],
              ["zone", "Zone"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={toolBtn(tool === id)}
              onClick={() => setTool(id)}
              style={
                id === "home"
                  ? { boxShadow: `inset 0 -2px 0 ${TACTICS_HOME_COLOR}` }
                  : id === "away"
                    ? { boxShadow: `inset 0 -2px 0 ${TACTICS_AWAY_COLOR}` }
                    : id === "arrow" ||
                        id === "draw" ||
                        id === "circle" ||
                        id === "zone"
                      ? { boxShadow: `inset 0 -2px 0 ${TACTICS_DRAW_COLOR}` }
                      : undefined
              }
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-white/10" />
          <button type="button" className={toolBtn(false)} onClick={handleUndo}>
            Undo
          </button>
          <button type="button" className={toolBtn(false)} onClick={handleRedo}>
            Redo
          </button>
          <button type="button" className={toolBtn(false)} onClick={handleClear}>
            Clear
          </button>
        </div>
      ) : null}

      {selected?.type === "player" && canEdit && !playback.isPlaybackActive ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/40 px-3 py-2">
          <label className="text-[11px] text-zinc-400">
            Number
            <input
              type="text"
              maxLength={3}
              value={selected.label}
              onChange={(e) =>
                updateSelectedPlayer({
                  label: e.target.value.replace(/[^\dA-Za-z]/g, "").slice(0, 3),
                })
              }
              className="mt-1 block w-16 rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Color
            <input
              type="color"
              value={
                selected.color ||
                (selected.team === "home"
                  ? TACTICS_HOME_COLOR
                  : TACTICS_AWAY_COLOR)
              }
              onChange={(e) => updateSelectedPlayer({ color: e.target.value })}
              className="mt-1 block h-9 w-12 cursor-pointer rounded-lg border border-white/12 bg-transparent"
            />
          </label>
          <button type="button" className={ghostBtn} onClick={deleteSelected}>
            Delete
          </button>
        </div>
      ) : null}

      {selected?.type === "area_label" &&
      canEdit &&
      !playback.isPlaybackActive ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/40 px-3 py-2">
          <label className="text-[11px] text-zinc-400">
            Label
            <input
              type="text"
              maxLength={48}
              value={selected.text}
              onChange={(event) =>
                applyObjectsCommit(
                  objects.map((object) =>
                    object.id === selected.id &&
                    object.type === "area_label"
                      ? { ...object, text: event.target.value }
                      : object,
                  ),
                )
              }
              className="mt-1 block min-w-48 rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <button type="button" className={ghostBtn} onClick={deleteSelected}>
            Delete
          </button>
        </div>
      ) : null}

      {selected &&
      selected.type !== "player" &&
      selected.type !== "area_label" &&
      canEdit &&
      !playback.isPlaybackActive ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/40 px-3 py-2">
          <span className="text-xs text-zinc-400">
            Selected: {selected.type.replaceAll("_", " ")}
          </span>
          <button type="button" className={ghostBtn} onClick={deleteSelected}>
            Delete
          </button>
        </div>
      ) : null}

      <TacticsBoardCanvas
        orientation={board.fieldOrientation}
        fieldView={board.fieldView}
        objects={canvasObjects}
        ghostObjects={ghostObjects}
        showGhostPaths={showPrevPositions && !playback.isPlaybackActive}
        tool={editingLocked ? "select" : tool}
        readOnly={editingLocked}
        selectedId={playback.isPlaybackActive ? null : selectedId}
        onSelect={setSelectedId}
        onChangeObjects={applyObjectsLive}
        onGestureEnd={applyObjectsCommit}
        svgRef={svgRef}
      />
      {presetLibraryOpen ? (
        <TacticsPresetLibrary
          team={team}
          currentUid={currentUid}
          displayName={displayName}
          onClose={() => setPresetLibraryOpen(false)}
          modal
        />
      ) : null}
    </div>
  );
}
