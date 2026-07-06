import type { SavedClip, SavedSessionDoc } from "@/lib/saved-sessions";

/** Clip shape used in Film Room RTDB (YouTube + Facebook teaching). */
export type RoomClipLike = {
  videoId: string;
  label?: string;
  provider?: "youtube" | "facebook";
  facebookVideoUrl?: string;
};

export function roomClipToSavedClip(c: RoomClipLike): SavedClip {
  const label = c.label?.trim();
  const facebookVideoUrl = c.facebookVideoUrl?.trim();
  return {
    videoId: c.videoId,
    ...(label ? { label } : {}),
    ...(c.provider === "facebook" ? { provider: "facebook" as const } : {}),
    ...(facebookVideoUrl ? { facebookVideoUrl } : {}),
  };
}

export function savedClipToRoomClip(c: SavedClip): RoomClipLike {
  const label = c.label?.trim();
  const facebookVideoUrl = c.facebookVideoUrl?.trim();
  return {
    videoId: c.videoId,
    ...(label ? { label } : {}),
    ...(c.provider === "facebook" ? { provider: "facebook" as const } : {}),
    ...(facebookVideoUrl ? { facebookVideoUrl } : {}),
  };
}

export function parseSavedClips(raw: unknown): SavedClip[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedClip[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const videoId = typeof o.videoId === "string" ? o.videoId.trim() : "";
    if (!videoId) continue;
    const label =
      typeof o.label === "string" && o.label.trim() !== ""
        ? o.label.trim()
        : undefined;
    const providerRaw = o.provider;
    const provider =
      providerRaw === "facebook" || providerRaw === "youtube"
        ? providerRaw
        : undefined;
    const facebookVideoUrl =
      typeof o.facebookVideoUrl === "string" && o.facebookVideoUrl.trim() !== ""
        ? o.facebookVideoUrl.trim()
        : undefined;
    out.push({
      videoId,
      ...(label ? { label } : {}),
      ...(provider ? { provider } : {}),
      ...(facebookVideoUrl ? { facebookVideoUrl } : {}),
    });
  }
  return out;
}

export function isFacebookLessonTemplate(template: {
  videoProvider?: SavedSessionDoc["videoProvider"];
  clips: SavedClip[];
}): boolean {
  if (template.videoProvider === "facebook") return true;
  return template.clips.some((c) => c.provider === "facebook");
}

export function facebookHrefForSavedClip(clip: SavedClip): string {
  if (clip.facebookVideoUrl?.trim()) return clip.facebookVideoUrl.trim();
  return `https://www.facebook.com/watch?v=${encodeURIComponent(clip.videoId)}`;
}

/** RTDB room seed from a saved / shared lesson template. */
export function buildRoomSeedFromSavedTemplate(
  template: SavedSessionDoc,
  opts?: { ownerId?: string },
): Record<string, unknown> {
  const clips = template.clips.map((c) => savedClipToRoomClip(c));
  const idx = Math.min(
    Math.max(0, template.currentClipIndex),
    Math.max(0, clips.length - 1),
  );
  const active = clips[idx] ?? clips[0];
  const activeId = active?.videoId ?? "";
  const isFacebook = isFacebookLessonTemplate(template);
  const tplAngles = template.angles;
  const hasTemplateAngles =
    Array.isArray(tplAngles) && tplAngles.length >= 1 ? tplAngles : null;

  return {
    ...(opts?.ownerId ? { ownerId: opts.ownerId } : {}),
    videoId: activeId,
    clips,
    currentClipIndex: idx,
    chapters: (template.chapters ?? []).map((ch) => ({
      time: ch.time,
      label: ch.label,
      videoId: ch.videoId,
      ...(typeof ch.gameTime === "number" ? { gameTime: ch.gameTime } : {}),
    })),
    ...(isFacebook
      ? {
          videoProvider: "facebook" as const,
          ...(active?.facebookVideoUrl
            ? { facebookVideoUrl: active.facebookVideoUrl }
            : active
              ? { facebookVideoUrl: facebookHrefForSavedClip(template.clips[idx]!) }
              : {}),
        }
      : {}),
    ...(hasTemplateAngles
      ? {
          angles: hasTemplateAngles,
          currentAngleId:
            template.currentAngleId &&
            hasTemplateAngles.some((a) => a.id === template.currentAngleId)
              ? template.currentAngleId
              : hasTemplateAngles[0]!.id,
        }
      : {}),
    ...(typeof template.syncAnchorTime === "number" &&
    template.syncAnchorTime > 0
      ? { syncAnchorTime: template.syncAnchorTime }
      : {}),
    ...(template.manualSyncLocked === true ? { manualSyncLocked: true } : {}),
    ...(template.playerViewAngleId &&
    hasTemplateAngles?.some((a) => a.id === template.playerViewAngleId)
      ? { playerViewAngleId: template.playerViewAngleId }
      : {}),
    ...(typeof template.manualSyncAt === "number"
      ? { manualSyncAt: template.manualSyncAt }
      : {}),
    ...(template.sourceType === "live" ? { sourceType: "live" as const } : {}),
    isPlaying: false,
    currentTime: 0,
    playbackRate: 1,
    playbackCommand: null,
    action: "init",
    actionId: 1,
  };
}
