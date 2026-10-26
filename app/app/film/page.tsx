"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import UserDriveConnect from "@/components/UserDriveConnect";
import UserYouTubeUploadConnect from "@/components/UserYouTubeUploadConnect";
import PersonalCreditsCard from "@/components/PersonalCreditsCard";
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
  FILM_HIGHLIGHT_MAX_SEC,
  filterFilmSources,
  filmSourceDateMs,
  isFilmReviewed,
  isFilmUnderTenMinutes,
  type FilmLengthFilter,
  type FilmReviewFilter,
} from "@/lib/film-source-filters";
import {
  addGameSourceFromDriveUpload,
  addGameSourceFromYouTubeUpload,
  createGame,
} from "@/lib/games";
import { isAngleSlot } from "@/lib/drive/angle-slots";
import { formatGameCapMogoDisplayName } from "@/lib/youtube/mogo-match";
import ShareFilmWithCoach from "@/components/ShareFilmWithCoach";
import { clubsFindUrl } from "@/lib/club-routes";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const linkBack = "text-sm text-zinc-400 transition hover:text-zinc-100";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600";

type SyncMode = "all" | "under10";

function formatDurationShort(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${r.toString().padStart(2, "0")}`;
}

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
  const [lengthFilter, setLengthFilter] =
    useState<FilmLengthFilter>("under10");
  const [reviewFilter, setReviewFilter] =
    useState<FilmReviewFilter>("unreviewed");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);

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

  const syncChannel = useCallback(
    async (mode: SyncMode = "under10") => {
      if (!user) return;
      setSyncing(true);
      setSyncMenuOpen(false);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/youtube/sync-channel", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            mode === "under10"
              ? { maxDurationSec: FILM_HIGHLIGHT_MAX_SEC }
              : {},
          ),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          imported?: number;
          matched?: number;
          scanned?: number;
          skippedTooLong?: number;
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(json?.error || "Could not sync YouTube channel.");
        }
        const imported = json?.imported ?? 0;
        const matched = json?.matched ?? 0;
        const skippedTooLong = json?.skippedTooLong ?? 0;
        if (mode === "under10") {
          setLengthFilter("under10");
          setReviewFilter("unreviewed");
          setSyncNote(
            imported > 0
              ? `Pulled ${imported} highlight-length clip${imported === 1 ? "" : "s"} (under 10 min).`
              : matched > 0
                ? `Found ${matched} short clip${matched === 1 ? "" : "s"} — already in your queue or cleared.`
                : `Scanned ${json?.scanned ?? 0} videos — no new under-10-min Game Cap matches${
                    skippedTooLong
                      ? ` (${skippedTooLong} longer game${skippedTooLong === 1 ? "" : "s"} skipped)`
                      : ""
                  }.`,
          );
        } else {
          setSyncNote(
            imported > 0
              ? `Pulled ${imported} new Game Cap upload${imported === 1 ? "" : "s"} (MOGO + Tripod).`
              : matched > 0
                ? `Found ${matched} Game Cap upload${matched === 1 ? "" : "s"} — already in your queue or cleared.`
                : `Scanned ${json?.scanned ?? 0} recent videos — no new MOGO/Tripod matches.`,
          );
        }
        await loadList();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed.");
      } finally {
        setSyncing(false);
      }
    },
    [user, loadList],
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    setError(null);
    try {
      const yt = await loadList();
      if (yt?.connectedAt) {
        await syncChannel("under10");
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

  const filteredSources = useMemo(() => {
    const rows = filterFilmSources(sources, {
      query: searchQuery,
      dateFrom,
      dateTo,
      review: reviewFilter,
      length: lengthFilter,
    });
    return [...rows].sort((a, b) => {
      const ah = isFilmUnderTenMinutes(a) ? 0 : 1;
      const bh = isFilmUnderTenMinutes(b) ? 0 : 1;
      if (ah !== bh) return ah - bh;
      return (filmSourceDateMs(b) ?? 0) - (filmSourceDateMs(a) ?? 0);
    });
  }, [sources, searchQuery, dateFrom, dateTo, reviewFilter, lengthFilter]);

  const shortCount = useMemo(
    () => sources.filter((s) => isFilmUnderTenMinutes(s)).length,
    [sources],
  );
  const unreviewedCount = useMemo(
    () => sources.filter((s) => !isFilmReviewed(s)).length,
    [sources],
  );
  const hasActiveSearch =
    Boolean(searchQuery.trim()) ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    reviewFilter !== "all" ||
    lengthFilter !== "all";

  const clearSearch = () => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setReviewFilter("all");
    setLengthFilter("all");
  };

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
        formatGameCapMogoDisplayName(source.label || "") ||
        source.label ||
        (source.organizeKind === "practice" ? "Practice" : "My Film");
      const gameId = await createGame(user.uid, { title });
      if (isYoutube && ytId) {
        await addGameSourceFromYouTubeUpload(gameId, user.uid, {
          videoId: ytId,
          label: formatGameCapMogoDisplayName(source.label) || source.label,
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
          label: formatGameCapMogoDisplayName(source.label) || source.label,
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

  const renderSource = (source: FilmSource) => {
    const reviewed = isFilmReviewed(source);
    const whenMs = filmSourceDateMs(source);
    return (
    <li
      key={source.id}
      className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {formatGameCapMogoDisplayName(source.label) || source.label}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {reviewed ? "reviewed" : "unreviewed"}
            {" · "}
            {source.organizeKind}
            {source.captureDevice === "tripod"
              ? " · Tripod"
              : source.captureDevice === "mogo"
                ? " · MOGO"
                : ""}
            {source.filmKind === "highlight" || isFilmUnderTenMinutes(source)
              ? " · highlight"
              : ""}
            {typeof source.durationSec === "number" && source.durationSec > 0
              ? ` · ${formatDurationShort(source.durationSec)}`
              : ""}
            {source.marksImported ? ` · ${source.marksImported} marks` : ""}
            {whenMs
              ? ` · ${new Date(whenMs).toLocaleString()}`
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
        {user ? (
          <ShareFilmWithCoach
            uid={user.uid}
            source={source}
            busy={busyId === source.id}
            onBusy={(b) => setBusyId(b ? source.id : null)}
            onError={setError}
            onShared={async () => {
              setSyncNote("Shared onto the coach’s team.");
              await loadList();
            }}
          />
        ) : null}
        {!reviewed ? (
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
      {source.clubId && source.gameId ? (
        <p className="mt-2 text-[11px] text-emerald-400/90">
          Shared onto a team game
        </p>
      ) : source.clubId && !source.gameId ? (
        <p className="mt-2 text-[11px] text-emerald-400/90">
          Shared with club coaches
        </p>
      ) : source.gameId ? (
        <p className="mt-2 text-[11px] text-emerald-400/90">
          Linked to a team game
        </p>
      ) : null}
      {!reviewed ? (
        <p className="mt-2 text-[11px] text-zinc-600">
          Work item — Review it or Clear (stays on YouTube, won’t reappear).
        </p>
      ) : null}
    </li>
    );
  };

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
            Upload and gather film here. Share with coach sends a tagged game
            onto a team in your club so the coach can open it with your marks.{" "}
            <Link href={clubsFindUrl()} className="text-blue-300 hover:underline">
              Find a club
            </Link>
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
        <PersonalCreditsCard />
        <UserDriveConnect drive={drive} onChanged={() => void refresh()} />

        <section className={panelClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              Film library
              {filteredSources.length ? ` (${filteredSources.length})` : ""}
              {unreviewedCount ? ` · ${unreviewedCount} unreviewed` : ""}
              {shortCount ? ` · ${shortCount} under 10 min` : ""}
            </h2>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={syncing || !youtube}
                  onClick={() => setSyncMenuOpen((o) => !o)}
                >
                  {syncing ? "Syncing…" : "Sync YouTube ▾"}
                </button>
                {syncMenuOpen ? (
                  <div className="absolute right-0 z-20 mt-1 min-w-[14rem] rounded-lg border border-white/12 bg-zinc-950 p-1 shadow-xl">
                    <button
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-xs text-zinc-100 hover:bg-white/[0.08]"
                      disabled={syncing}
                      onClick={() => void syncChannel("under10")}
                    >
                      Highlights only (under 10 min)
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-xs text-zinc-100 hover:bg-white/[0.08]"
                      disabled={syncing}
                      onClick={() => void syncChannel("all")}
                    >
                      All Game Cap (games + highlights)
                    </button>
                  </div>
                ) : null}
              </div>
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

          <div className="mb-3 space-y-2 rounded-lg border border-white/[0.06] bg-black/25 p-3">
            <label className="block text-[11px] text-zinc-500">
              Search
              <input
                type="search"
                className={`${inputClass} mt-1`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Title, Tripod, highlight…"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] text-zinc-500">
                From
                <input
                  type="date"
                  className={`${inputClass} mt-1`}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="block text-[11px] text-zinc-500">
                To
                <input
                  type="date"
                  className={`${inputClass} mt-1`}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {(
                [
                  ["unreviewed", "Unreviewed"],
                  ["reviewed", "Reviewed"],
                  ["all", "All status"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${ghostBtn} ${
                    reviewFilter === value
                      ? "border-blue-500/40 bg-blue-950/40 text-blue-100"
                      : ""
                  }`}
                  onClick={() => setReviewFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${ghostBtn} ${
                  lengthFilter === "under10"
                    ? "border-blue-500/40 bg-blue-950/40 text-blue-100"
                    : ""
                }`}
                onClick={() => setLengthFilter("under10")}
              >
                Under 10 min
              </button>
              <button
                type="button"
                className={`${ghostBtn} ${
                  lengthFilter === "all"
                    ? "border-blue-500/40 bg-blue-950/40 text-blue-100"
                    : ""
                }`}
                onClick={() => setLengthFilter("all")}
              >
                Any length
              </button>
              {hasActiveSearch ? (
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={clearSearch}
                >
                  Clear filters
                </button>
              ) : null}
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
              Connect YouTube upload above — then Game Cap MOGO and Tripod
              uploads appear here when you sync.
            </p>
          ) : filteredSources.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {sources.length === 0
                ? "No film yet. Use Sync YouTube → Highlights only (under 10 min)."
                : "No clips match these filters. Clear filters or widen the date range."}
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredSources.map((s) => renderSource(s))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
