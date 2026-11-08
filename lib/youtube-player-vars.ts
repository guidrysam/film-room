/** Shared IFrame API params when Film Room renders its own transport. */
export const YOUTUBE_CHROMELESS_PLAYER_VARS = {
  rel: 0,
  playsinline: 1,
  modestbranding: 1,
  enablejsapi: 1,
  controls: 0,
  disablekb: 1,
  fs: 0,
  iv_load_policy: 3,
  /** Prefer captions off (user prefs / auto-captions still need unload below). */
  cc_load_policy: 0,
} as const;

type CaptionCapablePlayer = {
  unloadModule?: (module: string) => void;
  loadModule?: (module: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
};

/**
 * Force YouTube closed captions off on a chromeless player.
 * Does not affect burned-in text that was edited into the VOD.
 */
export function disableYouTubeCaptions(player: unknown): void {
  if (!player || typeof player !== "object") return;
  const p = player as CaptionCapablePlayer;
  try {
    p.unloadModule?.("captions");
  } catch {
    /* module may already be off */
  }
  try {
    p.loadModule?.("captions");
    p.setOption?.("captions", "track", {});
    p.unloadModule?.("captions");
  } catch {
    /* older players / restricted embeds */
  }
}
