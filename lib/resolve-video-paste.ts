import {
  extractFacebookVideoRef,
  type FacebookVideoRef,
} from "@/lib/facebook-video-url";
import { NON_YOUTUBE_LINK_MESSAGE } from "@/lib/public-copy";
import { resolveYouTubeVideoIdFromPaste } from "@/lib/resolve-youtube-paste";

export type ResolveVideoPasteResult =
  | { ok: true; provider: "youtube"; videoId: string }
  | { ok: true; provider: "facebook"; ref: FacebookVideoRef }
  | { ok: false; error: string };

/** Resolve a pasted link to YouTube or Facebook playback metadata. */
export async function resolveVideoFromPaste(
  raw: string,
): Promise<ResolveVideoPasteResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a video link first." };
  }

  const yt = await resolveYouTubeVideoIdFromPaste(trimmed);
  if (yt.ok) {
    return { ok: true, provider: "youtube", videoId: yt.videoId };
  }

  const fb = extractFacebookVideoRef(trimmed);
  if (fb) {
    if (fb.videoKey.startsWith("fbwatch:")) {
      const resolved = await resolveFacebookShortLink(fb.href);
      if (resolved) {
        return { ok: true, provider: "facebook", ref: resolved };
      }
      return {
        ok: false,
        error:
          "Could not resolve that fb.watch link. Open it in a browser and paste the full facebook.com URL instead.",
      };
    }
    return { ok: true, provider: "facebook", ref: fb };
  }

  return { ok: false, error: NON_YOUTUBE_LINK_MESSAGE };
}

async function resolveFacebookShortLink(
  href: string,
): Promise<FacebookVideoRef | null> {
  try {
    const res = await fetch(
      `/api/resolve-facebook-url?url=${encodeURIComponent(href)}`,
    );
    const data = (await res.json()) as {
      ok?: boolean;
      ref?: FacebookVideoRef;
    };
    if (data.ok && data.ref?.videoKey && data.ref.href) {
      return data.ref;
    }
  } catch {
    /* network */
  }
  return null;
}
