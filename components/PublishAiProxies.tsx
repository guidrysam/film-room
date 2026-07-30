"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getYouTubeOAuthAccessToken } from "@/lib/auth-google";
import { downloadDriveFileAsFile } from "@/lib/drive-download";
import {
  updateGameSourceAiProxy,
  type Game,
  type GameVideoSource,
} from "@/lib/games";
import type { Team } from "@/lib/teams";
import {
  buildYouTubeUploadDescription,
  buildYouTubeUploadTitle,
  uploadVideoToYouTube,
} from "@/lib/youtube-upload";

export type PublishAiProxiesProps = {
  game: Game;
  sources: GameVideoSource[];
  team?: Team | null;
  onComplete?: () => void;
};

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50";

/**
 * Publish YouTube AI proxies for Drive vault angles (public for Gemini watch).
 */
export default function PublishAiProxies({
  game,
  sources,
  team,
  onComplete,
}: PublishAiProxiesProps) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const vaultSources = useMemo(
    () =>
      sources.filter(
        (s) =>
          s.kind === "upload" &&
          typeof s.driveFileId === "string" &&
          s.driveFileId.trim() !== "",
      ),
    [sources],
  );

  const publishOne = useCallback(
    async (source: GameVideoSource) => {
      if (!user || !source.driveFileId) return;
      setBusyId(source.id);
      setError(null);
      setProgress(0);
      setStatus(`Downloading ${source.label} from Drive…`);
      try {
        const idToken = await user.getIdToken();
        const accessRes = await fetch("/api/drive/file-access", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ gameId: game.id, sourceId: source.id }),
        });
        const access = (await accessRes.json()) as {
          accessToken?: string;
          driveFileId?: string;
          fileName?: string;
          error?: string;
        };
        if (!accessRes.ok || !access.accessToken || !access.driveFileId) {
          throw new Error(access.error || "Could not access Drive file.");
        }

        const file = await downloadDriveFileAsFile({
          accessToken: access.accessToken,
          driveFileId: access.driveFileId,
          fileName: access.fileName || `${source.label || "angle"}.mp4`,
        });

        setStatus(`Uploading ${source.label} to YouTube (public AI proxy)…`);
        const { accessToken: ytToken } = await getYouTubeOAuthAccessToken();
        const uploaded = await uploadVideoToYouTube({
          accessToken: ytToken,
          file,
          privacyStatus: "public",
          metadata: {
            title: buildYouTubeUploadTitle(
              game.title,
              `AI Proxy — ${source.label || "Camera"}`,
            ),
            description: buildYouTubeUploadDescription({
              teamName: team?.name,
              gameTitle: game.title,
              date: game.date,
            }),
          },
          onProgress: (p) => setProgress(p.pct),
        });

        await updateGameSourceAiProxy(game.id, source.id, {
          aiProxyVideoId: uploaded.videoId,
          youtubePrivacyStatus: "public",
          youtubeEmbeddable: true,
        });
        setStatus(`Proxy ready for ${source.label}.`);
        onComplete?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Proxy publish failed.");
      } finally {
        setBusyId(null);
        setProgress(0);
      }
    },
    [user, game, team, onComplete],
  );

  const publishMissing = useCallback(async () => {
    const missing = vaultSources.filter((s) => !s.aiProxyVideoId);
    for (const source of missing) {
      await publishOne(source);
      if (error) break;
    }
  }, [vaultSources, publishOne, error]);

  if (vaultSources.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 ring-1 ring-white/[0.04]">
      <h3 className="text-sm font-semibold text-white">AI YouTube proxies</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Publish public YouTube copies of vault angles so Gemini can sync and
        propose cuts. Clean masters still render from Drive originals.
      </p>
      {error ? (
        <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-950/25 px-2 py-1.5 text-xs text-rose-200">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="mt-2 text-xs text-zinc-400">
          {status}
          {busyId && progress > 0 ? ` ${progress}%` : ""}
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {vaultSources.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="text-zinc-200">
              {s.label}
              {s.angleSlot ? (
                <span className="ml-1 text-zinc-500">({s.angleSlot})</span>
              ) : null}
              {s.aiProxyVideoId ? (
                <a
                  className="ml-2 text-blue-300 hover:underline"
                  href={`https://www.youtube.com/watch?v=${s.aiProxyVideoId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  proxy
                </a>
              ) : (
                <span className="ml-2 text-amber-300/90">no proxy</span>
              )}
            </span>
            <button
              type="button"
              className={ghostBtn}
              disabled={Boolean(busyId)}
              onClick={() => void publishOne(s)}
            >
              {busyId === s.id
                ? "Working…"
                : s.aiProxyVideoId
                  ? "Re-publish"
                  : "Publish"}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`${primaryBtn} mt-3`}
        disabled={Boolean(busyId) || vaultSources.every((s) => s.aiProxyVideoId)}
        onClick={() => void publishMissing()}
      >
        Publish missing proxies
      </button>
    </div>
  );
}
