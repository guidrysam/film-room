"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  dismissClubCoachInboxItem,
  listClubCoachInbox,
  markClubCoachInboxOrganized,
  type ClubCoachInboxItem,
} from "@/lib/club-coach-inbox";
import { listClubTeams } from "@/lib/clubs";
import type { Team } from "@/lib/teams";
import {
  addGameSourceFromDriveUpload,
  addGameSourceFromYouTubeUpload,
  createGame,
  listGamesForTeam,
  type Game,
} from "@/lib/games";
import { isAngleSlot } from "@/lib/drive/angle-slots";
import { formatGameCapMogoDisplayName } from "@/lib/youtube/mogo-match";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const selectClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white";

type Props = {
  clubId: string;
  uid: string;
  canManage: boolean;
};

export default function ClubCoachInbox({ clubId, uid, canManage }: Props) {
  const [items, setItems] = useState<ClubCoachInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [organizeId, setOrganizeId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [teamId, setTeamId] = useState("");
  const [gameId, setGameId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listClubCoachInbox(clubId);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load coach inbox.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!organizeId || !canManage) return;
    void listClubTeams(clubId)
      .then((rows) => {
        setTeams(rows);
        if (rows.length === 1) setTeamId(rows[0]!.id);
      })
      .catch(() => setTeams([]));
  }, [organizeId, canManage, clubId]);

  useEffect(() => {
    if (!teamId) {
      setGames([]);
      setGameId("");
      return;
    }
    void listGamesForTeam(teamId)
      .then((rows) => {
        setGames(rows);
        if (rows.length === 1) setGameId(rows[0]!.id);
        else setGameId("");
      })
      .catch(() => setGames([]));
  }, [teamId]);

  const openWatch = (item: ClubCoachInboxItem) => {
    if (item.youtubeVideoId) {
      window.open(
        `https://www.youtube.com/watch?v=${encodeURIComponent(item.youtubeVideoId)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (item.driveFileId) {
      window.open(
        `https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  const openInFilmRoom = async (item: ClubCoachInboxItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const title =
        formatGameCapMogoDisplayName(item.label) || item.label || "Shared film";
      const gameIdNew = await createGame(uid, {
        title,
        ...(clubId ? { clubId } : {}),
      });
      if (item.youtubeVideoId) {
        await addGameSourceFromYouTubeUpload(gameIdNew, uid, {
          videoId: item.youtubeVideoId,
          label: title,
          youtubePrivacyStatus: "unlisted",
          ...(item.recordedStartTime
            ? { recordedStartTime: item.recordedStartTime }
            : {}),
          ...(typeof item.durationSec === "number"
            ? { durationSec: item.durationSec }
            : {}),
        });
      } else if (item.driveFileId) {
        const slot = isAngleSlot(item.angleSlot) ? item.angleSlot : "main";
        await addGameSourceFromDriveUpload(gameIdNew, uid, {
          driveFileId: item.driveFileId,
          label: title,
          angleSlot: slot,
          ...(item.recordedStartTime
            ? { recordedStartTime: item.recordedStartTime }
            : {}),
          ...(typeof item.durationSec === "number"
            ? { durationSec: item.durationSec }
            : {}),
        });
      } else {
        throw new Error("No playable source on this item.");
      }
      window.location.href = `/game/${gameIdNew}/review`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open in Film Room.");
      setBusyId(null);
    }
  };

  const attachToGame = async (item: ClubCoachInboxItem) => {
    if (!teamId || !gameId) {
      setError("Pick a team and game.");
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      const label =
        formatGameCapMogoDisplayName(item.label) || item.label || "Shared film";
      if (item.youtubeVideoId) {
        await addGameSourceFromYouTubeUpload(gameId, uid, {
          videoId: item.youtubeVideoId,
          label,
          youtubePrivacyStatus: "unlisted",
          ...(item.recordedStartTime
            ? { recordedStartTime: item.recordedStartTime }
            : {}),
          ...(typeof item.durationSec === "number"
            ? { durationSec: item.durationSec }
            : {}),
        });
      } else if (item.driveFileId) {
        const slot = isAngleSlot(item.angleSlot) ? item.angleSlot : "main";
        await addGameSourceFromDriveUpload(gameId, uid, {
          driveFileId: item.driveFileId,
          label,
          angleSlot: slot,
          ...(item.recordedStartTime
            ? { recordedStartTime: item.recordedStartTime }
            : {}),
          ...(typeof item.durationSec === "number"
            ? { durationSec: item.durationSec }
            : {}),
        });
      } else {
        throw new Error("No playable source on this item.");
      }
      await markClubCoachInboxOrganized({
        clubId,
        itemId: item.id,
        teamId,
        gameId,
      });
      setOrganizeId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach to game.");
    } finally {
      setBusyId(null);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Coach film inbox</h2>
        <button
          type="button"
          className={ghostBtn}
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <p className="mb-3 text-xs text-zinc-400">
        Parents share film here. Watch or open in Film Room anytime — organizing
        onto a team game is optional.
      </p>

      {error ? (
        <p className="mb-3 rounded-lg border border-rose-400/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No shared film yet. Parents use Share with coach from My Film.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {formatGameCapMogoDisplayName(item.label) || item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {item.sharedByLabel || `${item.sharedByUid.slice(0, 8)}…`}
                    {item.status === "organized"
                      ? " · organized"
                      : item.status === "open"
                        ? " · open"
                        : ""}
                    {item.createdAt
                      ? ` · ${item.createdAt.toDate().toLocaleString()}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busyId === item.id}
                  onClick={() => openWatch(item)}
                >
                  Watch
                </button>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={busyId === item.id}
                  onClick={() => void openInFilmRoom(item)}
                >
                  {busyId === item.id ? "Opening…" : "Open in Film Room"}
                </button>
                {item.status === "open" ? (
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busyId === item.id}
                    onClick={() => {
                      setOrganizeId(
                        organizeId === item.id ? null : item.id,
                      );
                      setError(null);
                    }}
                  >
                    Organize by team
                  </button>
                ) : item.gameId ? (
                  <Link
                    href={`/game/${item.gameId}/review`}
                    className={ghostBtn}
                  >
                    Open game
                  </Link>
                ) : null}
                {item.status !== "dismissed" ? (
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busyId === item.id}
                    onClick={() => {
                      setBusyId(item.id);
                      void dismissClubCoachInboxItem(clubId, item.id)
                        .then(() => refresh())
                        .catch((e) => {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not dismiss.",
                          );
                        })
                        .finally(() => setBusyId(null));
                    }}
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>

              {organizeId === item.id ? (
                <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
                  <label className="block text-[11px] text-zinc-500">
                    Team
                    <select
                      className={selectClass}
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-zinc-500">
                    Game
                    <select
                      className={selectClass}
                      value={gameId}
                      disabled={!teamId}
                      onChange={(e) => setGameId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {games.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title || g.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  {teamId && games.length === 0 ? (
                    <p className="text-[11px] text-amber-200/90">
                      No games on this team yet — create one first, or just use
                      Open in Film Room.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={busyId === item.id || !gameId}
                      onClick={() => void attachToGame(item)}
                    >
                      {busyId === item.id ? "Saving…" : "Attach to game"}
                    </button>
                    <button
                      type="button"
                      className={ghostBtn}
                      onClick={() => setOrganizeId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
