import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crossCorrelateEnvelopes,
  delayPcm,
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
  // Light noise so demean/envelope stay stable
  for (let i = 0; i < n; i++) {
    out[i]! += (Math.random() - 0.5) * 0.02;
  }
  return out;
}

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
    // Primary has extra pre-roll → shared events are earlier on secondary timeline
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
