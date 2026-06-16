"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addYouTubeSourceToGame,
  canContributeGameSources,
  listGameSources,
  updateGameSourceYouTubeMetadata,
  type Game,
  type GameTeamRole,
  type GameVideoSource,
} from "@/lib/games";
import { gameSourcesToAngles, openGameInFilmRoom } from "@/lib/open-game-room";
import {
  fetchYouTubeVideoMeta,
  metaToSourcePatch,
} from "@/lib/youtube-video-meta-client";

export type GameSourcesProps = {
  game: Game;
  currentUid: string;
  /** Team role when the game is team-scoped (enables parent source attach). */
  teamRole?: GameTeamRole | null;
  /** Show the paste-link attach form (default true). */
  showPasteForm?: boolean;
  /** Called after a source is added (parent may refresh counts). */
  onChanged?: () => void;
};

const LABEL_SUGGESTIONS = [
  "Main sideline",
  "Goal cam",
  "Parent cam",
  "End zone",
  "Opposite sideline",
] as const;

function kindLabel(kind: GameVideoSource["kind"]): string {
  switch (kind) {
    case "youtube":
      return "YouTube";
    case "youtube_live":
      return "YouTube Live";
    case "upload":
      return "Upload";
    case "external_url":
      return "External URL";
    default:
      return kind;
  }
}

function shortUid(uid?: string): string {
  if (!uid) return "—";
  return uid.length > 10 ? `${uid.slice(0, 6)}…${uid.slice(-2)}` : uid;
}

function formatDuration(sec?: number): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isYouTubeKind(kind: GameVideoSource["kind"]): boolean {
  return kind === "youtube" || kind === "youtube_live";
}

/**
 * Sources panel for a Game: lists attached YouTube sources, lets editors/owners
 * attach more, and opens the Game in the existing Film Room (single → clip,
 * multi → sync/multi-angle). Viewers see a read-only list but can still open.
 */
export default function GameSources({
  game,
  currentUid,
  teamRole,
  showPasteForm = true,
  onChanged,
}: GameSourcesProps) {
  const router = useRouter();
  const canEdit = canContributeGameSources(game, currentUid, teamRole);

  const [sources, setSources] = useState<GameVideoSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [urlOrId, setUrlOrId] = useState("");
  const [label, setLabel] = useState("");
  const [offset, setOffset] = useState("");
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSources(await listGameSources(game.id));
    } catch {
      /* Leave current list on failure. */
    } finally {
      setLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const playableCount = useMemo(
    () => gameSourcesToAngles(sources).length,
    [sources],
  );

  const handleAdd = useCallback(async () => {
    if (!urlOrId.trim()) {
      setError("Paste a YouTube URL or video ID.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const off = offset.trim() === "" ? 0 : Number(offset);
      await addYouTubeSourceToGame(game.id, currentUid, {
        urlOrId,
        label,
        offsetFromGameTime: Number.isFinite(off) ? off : 0,
      });
      setUrlOrId("");
      setLabel("");
      setOffset("");
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add source.");
    } finally {
      setAdding(false);
    }
  }, [urlOrId, label, offset, game.id, currentUid, refresh, onChanged]);

  const handleOpen = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      const { url } = await openGameInFilmRoom(game, sources, currentUid);
      router.push(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open this game in Film Room.",
      );
      setOpening(false);
    }
  }, [game, sources, currentUid, router]);

  const handleRefreshMetadata = useCallback(
    async (source: GameVideoSource) => {
      if (!source.videoId) return;
      setRefreshingId(source.id);
      setError(null);
      try {
        const meta = await fetchYouTubeVideoMeta(source.videoId);
        if (!meta) {
          setError("Could not fetch YouTube metadata. Try again in a moment.");
          return;
        }
        const patch = metaToSourcePatch(meta);
        if (Object.keys(patch).length === 0) {
          setError("No new metadata available yet.");
          return;
        }
        await updateGameSourceYouTubeMetadata(game.id, source.id, patch);
        await refresh();
        onChanged?.();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not refresh metadata.",
        );
      } finally {
        setRefreshingId(null);
      }
    },
    [game.id, refresh, onChanged],
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Sources
        </p>
        <button
          type="button"
          onClick={() => void handleOpen()}
          disabled={opening || playableCount === 0}
          className="rounded-md border border-blue-500/40 bg-blue-950/50 px-2.5 py-1 text-[11px] font-semibold text-blue-100 transition hover:bg-blue-900/55 disabled:opacity-40"
          title={
            playableCount === 0
              ? "Add a YouTube source first"
              : playableCount > 1
                ? "Open all angles in sync"
                : "Open in Film Room"
          }
        >
          {opening
            ? "Opening…"
            : playableCount > 1
              ? `Open in Film Room (${playableCount} angles)`
              : "Open in Film Room"}
        </button>
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-500">Loading sources…</p>
      ) : sources.length === 0 ? (
        <p className="text-[10px] leading-snug text-zinc-500">
          No sources yet.{" "}
          {canEdit
            ? "Attach a YouTube video below."
            : "An editor can attach a YouTube video."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sources.map((s) => {
            const duration = formatDuration(s.durationSec);
            return (
            <li
              key={s.id}
              className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="truncate text-[12px] font-medium text-zinc-200">
                  {s.label}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300">
                  {kindLabel(s.kind)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                {s.videoId ? (
                  <span className="font-mono">{s.videoId}</span>
                ) : null}
                {duration ? <span>{duration}</span> : null}
                <span>offset {s.offsetFromGameTime ?? 0}s</span>
                <span>by {shortUid(s.createdBy)}</span>
                {canEdit && isYouTubeKind(s.kind) && s.videoId ? (
                  <button
                    type="button"
                    onClick={() => void handleRefreshMetadata(s)}
                    disabled={refreshingId === s.id}
                    className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    {refreshingId === s.id ? "Refreshing…" : "Refresh metadata"}
                  </button>
                ) : null}
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {canEdit && showPasteForm ? (
        <div className="mt-2.5 rounded-md border border-white/[0.07] bg-white/[0.02] p-2">
          <p className="mb-1.5 text-[10px] font-medium text-zinc-400">
            Attach YouTube source
          </p>
          <input
            type="text"
            value={urlOrId}
            onChange={(e) => setUrlOrId(e.target.value)}
            placeholder="YouTube URL or video ID"
            className="mb-1.5 w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50"
          />
          <div className="mb-1.5 flex flex-wrap gap-1">
            {LABEL_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLabel(s)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-zinc-300 transition hover:bg-white/[0.09]"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mb-1.5 flex gap-1.5">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Main sideline)"
              maxLength={60}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50"
            />
            <input
              type="number"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              placeholder="Offset s"
              title="Seconds added to game time to reach this source (default 0)"
              className="w-20 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={adding}
            className="rounded-md border border-emerald-500/40 bg-emerald-950/45 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-900/55 disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add source"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
