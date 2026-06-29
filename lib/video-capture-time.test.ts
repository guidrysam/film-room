import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findIsoDatetimeInBuffer,
  parseMvhdCreationEpochMs,
  quicktimeSecondsToEpochMs,
} from "./video-capture-time";

const QUICKTIME_EPOCH_OFFSET_SEC = 2082844800;

function asciiBytes(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Build a minimal `moov` buffer containing a version-0 `mvhd`. */
function buildMoovWithMvhd(creationSeconds: number): ArrayBuffer {
  // mvhd data: version(1)+flags(3) + creation_time(4) + modification_time(4)
  const mvhdData = [
    0,
    0,
    0,
    0, // version 0 + flags
    ...u32(creationSeconds),
    ...u32(creationSeconds), // modification time (unused)
  ];
  const mvhdSize = 8 + mvhdData.length;
  const mvhd = [...u32(mvhdSize), ...asciiBytes("mvhd"), ...mvhdData];
  const moovSize = 8 + mvhd.length;
  const moov = [...u32(moovSize), ...asciiBytes("moov"), ...mvhd];
  return new Uint8Array(moov).buffer;
}

describe("quicktimeSecondsToEpochMs", () => {
  it("converts 1904-epoch seconds to unix ms", () => {
    const unixSec = Math.floor(Date.parse("2024-06-08T12:00:00Z") / 1000);
    const qtSeconds = unixSec + QUICKTIME_EPOCH_OFFSET_SEC;
    assert.equal(quicktimeSecondsToEpochMs(qtSeconds), unixSec * 1000);
  });

  it("rejects values at or below the epoch offset", () => {
    assert.equal(quicktimeSecondsToEpochMs(0), null);
    assert.equal(quicktimeSecondsToEpochMs(QUICKTIME_EPOCH_OFFSET_SEC), null);
  });
});

describe("parseMvhdCreationEpochMs", () => {
  it("reads creation_time from a version-0 mvhd inside moov", () => {
    const unixSec = Math.floor(Date.parse("2024-06-08T12:00:00Z") / 1000);
    const qtSeconds = unixSec + QUICKTIME_EPOCH_OFFSET_SEC;
    const buf = buildMoovWithMvhd(qtSeconds);
    const ms = parseMvhdCreationEpochMs(new DataView(buf), 8);
    assert.equal(ms, unixSec * 1000);
  });

  it("returns null when no mvhd is present", () => {
    const moovSize = 8;
    const buf = new Uint8Array([...u32(moovSize), ...asciiBytes("moov")])
      .buffer;
    assert.equal(parseMvhdCreationEpochMs(new DataView(buf), 8), null);
  });
});

describe("findIsoDatetimeInBuffer", () => {
  it("finds an Apple-style creationdate with offset", () => {
    const bytes = new TextEncoder().encode(
      "\u0000\u0000creationdate2024-06-08T14:33:21-0400\u0000junk",
    );
    assert.equal(
      findIsoDatetimeInBuffer(bytes.buffer),
      "2024-06-08T14:33:21-0400",
    );
  });

  it("finds a Z-suffixed datetime", () => {
    const bytes = new TextEncoder().encode("xx2024-01-02T03:04:05Zyy");
    assert.equal(findIsoDatetimeInBuffer(bytes.buffer), "2024-01-02T03:04:05Z");
  });

  it("returns null when no datetime is present", () => {
    const bytes = new TextEncoder().encode("no dates here");
    assert.equal(findIsoDatetimeInBuffer(bytes.buffer), null);
  });
});
