import {
  addYouTubeSourceToGame,
  getGame,
  updateGameSourceYouTubeMetadata,
  type CreateGameInput,
} from "@/lib/games";
import { extractYouTubeVideoId } from "@/lib/youtube-id";
import {
  fetchYouTubeVideoMeta,
  metaToSourcePatch,
  type YouTubeVideoMeta,
} from "@/lib/youtube-video-meta-client";
import {
  canCoachTeam,
  createTeamGame,
  getTeam,
  teamRoleFor,
  type Team,
} from "@/lib/teams";

export type CreateTeamGameFromStreamInput = {
  urlOrId: string;
  title?: string;
  opponent?: string;
  date?: string;
  season?: string;
  sourceLabel?: string;
};

export type CreateTeamGameFromStreamResult = {
  gameId: string;
  sourceId: string;
  title: string;
  videoId: string;
};

export type BatchCreateTeamGamesFromStreamsResult = {
  created: CreateTeamGameFromStreamResult[];
  errors: { line: string; message: string }[];
};

/** Parse one YouTube URL/id per non-empty line (deduped by video id). */
export function parseYouTubeStreamLines(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const videoId = extractYouTubeVideoId(line);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    out.push(line);
  }
  return out;
}

/** Prefer explicit title, then YouTube title, then a short fallback. */
export function gameTitleFromStreamMeta(
  meta: YouTubeVideoMeta | null,
  explicitTitle?: string,
): string {
  const explicit = explicitTitle?.trim();
  if (explicit) return explicit;
  const yt = meta?.title?.trim();
  if (yt) return yt;
  return "Game";
}

/** Best-effort opponent parse from a "Team A vs Team B" style title. */
export function opponentFromGameTitle(
  title: string,
  teamName?: string,
): string | undefined {
  const parts = title.split(/\s+vs\.?\s+/i);
  if (parts.length < 2) return undefined;
  const teamKey = teamName?.trim().toLowerCase();
  const left = parts[0]!.trim();
  const right = parts[1]!.trim();
  if (!teamKey) return right || left;
  if (left.toLowerCase().includes(teamKey)) return right;
  if (right.toLowerCase().includes(teamKey)) return left;
  return right || left;
}

function scheduleFieldsFromMeta(
  meta: YouTubeVideoMeta | null,
  input: Pick<CreateTeamGameFromStreamInput, "date" | "season">,
): Pick<CreateGameInput, "date" | "season" | "scheduledStartAt"> {
  const scheduledStartAt =
    meta?.actualStartTime?.trim() || meta?.scheduledStartTime?.trim();
  const dateFromMeta =
    meta?.recordingDate?.trim().slice(0, 10) ||
    (scheduledStartAt ? scheduledStartAt.slice(0, 10) : undefined);
  return {
    ...(input.season?.trim() ? { season: input.season.trim() } : {}),
    ...(input.date?.trim()
      ? { date: input.date.trim() }
      : dateFromMeta
        ? { date: dateFromMeta }
        : {}),
    ...(scheduledStartAt ? { scheduledStartAt } : {}),
  };
}

/**
 * Create a team game and attach a YouTube stream/VOD as the first source.
 * Title defaults to the YouTube video title when omitted.
 */
export async function createTeamGameFromYouTubeStream(
  uid: string,
  teamId: string,
  input: CreateTeamGameFromStreamInput,
): Promise<CreateTeamGameFromStreamResult> {
  const videoId = extractYouTubeVideoId(input.urlOrId);
  if (!videoId) {
    throw new Error("Enter a valid YouTube URL or 11-character video ID.");
  }

  const team = await getTeam(teamId);
  if (!team) throw new Error("Team not found.");
  if (!canCoachTeam(team, uid)) {
    throw new Error("Only team admins and coaches can create games.");
  }

  const meta = await fetchYouTubeVideoMeta(videoId);
  const title = gameTitleFromStreamMeta(meta, input.title);
  const opponent =
    input.opponent?.trim() ||
    opponentFromGameTitle(title, team.name) ||
    undefined;

  const gameId = await createTeamGame(uid, teamId, {
    title,
    ...(opponent ? { opponent, awayTeam: opponent } : {}),
    ...scheduleFieldsFromMeta(meta, input),
  });

  const game = await getGame(gameId);
  const teamRole = teamRoleFor(team, uid);
  const sourceId = await addYouTubeSourceToGame(
    gameId,
    uid,
    {
      urlOrId: videoId,
      label: input.sourceLabel?.trim() || "Main stream",
    },
    { game: game ?? undefined, teamRole },
  );

  if (meta) {
    await updateGameSourceYouTubeMetadata(
      gameId,
      sourceId,
      metaToSourcePatch(meta),
    );
  }

  return { gameId, sourceId, title, videoId };
}

/** Create one game per YouTube URL line (for backfilling an old tournament). */
export async function createTeamGamesFromYouTubeStreams(
  uid: string,
  teamId: string,
  text: string,
  shared?: Pick<CreateTeamGameFromStreamInput, "season" | "sourceLabel">,
): Promise<BatchCreateTeamGamesFromStreamsResult> {
  const lines = parseYouTubeStreamLines(text);
  const created: CreateTeamGameFromStreamResult[] = [];
  const errors: { line: string; message: string }[] = [];

  for (const line of lines) {
    try {
      const row = await createTeamGameFromYouTubeStream(uid, teamId, {
        urlOrId: line,
        season: shared?.season,
        sourceLabel: shared?.sourceLabel,
      });
      created.push(row);
    } catch (err) {
      errors.push({
        line,
        message: err instanceof Error ? err.message : "Could not create game.",
      });
    }
  }

  return { created, errors };
}
