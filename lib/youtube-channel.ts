/**
 * Detect whether the signed-in Google account has a YouTube channel.
 *
 * Many parents don't realize their Gmail already includes a YouTube channel —
 * and a Google account has NO channel until one is created. `channels.list`
 * with `mine=true` returns the channel when it exists, or an empty list / a
 * `youtubeSignupRequired` error when it does not.
 *
 * Requires an OAuth token with a YouTube read scope (the broad `youtube` scope
 * used by the consolidated parent flow is sufficient).
 */

export type MyYouTubeChannel = {
  id: string;
  title: string;
  customUrl?: string;
};

export type MyChannelResult =
  | { status: "found"; channel: MyYouTubeChannel }
  | { status: "no_channel" }
  | { status: "error"; message: string };

const CHANNELS_MINE_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

/** "No channel yet" is reported by YouTube as a signup-required error. */
function isSignupRequired(detail: string): boolean {
  return /youtubeSignupRequired|not enabled for using YouTube|has not created a YouTube channel/i.test(
    detail,
  );
}

export async function fetchMyYouTubeChannel(
  accessToken: string,
): Promise<MyChannelResult> {
  let res: Response;
  try {
    res = await fetch(CHANNELS_MINE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { status: "error", message: "Couldn't reach YouTube. Try again." };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ?? "";
    } catch {
      /* ignore */
    }
    if (isSignupRequired(detail)) return { status: "no_channel" };
    return {
      status: "error",
      message: detail || `YouTube returned ${res.status}.`,
    };
  }

  let data: {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; customUrl?: string };
    }>;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { status: "error", message: "Invalid response from YouTube." };
  }

  const item = Array.isArray(data.items) ? data.items[0] : undefined;
  const id = typeof item?.id === "string" ? item.id.trim() : "";
  if (!item || !id) return { status: "no_channel" };

  const title =
    typeof item.snippet?.title === "string" && item.snippet.title.trim() !== ""
      ? item.snippet.title.trim()
      : "Your channel";
  const customUrl =
    typeof item.snippet?.customUrl === "string" &&
    item.snippet.customUrl.trim() !== ""
      ? item.snippet.customUrl.trim().replace(/^@/, "")
      : undefined;

  return {
    status: "found",
    channel: { id, title, ...(customUrl ? { customUrl } : {}) },
  };
}
