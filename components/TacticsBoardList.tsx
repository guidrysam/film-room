"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import SoccerFieldSvg from "@/components/SoccerFieldSvg";
import { tacticsBoardEditorUrl } from "@/lib/tactics-board-share";
import {
  createTacticsBoard,
  deleteTacticsBoard,
  duplicateTacticsBoard,
  listTacticsBoards,
  relativeUpdatedLabel,
  renameTacticsBoard,
  TACTICS_AWAY_COLOR,
  TACTICS_HOME_COLOR,
  visibilityLabel,
  type TacticsBoard,
} from "@/lib/tactics-boards";
import { canCoachTeam, type Team } from "@/lib/teams";
import {
  aspectRatioForView,
  normToSvg,
  viewBoxAttr,
} from "@/lib/tactics-field-geometry";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40";

const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40";

function MiniPreview({ board }: { board: TacticsBoard }) {
  const orientation = board.fieldOrientation;
  const fieldView = board.fieldView;
  const preview =
    board.previewObjects.length > 0 ? board.previewObjects : board.objects;
  const multiStep = board.stepCount > 1;
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-zinc-900"
      style={{ aspectRatio: aspectRatioForView(orientation, fieldView) }}
    >
      <svg
        viewBox={viewBoxAttr(orientation, fieldView)}
        className="h-full w-full"
        aria-hidden
      >
        <SoccerFieldSvg orientation={orientation} asGroup />
        {preview.slice(0, 24).map((o) => {
          if (o.type === "player") {
            const p = normToSvg(o.x, o.y, orientation);
            return (
              <circle
                key={o.id}
                cx={p.x}
                cy={p.y}
                r={18}
                fill={
                  o.color ||
                  (o.team === "home" ? TACTICS_HOME_COLOR : TACTICS_AWAY_COLOR)
                }
              />
            );
          }
          if (o.type === "ball") {
            const p = normToSvg(o.x, o.y, orientation);
            return (
              <circle key={o.id} cx={p.x} cy={p.y} r={8} fill="#f5f5f4" />
            );
          }
          return null;
        })}
      </svg>
      {multiStep ? (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
          ▶ {board.stepCount} steps
        </span>
      ) : null}
    </div>
  );
}

export type TacticsBoardListProps = {
  team: Team;
  currentUid: string;
  displayName?: string | null;
};

export default function TacticsBoardList({
  team,
  currentUid,
  displayName,
}: TacticsBoardListProps) {
  const router = useRouter();
  const [boards, setBoards] = useState<TacticsBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const canCoach = canCoachTeam(team, currentUid);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTacticsBoards(team.id, currentUid);
      setBoards(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load tactics boards.",
      );
      setBoards([]);
    } finally {
      setLoading(false);
    }
  }, [team.id, currentUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!canCoach || creating) return;
    setCreating(true);
    try {
      const board = await createTacticsBoard(team.id, currentUid, {
        title: "Untitled board",
        displayName,
      });
      router.push(tacticsBoardEditorUrl(team.id, board.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not create board.");
    } finally {
      setCreating(false);
    }
  };

  if (!canCoach) {
    return (
      <div className={panelClass}>
        <p className="text-sm font-semibold text-white">Tactics</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          Tactics boards are for coaches. Ask a team coach or admin if you need
          access to a shared board link.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Tactics</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Digital whiteboard for set pieces, shapes, and coaching points.
            Shared with coaches on this team by default.
          </p>
        </div>
        <button
          type="button"
          className={primaryBtn}
          disabled={creating}
          onClick={() => void handleCreate()}
        >
          {creating ? "Creating…" : "+ New board"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading boards…</p>
      ) : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && !error && boards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center">
          <p className="text-sm text-zinc-300">No boards yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            Create one in under 10 seconds for halftime talks.
          </p>
          <button
            type="button"
            className={`${primaryBtn} mt-4`}
            onClick={() => void handleCreate()}
          >
            Create board
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {boards.map((board) => (
          <div key={board.id} className={`${panelClass} !p-3`}>
            <Link
              href={tacticsBoardEditorUrl(team.id, board.id)}
              className="block"
            >
              <MiniPreview board={board} />
            </Link>
            <div className="mt-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                {renamingId === board.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void (async () => {
                        try {
                          await renameTacticsBoard(
                            team.id,
                            board.id,
                            currentUid,
                            renameDraft,
                            displayName,
                          );
                          setRenamingId(null);
                          await refresh();
                        } catch (err) {
                          alert(
                            err instanceof Error
                              ? err.message
                              : "Could not rename.",
                          );
                        }
                      })();
                    }}
                  >
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm text-white"
                    />
                  </form>
                ) : (
                  <Link
                    href={tacticsBoardEditorUrl(team.id, board.id)}
                    className="block truncate text-sm font-semibold text-white hover:underline"
                  >
                    {board.title}
                  </Link>
                )}
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {board.stepCount > 0 ? `${board.stepCount} step${board.stepCount === 1 ? "" : "s"} · ` : ""}
                  Edited {relativeUpdatedLabel(board.updatedAt)}
                  {board.updatedByName ? ` by ${board.updatedByName}` : ""}
                </p>
                <p className="truncate text-[10px] text-zinc-600">
                  {visibilityLabel(board.visibility)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Link
                    href={tacticsBoardEditorUrl(team.id, board.id)}
                    className={ghostBtn}
                  >
                    Open
                  </Link>
                  <Link
                    href={tacticsBoardEditorUrl(team.id, board.id, { play: true })}
                    className={ghostBtn}
                  >
                    Play
                  </Link>
                </div>
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() =>
                    setMenuId((id) => (id === board.id ? null : board.id))
                  }
                >
                  ⋯
                </button>
                {menuId === board.id ? (
                  <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-xl">
                    <Link
                      href={tacticsBoardEditorUrl(team.id, board.id)}
                      className="block rounded-lg px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.06]"
                    >
                      Open
                    </Link>
                    <Link
                      href={tacticsBoardEditorUrl(team.id, board.id, { play: true })}
                      className="block rounded-lg px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.06]"
                    >
                      Play
                    </Link>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMenuId(null);
                        setRenamingId(board.id);
                        setRenameDraft(board.title);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      onClick={() => {
                        setMenuId(null);
                        void duplicateTacticsBoard(
                          team.id,
                          board.id,
                          currentUid,
                          { displayName },
                        )
                          .then((copy) =>
                            router.push(
                              tacticsBoardEditorUrl(team.id, copy.id),
                            ),
                          )
                          .catch((err) =>
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Duplicate failed.",
                            ),
                          );
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/10"
                      onClick={() => {
                        setMenuId(null);
                        if (
                          !window.confirm(
                            `Delete “${board.title}”? This cannot be undone.`,
                          )
                        ) {
                          return;
                        }
                        void deleteTacticsBoard(
                          team.id,
                          board.id,
                          currentUid,
                        )
                          .then(() => refresh())
                          .catch((err) =>
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Delete failed.",
                            ),
                          );
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
