/**
 * Unified Game Cap channel upload matching (MOGO + Tripod) for My Film sync.
 */

import {
  formatGameCapMogoDisplayName,
  isGameCapMogoYouTubeVideo,
} from "@/lib/youtube/mogo-match";
import {
  formatGameCapTripodDisplayName,
  isGameCapTripodYouTubeVideo,
  looksLikeHighlightReelTitle,
} from "@/lib/youtube/tripod-match";

export type GameCapChannelDevice = "mogo" | "tripod";

export type GameCapChannelMatch = {
  device: GameCapChannelDevice;
  /** Title/description suggests a highlight cut rather than full-game film. */
  isHighlight: boolean;
  label: string;
};

export function isGameCapChannelYouTubeVideo(
  title: string,
  description = "",
): boolean {
  return (
    isGameCapMogoYouTubeVideo(title, description) ||
    isGameCapTripodYouTubeVideo(title, description)
  );
}

export function classifyGameCapChannelUpload(
  title: string,
  description = "",
): GameCapChannelMatch | null {
  const t = title.trim();
  const d = description.trim();
  if (!isGameCapChannelYouTubeVideo(t, d)) return null;

  const isMogo = isGameCapMogoYouTubeVideo(t, d);
  const isTripod = isGameCapTripodYouTubeVideo(t, d);
  // Prefer Tripod when description stamps tripod (MOGO titles can coexist).
  const device: GameCapChannelDevice =
    isTripod && (!isMogo || /\btripod\b/i.test(d) || /GameCapTripod/i.test(t))
      ? "tripod"
      : isMogo
        ? "mogo"
        : "tripod";

  const label =
    device === "mogo"
      ? formatGameCapMogoDisplayName(t) || t
      : formatGameCapTripodDisplayName(t) || t;

  return {
    device,
    isHighlight: looksLikeHighlightReelTitle(t, d),
    label: label.trim() || t,
  };
}
