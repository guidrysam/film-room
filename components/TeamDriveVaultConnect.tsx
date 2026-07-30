"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { canCoachTeam, type Team } from "@/lib/teams";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export type TeamDriveVaultConnectProps = {
  team: Team;
  currentUid: string;
  onChanged?: () => void;
};

/**
 * Connect / reconnect / disconnect the coach-owned Google Drive team vault.
 */
export default function TeamDriveVaultConnect({
  team,
  currentUid,
  onChanged,
}: TeamDriveVaultConnectProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const drive = params.get("drive");
    if (drive === "connected") {
      setBanner("Google Drive connected. Game folders will be created under Film Room.");
      onChanged?.();
    } else if (drive === "error") {
      setError(params.get("message") || "Could not connect Google Drive.");
    }
    if (drive) {
      params.delete("drive");
      params.delete("message");
      const q = params.toString();
      const next = `${window.location.pathname}${q ? `?${q}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [onChanged]);

  const connect = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setBanner(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/drive/oauth/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teamId: team.id }),
      });
      const json = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || "Could not start Drive connect.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect Drive.");
      setBusy(false);
    }
  }, [user, team.id]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    if (
      !window.confirm(
        "Disconnect Google Drive for this team? Existing files stay in Drive; new vault uploads will stop until you reconnect.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/drive/oauth/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teamId: team.id }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error || "Could not disconnect Drive.");
      }
      setBanner("Drive disconnected.");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect Drive.");
    } finally {
      setBusy(false);
    }
  }, [user, team.id, onChanged]);

  if (!canCoachTeam(team, currentUid)) return null;

  const connected = Boolean(team.drive?.rootFolderId);

  return (
    <section className={panelClass}>
      <h2 className="mb-1 text-sm font-semibold text-white">Team Drive vault</h2>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        Store kit angles (Main, goals, offense, defense) in your Google Drive.
        Film Room creates per-game folders under{" "}
        <span className="font-mono text-zinc-400">Film Room / {team.name}</span>.
        Team members upload through Film Room; bytes never pass through our
        servers.
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
            {team.drive?.accountEmail ? (
              <>
                {" "}
                as{" "}
                <span className="font-medium text-white">
                  {team.drive.accountEmail}
                </span>
              </>
            ) : null}
            .
          </p>
          <p className="text-[11px] text-zinc-500">
            Connected{" "}
            {team.drive?.connectedAt
              ? new Date(team.drive.connectedAt).toLocaleString()
              : "—"}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              className={ghostBtn}
              href={`https://drive.google.com/drive/folders/${encodeURIComponent(team.drive!.rootFolderId)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open vault folder
            </a>
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
          {busy ? "Redirecting…" : "Connect Google Drive"}
        </button>
      )}
    </section>
  );
}
