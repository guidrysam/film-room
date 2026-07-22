"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SkillsYouTubePlayer from "@/components/SkillsYouTubePlayer";
import {
  BALL_MASTERY_LEVELS,
  getBallMasteryLevel,
} from "@/lib/player-skills/ball-mastery-ladder";
import {
  ballMasterySummary,
  ensureBallMasteryAssignment,
  masterLevel,
  type BallMasteryProgress,
} from "@/lib/player-skills/progress";
import {
  loadTeamBallMasteryLadder,
  type TeamBallMasteryLadder,
} from "@/lib/player-skills/team-ladder-videos";
import { listMyTeams, type Team } from "@/lib/teams";
import { loadUserProfile } from "@/lib/user-profile";

type Props = {
  uid: string;
};

const primaryBtn =
  "rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-40";

/**
 * Player view: choose any lesson, watch the coach-selected video, mark mastered.
 */
export default function PlayerSkillsLadder({ uid }: Props) {
  const [progress, setProgress] = useState<BallMasteryProgress | null>(null);
  const [teamLadder, setTeamLadder] = useState<TeamBallMasteryLadder | null>(
    null,
  );
  const [team, setTeam] = useState<Team | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLevel = useMemo(() => {
    if (!selectedLevelId) return null;
    return getBallMasteryLevel(selectedLevelId) ?? null;
  }, [selectedLevelId]);

  const selectedProgress = selectedLevel
    ? progress?.levels[selectedLevel.id]
    : undefined;

  const selectedVideo = selectedLevel
    ? teamLadder?.levels[selectedLevel.id]
    : undefined;

  const summary = progress ? ballMasterySummary(progress) : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextProgress = await ensureBallMasteryAssignment(uid);
      setProgress(nextProgress);
      setSelectedLevelId((prev) => prev ?? nextProgress.currentLevelId);

      const profile = await loadUserProfile(uid);
      const teams = await listMyTeams(uid);
      const preferred =
        teams.find((t) => t.id === profile?.linkedTeamId) ?? teams[0] ?? null;
      setTeam(preferred);
      if (preferred) {
        setTeamLadder(await loadTeamBallMasteryLadder(preferred.id));
      } else {
        setTeamLadder({
          ladderId: "ball-mastery",
          levels: {},
          updatedAt: null,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load skills.");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onMaster() {
    if (!selectedLevel) return;
    setBusy(true);
    setError(null);
    try {
      setProgress(await masterLevel(uid, selectedLevel.id));
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
          Pick a lesson and practice with the video your coach chose.
          {team ? (
            <>
              {" "}
              Team: <span className="text-zinc-300">{team.name}</span>
            </>
          ) : null}
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
            const hasVideo = Boolean(teamLadder?.levels[level.id]?.videoId);
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
                          : hasVideo
                            ? "border-zinc-500 text-zinc-300"
                            : "border-zinc-700 text-zinc-500"
                    }`}
                  >
                    {state === "mastered"
                      ? "Mastered"
                      : selected
                        ? "Selected"
                        : hasVideo
                          ? "Ready"
                          : "No video"}
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

          {selectedVideo?.videoId ? (
            <div className="mt-4">
              <SkillsYouTubePlayer
                videoId={selectedVideo.videoId}
                title={selectedVideo.videoTitle}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              {team
                ? "Your coach hasn’t picked a video for this lesson yet."
                : "Join a team so your coach can assign teaching videos."}
            </p>
          )}

          <button
            type="button"
            className={`${primaryBtn} mt-5 w-full`}
            disabled={busy || isMastered || !selectedVideo?.videoId}
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
