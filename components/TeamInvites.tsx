"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createTeamInvite,
  isInviteExpired,
  listTeamInvites,
  setTeamInviteActive,
  type TeamInvite,
  type TeamInviteRole,
} from "@/lib/team-invites";
import { canManageTeam, type Team } from "@/lib/teams";

export type TeamInvitesProps = {
  team: Team;
  currentUid: string;
};

const ROLE_BADGE: Record<TeamInviteRole, string> = {
  coach: "border-emerald-600/45 bg-emerald-950/45 text-emerald-200",
  parent: "border-amber-500/40 bg-amber-950/40 text-amber-200",
  player: "border-blue-500/40 bg-blue-950/40 text-blue-200",
  viewer: "border-zinc-600/50 bg-zinc-800/50 text-zinc-300",
};

const ROLE_LABELS: Record<TeamInviteRole, string> = {
  coach: "Coach",
  parent: "Parent",
  player: "Player",
  viewer: "Viewer",
};

/**
 * Admin-only team invite manager. Generates role-specific join links.
 */
export default function TeamInvites({ team, currentUid }: TeamInvitesProps) {
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<TeamInviteRole | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");

  const isAdmin = canManageTeam(team, currentUid);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      setInvites(await listTeamInvites(team.id));
    } catch {
      /* Leave current list on failure. */
    } finally {
      setLoading(false);
    }
  }, [team.id, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const joinUrl = useCallback(
    (code: string) => `${origin || ""}/join/team/${code}`,
    [origin],
  );

  const handleCreate = useCallback(
    async (role: TeamInviteRole) => {
      setCreating(role);
      setError(null);
      try {
        const trimmed = label.trim();
        await createTeamInvite(team, currentUid, role, {
          label: trimmed || `${ROLE_LABELS[role]} link`,
        });
        setLabel("");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create invite.");
      } finally {
        setCreating(null);
      }
    },
    [team, currentUid, label, refresh],
  );

  const handleToggle = useCallback(
    async (invite: TeamInvite) => {
      setBusyCode(invite.code);
      setError(null);
      try {
        await setTeamInviteActive(invite.code, !invite.active);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update invite.");
      } finally {
        setBusyCode(null);
      }
    },
    [refresh],
  );

  const handleCopy = useCallback(
    async (code: string) => {
      const url = joinUrl(code);
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          window.prompt("Copy this join link", url);
        }
        setCopiedCode(code);
        setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
      } catch {
        window.prompt("Copy this join link", url);
      }
    },
    [joinUrl],
  );

  if (!isAdmin) {
    return (
      <p className="text-[10px] leading-snug text-zinc-500">
        Team invite links are managed by team admins.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Team invite links
      </p>
      <p className="mb-3 text-[10px] leading-snug text-zinc-500">
        Share role-specific links so coaches, parents, players, and viewers can
        join {team.name}. Admin access cannot be granted via invite.
      </p>

      <label className="mb-1 block text-[10px] font-medium text-zinc-400">
        Label (optional)
      </label>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Parent cameras"
        maxLength={60}
        className="mb-3 w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50"
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["coach", "parent", "player", "viewer"] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => void handleCreate(role)}
            disabled={creating !== null}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${ROLE_BADGE[role]}`}
          >
            {creating === role ? "Creating…" : `Generate ${ROLE_LABELS[role]} link`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-500">Loading invites…</p>
      ) : invites.length === 0 ? (
        <p className="text-[10px] leading-snug text-zinc-500">
          No invite links yet. Generate one above and share it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {invites.map((inv) => {
            const expired = isInviteExpired(inv);
            return (
              <li
                key={inv.code}
                className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${ROLE_BADGE[inv.role]}`}
                    >
                      {inv.role}
                    </span>
                    {inv.label ? (
                      <span className="text-[11px] text-zinc-300">{inv.label}</span>
                    ) : null}
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wide ${
                        expired
                          ? "text-amber-300"
                          : inv.active
                            ? "text-emerald-300"
                            : "text-zinc-500"
                      }`}
                    >
                      {expired ? "expired" : inv.active ? "active" : "inactive"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggle(inv)}
                    disabled={busyCode === inv.code}
                    className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    {inv.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    readOnly
                    value={joinUrl(inv.code)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopy(inv.code)}
                    className="shrink-0 rounded-md border border-blue-500/40 bg-blue-950/50 px-2 py-1 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-900/55"
                  >
                    {copiedCode === inv.code ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="mt-2 text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
