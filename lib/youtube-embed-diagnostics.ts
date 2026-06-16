import { extractYouTubeVideoId } from "@/lib/youtube-id";

export type EmbedDiagnosticCreatedBy =
  | "studio"
  | "manual"
  | "api-new"
  | "api-reusable";

export type EmbedDiagnosticTestKind =
  | "manual_studio"
  | "api_new"
  | "api_reusable"
  | "archive_vod";

export type IframeEmbedResult = "works" | "blocked" | "unknown" | "pending";

export type EmbedDiagnosticRecord = {
  id: string;
  recordedAt: string;
  testKind: EmbedDiagnosticTestKind;
  videoId: string;
  createdBy: EmbedDiagnosticCreatedBy;
  /** `liveBroadcasts.contentDetails.enableEmbed` when OAuth available. */
  enableEmbedFromBroadcastApi?: boolean | null;
  /** `videos.list` status.embeddable (Data API key). */
  embeddableFromVideosApi?: boolean | null;
  iframeEmbedResult: IframeEmbedResult;
  privacyStatus?: string;
  lifeCycleStatus?: string;
  streamPhase?: string;
  /** Set when re-tested after broadcast ended (archive/VOD). */
  archiveEmbedsLater?: boolean | null;
  notes?: string;
  watchUrl?: string;
};

export const EMBED_DIAGNOSTICS_STORAGE_KEY = "filmRoomYouTubeEmbedDiagnostics.v1";

export function embedUrlForVideoId(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1`;
}

export function watchUrlForVideoId(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function parseVideoIdInput(raw: string): string | null {
  return extractYouTubeVideoId(raw.trim());
}

export function loadEmbedDiagnosticRecords(): EmbedDiagnosticRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EMBED_DIAGNOSTICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: EmbedDiagnosticRecord[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      const videoId = typeof o.videoId === "string" ? o.videoId.trim() : "";
      const recordedAt =
        typeof o.recordedAt === "string" ? o.recordedAt.trim() : "";
      const testKind = o.testKind;
      const createdBy = o.createdBy;
      const iframeEmbedResult = o.iframeEmbedResult;
      if (!id || !videoId || !recordedAt) continue;
      if (
        testKind !== "manual_studio" &&
        testKind !== "api_new" &&
        testKind !== "api_reusable" &&
        testKind !== "archive_vod"
      ) {
        continue;
      }
      if (
        createdBy !== "studio" &&
        createdBy !== "manual" &&
        createdBy !== "api-new" &&
        createdBy !== "api-reusable"
      ) {
        continue;
      }
      if (
        iframeEmbedResult !== "works" &&
        iframeEmbedResult !== "blocked" &&
        iframeEmbedResult !== "unknown" &&
        iframeEmbedResult !== "pending"
      ) {
        continue;
      }
      out.push({
        id,
        recordedAt,
        testKind,
        videoId,
        createdBy,
        iframeEmbedResult,
        ...(typeof o.enableEmbedFromBroadcastApi === "boolean"
          ? { enableEmbedFromBroadcastApi: o.enableEmbedFromBroadcastApi }
          : o.enableEmbedFromBroadcastApi === null
            ? { enableEmbedFromBroadcastApi: null }
            : {}),
        ...(typeof o.embeddableFromVideosApi === "boolean"
          ? { embeddableFromVideosApi: o.embeddableFromVideosApi }
          : o.embeddableFromVideosApi === null
            ? { embeddableFromVideosApi: null }
            : {}),
        ...(typeof o.privacyStatus === "string"
          ? { privacyStatus: o.privacyStatus }
          : {}),
        ...(typeof o.lifeCycleStatus === "string"
          ? { lifeCycleStatus: o.lifeCycleStatus }
          : {}),
        ...(typeof o.streamPhase === "string" ? { streamPhase: o.streamPhase } : {}),
        ...(typeof o.archiveEmbedsLater === "boolean"
          ? { archiveEmbedsLater: o.archiveEmbedsLater }
          : o.archiveEmbedsLater === null
            ? { archiveEmbedsLater: null }
            : {}),
        ...(typeof o.notes === "string" ? { notes: o.notes } : {}),
        ...(typeof o.watchUrl === "string" ? { watchUrl: o.watchUrl } : {}),
      });
    }
    return out.sort(
      (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
    );
  } catch {
    return [];
  }
}

export function saveEmbedDiagnosticRecords(records: EmbedDiagnosticRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    EMBED_DIAGNOSTICS_STORAGE_KEY,
    JSON.stringify(records),
  );
}

export function upsertEmbedDiagnosticRecord(
  record: EmbedDiagnosticRecord,
): EmbedDiagnosticRecord[] {
  const existing = loadEmbedDiagnosticRecords();
  const next = [record, ...existing.filter((r) => r.id !== record.id)];
  saveEmbedDiagnosticRecords(next);
  return next;
}

export function simpleEmbedVerdict(args: {
  iframeEmbedResult: IframeEmbedResult;
  embeddableFromVideosApi?: boolean | null;
  enableEmbedFromBroadcastApi?: boolean | null;
}): "Works" | "Blocked" | "Unknown" {
  const { iframeEmbedResult, embeddableFromVideosApi, enableEmbedFromBroadcastApi } =
    args;
  if (iframeEmbedResult === "blocked") return "Blocked";
  if (embeddableFromVideosApi === false || enableEmbedFromBroadcastApi === false) {
    return "Blocked";
  }
  if (iframeEmbedResult === "works") return "Works";
  if (embeddableFromVideosApi === true || enableEmbedFromBroadcastApi === true) {
    return "Works";
  }
  return "Unknown";
}

export type EmbedWorkaroundAnalysis = {
  studioEmbeddable: boolean | null;
  apiEmbeddable: boolean | null;
  archiveEmbeddable: boolean | null;
  recommendation: string;
};

export function analyzeEmbedWorkaround(
  records: EmbedDiagnosticRecord[],
): EmbedWorkaroundAnalysis {
  const studio = records.filter(
    (r) => r.createdBy === "studio" || r.testKind === "manual_studio",
  );
  const api = records.filter(
    (r) =>
      r.createdBy === "api-new" ||
      r.createdBy === "api-reusable" ||
      r.testKind === "api_new" ||
      r.testKind === "api_reusable",
  );
  const archive = records.filter((r) => r.testKind === "archive_vod");

  const verdict = (r: EmbedDiagnosticRecord) =>
    simpleEmbedVerdict({
      iframeEmbedResult: r.iframeEmbedResult,
      embeddableFromVideosApi: r.embeddableFromVideosApi,
      enableEmbedFromBroadcastApi: r.enableEmbedFromBroadcastApi,
    });

  const studioWorks = studio.some((r) => verdict(r) === "Works");
  const studioBlocked = studio.some((r) => verdict(r) === "Blocked");
  const apiWorks = api.some((r) => verdict(r) === "Works");
  const apiBlocked = api.some((r) => verdict(r) === "Blocked");
  const archiveWorks = archive.some((r) => verdict(r) === "Works");
  const archiveBlocked = archive.some((r) => verdict(r) === "Blocked");

  const studioEmbeddable = studioWorks
    ? true
    : studioBlocked
      ? false
      : studio.length > 0
        ? null
        : null;
  const apiEmbeddable = apiWorks ? true : apiBlocked ? false : api.length > 0 ? null : null;
  const archiveEmbeddable = archiveWorks
    ? true
    : archiveBlocked
      ? false
      : archive.length > 0
        ? null
        : null;

  let recommendation =
    "Run the checklist tests below (Studio manual, API new, API reusable, then archive after the stream ends).";

  if (studioEmbeddable === true && apiEmbeddable === false) {
    recommendation =
      "YouTube Studio creates embeddable live streams on this channel, but API-created broadcasts are not embeddable. Create the stream in YouTube Studio (enable “Allow embedding”), paste the watch link into Stream Room, and use it as your sideline source in Film Room. Do not rely on API create-live-stream for embed playback on this channel.";
  } else if (apiEmbeddable === true && studioEmbeddable !== false) {
    recommendation =
      "API-created broadcasts appear embeddable on this channel. Continue using Create / Get Today’s Watch Link in Stream Room.";
  } else if (studioEmbeddable === false && apiEmbeddable === false) {
    recommendation =
      "Neither Studio nor API streams embed on this channel. Enable live embedding in YouTube Studio (Stream settings → Allow embedding), confirm AdSense / Partner Program eligibility, or use the watch-link fallback (open on YouTube) instead of iframe embed.";
  } else if (archiveEmbeddable === true && apiEmbeddable === false) {
    recommendation =
      "Live embed is blocked but the archived VOD embeds after the stream ends. For Film Room during the game, use a Studio-created live link or open YouTube in a new tab; after the broadcast, the same video ID may work as VOD in the room.";
  } else if (archiveEmbeddable === false) {
    recommendation =
      "Archive/VOD also blocks embedding. This is a channel-level restriction — fix embedding in Studio and Partner Program settings before relying on Film Room iframe playback.";
  }

  return {
    studioEmbeddable,
    apiEmbeddable,
    archiveEmbeddable,
    recommendation,
  };
}
