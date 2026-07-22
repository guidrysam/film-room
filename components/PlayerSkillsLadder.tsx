"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AcademyYouTubeSuggestion } from "@/lib/academy/youtube-search-query";
import {
  BALL_MASTERY_LEVELS,
  getBallMasteryLevel,
} from "@/lib/player-skills/ball-mastery-ladder";
import {
  ballMasterySummary,
  clearLevelVideo,
  ensureBallMasteryAssignment,
  masterLevel,
  pinLevelVideo,
  type BallMasteryProgress,
} from "@/lib/player-skills/progress";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

type Props = {
  uid: string;
};

const primaryBtn =
  "rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-40";
const ghostBtn =
  "rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40";
const inputClass =
  "w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25";

function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}

export default function PlayerSkillsLadder({ uid }: Props) {
  const [progress, setProgress] = useState<BallMasteryProgress | null>(null);
  const [suggestions, setSuggestions] = useState<AcademyYouTubeSuggestion[]>(
    [],
  );
  const [discardedIds, setDiscardedIds] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLevel = useMemo(() => {
    if (!progress) return null;
    return getBallMasteryLevel(progress.currentLevelId) ?? null;
  }, [progress]);

  const activeProgress = activeLevel
    ? progress?.levels[activeLevel.id]
    : undefined;

  const summary = progress ? ballMasterySummary(progress) : null;

  const visibleSuggestions = useMemo(
    () =>
      suggestions.filter(
        (video) =>
          !discardedIds.includes(video.videoId) ||
          video.videoId === activeProgress?.videoId,
      ),
    [suggestions, discardedIds, activeProgress?.videoId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await ensureBallMasteryAssignment(uid);
      setProgress(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load skills.");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setDiscardedIds([]);
    setCustomUrl("");
  }, [activeLevel?.id]);

  useEffect(() => {
    if (!activeLevel || progress?.status === "completed") {
      setSuggestions([]);
      return;
    }
    const pinnedId = activeProgress?.videoId;
    const skipAuto = activeProgress?.skipAutoSuggest === true;
    let cancelled = false;
    setVideoLoading(true);
    void fetch(
      `/api/academy/youtube-search?q=${encodeURIComponent(activeLevel.youtubeQuery)}`,
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          videos?: AcademyYouTubeSuggestion[];
        };
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "YouTube search failed.");
        }
        const videos = payload.videos ?? [];
        setSuggestions(videos);
        if (!pinnedId && !skipAuto && videos[0]) {
          const pinned = await pinLevelVideo(
            uid,
            activeLevel.id,
            videos[0].videoId,
            videos[0].title,
          );
          if (!cancelled) setProgress(pinned);
        }
        setError(null);
      })
      .catch((searchError: unknown) => {
        if (cancelled) return;
        setSuggestions([]);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Could not load video suggestions.",
        );
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeLevel,
    activeProgress?.videoId,
    activeProgress?.skipAutoSuggest,
    progress?.status,
    uid,
  ]);

  async function onPickVideo(video: AcademyYouTubeSuggestion) {
    if (!activeLevel) return;
    setBusy(true);
    setError(null);
    try {
      const next = await pinLevelVideo(
        uid,
        activeLevel.id,
        video.videoId,
        video.title,
      );
      setProgress(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save video.");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscardCurrent() {
    if (!activeLevel) return;
    const currentId = activeProgress?.videoId;
    setBusy(true);
    setError(null);
    try {
      if (currentId) {
        setDiscardedIds((ids) =>
          ids.includes(currentId) ? ids : [...ids, currentId],
        );
      }
      const next = await clearLevelVideo(uid, activeLevel.id);
      setProgress(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not discard video.");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscardSuggestion(videoId: string) {
    setDiscardedIds((ids) =>
      ids.includes(videoId) ? ids : [...ids, videoId],
    );
    if (activeProgress?.videoId === videoId && activeLevel) {
      setBusy(true);
      try {
        const next = await clearLevelVideo(uid, activeLevel.id);
        setProgress(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not discard video.");
      } finally {
        setBusy(false);
      }
    }
  }

  async function onAddCustom(event: FormEvent) {
    event.preventDefault();
    if (!activeLevel) return;
    const videoId = extractYouTubeVideoId(customUrl);
    if (!videoId) {
      setError("Paste a valid YouTube link or 11-character video id.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await pinLevelVideo(
        uid,
        activeLevel.id,
        videoId,
        "Custom teaching video",
      );
      setProgress(next);
      setCustomUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save video.");
    } finally {
      setBusy(false);
    }
  }

  async function onMaster() {
    if (!activeLevel) return;
    setBusy(true);
    setError(null);
    try {
      const next = await masterLevel(uid, activeLevel.id);
      setProgress(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not master level.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !progress) {
    return (
      <p className="text-sm text-zinc-400">
        {error ?? "Loading your skills ladder…"}
      </p>
    );
  }

  const videoId = activeProgress?.videoId;
  const selectedSuggestion =
    visibleSuggestions.find((v) => v.videoId === videoId) ?? null;
  const embedTitle =
    activeProgress?.videoTitle ?? selectedSuggestion?.title ?? "Practice video";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Ball mastery
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          Skills ladder
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Watch, practice, then master each level to unlock the next.
        </p>
        {summary ? (
          <p className="mt-3 text-sm font-medium text-cyan-100">
            {summary.label}
          </p>
        ) : null}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all"
            style={{
              width: `${Math.round(
                (summary?.masteredCount ?? 0) /
                  Math.max(summary?.total ?? 1, 1) *
                  100,
              )}%`,
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {progress.status === "completed" ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] p-5">
          <h2 className="text-lg font-semibold text-white">
            You finished Ball Mastery
          </h2>
          <p className="mt-2 text-sm text-zinc-300">
            Keep practicing these moves in games and free play. Check back for
            the next ladder soon.
          </p>
        </div>
      ) : activeLevel ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Level {activeLevel.order}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            {activeLevel.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {activeLevel.kidBrief}
          </p>
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
            <span className="font-medium text-zinc-200">To master: </span>
            {activeLevel.practicePrompt}
          </p>

          {videoLoading ? (
            <p className="mt-4 text-sm text-zinc-400">Finding a teaching video…</p>
          ) : null}

          {videoId ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black">
              <div className="aspect-video w-full">
                <iframe
                  title={embedTitle}
                  src={youtubeEmbedUrl(videoId)}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                  {embedTitle}
                </p>
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busy}
                  onClick={() => void onDiscardCurrent()}
                >
                  Discard video
                </button>
              </div>
            </div>
          ) : !videoLoading ? (
            <p className="mt-4 text-sm text-zinc-500">
              No video selected — pick a suggestion or paste a YouTube link.
            </p>
          ) : null}

          {visibleSuggestions.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Suggestions
              </p>
              <ul className="space-y-2">
                {visibleSuggestions.map((video) => (
                  <li
                    key={video.videoId}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                  >
                    <p className="min-w-0 flex-1 text-xs text-zinc-300">
                      {video.title}
                    </p>
                    <button
                      type="button"
                      disabled={busy || video.videoId === videoId}
                      onClick={() => void onPickVideo(video)}
                      className={`${ghostBtn} ${
                        video.videoId === videoId
                          ? "border-cyan-400/40 text-cyan-200"
                          : ""
                      }`}
                    >
                      {video.videoId === videoId ? "Selected" : "Use"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDiscardSuggestion(video.videoId)}
                      className={ghostBtn}
                    >
                      Discard
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={onAddCustom} className="mt-4 space-y-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Add a specific YouTube video
              </span>
              <input
                className={inputClass}
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="Paste youtube.com or youtu.be link"
                disabled={busy}
              />
            </label>
            <button
              type="submit"
              className={ghostBtn}
              disabled={busy || !customUrl.trim()}
            >
              Use this video
            </button>
          </form>

          <button
            type="button"
            className={`${primaryBtn} mt-5 w-full`}
            disabled={busy}
            onClick={() => void onMaster()}
          >
            {busy ? "Saving…" : "I practiced this — master level"}
          </button>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white">All levels</h2>
        <ul className="space-y-2">
          {BALL_MASTERY_LEVELS.map((level) => {
            const state = progress.levels[level.id]?.status ?? "locked";
            return (
              <li
                key={level.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200">
                    {level.order}. {level.title}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {level.kidBrief}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    state === "mastered"
                      ? "border-emerald-400/40 text-emerald-200"
                      : state === "active"
                        ? "border-cyan-400/40 text-cyan-200"
                        : "border-zinc-600 text-zinc-500"
                  }`}
                >
                  {state === "mastered"
                    ? "Mastered"
                    : state === "active"
                      ? "Current"
                      : "Locked"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <Link
        href="/player"
        className="inline-block text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← Back to player home
      </Link>
    </div>
  );
}
