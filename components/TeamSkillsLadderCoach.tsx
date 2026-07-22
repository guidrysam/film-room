"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { AcademyYouTubeSuggestion } from "@/lib/academy/youtube-search-query";
import SkillsYouTubePlayer from "@/components/SkillsYouTubePlayer";
import {
  BALL_MASTERY_LEVELS,
  getBallMasteryLevel,
  type BallMasteryLevel,
} from "@/lib/player-skills/ball-mastery-ladder";
import { ensureLadderDrillGame } from "@/lib/player-skills/ladder-drill-game";
import {
  discardTeamLevelSuggestion,
  ensureTeamLevelDefaultVideo,
  loadTeamBallMasteryLadder,
  resolveLevelTeachingVideo,
  setTeamLevelSuggestions,
  setTeamLevelVideo,
  type TeamBallMasteryLadder,
  type TeamLadderSuggestion,
} from "@/lib/player-skills/team-ladder-videos";
import { teamFilmRoomRoute } from "@/lib/team-film-room";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

type Props = {
  teamId: string;
};

const ghostBtn =
  "rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40";
const inputClass =
  "w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25";

function toStoredSuggestion(
  video: AcademyYouTubeSuggestion,
): TeamLadderSuggestion {
  return {
    videoId: video.videoId,
    title: video.title,
    channelTitle: video.channelTitle,
    thumbnailUrl: video.thumbnailUrl,
    watchUrl: video.watchUrl,
    embedUrl: video.embedUrl,
  };
}

/**
 * Coach UI: pick / discard YouTube teaching videos for each Ball Mastery lesson.
 * Suggestions are cached on the team until the coach refreshes them.
 * Mark in Review / Open Film Room create a reusable team game for the drill.
 */
export default function TeamSkillsLadderCoach({ teamId }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [ladder, setLadder] = useState<TeamBallMasteryLadder | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState(
    BALL_MASTERY_LEVELS[0]?.id ?? "",
  );
  const [customUrl, setCustomUrl] = useState("");
  const [previewVideo, setPreviewVideo] = useState<TeamLadderSuggestion | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openingAction, setOpeningAction] = useState<"mark" | "room" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const selectedLevel = useMemo(
    () => getBallMasteryLevel(selectedLevelId) ?? null,
    [selectedLevelId],
  );
  const selectedEntry = selectedLevel
    ? ladder?.levels[selectedLevel.id]
    : undefined;
  const selectedVideoId = selectedEntry?.videoId;
  const selectedVideoTitle = selectedEntry?.videoTitle;

  const playerVideoId = previewVideo?.videoId ?? selectedVideoId;
  const playerVideoTitle =
    previewVideo?.title ?? selectedVideoTitle ?? "Teaching video";
  const isPreviewing =
    Boolean(previewVideo) && previewVideo?.videoId !== selectedVideoId;

  const visibleSuggestions = useMemo(() => {
    if (!selectedEntry) return [];
    const discarded = new Set(selectedEntry.discardedSuggestionIds);
    return selectedEntry.suggestions.filter(
      (video) =>
        !discarded.has(video.videoId) || video.videoId === selectedVideoId,
    );
  }, [selectedEntry, selectedVideoId]);

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
    setCustomUrl("");
    setPreviewVideo(null);
  }, [selectedLevelId]);

  /** Load cached suggestions, or fetch once and persist (auto-selects first). */
  const ensureSuggestions = useCallback(
    async (forceRefresh: boolean) => {
      if (!selectedLevel || !ladder) return;
      const entry = ladder.levels[selectedLevel.id];
      if (!forceRefresh && entry?.suggestions.length) {
        if (!entry.videoId) {
          setLadder(
            await ensureTeamLevelDefaultVideo(teamId, selectedLevel.id),
          );
        }
        return;
      }
      setVideoLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/academy/youtube-search?q=${encodeURIComponent(selectedLevel.youtubeQuery)}`,
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          videos?: AcademyYouTubeSuggestion[];
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "YouTube search failed.");
        }
        const videos = (payload.videos ?? []).map(toStoredSuggestion);
        const next = await setTeamLevelSuggestions(
          teamId,
          selectedLevel.id,
          videos,
        );
        setLadder(next);
      } catch (searchError: unknown) {
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Could not load video suggestions.",
        );
      } finally {
        setVideoLoading(false);
      }
    },
    [ladder, selectedLevel, teamId],
  );

  useEffect(() => {
    if (!selectedLevel || !ladder) return;
    void ensureSuggestions(false);
  }, [selectedLevel, ladder, ensureSuggestions]);

  /** Once per mount: fill any lessons that still have no suggestions/video. */
  const seededRef = useRef(false);
  useEffect(() => {
    if (!ladder || seededRef.current) return;
    seededRef.current = true;
    let cancelled = false;
    const initialLadder: TeamBallMasteryLadder = ladder;

    async function seedMissingLevels() {
      let current = initialLadder;
      for (const level of BALL_MASTERY_LEVELS) {
        if (cancelled) return;
        const entry = current.levels[level.id];
        if (entry?.videoId) continue;
        if (entry?.suggestions.length) {
          current = await ensureTeamLevelDefaultVideo(teamId, level.id);
          if (!cancelled) setLadder(current);
          continue;
        }
        try {
          const response = await fetch(
            `/api/academy/youtube-search?q=${encodeURIComponent(level.youtubeQuery)}`,
          );
          const payload = (await response.json()) as {
            ok?: boolean;
            error?: string;
            videos?: AcademyYouTubeSuggestion[];
          };
          if (!response.ok || !payload.ok) continue;
          const videos = (payload.videos ?? []).map(toStoredSuggestion);
          if (!videos.length) continue;
          current = await setTeamLevelSuggestions(teamId, level.id, videos);
          if (!cancelled) setLadder(current);
        } catch {
          // Leave this level for the coach to refresh manually.
        }
      }
    }

    void seedMissingLevels();
    return () => {
      cancelled = true;
    };
  }, [ladder, teamId]);

  async function onUse(video: TeamLadderSuggestion) {
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
      setPreviewVideo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save video.");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscardSelected() {
    if (!selectedLevel || !selectedVideoId) return;
    setBusy(true);
    setError(null);
    try {
      setLadder(
        await discardTeamLevelSuggestion(
          teamId,
          selectedLevel.id,
          selectedVideoId,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not discard video.");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscardSuggestion(videoId: string) {
    if (!selectedLevel) return;
    setBusy(true);
    setError(null);
    try {
      setLadder(
        await discardTeamLevelSuggestion(teamId, selectedLevel.id, videoId),
      );
      if (previewVideo?.videoId === videoId) {
        setPreviewVideo(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not discard video.");
    } finally {
      setBusy(false);
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

  async function openDrill(
    level: BallMasteryLevel,
    mode: "mark" | "room",
    video?: { videoId: string; videoTitle: string },
    opts?: { persistLink?: boolean },
  ) {
    if (!user) {
      setError("Sign in as a coach to open this drill.");
      return;
    }
    const teaching =
      video ?? resolveLevelTeachingVideo(ladder?.levels[level.id]);
    if (!teaching) {
      setError("Pick a video for this lesson first.");
      return;
    }
    setOpeningAction(mode);
    setError(null);
    try {
      const { gameId } = await ensureLadderDrillGame({
        uid: user.uid,
        teamId,
        level,
        videoId: teaching.videoId,
        videoTitle: teaching.videoTitle,
        entry: ladder?.levels[level.id],
        persistLink: opts?.persistLink,
      });
      if (opts?.persistLink !== false) {
        setLadder(await loadTeamBallMasteryLadder(teamId));
      }
      if (mode === "mark") {
        router.push(`/game/${gameId}/review`);
      } else {
        router.push(teamFilmRoomRoute(gameId));
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open drill film room.",
      );
    } finally {
      setOpeningAction(null);
    }
  }

  if (loading || !ladder) {
    return (
      <p className="text-sm text-zinc-400">
        {error ?? "Loading Ball Mastery videos…"}
      </p>
    );
  }

  const teachingVideo = selectedLevel
    ? resolveLevelTeachingVideo(ladder.levels[selectedLevel.id])
    : null;
  const filmBusy = openingAction !== null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Ball Mastery videos
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Assign teaching videos, then mark moments in Review or open a Team
          Film Room for any drill. Suggestions stay until you refresh them.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {BALL_MASTERY_LEVELS.map((level) => {
          const hasVideo = Boolean(
            resolveLevelTeachingVideo(ladder.levels[level.id]),
          );
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

          {playerVideoId ? (
            <div className="mt-4">
              {isPreviewing ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2">
                  <p className="text-xs text-amber-100">
                    Preview only — not assigned to players yet.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={ghostBtn}
                      disabled={busy || !previewVideo}
                      onClick={() => {
                        if (previewVideo) void onUse(previewVideo);
                      }}
                    >
                      Use this video
                    </button>
                    <button
                      type="button"
                      className={ghostBtn}
                      disabled={busy}
                      onClick={() => setPreviewVideo(null)}
                    >
                      Back to assigned
                    </button>
                  </div>
                </div>
              ) : null}
              <SkillsYouTubePlayer
                videoId={playerVideoId}
                title={playerVideoTitle}
              />
              {teachingVideo && !isPreviewing ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy || filmBusy || !user}
                    onClick={() =>
                      void openDrill(selectedLevel, "mark", teachingVideo)
                    }
                  >
                    {openingAction === "mark"
                      ? "Opening Review…"
                      : "Mark in Review"}
                  </button>
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy || filmBusy || !user}
                    onClick={() =>
                      void openDrill(selectedLevel, "room", teachingVideo)
                    }
                  >
                    {openingAction === "room"
                      ? "Opening Film Room…"
                      : "Open Team Film Room"}
                  </button>
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy || filmBusy}
                    onClick={() => void onDiscardSelected()}
                  >
                    Discard selected video
                  </button>
                </div>
              ) : selectedVideoId && !isPreviewing ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy}
                    onClick={() => void onDiscardSelected()}
                  >
                    Discard selected video
                  </button>
                </div>
              ) : null}
              {isPreviewing && previewVideo && selectedLevel ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy || filmBusy || !user}
                    onClick={() =>
                      void openDrill(
                        selectedLevel,
                        "mark",
                        {
                          videoId: previewVideo.videoId,
                          videoTitle: previewVideo.title,
                        },
                        { persistLink: false },
                      )
                    }
                  >
                    {openingAction === "mark"
                      ? "Opening Review…"
                      : "Mark this preview"}
                  </button>
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy || filmBusy || !user}
                    onClick={() =>
                      void openDrill(
                        selectedLevel,
                        "room",
                        {
                          videoId: previewVideo.videoId,
                          videoTitle: previewVideo.title,
                        },
                        { persistLink: false },
                      )
                    }
                  >
                    {openingAction === "room"
                      ? "Opening Film Room…"
                      : "Film Room with preview"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              No video selected for this lesson yet. Preview a suggestion
              below.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Suggestions
            </p>
            <button
              type="button"
              className={ghostBtn}
              disabled={busy || videoLoading}
              onClick={() => void ensureSuggestions(true)}
            >
              {videoLoading ? "Searching…" : "Refresh suggestions"}
            </button>
          </div>

          {videoLoading && !visibleSuggestions.length ? (
            <p className="mt-2 text-sm text-zinc-400">Searching YouTube…</p>
          ) : null}

          {visibleSuggestions.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {visibleSuggestions.map((video) => {
                const isAssigned = video.videoId === selectedVideoId;
                const isPreview = video.videoId === previewVideo?.videoId;
                return (
                  <li
                    key={video.videoId}
                    className={`rounded-xl border px-3 py-2 ${
                      isPreview
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-black/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      {video.thumbnailUrl ? (
                        <button
                          type="button"
                          className="relative shrink-0 overflow-hidden rounded-lg border border-white/10"
                          onClick={() => setPreviewVideo(video)}
                          aria-label={`Preview ${video.title}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="h-14 w-24 object-cover"
                          />
                        </button>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-200">
                          {video.title}
                        </p>
                        {video.channelTitle ? (
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            {video.channelTitle}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPreviewVideo(video)}
                            className={ghostBtn}
                          >
                            {isPreview ? "Previewing" : "Preview"}
                          </button>
                          <button
                            type="button"
                            disabled={busy || isAssigned}
                            onClick={() => void onUse(video)}
                            className={ghostBtn}
                          >
                            {isAssigned ? "Selected" : "Use"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onDiscardSuggestion(video.videoId)}
                            className={ghostBtn}
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : !videoLoading ? (
            <p className="mt-2 text-sm text-zinc-500">
              No suggestions yet — tap Refresh suggestions.
            </p>
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
