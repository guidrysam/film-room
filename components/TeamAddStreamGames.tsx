"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createTeamGameFromYouTubeStream,
  createTeamGamesFromYouTubeStreams,
  parseYouTubeStreamLines,
} from "@/lib/team-game-from-video";
import type { Team } from "@/lib/teams";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

export type TeamAddStreamGamesProps = {
  team: Team;
  currentUid: string;
  onCreated?: () => void;
};

export default function TeamAddStreamGames({
  team,
  currentUid,
  onCreated,
}: TeamAddStreamGamesProps) {
  const [urls, setUrls] = useState("");
  const [season, setSeason] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<
    { gameId: string; title: string }[]
  >([]);

  const gameCount = parseYouTubeStreamLines(urls).length;
  const isBulk = gameCount > 1;

  const gameCountLabel =
    gameCount === 0
      ? "Paste a YouTube link to create a game"
      : gameCount === 1
        ? "1 game"
        : `${gameCount} games`;

  const handleSubmit = async () => {
    const trimmed = urls.trim();
    if (!trimmed) {
      setMessage("Paste at least one YouTube stream or archive link.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setCreated([]);
    try {
      if (isBulk) {
        const result = await createTeamGamesFromYouTubeStreams(
          currentUid,
          team.id,
          trimmed,
          {
            ...(season.trim() ? { season: season.trim() } : {}),
            sourceLabel: "Main stream",
          },
        );
        setCreated(
          result.created.map((row) => ({ gameId: row.gameId, title: row.title })),
        );
        if (result.created.length > 0) {
          setMessage(
            `Created ${result.created.length} game${result.created.length === 1 ? "" : "s"}.`,
          );
          setUrls("");
          onCreated?.();
        }
        if (result.errors.length > 0) {
          setMessage(
            (result.created.length > 0 ? `${result.created.length} created. ` : "") +
              `${result.errors.length} failed: ${result.errors[0]?.message ?? "error"}`,
          );
        }
      } else {
        const row = await createTeamGameFromYouTubeStream(currentUid, team.id, {
          urlOrId: trimmed,
          ...(titleOverride.trim() ? { title: titleOverride.trim() } : {}),
          ...(season.trim() ? { season: season.trim() } : {}),
          sourceLabel: "Main stream",
        });
        setCreated([{ gameId: row.gameId, title: row.title }]);
        setMessage("Game created and stream attached.");
        setUrls("");
        setTitleOverride("");
        onCreated?.();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create game.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/25 p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-zinc-100">Add game</p>
        <p className="mt-0.5 text-xs text-zinc-500">{gameCountLabel}</p>
      </div>

      <div className="space-y-2">
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={isBulk ? 5 : 2}
          placeholder="YouTube stream or archive link — one per line for multiple games"
          className={`${inputClass} font-mono text-xs`}
          aria-label="YouTube stream URLs"
        />
        {!isBulk ? (
          <input
            type="text"
            value={titleOverride}
            onChange={(e) => setTitleOverride(e.target.value)}
            placeholder="Game title (optional — uses YouTube title if blank)"
            className={inputClass}
          />
        ) : null}
        <input
          type="text"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          placeholder="Tournament or season (optional)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={busy || gameCount === 0}
          className={primaryBtn}
        >
          {busy
            ? "Adding…"
            : gameCount <= 1
              ? "Add game"
              : `Add ${gameCount} games`}
        </button>
      </div>

      {message ? (
        <p
          className={`mt-2 text-xs ${
            message.includes("failed") || message.includes("Could not")
              ? "text-rose-200"
              : "text-emerald-300"
          }`}
        >
          {message}
        </p>
      ) : null}

      {created.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {created.map((row) => (
            <li key={row.gameId}>
              <Link
                href={`/game/${row.gameId}`}
                className={`${ghostBtn} inline-block`}
              >
                Open {row.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
