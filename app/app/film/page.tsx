"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import UserDriveConnect from "@/components/UserDriveConnect";
import UserYouTubeUploadConnect from "@/components/UserYouTubeUploadConnect";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  getUserDrivePublic,
  getUserYouTubeUploadPublic,
  listMyFilmSources,
  setFilmSourceReviewGame,
  updateFilmSourceOrganize,
  type FilmOrganizeKind,
  type FilmSource,
  type UserDrivePublic,
  type UserYouTubeUploadPublic,
} from "@/lib/film-sources";
import {
  addGameSourceFromDriveUpload,
  addGameSourceFromYouTubeUpload,
  createGame,
} from "@/lib/games";
import { isAngleSlot } from "@/lib/drive/angle-slots";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const linkBack = "text-sm text-zinc-400 transition hover:text-zinc-100";

export default function MyFilmPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drive, setDrive] = useState<UserDrivePublic | null>(null);
  const [youtube, setYoutube] = useState<UserYouTubeUploadPublic | null>(null);
  const [sources, setSources] = useState<FilmSource[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadList = useCallback(async () => {
    if (!user) return;
    const [d, yt, rows] = await Promise.all([
      getUserDrivePublic(user.uid),
      getUserYouTubeUploadPublic(user.uid),
      listMyFilmSources(user.uid),
    ]);
    setDrive(d);
    setYoutube(yt);
    setSources(rows.filter((s) => s.status !== "dismissed"));
    return yt;
  }, [user]);

  const syncChannel = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/youtube/sync-channel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        imported?: number;
        matched?: number;
        scanned?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error || "Could not sync YouTube channel.");
      }
      const imported = json?.imported ?? 0;
      const matched = json?.matched ?? 0;
      setSyncNote(
        imported > 0
          ? `Pulled ${imported} new Game Cap MOGO upload${imported === 1 ? "" : "s"} into your stack.`
          : matched > 0
            ? `Found ${matched} MOGO upload${matched === 1 ? "" : "s"} — already in your queue or cleared.`
            : `Scanned ${json?.scanned ?? 0} recent videos — no new GameCapMOGO titles.`,
      );
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [user, loadList]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    setError(null);
    try {
      const yt = await loadList();
      if (yt?.connectedAt) {
        await syncChannel();
      }
    } catch (e) {
      console.error("[my-film]", e);
      setError(e instanceof Error ? e.message : "Could not load My Film.");
    } finally {
      setListLoading(false);
    }
  }, [user, loadList, syncChannel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const workQueue = useMemo(
    () =>
      sources.filter(
        (s) => !s.reviewGameId && (s.kind === "youtube" || s.youtubeVideoId),
      ),
    [sources],
  );
  const rest = useMemo(
    () =>
      sources.filter(
        (s) => Boolean(s.reviewGameId) || !(s.kind === "youtube" || s.youtubeVideoId),
      ),
    [sources],
  );

  const setKind = async (source: FilmSource, organizeKind: FilmOrganizeKind) => {
    if (!user) return;
    setBusyId(source.id);
    try {
      await updateFilmSourceOrganize(user.uid, source.id, { organizeKind });
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusyId(null);
    }
  };

  const clearItem = async (source: FilmSource) => {
    if (!user) return;
    setBusyId(source.id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/youtube/dismiss", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error || "Could not clear.");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear.");
    } finally {
      setBusyId(null);
    }
  };

  const openReview = async (source: FilmSource) => {
    if (!user) return;
    if (source.reviewGameId) {
      router.push(`/game/${source.reviewGameId}/review`);
      return;
    }
    const ytId = source.youtubeVideoId || source.videoId;
    const isYoutube = source.kind === "youtube" || Boolean(ytId);
    if (!isYoutube && !source.driveFileId) {
      setError("This item has no playable source.");
      return;
    }
    setBusyId(source.id);
    setError(null);
    try {
      const title =
        source.label ||
        (source.organizeKind === "practice" ? "Practice" : "My Film");
      const gameId = await createGame(user.uid, { title });
      if (isYoutube && ytId) {
        await addGameSourceFromYouTubeUpload(gameId, user.uid, {
          videoId: ytId,
          label: source.label,
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
        await addGameSourceFromDriveUpload(gameId, user.uid, {
          driveFileId: source.driveFileId!,
          label: source.label,
          angleSlot: slot,
          ...(source.recordedStartTime
            ? { recordedStartTime: source.recordedStartTime }
            : {}),
          ...(typeof source.durationSec === "number"
            ? { durationSec: source.durationSec }
            : {}),
        });
      }
      await setFilmSourceReviewGame(user.uid, source.id, gameId);
      router.push(`/game/${gameId}/review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open review.");
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-zinc-50">
        <h1 className="mb-3 text-2xl font-semibold">My Film</h1>
        <p className="mb-6 max-w-sm text-center text-sm text-zinc-400">
          Sign in to see Game Cap MOGO uploads from your YouTube channel.
        </p>
        <button
          type="button"
          className={primaryBtn}
          onClick={() => void signInWithGoogle().catch(() => {})}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  const renderSource = (source: FilmSource, queued: boolean) => (
    <li
      key={source.id}
      className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {source.label}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {source.organizeKind}
            {source.marksImported ? ` · ${source.marksImported} marks` : ""}
            {source.createdAt
              ? ` · ${source.createdAt.toDate().toLocaleString()}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["game", "practice", "other"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`${ghostBtn} ${
                source.organizeKind === k
                  ? "border-blue-500/40 bg-blue-950/40 text-blue-100"
                  : ""
              }`}
              disabled={busyId === source.id}
              onClick={() => void setKind(source, k)}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {source.kind === "youtube" ||
        source.youtubeVideoId ||
        source.videoId ? (
          <a
            className={ghostBtn}
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(source.youtubeVideoId || source.videoId || "")}`}
            target="_blank"
            rel="noreferrer"
          >
            Open on YouTube
          </a>
        ) : source.url || source.driveFileId ? (
          <a
            className={ghostBtn}
            href={
              source.url ||
              `https://drive.google.com/file/d/${encodeURIComponent(source.driveFileId!)}/view`
            }
            target="_blank"
            rel="noreferrer"
          >
            Open in Drive
          </a>
        ) : null}
        <button
          type="button"
          className={primaryBtn}
          disabled={busyId === source.id}
          onClick={() => void openReview(source)}
        >
          {busyId === source.id
            ? "Opening…"
            : source.reviewGameId
              ? "Continue review"
              : "Review"}
        </button>
        {queued ? (
          <button
            type="button"
            className={ghostBtn}
            disabled={busyId === source.id}
            onClick={() => void clearItem(source)}
          >
            Clear
          </button>
        ) : null}
      </div>
      {queued ? (
        <p className="mt-2 text-[11px] text-zinc-600">
          Work item — Review it or Clear (stays on YouTube, won’t reappear).
        </p>
      ) : null}
    </li>
  );

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10 text-zinc-50">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Film Room
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            My Film
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            MOGO uploads stack here from your YouTube channel. Review or clear.
          </p>
        </div>
        <Link href="/app" className={linkBack}>
          Dashboard
        </Link>
      </div>

      <div className="space-y-5">
        <UserYouTubeUploadConnect
          youtube={youtube}
          onChanged={() => void refresh()}
        />
        <UserDriveConnect drive={drive} onChanged={() => void refresh()} />

        <section className={panelClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              To review{workQueue.length ? ` (${workQueue.length})` : ""}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                className={ghostBtn}
                disabled={syncing || !youtube}
                onClick={() => void syncChannel()}
              >
                {syncing ? "Syncing…" : "Sync YouTube"}
              </button>
              <button
                type="button"
                className={ghostBtn}
                disabled={listLoading}
                onClick={() => void refresh()}
              >
                {listLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}
          {syncNote ? (
            <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-200">
              {syncNote}
            </p>
          ) : null}

          {!youtube ? (
            <p className="text-sm text-zinc-500">
              Connect YouTube upload above — then your GameCapMOGO videos appear
              here automatically.
            </p>
          ) : workQueue.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No open work. Upload from MOGO (title starts with GameCapMOGO) or
              hit Sync YouTube.
            </p>
          ) : (
            <ul className="space-y-3">
              {workQueue.map((s) => renderSource(s, true))}
            </ul>
          )}
        </section>

        {rest.length > 0 ? (
          <section className={panelClass}>
            <h2 className="mb-3 text-sm font-semibold text-white">
              Reviewed / other
            </h2>
            <ul className="space-y-3">
              {rest.map((s) => renderSource(s, false))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
