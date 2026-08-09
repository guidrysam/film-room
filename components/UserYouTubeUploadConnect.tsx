"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50";

export type UserYouTubeUploadPublic = {
  connectedAt: string;
  channelId?: string;
  channelTitle?: string;
};

export type UserYouTubeUploadConnectProps = {
  youtube: UserYouTubeUploadPublic | null;
  onChanged?: () => void;
};

/** Offline YouTube upload connect — powers Game Cap token minting. */
export default function UserYouTubeUploadConnect({
  youtube,
  onChanged,
}: UserYouTubeUploadConnectProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const yt = params.get("youtube");
    if (yt === "connected") {
      setBanner(
        "YouTube upload connected. Game Cap can mint tokens and upload Unlisted VODs.",
      );
      onChanged?.();
    } else if (yt === "error") {
      setError(params.get("message") || "Could not connect YouTube upload.");
    }
    if (yt) {
      params.delete("youtube");
      params.delete("message");
      const q = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${q ? `?${q}` : ""}`,
      );
    }
  }, [onChanged]);

  const connect = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setBanner(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/youtube/oauth/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || "Could not start YouTube connect.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect YouTube.");
      setBusy(false);
    }
  }, [user]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    if (
      !window.confirm(
        "Disconnect YouTube upload for Game Cap? Existing videos stay on YouTube.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/youtube/oauth/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error || "Could not disconnect YouTube.");
      }
      setBanner("YouTube upload disconnected.");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  }, [user, onChanged]);

  const connected = Boolean(youtube?.connectedAt);

  return (
    <section className={panelClass}>
      <h2 className="mb-1 text-sm font-semibold text-white">
        YouTube upload (Game Cap)
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        Connect once so phone/Mac can mint upload tokens and push Unlisted VODs
        with marks — no browser popup on every clip. Separate from Drive.
      </p>

      {banner ? (
        <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-200">
          {banner}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {connected ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">
            Connected
            {youtube?.channelTitle ? (
              <>
                {" "}
                as{" "}
                <span className="font-medium text-white">
                  {youtube.channelTitle}
                </span>
              </>
            ) : null}
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ghostBtn}
              disabled={busy}
              onClick={() => void connect()}
            >
              {busy ? "Working…" : "Reconnect"}
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || !user}
          onClick={() => void connect()}
        >
          {busy ? "Redirecting…" : "Connect YouTube upload"}
        </button>
      )}
    </section>
  );
}
