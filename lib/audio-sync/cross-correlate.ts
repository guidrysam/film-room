/**
 * Align two mono PCM buffers by matching loud energy peaks (whistle, cheer, kick),
 * with envelope cross-correlation as a confirmatory signal.
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
  /** 0–1ish score (not a calibrated probability). */
  confidence: number;
  peakValue: number;
  medianAbsCorr: number;
  method: "peaks" | "envelope" | "peaks+envelope";
  /** How many peak-pair votes supported the chosen lag. */
  peakVotes?: number;
  primaryPeakCount?: number;
  secondaryPeakCount?: number;
};

export type EnergyPeak = {
  /** Time within the PCM window (seconds). */
  tSec: number;
  /** Envelope amplitude at the peak. */
  amp: number;
};

function mean(xs: Float32Array): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return xs.length ? s / xs.length : 0;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((sortedAsc.length - 1) * p)),
  );
  return sortedAsc[i]!;
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
 * Find loud local maxima in the energy envelope.
 * Peaks must exceed a high percentile and be separated by minSeparationSec.
 */
export function findEnergyPeaks(
  pcm: Float32Array,
  sampleRate: number,
  opts?: {
    hopSec?: number;
    /** Keep peaks above this envelope percentile (0–1). Default 0.85. */
    minPercentile?: number;
    minSeparationSec?: number;
    maxPeaks?: number;
  },
): EnergyPeak[] {
  const hopSec = opts?.hopSec ?? 0.01;
  const minSeparationSec = opts?.minSeparationSec ?? 0.35;
  const maxPeaks = opts?.maxPeaks ?? 24;
  const env = energyEnvelope(pcm, sampleRate, hopSec);
  if (env.length < 5) return [];

  const sorted = Array.from(env).sort((a, b) => a - b);
  const floor = Math.max(
    percentile(sorted, opts?.minPercentile ?? 0.85),
    mean(env) * 1.8,
  );

  const minSepHops = Math.max(1, Math.round(minSeparationSec / hopSec));
  const candidates: EnergyPeak[] = [];

  for (let i = 1; i < env.length - 1; i++) {
    const v = env[i]!;
    if (v < floor) continue;
    if (v < env[i - 1]! || v < env[i + 1]!) continue;
    candidates.push({ tSec: i * hopSec, amp: v });
  }

  candidates.sort((a, b) => b.amp - a.amp);

  const kept: EnergyPeak[] = [];
  for (const peak of candidates) {
    if (kept.length >= maxPeaks) break;
    const tooClose = kept.some(
      (k) => Math.abs(k.tSec - peak.tSec) < minSeparationSec,
    );
    if (tooClose) continue;
    // Also enforce hop-level separation for dense clusters
    if (
      kept.some(
        (k) => Math.abs(k.tSec - peak.tSec) < minSepHops * hopSec * 0.9,
      )
    ) {
      continue;
    }
    kept.push(peak);
  }

  return kept.sort((a, b) => a.tSec - b.tSec);
}

/**
 * Vote on lag from peak pairs: lag = tSecondary − tPrimary.
 * Shared world events (whistle, cheer) should produce a dominant lag bin.
 */
export function lagFromPeakVotes(
  primaryPeaks: EnergyPeak[],
  secondaryPeaks: EnergyPeak[],
  opts: { maxLagSec: number; binSec?: number },
): {
  lagSec: number;
  votes: number;
  weight: number;
  confidence: number;
} | null {
  if (primaryPeaks.length < 2 || secondaryPeaks.length < 2) return null;

  const binSec = opts.binSec ?? 0.05;
  const maxLag = opts.maxLagSec;
  const bins = new Map<number, { votes: number; weight: number }>();

  for (const a of primaryPeaks) {
    for (const b of secondaryPeaks) {
      const lag = b.tSec - a.tSec;
      if (Math.abs(lag) > maxLag) continue;
      const key = Math.round(lag / binSec);
      const prev = bins.get(key) ?? { votes: 0, weight: 0 };
      prev.votes += 1;
      prev.weight += a.amp * b.amp;
      bins.set(key, prev);
    }
  }

  if (bins.size === 0) return null;

  let bestKey = 0;
  let best = { votes: 0, weight: 0 };
  let totalWeight = 0;
  for (const [key, val] of bins) {
    totalWeight += val.weight;
    if (
      val.weight > best.weight ||
      (val.weight === best.weight && val.votes > best.votes)
    ) {
      best = val;
      bestKey = key;
    }
  }

  const lagSec = bestKey * binSec;
  const share = totalWeight > 0 ? best.weight / totalWeight : 0;
  // Need several agreeing pairs; 3+ votes with concentrated weight is solid.
  const confidence = Math.max(
    0,
    Math.min(1, (best.votes - 1) / 6 + share * 0.7),
  );

  if (best.votes < 2) return null;

  return {
    lagSec,
    votes: best.votes,
    weight: best.weight,
    confidence,
  };
}

/**
 * Cross-correlate envelopes. Positive lagSec means the shared event occurs
 * later in `secondary` than in `primary` (secondary started earlier / has more pre-roll).
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
  const confidence = Math.max(0, Math.min(1, (prominence - 1.5) / 8));

  return {
    lagSec: bestLag * hopSec,
    confidence,
    peakValue: bestVal,
    medianAbsCorr: medianAbs,
    method: "envelope",
  };
}

/**
 * Prefer lining up loud peaks across angles; confirm with envelope correlation.
 */
export function alignByAudioPeaks(
  primaryPcm: Float32Array,
  secondaryPcm: Float32Array,
  opts: CrossCorrelateOptions,
): CrossCorrelateResult {
  const maxLagSec = opts.maxLagSec ?? 180;
  const sampleRate = opts.sampleRate;

  const primaryPeaks = findEnergyPeaks(primaryPcm, sampleRate);
  const secondaryPeaks = findEnergyPeaks(secondaryPcm, sampleRate);
  const peakVote = lagFromPeakVotes(primaryPeaks, secondaryPeaks, {
    maxLagSec,
  });
  const envelope = crossCorrelateEnvelopes(primaryPcm, secondaryPcm, opts);

  if (peakVote && peakVote.confidence >= 0.25) {
    const agree =
      Math.abs(peakVote.lagSec - envelope.lagSec) <= 0.35 ||
      envelope.confidence < 0.25;
    const lagSec = agree
      ? // Prefer peak lag; nudge toward envelope when very close
        Math.abs(peakVote.lagSec - envelope.lagSec) < 0.15 &&
        envelope.confidence > peakVote.confidence
        ? envelope.lagSec
        : peakVote.lagSec
      : // Peaks and envelope disagree — trust peaks if they have strong votes
        peakVote.votes >= 4
        ? peakVote.lagSec
        : envelope.confidence > peakVote.confidence
          ? envelope.lagSec
          : peakVote.lagSec;

    const confidence = agree
      ? Math.min(1, (peakVote.confidence + envelope.confidence) / 1.6)
      : peakVote.confidence * 0.85;

    return {
      lagSec,
      confidence,
      peakValue: envelope.peakValue,
      medianAbsCorr: envelope.medianAbsCorr,
      method: agree ? "peaks+envelope" : "peaks",
      peakVotes: peakVote.votes,
      primaryPeakCount: primaryPeaks.length,
      secondaryPeakCount: secondaryPeaks.length,
    };
  }

  return {
    ...envelope,
    method: "envelope",
    primaryPeakCount: primaryPeaks.length,
    secondaryPeakCount: secondaryPeaks.length,
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
