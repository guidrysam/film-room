"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import TacticsBoardCanvas, {
  type TacticsTool,
} from "@/components/TacticsBoardCanvas";
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
  type TacticsVisibility,
} from "@/lib/tactics-boards";
import {
  downloadTacticsPng,
  exportTacticsPdfViaPrint,
  shareTacticsImage,
} from "@/lib/tactics-export";
import {
  countPlayersOnSide,
  setPlayersOnSide,
  TACTICS_PLAYER_COUNT_OPTIONS,
} from "@/lib/tactics-formations";
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

export type TacticsBoardEditorProps = {
  team: Team;
  board: TacticsBoard;
  currentUid: string;
  displayName?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const MAX_HISTORY = 40;

export default function TacticsBoardEditor({
  team,
  board: initialBoard,
  currentUid,
  displayName,
}: TacticsBoardEditorProps) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [objects, setObjects] = useState<TacticsBoardObject[]>(initialBoard.objects);
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const historyRef = useRef<TacticsBoardObject[][]>([initialBoard.objects]);
  const historyIndexRef = useRef(0);
  const versionRef = useRef(initialBoard.version);
  const saveTimerRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const canEdit = canEditTacticsBoard(board, team, currentUid);

  const pushHistory = useCallback((next: TacticsBoardObject[]) => {
    const idx = historyIndexRef.current;
    const truncated = historyRef.current.slice(0, idx + 1);
    truncated.push(next);
    if (truncated.length > MAX_HISTORY) truncated.shift();
    historyRef.current = truncated;
    historyIndexRef.current = truncated.length - 1;
  }, []);

  const applyObjects = useCallback(
    (next: TacticsBoardObject[], recordHistory: boolean) => {
      setObjects(next);
      if (recordHistory) pushHistory(next);
      pendingRef.current = true;
      setDirty(true);
      setSaveState("idle");
    },
    [pushHistory],
  );

  const persist = useCallback(async () => {
    if (!canEdit || !pendingRef.current) return;
    pendingRef.current = false;
    setSaveState("saving");
    setSaveError(null);
    try {
      const result = await updateTacticsBoard(team.id, board.id, currentUid, {
        title,
        objects,
        fieldOrientation: board.fieldOrientation,
        expectedVersion: versionRef.current,
        displayName,
      });
      if (!result.ok) {
        setConflictRemote(result.conflict.remote);
        setSaveState("error");
        pendingRef.current = true;
        return;
      }
      versionRef.current = result.board.version;
      setBoard(result.board);
      setDirty(false);
      setSaveState("saved");
      void syncTacticsBoardShareSnapshot(result.board);
    } catch (err) {
      pendingRef.current = true;
      setSaveState("error");
      setSaveError(
        err instanceof Error ? err.message : "Could not save board.",
      );
    }
  }, [
    canEdit,
    team.id,
    board.id,
    board.fieldOrientation,
    currentUid,
    title,
    objects,
    displayName,
  ]);

  useEffect(() => {
    if (!pendingRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persist();
    }, 600);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [objects, title, board.fieldOrientation, persist]);

  useEffect(() => {
    const onLeave = () => {
      if (pendingRef.current) void persist();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [persist]);

  const handleUndo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const prev = historyRef.current[historyIndexRef.current]!;
    setObjects(prev);
    pendingRef.current = true;
    setDirty(true);
  };

  const handleRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = historyRef.current[historyIndexRef.current]!;
    setObjects(next);
    pendingRef.current = true;
    setDirty(true);
  };

  const handleClear = () => {
    if (!canEdit) return;
    if (!window.confirm("Clear all players and drawings on this board?")) return;
    applyObjects([], true);
    setSelectedId(null);
  };

  const selected = objects.find((o) => o.id === selectedId) ?? null;

  const updateSelectedPlayer = (patch: {
    label?: string;
    color?: string;
  }) => {
    if (!selected || selected.type !== "player") return;
    const next = objects.map((o) =>
      o.id === selected.id && o.type === "player" ? { ...o, ...patch } : o,
    );
    applyObjects(next, true);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    applyObjects(
      objects.filter((o) => o.id !== selectedId),
      true,
    );
    setSelectedId(null);
  };

  const handleShareMode = async (mode: TacticsVisibility | "link_view" | "link_edit") => {
    if (!canEdit) return;
    setShareBusy(true);
    try {
      await persist();
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
              versionRef.current = r.board.version;
              setBoard(r.board);
            }
          }
        }
        const reloaded = await getTacticsBoard(team.id, board.id);
        if (reloaded) {
          versionRef.current = reloaded.version;
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
        versionRef.current = reloaded.version;
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

  const handleDuplicate = async () => {
    try {
      const copy = await duplicateTacticsBoard(team.id, board.id, currentUid, {
        displayName,
      });
      router.push(tacticsBoardEditorUrl(team.id, copy.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not duplicate.");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete “${board.title}”? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteTacticsBoard(team.id, board.id, currentUid);
      router.push(teamTacticsUrl(team.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  const loadRemoteVersion = () => {
    if (!conflictRemote) return;
    setBoard(conflictRemote);
    setObjects(conflictRemote.objects);
    setTitle(conflictRemote.title);
    versionRef.current = conflictRemote.version;
    historyRef.current = [conflictRemote.objects];
    historyIndexRef.current = 0;
    pendingRef.current = false;
    setConflictRemote(null);
    setSaveState("saved");
    setDirty(false);
  };

  const saveMineAsCopy = async () => {
    try {
      const copy = await duplicateTacticsBoard(team.id, board.id, currentUid, {
        title: `${title} — my version`,
        displayName,
      });
      const r = await updateTacticsBoard(team.id, copy.id, currentUid, {
        objects,
        title: `${title} — my version`,
        expectedVersion: copy.version,
        displayName,
      });
      if (r.ok) {
        router.push(tacticsBoardEditorUrl(team.id, r.board.id));
      } else {
        router.push(tacticsBoardEditorUrl(team.id, copy.id));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save a copy.");
    }
  };

  const toggleOrientation = () => {
    if (!canEdit) return;
    setBoard((b) => ({
      ...b,
      fieldOrientation:
        b.fieldOrientation === "horizontal" ? "vertical" : "horizontal",
    }));
    pendingRef.current = true;
    setDirty(true);
  };

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
            disabled={!canEdit}
            onChange={(e) => {
              setTitle(e.target.value);
              pendingRef.current = true;
              setDirty(true);
              setSaveState("idle");
            }}
            onBlur={() => void persist()}
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
          </p>
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
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-white/10 bg-zinc-950 p-1.5 shadow-xl">
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        void handleDuplicate();
                      }}
                    >
                      Duplicate board
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMoreOpen(false);
                        toggleOrientation();
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
                        void downloadTacticsPng(svgRef, title).then(
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
                      Export PNG
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
                      Export PDF
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
                                ? "Shared."
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
                        void handleDelete();
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
            All coaches on this team can find boards set to team access. Link
            sharing is optional for view-only or edit access outside the library.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(
              [
                ["team_coaches", "All team coaches can edit"],
                ["private", "Only me"],
                ["link_view", "Anyone with the link can view"],
                ["link_edit", "Anyone with the link can edit"],
              ] as const
            ).map(([mode, label]) => {
              const active =
                (mode === "team_coaches" && board.visibility === "team_coaches") ||
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

      {conflictRemote ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-950/40 p-4">
          <p className="text-sm font-semibold text-amber-100">
            This board was updated by another coach.
          </p>
          <p className="mt-1 text-xs text-amber-100/80">
            {conflictRemote.updatedByName
              ? `${conflictRemote.updatedByName} saved a newer version.`
              : "A newer version is on the server."}{" "}
            Loading theirs will discard your unsaved local edits.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} onClick={loadRemoteVersion}>
              Load their version
            </button>
            <button type="button" className={ghostBtn} onClick={() => void saveMineAsCopy()}>
              Save mine as a copy
            </button>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/50 px-3 py-2">
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
                applyObjects(setPlayersOnSide(objects, "home", n), true);
                setSelectedId(null);
              }}
              className="rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-xs font-semibold text-white focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
                applyObjects(setPlayersOnSide(objects, "away", n), true);
                setSelectedId(null);
              }}
              className="rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-xs font-semibold text-white focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value={0}>0</option>
              {TACTICS_PLAYER_COUNT_OPTIONS.map((n) => (
                <option key={`away-${n}`} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="hidden text-[10px] text-zinc-600 sm:inline">
            Places dots in a default shape
          </span>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.07] bg-zinc-950/50 p-2">
          {(
            [
              ["select", "Select"],
              ["home", "Home"],
              ["away", "Away"],
              ["ball", "Ball"],
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
                    : id === "arrow" || id === "draw" || id === "circle" || id === "zone"
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

      {selected?.type === "player" && canEdit ? (
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
                (selected.team === "home" ? TACTICS_HOME_COLOR : TACTICS_AWAY_COLOR)
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

      <TacticsBoardCanvas
        orientation={board.fieldOrientation}
        objects={objects}
        tool={canEdit ? tool : "select"}
        readOnly={!canEdit}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChangeObjects={(next) => applyObjects(next, true)}
        svgRef={svgRef}
      />
    </div>
  );
}
