"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AcademyYouTubeSuggestion } from "@/lib/academy/youtube-search-query";
import SkillsYouTubePlayer from "@/components/SkillsYouTubePlayer";
import {
  BALL_MASTERY_LEVELS,
  getBallMasteryLevel,
} from "@/lib/player-skills/ball-mastery-ladder";
import {
  clearTeamLevelVideo,
  loadTeamBallMasteryLadder,
  setTeamLevelVideo,
  type TeamBallMasteryLadder,
} from "@/lib/player-skills/team-ladder-videos";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

type Props = {
  teamId: string;
};

const ghostBtn =
  "rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40";
const inputClass =
  "w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25";

/**
 * Coach UI: pick / discard YouTube teaching videos for each Ball Mastery lesson.
 * Players only see the video the coach selected.
 */
export default function TeamSkillsLadderCoach({ teamId }: Props) {
  const [ladder, setLadder] = useState<TeamBallMasteryLadder | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState(
    BALL_MASTERY_LEVELS[0]?.id ?? "",
  );
  const [suggestions, setSuggestions] = useState<AcademyYouTubeSuggestion[]>(
    [],
  );
  const [discardedIds, setDiscardedIds] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLevel = useMemo(
    () => getBallMasteryLevel(selectedLevelId) ?? null,
    [selectedLevelId],
  );
  const selectedVideo = selectedLevel
    ? ladder?.levels[selectedLevel.id]
    : undefined;

  const visibleSuggestions = useMemo(
    () =>
      suggestions.filter(
        (video) =>
          !discardedIds.includes(video.videoId) ||
          video.videoId === selectedVideo?.videoId,
      ),
    [suggestions, discardedIds, selectedVideo?.videoId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLadder(await loadTeamBallMasteryLadder(teamId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load skills videos.");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setDiscardedIds([]);
    setCustomUrl("");
  }, [selectedLevelId]);

  useEffect(() => {
    if (!selectedLevel) {
      setSuggestions([]);
      return;
    }
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
        setSuggestions(payload.videos ?? []);
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
  }, [selectedLevel]);

  async function onUse(video: AcademyYouTubeSuggestion) {
    if (!selectedLevel) return;
    setBusy(true);
    setError(null);
    try {
      setLadder(
        await setTeamLevelVideo(
          teamId,
          selectedLevel.id,
          video.videoId,
          video.title,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save video.");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscardSelected() {
    if (!selectedLevel) return;
    const currentId = selectedVideo?.videoId;
    setBusy(true);
    setError(null);
    try {
      if (currentId) {
        setDiscardedIds((ids) =>
          ids.includes(currentId) ? ids : [...ids, currentId],
        );
      }
      setLadder(await clearTeamLevelVideo(teamId, selectedLevel.id));
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
    if (selectedVideo?.videoId === videoId && selectedLevel) {
      setBusy(true);
      try {
        setLadder(await clearTeamLevelVideo(teamId, selectedLevel.id));
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
      setLadder(
        await setTeamLevelVideo(
          teamId,
          selectedLevel.id,
          videoId,
          "Custom teaching video",
        ),
      );
      setCustomUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save video.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !ladder) {
    return (
      <p className="text-sm text-zinc-400">
        {error ?? "Loading Ball Mastery videos…"}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Ball Mastery videos
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Choose the teaching video for each lesson. Players only see the video
          you select — they can&apos;t change it.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {BALL_MASTERY_LEVELS.map((level) => {
          const hasVideo = Boolean(ladder.levels[level.id]?.videoId);
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
                    hasVideo
                      ? "border-emerald-400/40 text-emerald-200"
                      : "border-zinc-600 text-zinc-400"
                  }`}
                >
                  {hasVideo ? "Video set" : "Needs video"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selectedLevel ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <h3 className="text-base font-semibold text-white">
            {selectedLevel.title}
          </h3>
          <p className="mt-2 text-sm text-zinc-400">{selectedLevel.kidBrief}</p>

          {selectedVideo?.videoId ? (
            <div className="mt-4">
              <SkillsYouTubePlayer
                videoId={selectedVideo.videoId}
                title={selectedVideo.videoTitle}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busy}
                  onClick={() => void onDiscardSelected()}
                >
                  Discard video
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              No video selected for this lesson yet.
            </p>
          )}

          {videoLoading ? (
            <p className="mt-4 text-sm text-zinc-400">Searching YouTube…</p>
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
                      disabled={busy || video.videoId === selectedVideo?.videoId}
                      onClick={() => void onUse(video)}
                      className={ghostBtn}
                    >
                      {video.videoId === selectedVideo?.videoId
                        ? "Selected"
                        : "Use"}
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
        </section>
      ) : null}
    </div>
  );
}
