/**
 * Best-effort repair for "won't embed" uploads.
 *
 * A Game Cap upload is inserted with `status.embeddable = true`, but YouTube can
 * still report it as non-embeddable when the video (or whole channel) is flagged
 * "Made for Kids". This helper re-asserts the per-video embed flags via
 * `videos.update`. It CANNOT override a channel-level "Made for Kids" audience —
 * that must be changed by the owner in YouTube Studio.
 *
 * Requires an OAuth token with the broad `youtube` scope (the upload scope
 * `youtube.upload` is not sufficient for `videos.update`).
 */

export type SetEmbeddableResult = {
  embeddable?: boolean;
  madeForKids?: boolean;
  privacyStatus?: string;
};

export type SetEmbeddableOptions = {
  accessToken: string;
  videoId: string;
  /** Preserve the video's current privacy when re-writing the status part. */
  privacyStatus?: "private" | "unlisted" | "public";
};

const VIDEOS_UPDATE_URL =
  "https://www.googleapis.com/youtube/v3/videos?part=status";

/**
 * Re-assert `embeddable: true` and `selfDeclaredMadeForKids: false` on a video
 * the signed-in user owns. Returns the resulting status flags so the caller can
 * confirm whether the fix actually took (a channel-level kids audience will keep
 * `embeddable` false even after this succeeds).
 */
export async function setYouTubeVideoEmbeddable(
  opts: SetEmbeddableOptions,
): Promise<SetEmbeddableResult> {
  const videoId = opts.videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error("Invalid YouTube video id.");
  }
  // `videos.update` resets omitted fields within the status part, so we send
  // the full set we care about (privacy is preserved from the known value).
  const res = await fetch(VIDEOS_UPDATE_URL, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      id: videoId,
      status: {
        embeddable: true,
        selfDeclaredMadeForKids: false,
        privacyStatus: opts.privacyStatus ?? "unlisted",
      },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(
      detail
        ? `Couldn't update embed setting: ${detail}`
        : `Couldn't update embed setting (${res.status}).`,
    );
  }

  let data: {
    status?: {
      embeddable?: boolean;
      madeForKids?: boolean;
      privacyStatus?: string;
    };
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* response body is optional for our purposes */
  }
  return {
    ...(typeof data.status?.embeddable === "boolean"
      ? { embeddable: data.status.embeddable }
      : {}),
    ...(typeof data.status?.madeForKids === "boolean"
      ? { madeForKids: data.status.madeForKids }
      : {}),
    ...(typeof data.status?.privacyStatus === "string"
      ? { privacyStatus: data.status.privacyStatus }
      : {}),
  };
}
