"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AcademyYouTubeSuggestion } from "@/lib/academy/youtube-search-query";
import {
  BALL_MASTERY_LEVELS,
  getBallMasteryLevel,
} from "@/lib/player-skills/ball-mastery-ladder";
import {
  ballMasterySummary,
  ensureBallMasteryAssignment,
  masterLevel,
  pinLevelVideo,
  type BallMasteryProgress,
} from "@/lib/player-skills/progress";

type Props = {
  uid: string;
};

const primaryBtn =
  "rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-40";
const ghostBtn =
  "rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40";

function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}

export default function PlayerSkillsLadder({ uid }: Props) {
  const [progress, setProgress] = useState<BallMasteryProgress | null>(null);
  const [suggestions, setSuggestions] = useState<AcademyYouTubeSuggestion[]>(
    [],
  );
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
    if (!activeLevel || progress?.status === "completed") {
      setSuggestions([]);
      return;
    }
    const pinnedId = activeProgress?.videoId;
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
        if (!pinnedId && videos[0]) {
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
  }, [activeLevel, activeProgress?.videoId, progress?.status, uid]);

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
    suggestions.find((v) => v.videoId === videoId) ?? suggestions[0] ?? null;
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
              <div className="border-t border-white/10 px-3 py-2 text-xs text-zinc-400">
                {embedTitle}
              </div>
            </div>
          ) : !videoLoading ? (
            <p className="mt-4 text-sm text-zinc-500">
              No video yet — try another suggestion below or check back later.
            </p>
          ) : null}

          {suggestions.length > 1 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Other suggestions
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((video) => (
                  <button
                    key={video.videoId}
                    type="button"
                    disabled={busy || video.videoId === videoId}
                    onClick={() => void onPickVideo(video)}
                    className={`${ghostBtn} ${
                      video.videoId === videoId
                        ? "border-cyan-400/40 text-cyan-200"
                        : ""
                    }`}
                  >
                    {video.title.length > 42
                      ? `${video.title.slice(0, 42)}…`
                      : video.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
