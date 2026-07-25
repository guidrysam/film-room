/**
 * Align two mono PCM buffers by energy-envelope cross-correlation.
 * Robust for sideline vs end-zone mics that share whistle/crowd, not identical waveforms.
 */

export type CrossCorrelateOptions = {
  sampleRate: number;
  /** Envelope hop in seconds (default 10ms). */
  hopSec?: number;
  /** Max |lag| to search in seconds (default 180). */
  maxLagSec?: number;
};

export type CrossCorrelateResult = {
  /** Seconds to add to primary time to reach the matching secondary time. */
  lagSec: number;
  /** 0–1ish score from peak prominence (not a calibrated probability). */
  confidence: number;
  peakValue: number;
  medianAbsCorr: number;
};

function mean(xs: Float32Array): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return xs.length ? s / xs.length : 0;
}

/** RMS energy envelope at a fixed hop. */
export function energyEnvelope(
  pcm: Float32Array,
  sampleRate: number,
  hopSec = 0.01,
): Float32Array {
  const hop = Math.max(1, Math.floor(sampleRate * hopSec));
  const n = Math.floor(pcm.length / hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const start = i * hop;
    for (let j = 0; j < hop; j++) {
      const v = pcm[start + j]!;
      sum += v * v;
    }
    out[i] = Math.sqrt(sum / hop);
  }
  return out;
}

function demean(xs: Float32Array): Float32Array {
  const m = mean(xs);
  const out = new Float32Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = xs[i]! - m;
  return out;
}

/**
 * Cross-correlate envelopes. Positive lagSec means the shared event occurs
 * later in `secondary` than in `primary` (secondary started earlier / has more pre-roll).
 *
 * Convention matching Film Room offsets:
 *   secondaryTime ≈ primaryTime + lagSec
 * so if primary is game-aligned with offset Op,
 *   Os = Op + lagSec
 */
export function crossCorrelateEnvelopes(
  primaryPcm: Float32Array,
  secondaryPcm: Float32Array,
  opts: CrossCorrelateOptions,
): CrossCorrelateResult {
  const hopSec = opts.hopSec ?? 0.01;
  const maxLagSec = opts.maxLagSec ?? 180;
  const sampleRate = opts.sampleRate;

  if (primaryPcm.length < sampleRate * 2 || secondaryPcm.length < sampleRate * 2) {
    throw new Error("Need at least ~2 seconds of audio on each angle to sync.");
  }

  const a = demean(energyEnvelope(primaryPcm, sampleRate, hopSec));
  const b = demean(energyEnvelope(secondaryPcm, sampleRate, hopSec));
  if (a.length < 50 || b.length < 50) {
    throw new Error("Audio window too short after envelope extraction.");
  }

  const maxLagHops = Math.min(
    Math.floor(maxLagSec / hopSec),
    a.length - 1,
    b.length - 1,
  );

  let bestLag = 0;
  let bestVal = -Infinity;
  const corrAtLag: number[] = [];

  for (let lag = -maxLagHops; lag <= maxLagHops; lag++) {
    let sum = 0;
    let count = 0;
    // corr[lag] = sum a[i] * b[i+lag]  (b delayed by lag relative to a when lag>0)
    if (lag >= 0) {
      const n = Math.min(a.length, b.length - lag);
      for (let i = 0; i < n; i++) {
        sum += a[i]! * b[i + lag]!;
        count++;
      }
    } else {
      const n = Math.min(a.length + lag, b.length);
      for (let i = 0; i < n; i++) {
        sum += a[i - lag]! * b[i]!;
        count++;
      }
    }
    const val = count > 0 ? sum / count : 0;
    corrAtLag.push(val);
    if (val > bestVal) {
      bestVal = val;
      bestLag = lag;
    }
  }

  const absSorted = corrAtLag.map(Math.abs).sort((x, y) => x - y);
  const medianAbs =
    absSorted.length === 0
      ? 0
      : absSorted[Math.floor(absSorted.length / 2)]!;

  const prominence = medianAbs > 1e-12 ? bestVal / medianAbs : 0;
  // Map prominence into a soft 0–1 confidence; >8× median is strong.
  const confidence = Math.max(0, Math.min(1, (prominence - 1.5) / 8));

  return {
    lagSec: bestLag * hopSec,
    confidence,
    peakValue: bestVal,
    medianAbsCorr: medianAbs,
  };
}

/** Build a delayed copy of `src` by prepending `delaySec` of silence (for tests). */
export function delayPcm(
  src: Float32Array,
  sampleRate: number,
  delaySec: number,
): Float32Array {
  const n = Math.max(0, Math.round(delaySec * sampleRate));
  const out = new Float32Array(src.length + n);
  out.set(src, n);
  return out;
}
