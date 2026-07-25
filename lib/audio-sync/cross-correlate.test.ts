import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignByAudioPeaks,
  crossCorrelateEnvelopes,
  delayPcm,
  findEnergyPeaks,
  lagFromPeakVotes,
} from "@/lib/audio-sync/cross-correlate";

function toneBurst(
  sampleRate: number,
  durationSec: number,
  bursts: Array<{ atSec: number; lenSec: number; amp?: number }>,
): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (const b of bursts) {
    const start = Math.floor(b.atSec * sampleRate);
    const len = Math.floor(b.lenSec * sampleRate);
    const amp = b.amp ?? 0.8;
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / sampleRate;
      out[start + i] = amp * Math.sin(2 * Math.PI * 440 * t);
    }
  }
  for (let i = 0; i < n; i++) {
    out[i]! += (Math.random() - 0.5) * 0.02;
  }
  return out;
}

describe("findEnergyPeaks", () => {
  it("finds loud bursts", () => {
    const sr = 16000;
    const pcm = toneBurst(sr, 20, [
      { atSec: 3, lenSec: 0.25, amp: 1 },
      { atSec: 8, lenSec: 0.25, amp: 0.9 },
      { atSec: 14, lenSec: 0.25, amp: 0.95 },
    ]);
    const peaks = findEnergyPeaks(pcm, sr);
    assert.ok(peaks.length >= 3, `expected ≥3 peaks, got ${peaks.length}`);
    const times = peaks.map((p) => p.tSec);
    // Envelope peak sits near burst onset; allow a bit of hop smearing.
    assert.ok(times.some((t) => Math.abs(t - 3) < 0.5), `times=${times}`);
    assert.ok(times.some((t) => Math.abs(t - 8) < 0.5), `times=${times}`);
    assert.ok(times.some((t) => Math.abs(t - 14) < 0.5), `times=${times}`);
  });
});

describe("lagFromPeakVotes", () => {
  it("votes the shared delay between peak sets", () => {
    const delay = 2.4;
    const primary = [
      { tSec: 3, amp: 1 },
      { tSec: 8, amp: 0.9 },
      { tSec: 14, amp: 0.95 },
    ];
    const secondary = primary.map((p) => ({
      tSec: p.tSec + delay,
      amp: p.amp,
    }));
    const vote = lagFromPeakVotes(primary, secondary, { maxLagSec: 10 });
    assert.ok(vote);
    assert.ok(Math.abs(vote!.lagSec - delay) < 0.06);
    assert.ok(vote!.votes >= 3);
  });
});

describe("alignByAudioPeaks", () => {
  it("recovers delay via peaks", () => {
    const sr = 16000;
    const primary = toneBurst(sr, 20, [
      { atSec: 3, lenSec: 0.4 },
      { atSec: 8, lenSec: 0.3 },
      { atSec: 14, lenSec: 0.5 },
    ]);
    const delaySec = 2.4;
    const secondary = delayPcm(primary, sr, delaySec);
    const result = alignByAudioPeaks(primary, secondary, {
      sampleRate: sr,
      maxLagSec: 10,
    });
    assert.ok(
      Math.abs(result.lagSec - delaySec) < 0.08,
      `expected ~${delaySec}s, got ${result.lagSec} (${result.method})`,
    );
    assert.ok(result.confidence > 0.25);
    assert.ok(
      result.method === "peaks" || result.method === "peaks+envelope",
    );
  });
});

describe("crossCorrelateEnvelopes", () => {
  it("recovers a known positive delay on secondary", () => {
    const sr = 16000;
    const primary = toneBurst(sr, 20, [
      { atSec: 3, lenSec: 0.4 },
      { atSec: 8, lenSec: 0.3 },
      { atSec: 14, lenSec: 0.5 },
    ]);
    const delaySec = 2.4;
    const secondary = delayPcm(primary, sr, delaySec);
    const result = crossCorrelateEnvelopes(primary, secondary, {
      sampleRate: sr,
      maxLagSec: 10,
    });
    assert.ok(
      Math.abs(result.lagSec - delaySec) < 0.05,
      `expected ~${delaySec}s, got ${result.lagSec}`,
    );
    assert.ok(result.confidence > 0.3, `low confidence ${result.confidence}`);
  });

  it("recovers a negative lag when secondary starts later", () => {
    const sr = 16000;
    const secondary = toneBurst(sr, 20, [
      { atSec: 3, lenSec: 0.4 },
      { atSec: 8, lenSec: 0.3 },
      { atSec: 14, lenSec: 0.5 },
    ]);
    const delaySec = 1.7;
    const primary = delayPcm(secondary, sr, delaySec);
    const result = crossCorrelateEnvelopes(primary, secondary, {
      sampleRate: sr,
      maxLagSec: 10,
    });
    assert.ok(
      Math.abs(result.lagSec - -delaySec) < 0.05,
      `expected ~${-delaySec}s, got ${result.lagSec}`,
    );
  });
});
