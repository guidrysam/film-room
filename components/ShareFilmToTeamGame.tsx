"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listClubTeams,
  listMyClubs,
  type Club,
} from "@/lib/clubs";
import type { Team } from "@/lib/teams";
import {
  addGameSourceFromDriveUpload,
  addGameSourceFromYouTubeUpload,
  listGamesForTeam,
  type Game,
} from "@/lib/games";
import {
  updateFilmSourceOrganize,
  type FilmSource,
} from "@/lib/film-sources";
import { isAngleSlot } from "@/lib/drive/angle-slots";
import { formatGameCapMogoDisplayName } from "@/lib/youtube/mogo-match";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const selectClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white";

type Props = {
  uid: string;
  source: FilmSource;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onShared: () => void | Promise<void>;
};

/**
 * Parent/coach: attach a My Film item onto a team game under a club they belong to.
 */
export default function ShareFilmToTeamGame({
  uid,
  source,
  busy,
  onBusy,
  onError,
  onShared,
}: Props) {
  const [open, setOpen] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [clubId, setClubId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [gameId, setGameId] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);

  const loadClubs = useCallback(async () => {
    setLoadingMeta(true);
    onError(null);
    try {
      const rows = await listMyClubs(uid);
      setClubs(rows);
      if (rows.length === 1) setClubId(rows[0]!.id);
      else if (source.clubId && rows.some((c) => c.id === source.clubId)) {
        setClubId(source.clubId);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not load clubs.");
    } finally {
      setLoadingMeta(false);
    }
  }, [uid, source.clubId, onError]);

  useEffect(() => {
    if (!open) return;
    void loadClubs();
  }, [open, loadClubs]);

  useEffect(() => {
    if (!clubId) {
      setTeams([]);
      setTeamId("");
      return;
    }
    let cancelled = false;
    void listClubTeams(clubId)
      .then((rows) => {
        if (cancelled) return;
        setTeams(rows);
        if (rows.length === 1) setTeamId(rows[0]!.id);
        else if (source.teamId && rows.some((t) => t.id === source.teamId)) {
          setTeamId(source.teamId);
        } else {
          setTeamId("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          onError(e instanceof Error ? e.message : "Could not load teams.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, source.teamId, onError]);

  useEffect(() => {
    if (!teamId) {
      setGames([]);
      setGameId("");
      return;
    }
    let cancelled = false;
    void listGamesForTeam(teamId)
      .then((rows) => {
        if (cancelled) return;
        setGames(rows);
        if (rows.length === 1) setGameId(rows[0]!.id);
        else if (source.gameId && rows.some((g) => g.id === source.gameId)) {
          setGameId(source.gameId);
        } else {
          setGameId("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          onError(e instanceof Error ? e.message : "Could not load games.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, source.gameId, onError]);

  const share = async () => {
    if (!clubId || !teamId || !gameId) {
      onError("Pick a club, team, and game.");
      return;
    }
    const ytId = source.youtubeVideoId || source.videoId;
    const isYoutube = source.kind === "youtube" || Boolean(ytId);
    if (!isYoutube && !source.driveFileId) {
      onError("This item has no playable source.");
      return;
    }
    onBusy(true);
    onError(null);
    try {
      const label =
        formatGameCapMogoDisplayName(source.label) || source.label || "Film";
      if (isYoutube && ytId) {
        await addGameSourceFromYouTubeUpload(gameId, uid, {
          videoId: ytId,
          label,
          youtubePrivacyStatus: "unlisted",
          ...(source.recordedStartTime
            ? { recordedStartTime: source.recordedStartTime }
            : {}),
          ...(typeof source.durationSec === "number"
            ? { durationSec: source.durationSec }
            : {}),
        });
      } else {
        const slot = isAngleSlot(source.angleSlot) ? source.angleSlot : "main";
        await addGameSourceFromDriveUpload(gameId, uid, {
          driveFileId: source.driveFileId!,
          label,
          angleSlot: slot,
          ...(source.recordedStartTime
            ? { recordedStartTime: source.recordedStartTime }
            : {}),
          ...(typeof source.durationSec === "number"
            ? { durationSec: source.durationSec }
            : {}),
        });
      }
      await updateFilmSourceOrganize(uid, source.id, {
        clubId,
        teamId,
        gameId,
      });
      setOpen(false);
      await onShared();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not share to game.");
    } finally {
      onBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className={ghostBtn}
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Share to team game
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="mb-2 text-[11px] font-medium text-zinc-300">
        Share to a club team game
      </p>
      {loadingMeta ? (
        <p className="text-[11px] text-zinc-500">Loading clubs…</p>
      ) : clubs.length === 0 ? (
        <p className="text-[11px] text-zinc-500">
          Join a club first (Find a club or invite link), then share film here.
        </p>
      ) : (
        <div className="space-y-2">
          <label className="block text-[11px] text-zinc-500">
            Club
            <select
              className={selectClass}
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
            >
              <option value="">Select…</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-zinc-500">
            Team
            <select
              className={selectClass}
              value={teamId}
              disabled={!clubId}
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
              No games on this team yet — ask a coach to create one, or use Game
              Cap.
            </p>
          ) : null}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || !gameId}
          onClick={() => void share()}
        >
          {busy ? "Sharing…" : "Add to game"}
        </button>
        <button
          type="button"
          className={ghostBtn}
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
