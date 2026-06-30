import { NON_YOUTUBE_LINK_MESSAGE } from "@/lib/public-copy";
import {
  extractYouTubeVideoId,
  parsePersistentLiveUrlTarget,
} from "@/lib/youtube-id";

export type ResolveYouTubePasteResult =
  | { ok: true; videoId: string }
  | { ok: false; error: string };

async function resolvePersistentLiveVideoId(
  target: Extract<
    NonNullable<ReturnType<typeof parsePersistentLiveUrlTarget>>,
    { kind: "channel_live" | "handle_live" }
  >,
): Promise<string | null> {
  const params = new URLSearchParams();
  if (target.kind === "channel_live") {
    params.set("channelId", target.channelId);
  } else {
    params.set("handle", target.handle);
  }
  try {
    const res = await fetch(`/api/youtube-resolve-live?${params.toString()}`);
    const data = (await res.json()) as { ok?: boolean; videoId?: string };
    if (data.ok && typeof data.videoId === "string" && data.videoId.trim()) {
      return data.videoId.trim();
    }
  } catch {
    /* best-effort */
  }
  return null;
}

/** Resolve a pasted YouTube link (or id) to an embeddable 11-char video id. */
export async function resolveYouTubeVideoIdFromPaste(
  raw: string,
): Promise<ResolveYouTubePasteResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a YouTube link first." };
  }

  const direct = extractYouTubeVideoId(trimmed);
  if (direct) return { ok: true, videoId: direct };

  const target = parsePersistentLiveUrlTarget(trimmed);
  if (target?.kind === "video") {
    return { ok: true, videoId: target.videoId };
  }
  if (target?.kind === "channel_live" || target?.kind === "handle_live") {
    const videoId = await resolvePersistentLiveVideoId(target);
    if (videoId) return { ok: true, videoId };
    return {
      ok: false,
      error:
        "Could not find an active live stream for that channel. Paste a direct youtube.com/live/… link instead.",
    };
  }

  return { ok: false, error: NON_YOUTUBE_LINK_MESSAGE };
}
