import "server-only";

import {
  AUDIO_SYNC_SAMPLE_RATE,
  extractYoutubePcmWindow,
} from "@/lib/audio-sync/extract-youtube-pcm";
import { alignByAudioPeaks } from "@/lib/audio-sync/cross-correlate";
import { roundSyncOffsetSeconds } from "@/lib/persist-room-game-sync";

export type AudioAlignAngle = {
  sourceId: string;
  videoId: string;
  label: string;
  /** Existing offsetFromGameTime (0 if unsynced). */
  offsetFromGameTime?: number;
};

export type AudioAlignResult = {
  /** Target source id that should receive the new offset. */
  targetSourceId: string;
  offsetFromGameTime: number;
  lagSec: number;
  confidence: number;
  syncConfidence: "high" | "medium" | "low";
  note: string;
  windowStartSec: number;
  windowDurationSec: number;
};

function syncConfidenceFromScore(
  confidence: number,
): "high" | "medium" | "low" {
  if (confidence >= 0.55) return "high";
  if (confidence >= 0.3) return "medium";
  return "low";
}

/**
 * Align `target` to `reference` using shared ambient audio peaks
 * (whistle / cheer / kick), confirmed with envelope correlation.
 */
export async function alignAnglesByAudio(input: {
  reference: AudioAlignAngle;
  target: AudioAlignAngle;
  /** Shared analysis window start in each video's own timeline. */
  windowStartSec?: number;
  windowDurationSec?: number;
}): Promise<AudioAlignResult> {
  const windowStartSec = input.windowStartSec ?? 45;
  const windowDurationSec = input.windowDurationSec ?? 90;

  const [primaryPcm, secondaryPcm] = await Promise.all([
    extractYoutubePcmWindow({
      videoId: input.reference.videoId,
      startSec: windowStartSec,
      durationSec: windowDurationSec,
    }),
    extractYoutubePcmWindow({
      videoId: input.target.videoId,
      startSec: windowStartSec,
      durationSec: windowDurationSec,
    }),
  ]);

  const corr = alignByAudioPeaks(primaryPcm, secondaryPcm, {
    sampleRate: AUDIO_SYNC_SAMPLE_RATE,
    maxLagSec: Math.min(150, Math.floor(windowDurationSec * 0.75)),
  });

  if (corr.confidence < 0.2) {
    throw new Error(
      `Audio sync confidence too low (${corr.confidence.toFixed(2)}; ` +
        `peaks ${corr.primaryPeakCount ?? 0}/${corr.secondaryPeakCount ?? 0}). ` +
        "Need shared loud moments (whistle, cheer). Try again later in the game, or sync manually. " +
        "Muted or music-only angles cannot audio-sync.",
    );
  }

  const refOffset = input.reference.offsetFromGameTime ?? 0;
  const offsetFromGameTime = roundSyncOffsetSeconds(refOffset + corr.lagSec);
  const level = syncConfidenceFromScore(corr.confidence);
  const peakBit =
    corr.peakVotes != null
      ? ` · ${corr.peakVotes} peak pairs · ${corr.primaryPeakCount}/${corr.secondaryPeakCount} peaks`
      : ` · ${corr.primaryPeakCount ?? 0}/${corr.secondaryPeakCount ?? 0} peaks`;

  return {
    targetSourceId: input.target.sourceId,
    offsetFromGameTime,
    lagSec: corr.lagSec,
    confidence: corr.confidence,
    syncConfidence: level,
    note: `Audio ${corr.method} lag ${corr.lagSec >= 0 ? "+" : ""}${corr.lagSec.toFixed(2)}s${peakBit} · window ${windowStartSec}s–${windowStartSec + windowDurationSec}s`,
    windowStartSec,
    windowDurationSec,
  };
}
