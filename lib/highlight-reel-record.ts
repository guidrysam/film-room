/**
 * Record a highlight reel by capturing the browser tab, then cropping to the
 * reel preview video element (Region Capture in Chrome/Edge, canvas crop in
 * Safari). YouTube iframes cannot be drawn to canvas directly, so we still
 * use display capture — but only the video frame is kept in the output.
 */

import {
  cropDisplayStreamToElement,
  isRegionCaptureSupported,
  startCanvasCropSession,
  type CanvasCropSession,
} from "@/lib/highlight-reel-crop";

export function isReelRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function"
  );
}

export function reelRecordingUsesRegionCapture(): boolean {
  return isRegionCaptureSupported();
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
  /** How the preview was isolated from the rest of the tab. */
  readonly cropMode: "region" | "canvas" | "none";
};

/** Target output for saved reel recordings (1080p). */
export const REEL_RECORD_OUTPUT = { width: 1920, height: 1080 } as const;

export type StartReelRecordingOptions = {
  /** Preview video frame to record (16:9 surface, not the whole page). */
  cropElement: HTMLElement;
  onAutoStop?: () => void;
  /** Output resolution for canvas-crop fallback (defaults to 1080p). */
  outputSize?: { width: number; height: number };
};

async function prepareCroppedStream(
  cropElement: HTMLElement,
  outputSize: { width: number; height: number },
): Promise<{
  stream: MediaStream;
  cropMode: ReelRecordingController["cropMode"];
  cleanup: () => void;
}> {
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: outputSize.width, max: 3840 },
      height: { ideal: outputSize.height, max: 2160 },
      frameRate: { ideal: 30 },
    } as MediaTrackConstraints,
    audio: true,
    ...(typeof window !== "undefined" &&
    "preferCurrentTab" in (navigator.mediaDevices.getDisplayMedia as object)
      ? { preferCurrentTab: true }
      : {}),
  } as DisplayMediaStreamOptions);

  const videoTrack = displayStream.getVideoTracks()[0];
  if (videoTrack) {
    try {
      await videoTrack.applyConstraints({
        width: { ideal: outputSize.width },
        height: { ideal: outputSize.height },
        frameRate: { ideal: 30 },
      });
    } catch {
      /* browser may ignore ideal constraints */
    }
  }

  let canvasSession: CanvasCropSession | null = null;
  const stopDisplayTracks = () => {
    for (const t of displayStream.getTracks()) t.stop();
  };

  const regionOk = await cropDisplayStreamToElement(displayStream, cropElement);
  if (regionOk) {
    return {
      stream: displayStream,
      cropMode: "region",
      cleanup: stopDisplayTracks,
    };
  }

  try {
    canvasSession = startCanvasCropSession(
      displayStream,
      cropElement,
      30,
      outputSize,
    );
    return {
      stream: canvasSession.stream,
      cropMode: "canvas",
      cleanup: () => {
        canvasSession?.stop();
        stopDisplayTracks();
      },
    };
  } catch {
    stopDisplayTracks();
    throw new Error("Could not crop the capture to the reel preview.");
  }
}

/**
 * Begin recording the reel preview element. The user must share this browser
 * tab when prompted; the saved file is cropped to the video frame only.
 */
export async function startReelRecording(
  opts: StartReelRecordingOptions,
): Promise<ReelRecordingController> {
  if (!isReelRecordingSupported()) {
    throw new Error("Screen recording isn't supported in this browser.");
  }
  if (!opts.cropElement?.isConnected) {
    throw new Error("Reel preview is not ready to record.");
  }

  const outputSize = opts.outputSize ?? REEL_RECORD_OUTPUT;

  const { stream, cropMode, cleanup } = await prepareCroppedStream(
    opts.cropElement,
    outputSize,
  );

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    },
  );
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });

  let stopResolve: ((v: ReelRecording | null) => void) | null = null;
  let cleanedUp = false;
  const runCleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    cleanup();
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
  };

  recorder.addEventListener("stop", () => {
    const type = recorder.mimeType || mimeType || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const blob = chunks.length > 0 ? new Blob(chunks, { type }) : null;
    stopResolve?.(blob ? { blob, mimeType: type, ext } : null);
    stopResolve = null;
    runCleanup();
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
    cropMode,
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
      runCleanup();
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
