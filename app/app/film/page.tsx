"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import UserDriveConnect from "@/components/UserDriveConnect";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  getUserDrivePublic,
  listMyFilmSources,
  setFilmSourceReviewGame,
  updateFilmSourceOrganize,
  type FilmOrganizeKind,
  type FilmSource,
  type UserDrivePublic,
} from "@/lib/film-sources";
import { addGameSourceFromDriveUpload, createGame } from "@/lib/games";
import { isAngleSlot } from "@/lib/drive/angle-slots";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100";

export default function MyFilmPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drive, setDrive] = useState<UserDrivePublic | null>(null);
  const [sources, setSources] = useState<FilmSource[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    setError(null);
    try {
      const [d, rows] = await Promise.all([
        getUserDrivePublic(user.uid),
        listMyFilmSources(user.uid),
      ]);
      setDrive(d);
      setSources(rows);
    } catch (e) {
      console.error("[my-film]", e);
      setError(e instanceof Error ? e.message : "Could not load My Film.");
    } finally {
      setListLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setKind = async (source: FilmSource, organizeKind: FilmOrganizeKind) => {
    if (!user) return;
    setBusyId(source.id);
    try {
      await updateFilmSourceOrganize(user.uid, source.id, { organizeKind });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
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
    if (!source.driveFileId) {
      setError("This item has no Drive file.");
      return;
    }
    setBusyId(source.id);
    setError(null);
    try {
      const title =
        source.label ||
        (source.organizeKind === "practice" ? "Practice" : "My Film");
      const gameId = await createGame(user.uid, { title });
      const slot = isAngleSlot(source.angleSlot) ? source.angleSlot : "main";
      await addGameSourceFromDriveUpload(gameId, user.uid, {
        driveFileId: source.driveFileId,
        label: source.label,
        angleSlot: slot,
        ...(source.recordedStartTime
          ? { recordedStartTime: source.recordedStartTime }
          : {}),
        ...(typeof source.durationSec === "number"
          ? { durationSec: source.durationSec }
          : {}),
      });
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
          Sign in to connect Drive and see Game Cap uploads.
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
            Upload first. Attach club, team, player, or game when you care.
          </p>
        </div>
        <Link href="/app" className={linkBack}>
          Dashboard
        </Link>
      </div>

      <div className="space-y-5">
        <UserDriveConnect drive={drive} onChanged={() => void refresh()} />

        <section className={panelClass}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Inbox</h2>
            <button
              type="button"
              className={ghostBtn}
              disabled={listLoading}
              onClick={() => void refresh()}
            >
              {listLoading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {error ? (
            <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}

          {!drive ? (
            <p className="text-sm text-zinc-500">
              Connect Drive above, then upload from Game Cap with no game
              selected.
            </p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No uploads yet. In Game Cap: sign in → Upload film (skip team/game).
            </p>
          ) : (
            <ul className="space-y-3">
              {sources.map((source) => (
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
                        {source.marksImported
                          ? ` · ${source.marksImported} marks`
                          : ""}
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
                    {source.url || source.driveFileId ? (
                      <a
                        className={ghostBtn}
                        href={
                          source.url ||
                          `https://drive.google.com/file/d/${encodeURIComponent(source.driveFileId)}/view`
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
                          : "Review / publish"}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-600">
                    Team / club / player attach comes next — label kind above for
                    now. YouTube publish lives in the review room.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
