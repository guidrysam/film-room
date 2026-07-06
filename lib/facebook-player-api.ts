import type { YouTubePlayer } from "react-youtube";

/** Subset of Meta Embedded Video Player API used by Film Room. */
export type FacebookEmbedPlayer = {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  getCurrentPosition: () => number;
  mute?: () => void;
  unmute?: () => void;
  subscribe: (
    event: string,
    callback: (payload?: unknown) => void,
  ) => { release?: () => void };
};

const YT_UNSTARTED = -1;
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;

/** Map Facebook embed player to the YouTube-shaped surface Film Room already uses. */
export function facebookPlayerAsYoutube(
  instance: FacebookEmbedPlayer,
): YouTubePlayer {
  let playerState = YT_UNSTARTED;

  try {
    instance.subscribe("startedPlaying", () => {
      playerState = YT_PLAYING;
    });
    instance.subscribe("paused", () => {
      playerState = YT_PAUSED;
    });
    instance.subscribe("finishedPlaying", () => {
      playerState = YT_ENDED;
    });
    instance.subscribe("startedBuffering", () => {
      playerState = YT_BUFFERING;
    });
  } catch {
    /* SDK not ready */
  }

  return {
    playVideo: () => {
      try {
        instance.play();
      } catch {
        /* ignore */
      }
    },
    pauseVideo: () => {
      try {
        instance.pause();
      } catch {
        /* ignore */
      }
    },
    seekTo: (seconds: number) => {
      try {
        instance.seek(Math.max(0, seconds));
      } catch {
        /* ignore */
      }
    },
    getCurrentTime: () => {
      try {
        const t = instance.getCurrentPosition();
        return typeof t === "number" && Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    },
    getPlayerState: () => playerState,
    mute: () => {
      try {
        instance.mute?.();
      } catch {
        /* ignore */
      }
    },
    unMute: () => {
      try {
        instance.unmute?.();
      } catch {
        /* ignore */
      }
    },
  } as YouTubePlayer;
}

declare global {
  interface Window {
    FB?: {
      init: (opts: {
        appId?: string;
        xfbml?: boolean;
        version?: string;
      }) => void;
      XFBML?: { parse: (node?: HTMLElement) => void };
      Event?: {
        subscribe: (
          event: string,
          callback: (msg: {
            type?: string;
            instance?: FacebookEmbedPlayer;
            id?: string;
          }) => void,
        ) => void;
      };
    };
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

/** Load the Facebook JS SDK once (required for embedded video player API). */
export function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Facebook SDK requires a browser."));
  }
  if (window.FB?.XFBML) {
    try {
      window.FB.init({ appId, xfbml: true, version: "v21.0" });
    } catch {
      /* already initialized */
    }
    return Promise.resolve();
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        window.FB?.init({ appId, xfbml: true, version: "v21.0" });
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Facebook SDK init failed."));
      }
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      const poll = window.setInterval(() => {
        if (window.FB?.XFBML) {
          window.clearInterval(poll);
          resolve();
        }
      }, 50);
      window.setTimeout(() => {
        window.clearInterval(poll);
        if (!window.FB?.XFBML) {
          reject(new Error("Facebook SDK load timed out."));
        }
      }, 15000);
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Facebook SDK script failed to load."));
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

export function subscribeFacebookVideoReady(
  elementId: string,
  onReady: (player: FacebookEmbedPlayer) => void,
): () => void {
  const handler = (msg: {
    type?: string;
    instance?: FacebookEmbedPlayer;
    id?: string;
  }) => {
    if (msg.type !== "video") return;
    if (msg.id && msg.id !== elementId) return;
    if (msg.instance) onReady(msg.instance);
  };

  window.FB?.Event?.subscribe("xfbml.ready", handler);
  return () => {
    /* Meta SDK does not document unsubscribe for xfbml.ready */
  };
}
