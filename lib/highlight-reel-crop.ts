/** Map a DOM element's viewport rect into captured display-media coordinates. */
export function computeDisplayCropRect(
  elementRect: DOMRectReadOnly,
  viewportWidth: number,
  viewportHeight: number,
  videoWidth: number,
  videoHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);
  const scaleX = videoWidth / vw;
  const scaleY = videoHeight / vh;
  const sx = Math.max(0, elementRect.left * scaleX);
  const sy = Math.max(0, elementRect.top * scaleY);
  const sw = Math.min(videoWidth - sx, elementRect.width * scaleX);
  const sh = Math.min(videoHeight - sy, elementRect.height * scaleY);
  return { sx, sy, sw: Math.max(1, sw), sh: Math.max(1, sh) };
}

export function isRegionCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "CropTarget" in window &&
    typeof (
      window as Window & {
        CropTarget?: { fromElement?: (el: Element) => Promise<unknown> };
      }
    ).CropTarget?.fromElement === "function"
  );
}

type BrowserCaptureTrack = MediaStreamTrack & {
  cropTo?: (target: unknown) => Promise<void>;
};

/** Crop a tab-capture track to a DOM element when Region Capture is available. */
export async function cropDisplayStreamToElement(
  stream: MediaStream,
  element: HTMLElement,
): Promise<boolean> {
  const track = stream.getVideoTracks()[0] as BrowserCaptureTrack | undefined;
  if (!track?.cropTo || !isRegionCaptureSupported()) return false;
  try {
    const CropTargetCtor = (
      window as unknown as {
        CropTarget: { fromElement: (el: Element) => Promise<unknown> };
      }
    ).CropTarget;
    const target = await CropTargetCtor.fromElement(element);
    await track.cropTo(target);
    return true;
  } catch {
    return false;
  }
}

export type CanvasCropSession = {
  stream: MediaStream;
  stop: () => void;
};

/**
 * Fallback for browsers without Region Capture (e.g. Safari): paint only the
 * capture element's viewport bounds into a canvas stream.
 */
export function startCanvasCropSession(
  displayStream: MediaStream,
  element: HTMLElement,
  fps = 30,
): CanvasCropSession {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = displayStream;
  void video.play().catch(() => {});

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D is unavailable.");
  }

  let running = true;
  let rafId = 0;

  const resizeCanvas = () => {
    const rect = element.getBoundingClientRect();
    const w = Math.max(2, Math.round(rect.width));
    const h = Math.max(2, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const paint = () => {
    if (!running) return;
    resizeCanvas();
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const rect = element.getBoundingClientRect();
      const { sx, sy, sw, sh } = computeDisplayCropRect(
        rect,
        window.innerWidth,
        window.innerHeight,
        video.videoWidth,
        video.videoHeight,
      );
      ctx.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
    rafId = window.requestAnimationFrame(paint);
  };
  rafId = window.requestAnimationFrame(paint);

  const canvasStream = canvas.captureStream(fps);
  for (const track of displayStream.getAudioTracks()) {
    canvasStream.addTrack(track);
  }

  return {
    stream: canvasStream,
    stop: () => {
      running = false;
      window.cancelAnimationFrame(rafId);
      video.pause();
      video.srcObject = null;
    },
  };
}
