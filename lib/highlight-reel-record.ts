/**
 * Screen-recording helper for highlight reels. Uses the browser's tab/screen
 * capture (`getDisplayMedia`) + `MediaRecorder` so we can record a reel exactly
 * as it plays — including the YouTube embeds, which can't be drawn to a canvas
 * because of cross-origin restrictions. The user picks which tab/window to
 * share once; we record until they stop or the reel finishes.
 */

export function isReelRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function"
  );
}

function pickMimeType(): string | undefined {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const c of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* isTypeSupported may throw on odd inputs */
    }
  }
  return undefined;
}

export type ReelRecording = {
  blob: Blob;
  mimeType: string;
  /** Suggested file extension (e.g. "webm" / "mp4"). */
  ext: string;
};

export type ReelRecordingController = {
  /** Stop recording and resolve with the captured file (or null if empty). */
  stop: () => Promise<ReelRecording | null>;
  /** Abort without producing a file. */
  cancel: () => void;
  readonly stream: MediaStream;
};

/**
 * Begin a screen recording. Resolves once the user has granted capture and
 * recording has started. `onAutoStop` fires if the user ends sharing via the
 * browser's own "Stop sharing" control.
 */
export async function startReelRecording(opts?: {
  onAutoStop?: () => void;
}): Promise<ReelRecordingController> {
  if (!isReelRecordingSupported()) {
    throw new Error("Screen recording isn't supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true,
  });

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });

  let stopResolve: ((v: ReelRecording | null) => void) | null = null;
  recorder.addEventListener("stop", () => {
    const type = recorder.mimeType || mimeType || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const blob = chunks.length > 0 ? new Blob(chunks, { type }) : null;
    stopResolve?.(blob ? { blob, mimeType: type, ext } : null);
    stopResolve = null;
    for (const t of stream.getTracks()) t.stop();
  });

  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.addEventListener("ended", () => {
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* already stopping */
        }
      }
      opts?.onAutoStop?.();
    });
  }

  recorder.start();

  return {
    stream,
    stop: () =>
      new Promise<ReelRecording | null>((resolve) => {
        if (recorder.state === "inactive") {
          resolve(null);
          return;
        }
        stopResolve = resolve;
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      }),
    cancel: () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* ignore */
      }
      for (const t of stream.getTracks()) t.stop();
    },
  };
}

/** Trigger a browser download for a captured recording. */
export function downloadRecording(recording: ReelRecording, baseName: string): void {
  const safe = baseName.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  const filename = `${safe || "highlight-reel"}.${recording.ext}`;
  const url = URL.createObjectURL(recording.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
