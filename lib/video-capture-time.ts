/**
 * Read a video file's recording start time in the browser, with no upload.
 *
 * Phone videos (MP4 / MOV) carry the capture time in their `moov` atom:
 *   - Apple devices write an explicit, timezone-aware string in QuickTime
 *     metadata (`com.apple.quicktime.creationdate`, e.g. "2024-06-08T14:33:21-0400").
 *     This is the most reliable signal.
 *   - The `mvhd` movie header carries `creation_time` (seconds since 1904 UTC),
 *     present on most MP4s but timezone-ambiguous on some devices.
 *   - As a last resort we fall back to the file's last-modified time.
 *
 * The returned `recordedStartTime` flows into the existing clock-sync path
 * (`estimateClockSync` in lib/game-timeline.ts) to auto-align a clip against the
 * game's scheduled kickoff.
 */

export type CaptureTimeSource = "quicktime_meta" | "mvhd" | "file_mtime";

export type CaptureTimeResult = {
  /** ISO-8601 recording start time. */
  recordedStartTime: string;
  source: CaptureTimeSource;
  confidence: "low" | "medium" | "high";
};

/** Seconds between 1904-01-01 (QuickTime epoch) and 1970-01-01 (Unix epoch). */
const QUICKTIME_EPOCH_OFFSET_SEC = 2082844800;

/** Cap how much of `moov` we read into memory (sample tables can be large). */
const MOOV_READ_CAP = 16 * 1024 * 1024;

/** Matches ISO-8601 datetimes incl. Apple's offset form ("-0400") and "Z". */
const ISO_DATETIME_RE =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/;

function asciiType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** Locate a top-level atom by type, reading only 16-byte headers. */
async function findTopLevelAtom(
  file: Blob,
  wanted: string,
): Promise<{ offset: number; size: number; headerSize: number } | null> {
  const fileSize = file.size;
  let offset = 0;
  while (offset + 8 <= fileSize) {
    const header = await file.slice(offset, offset + 16).arrayBuffer();
    if (header.byteLength < 8) break;
    const dv = new DataView(header);
    let size = dv.getUint32(0);
    const type = asciiType(dv, 4);
    let headerSize = 8;
    if (size === 1) {
      if (header.byteLength < 16) break;
      const hi = dv.getUint32(8);
      const lo = dv.getUint32(12);
      size = hi * 2 ** 32 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = fileSize - offset;
    }
    if (type === wanted) return { offset, size, headerSize };
    if (size < headerSize) break;
    offset += size;
  }
  return null;
}

/** Convert a QuickTime/MP4 `creation_time` (seconds since 1904) to epoch ms. */
export function quicktimeSecondsToEpochMs(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds <= QUICKTIME_EPOCH_OFFSET_SEC) {
    return null;
  }
  return (seconds - QUICKTIME_EPOCH_OFFSET_SEC) * 1000;
}

/**
 * Parse the `mvhd` movie header's `creation_time` out of a `moov` buffer.
 * `moovView` covers the whole `moov` atom (including its 8/16-byte header).
 */
export function parseMvhdCreationEpochMs(
  moovView: DataView,
  moovHeaderSize: number,
): number | null {
  let pos = moovHeaderSize;
  const end = moovView.byteLength;
  while (pos + 8 <= end) {
    let size = moovView.getUint32(pos);
    const type = asciiType(moovView, pos + 4);
    let childHeader = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      const hi = moovView.getUint32(pos + 8);
      const lo = moovView.getUint32(pos + 12);
      size = hi * 2 ** 32 + lo;
      childHeader = 16;
    }
    if (type === "mvhd") {
      const fieldsStart = pos + childHeader;
      if (fieldsStart + 4 > end) return null;
      const version = moovView.getUint8(fieldsStart);
      let creation: number;
      if (version === 1) {
        if (fieldsStart + 12 > end) return null;
        const hi = moovView.getUint32(fieldsStart + 4);
        const lo = moovView.getUint32(fieldsStart + 8);
        creation = hi * 2 ** 32 + lo;
      } else {
        if (fieldsStart + 8 > end) return null;
        creation = moovView.getUint32(fieldsStart + 4);
      }
      return quicktimeSecondsToEpochMs(creation);
    }
    if (size < childHeader) break;
    pos += size;
  }
  return null;
}

/** Find the first ISO-8601 datetime string in a buffer (Apple creationdate). */
export function findIsoDatetimeInBuffer(buffer: ArrayBuffer): string | null {
  const text = new TextDecoder("latin1").decode(new Uint8Array(buffer));
  const match = text.match(ISO_DATETIME_RE);
  return match ? match[0] : null;
}

function fileLastModifiedIso(file: { lastModified?: number }): string | null {
  if (typeof file.lastModified !== "number" || !Number.isFinite(file.lastModified)) {
    return null;
  }
  return new Date(file.lastModified).toISOString();
}

/**
 * Best-effort recording start time for a picked video file. Returns null only
 * if nothing usable (not even a file timestamp) can be derived.
 */
export async function readVideoCaptureTime(
  file: File,
): Promise<CaptureTimeResult | null> {
  try {
    const moov = await findTopLevelAtom(file, "moov");
    if (moov) {
      const readEnd = moov.offset + Math.min(moov.size, MOOV_READ_CAP);
      const moovBuf = await file.slice(moov.offset, readEnd).arrayBuffer();

      const isoFromMeta = findIsoDatetimeInBuffer(moovBuf);
      if (isoFromMeta) {
        const ms = Date.parse(isoFromMeta);
        if (Number.isFinite(ms)) {
          const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(isoFromMeta);
          return {
            recordedStartTime: new Date(ms).toISOString(),
            source: "quicktime_meta",
            confidence: hasTz ? "high" : "medium",
          };
        }
      }

      const mvhdMs = parseMvhdCreationEpochMs(
        new DataView(moovBuf),
        moov.headerSize,
      );
      if (mvhdMs != null) {
        return {
          recordedStartTime: new Date(mvhdMs).toISOString(),
          source: "mvhd",
          confidence: "medium",
        };
      }
    }
  } catch {
    /* fall through to file timestamp */
  }

  const mtimeIso = fileLastModifiedIso(file);
  if (mtimeIso) {
    return {
      recordedStartTime: mtimeIso,
      source: "file_mtime",
      confidence: "low",
    };
  }
  return null;
}

const CAPTURE_SOURCE_LABELS: Record<CaptureTimeSource, string> = {
  quicktime_meta: "from video metadata",
  mvhd: "from video header",
  file_mtime: "from file date (approximate)",
};

export function captureSourceLabel(source: CaptureTimeSource): string {
  return CAPTURE_SOURCE_LABELS[source];
}
