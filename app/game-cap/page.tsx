"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";
import GameCapUpload from "@/components/GameCapUpload";
import GameSources from "@/components/GameSources";
import TeamSetup from "@/components/TeamSetup";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  canContributeGameSources,
  getGame,
  type Game,
} from "@/lib/games";
import {
  canCoachTeam,
  createTeamGame,
  getTeam,
  listTeamGames,
  teamRoleFor,
  type Team,
} from "@/lib/teams";
import { gameCapUrl, teamSetupUrl } from "@/lib/team-routes";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

type SourceMode = "paste" | "upload" | "record";

const modeTab =
  "rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

function GameCapPageInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryGameId = searchParams.get("gameId");
  const queryTeamId = searchParams.get("teamId");

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("");
  const [date, setDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [season, setSeason] = useState("");
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [sourcesKey, setSourcesKey] = useState(0);
  const [queryResolvedGame, setQueryResolvedGame] = useState<Game | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const teamRole = useMemo(() => {
    if (!selectedTeam || !user) return null;
    return teamRoleFor(selectedTeam, user.uid);
  }, [selectedTeam, user]);

  const refreshTeam = useCallback(async () => {
    if (!selectedTeamId) {
      setSelectedTeam(null);
      return;
    }
    try {
      setSelectedTeam(await getTeam(selectedTeamId));
    } catch {
      setSelectedTeam(null);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    void refreshTeam();
  }, [refreshTeam]);

  const refreshGames = useCallback(async () => {
    if (!user || !selectedTeamId) {
      setGames([]);
      return;
    }
    setGamesLoading(true);
    try {
      setGames(await listTeamGames(user.uid, selectedTeamId));
    } catch {
      /* best-effort */
    } finally {
      setGamesLoading(false);
    }
  }, [user, selectedTeamId]);

  useEffect(() => {
    void refreshGames();
  }, [refreshGames]);

  useEffect(() => {
    if (queryGameId) setSelectedGameId(queryGameId);
  }, [queryGameId]);

  useEffect(() => {
    if (queryTeamId) setSelectedTeamId(queryTeamId);
  }, [queryTeamId]);

  useEffect(() => {
    if (!user || !queryGameId) {
      setQueryResolvedGame(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const game = await getGame(queryGameId);
      if (cancelled) return;
      setQueryResolvedGame(game);
      if (game?.teamId) {
        setSelectedTeamId((prev) => prev ?? game.teamId ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, queryGameId]);

  useEffect(() => {
    if (queryGameId) setShowPicker(false);
  }, [queryGameId]);

  const handleCreate = useCallback(async () => {
    if (!user || !selectedTeamId || !selectedTeam) return;
    if (!canCoachTeam(selectedTeam, user.uid)) {
      setError("Only team admins and coaches can create games.");
      return;
    }
    if (!title.trim()) {
      setError("Give the game a title.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const id = await createTeamGame(user.uid, selectedTeamId, {
        title,
        ...(sport.trim() ? { sport } : {}),
        ...(date.trim() ? { date } : {}),
        ...(opponent.trim() ? { opponent, awayTeam: opponent } : {}),
        ...(season.trim() ? { season } : {}),
        ...(scheduledStartAt.trim() ? { scheduledStartAt } : {}),
      });
      setTitle("");
      setSport("");
      setDate("");
      setOpponent("");
      setSeason("");
      setScheduledStartAt("");
      setShowCreate(false);
      await refreshGames();
      router.push(`/game/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create game.");
    } finally {
      setCreating(false);
    }
  }, [
    user,
    selectedTeamId,
    selectedTeam,
    title,
    sport,
    date,
    opponent,
    season,
    scheduledStartAt,
    refreshGames,
    router,
  ]);

  const selectedGame =
    games.find((g) => g.id === selectedGameId) ??
    (queryResolvedGame?.id === selectedGameId ? queryResolvedGame : null);

  const attachFocus = Boolean(
    queryGameId && selectedGame && (queryTeamId || selectedGame.teamId),
  );
  const showTeamGamePickers = !attachFocus || showPicker;
  const canCreateGames =
    selectedTeam && user ? canCoachTeam(selectedTeam, user.uid) : false;
  const isParent =
    selectedTeam && user ? teamRoleFor(selectedTeam, user.uid) === "parent" : false;
  const canAttachSources =
    selectedGame && user
      ? canContributeGameSources(selectedGame, user.uid, teamRole)
      : false;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
        <div className="w-full max-w-sm text-center">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Film Room Sports
          </p>
          <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white">
            Add Video
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-zinc-300">
            Sign in to select your team, create games, attach YouTube videos,
            and open Review.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle().catch(() => {})}
            className="mb-8 w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/30 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            Sign in with Google
          </button>
          <Link href="/" className={linkBack}>
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Film Room Sports
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Add Video
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-300">
            {isParent
              ? "Upload video from your phone to help build the lined-up team game. Pick a game below and attach your angle."
              : "Select your team, create or pick a game, then add a video by pasting a YouTube link or uploading to your own channel. Open Review to line up angles."}
          </p>
        </div>

        {isParent && selectedTeam ? (
          <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm leading-relaxed text-amber-100">
            Welcome to <span className="font-medium">{selectedTeam.name}</span>.
            Upload video from your phone to help build the synced team game.
            Choose a game below, then paste a YouTube link or upload from your
            channel.
          </div>
        ) : null}

        {attachFocus && selectedTeam && selectedGame ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-500/25 bg-blue-950/20 px-4 py-3">
            <p className="text-sm text-blue-100">
              <span className="font-medium">{selectedTeam.name}</span>
              <span className="text-blue-200/70"> · </span>
              <span className="font-medium">{selectedGame.title}</span>
            </p>
            <button
              type="button"
              onClick={() => setShowPicker((s) => !s)}
              className={ghostBtn}
            >
              {showPicker ? "Hide picker" : "Change team or game"}
            </button>
          </div>
        ) : null}

        {showTeamGamePickers ? (
          <>
        <section className={`${panelClass} mb-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Select team</h2>
            {selectedTeam && user && canCoachTeam(selectedTeam, user.uid) ? (
              <Link href={teamSetupUrl(selectedTeam.id)} className={ghostBtn}>
                Team Setup
              </Link>
            ) : null}
          </div>
          <TeamSetup
            currentUid={user.uid}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
            onTeamsChanged={() => void refreshTeam()}
          />
        </section>

        <section className={`${panelClass} mb-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Select game</h2>
            {selectedTeamId ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void refreshGames()}
                  className={ghostBtn}
                >
                  Refresh
                </button>
                {canCreateGames ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate((s) => !s)}
                    className={ghostBtn}
                  >
                    {showCreate ? "Cancel" : "New Game"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {!selectedTeamId ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
              Select a team above to see its games.
            </p>
          ) : showCreate && canCreateGames ? (
            <div className="mb-4 rounded-lg border border-white/[0.08] bg-black/25 p-3">
              <div className="space-y-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (e.g. U14 vs Rangers)"
                  className={inputClass}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    placeholder="Opponent (optional)"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    placeholder="Season (optional)"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    type="text"
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    placeholder="Sport (optional)"
                    className={inputClass}
                  />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="datetime-local"
                    value={scheduledStartAt}
                    onChange={(e) => setScheduledStartAt(e.target.value)}
                    className={inputClass}
                    title="Scheduled start (for clock sync later)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className={primaryBtn}
                >
                  {creating ? "Creating…" : "Create Game"}
                </button>
              </div>
            </div>
          ) : null}

          {!selectedTeamId ? null : gamesLoading ? (
            <p className="text-sm text-zinc-400">Loading games…</p>
          ) : games.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
              {canCreateGames
                ? "No games yet for this team. Create one above."
                : "No games yet for this team."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {games.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/50 px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">
                      {g.title}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {[g.sport, g.date, g.opponent ?? g.awayTeam, g.season]
                        .filter(Boolean)
                        .join(" · ") || "Game"}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link href={`/game/${g.id}`} className={ghostBtn}>
                      Open
                    </Link>
                    <Link
                      href={gameCapUrl({
                        teamId: selectedTeamId ?? undefined,
                        gameId: g.id,
                      })}
                      className="rounded-lg border border-blue-500/40 bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-blue-100 transition hover:bg-blue-900/55"
                    >
                      Add video
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error ? (
            <p className="mt-2 text-xs text-rose-300">{error}</p>
          ) : null}
        </section>
          </>
        ) : null}

        <section className={panelClass}>
          <h2 className="mb-3 text-sm font-semibold text-white">Attach video</h2>
          {!selectedGame ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-zinc-400">
              Choose a game above and tap{" "}
              <span className="font-medium text-zinc-300">Add video</span>, or open
              a game from the dashboard and use Add source there.
            </p>
          ) : (
            <div>
              <p className="mb-3 text-xs text-zinc-400">
                Attaching to{" "}
                <Link
                  href={`/game/${selectedGame.id}`}
                  className="font-medium text-blue-300 hover:underline"
                >
                  {selectedGame.title}
                </Link>
              </p>
              {!canAttachSources ? (
                <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-xs leading-snug text-amber-200">
                  You can view this game but cannot attach sources with your
                  current team role ({teamRole ?? "none"}).
                </p>
              ) : (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSourceMode("paste")}
                    className={`${modeTab} ${
                      sourceMode === "paste"
                        ? "border-blue-500/50 bg-blue-950/35 text-white"
                        : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    Paste YouTube link
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode("upload")}
                    className={`${modeTab} ${
                      sourceMode === "upload"
                        ? "border-blue-500/50 bg-blue-950/35 text-white"
                        : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    Upload to YouTube
                  </button>
                  <span
                    className={`${modeTab} cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-zinc-500`}
                    title="Coming soon"
                  >
                    Record locally — coming soon
                  </span>
                </div>
              )}

              {canAttachSources && sourceMode === "upload" ? (
                <div className="mb-4">
                  <GameCapUpload
                    game={selectedGame}
                    team={selectedTeam}
                    currentUid={user.uid}
                    currentDisplayName={user.displayName}
                    onComplete={() => {
                      setSourcesKey((k) => k + 1);
                      void refreshGames();
                    }}
                    onSwitchToPaste={() => setSourceMode("paste")}
                  />
                </div>
              ) : null}

              <GameSources
                key={`${selectedGame.id}-${sourcesKey}`}
                game={selectedGame}
                currentUid={user.uid}
                teamRole={teamRole}
                showPasteForm={canAttachSources && sourceMode === "paste"}
                onChanged={() => void refreshGames()}
              />
            </div>
          )}
        </section>

        <Link href="/app" className={`${linkBack} mt-8 inline-block`}>
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default function GameCapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-zinc-300">
          <p className="text-sm">Loading…</p>
        </div>
      }
    >
      <GameCapPageInner />
    </Suspense>
  );
}
