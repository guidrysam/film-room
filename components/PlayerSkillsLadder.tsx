"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AcademyYouTubeSuggestion } from "@/lib/academy/youtube-search-query";
import SkillsYouTubePlayer from "@/components/SkillsYouTubePlayer";
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

export default function PlayerSkillsLadder({ uid }: Props) {
  const [progress, setProgress] = useState<BallMasteryProgress | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AcademyYouTubeSuggestion[]>(
    [],
  );
  const [discardedIds, setDiscardedIds] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLevel = useMemo(() => {
    if (!selectedLevelId) return null;
    return getBallMasteryLevel(selectedLevelId) ?? null;
  }, [selectedLevelId]);

  const selectedProgress = selectedLevel
    ? progress?.levels[selectedLevel.id]
    : undefined;

  const summary = progress ? ballMasterySummary(progress) : null;

  const visibleSuggestions = useMemo(
    () =>
      suggestions.filter(
        (video) =>
          !discardedIds.includes(video.videoId) ||
          video.videoId === selectedProgress?.videoId,
      ),
    [suggestions, discardedIds, selectedProgress?.videoId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await ensureBallMasteryAssignment(uid);
      setProgress(next);
      setSelectedLevelId((prev) => prev ?? next.currentLevelId);
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
  }, [selectedLevel?.id]);

  useEffect(() => {
    if (!selectedLevel) {
      setSuggestions([]);
      return;
    }
    const pinnedId = selectedProgress?.videoId;
    const skipAuto = selectedProgress?.skipAutoSuggest === true;
    let cancelled = false;
    setVideoLoading(true);
    void fetch(
      `/api/academy/youtube-search?q=${encodeURIComponent(selectedLevel.youtubeQuery)}`,
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
            selectedLevel.id,
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
    selectedLevel,
    selectedProgress?.videoId,
    selectedProgress?.skipAutoSuggest,
    uid,
  ]);

  async function onPickVideo(video: AcademyYouTubeSuggestion) {
    if (!selectedLevel) return;
    setBusy(true);
    setError(null);
    try {
      const next = await pinLevelVideo(
        uid,
        selectedLevel.id,
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
    if (!selectedLevel) return;
    const currentId = selectedProgress?.videoId;
    setBusy(true);
    setError(null);
    try {
      if (currentId) {
        setDiscardedIds((ids) =>
          ids.includes(currentId) ? ids : [...ids, currentId],
        );
      }
      const next = await clearLevelVideo(uid, selectedLevel.id);
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
    if (selectedProgress?.videoId === videoId && selectedLevel) {
      setBusy(true);
      try {
        const next = await clearLevelVideo(uid, selectedLevel.id);
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
    if (!selectedLevel) return;
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
        selectedLevel.id,
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
    if (!selectedLevel) return;
    setBusy(true);
    setError(null);
    try {
      const next = await masterLevel(uid, selectedLevel.id);
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

  const videoId = selectedProgress?.videoId;
  const selectedSuggestion =
    visibleSuggestions.find((v) => v.videoId === videoId) ?? null;
  const embedTitle =
    selectedProgress?.videoTitle ??
    selectedSuggestion?.title ??
    "Practice video";
  const isMastered = selectedProgress?.status === "mastered";

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
          Pick any lesson, practice with Film Room controls, then mark it
          mastered when you&apos;re ready.
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

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white">Lessons</h2>
        <ul className="space-y-2">
          {BALL_MASTERY_LEVELS.map((level) => {
            const state = progress.levels[level.id]?.status ?? "available";
            const selected = level.id === selectedLevelId;
            return (
              <li key={level.id}>
                <button
                  type="button"
                  onClick={() => setSelectedLevelId(level.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    selected
                      ? "border-cyan-400/45 bg-cyan-400/10"
                      : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
                  }`}
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
                        : selected
                          ? "border-cyan-400/40 text-cyan-200"
                          : "border-zinc-600 text-zinc-400"
                    }`}
                  >
                    {state === "mastered"
                      ? "Mastered"
                      : selected
                        ? "Selected"
                        : "Available"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {selectedLevel ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Level {selectedLevel.order}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            {selectedLevel.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {selectedLevel.kidBrief}
          </p>
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
            <span className="font-medium text-zinc-200">To master: </span>
            {selectedLevel.practicePrompt}
          </p>

          {videoLoading ? (
            <p className="mt-4 text-sm text-zinc-400">Finding a teaching video…</p>
          ) : null}

          {videoId ? (
            <div className="mt-4">
              <SkillsYouTubePlayer videoId={videoId} title={embedTitle} />
              <div className="mt-2 flex justify-end">
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
            disabled={busy || isMastered}
            onClick={() => void onMaster()}
          >
            {isMastered
              ? "Already mastered"
              : busy
                ? "Saving…"
                : "I practiced this — master level"}
          </button>
        </section>
      ) : null}

      <Link
        href="/player"
        className="inline-block text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← Back to player home
      </Link>
    </div>
  );
}
