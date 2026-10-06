/**
 * Capture a Watch together film session for YouTube publish:
 * this tab (prefer) + coach microphone mixed into one MediaStream.
 */

export function isCoachFilmSessionCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    typeof AudioContext !== "undefined"
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
      /* ignore */
    }
  }
  return undefined;
}

export type CoachFilmSessionRecording = {
  blob: Blob;
  mimeType: string;
  ext: string;
  durationSec: number;
};

export type CoachFilmSessionController = {
  stop: () => Promise<CoachFilmSessionRecording | null>;
  cancel: () => void;
  readonly stream: MediaStream;
};

export type StartCoachFilmSessionCaptureOptions = {
  /** Fired when the user stops sharing the tab/window. */
  onDisplayEnded?: () => void;
};

/**
 * Prompt for this tab + coach mic, mix audio, start MediaRecorder.
 * Coach should share the Film Room tab (with audio if offered).
 */
export async function startCoachFilmSessionCapture(
  opts: StartCoachFilmSessionCaptureOptions = {},
): Promise<CoachFilmSessionController> {
  if (!isCoachFilmSessionCaptureSupported()) {
    throw new Error(
      "Screen + mic recording isn’t supported in this browser. Try Chrome or Edge.",
    );
  }

  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30 },
    } as MediaTrackConstraints,
    audio: true,
    ...(typeof window !== "undefined" &&
    "preferCurrentTab" in (navigator.mediaDevices.getDisplayMedia as object)
      ? { preferCurrentTab: true, selfBrowserSurface: "include" }
      : {}),
  } as DisplayMediaStreamOptions);

  let micStream: MediaStream;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch {
    for (const t of displayStream.getTracks()) t.stop();
    throw new Error(
      "Microphone permission is required so parents can hear the coach.",
    );
  }

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const displayAudio = displayStream.getAudioTracks();
  if (displayAudio.length > 0) {
    const src = audioCtx.createMediaStreamSource(
      new MediaStream(displayAudio),
    );
    const gain = audioCtx.createGain();
    gain.gain.value = 0.85;
    src.connect(gain);
    gain.connect(dest);
  }
  const micSrc = audioCtx.createMediaStreamSource(micStream);
  const micGain = audioCtx.createGain();
  micGain.gain.value = 1.15;
  micSrc.connect(micGain);
  micGain.connect(dest);

  const videoTrack = displayStream.getVideoTracks()[0];
  if (!videoTrack) {
    for (const t of displayStream.getTracks()) t.stop();
    for (const t of micStream.getTracks()) t.stop();
    void audioCtx.close();
    throw new Error("No video track from screen share.");
  }

  const mixed = new MediaStream([
    videoTrack,
    ...dest.stream.getAudioTracks(),
  ]);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(mixed, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });

  const startedAt = performance.now();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    for (const t of displayStream.getTracks()) t.stop();
    for (const t of micStream.getTracks()) t.stop();
    for (const t of mixed.getTracks()) t.stop();
    void audioCtx.close().catch(() => undefined);
  };

  videoTrack.addEventListener("ended", () => {
    opts.onDisplayEnded?.();
  });

  let stopResolve: ((v: CoachFilmSessionRecording | null) => void) | null =
    null;
  recorder.addEventListener("stop", () => {
    const durationSec = Math.max(
      1,
      Math.round((performance.now() - startedAt) / 1000),
    );
    const type =
      recorder.mimeType || mimeType || chunks[0]?.type || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const blob =
      chunks.length > 0 ? new Blob(chunks, { type }) : null;
    stopResolve?.(
      blob && blob.size > 0
        ? { blob, mimeType: type, ext, durationSec }
        : null,
    );
    stopResolve = null;
    cleanup();
  });

  recorder.start(1000);

  return {
    stream: mixed,
    cancel: () => {
      stopResolve?.(null);
      stopResolve = null;
      cleanup();
    },
    stop: () =>
      new Promise((resolve) => {
        if (recorder.state === "inactive") {
          resolve(null);
          cleanup();
          return;
        }
        stopResolve = resolve;
        try {
          recorder.stop();
        } catch {
          resolve(null);
          cleanup();
        }
      }),
  };
}
