"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureParentInviteForTarget } from "@/lib/parent-invite-flow";
import {
  parentInviteMessage,
  parentInviteStatusLabel,
} from "@/lib/parent-onboarding";
import {
  listParentInviteTargets,
  manualLinkParentToTarget,
  setParentTargetIgnored,
  type ParentInviteTarget,
} from "@/lib/parent-invite-targets";
import {
  canCoachTeam,
  listTeamPlayers,
  type Player,
  type Team,
} from "@/lib/teams";

export type ParentInviteTargetsProps = {
  team: Team;
  currentUid: string;
};

const ghostBtn =
  "rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-40";

const primaryBtn =
  "rounded-md border border-blue-500/40 bg-blue-600/90 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40";

const STATUS_BADGE: Record<string, string> = {
  not_invited: "border-zinc-600/40 bg-zinc-800/40 text-zinc-400",
  invited: "border-blue-500/35 bg-blue-950/30 text-blue-200",
  joined: "border-emerald-500/40 bg-emerald-950/35 text-emerald-200",
  ignored: "border-zinc-600/30 bg-zinc-900/50 text-zinc-500",
};

function joinUrl(code: string, origin: string): string {
  return `${origin}/join/team/${code}`;
}

/**
 * Coach/admin UI for roster parent invite targets: copy links, track status, manual link.
 */
export default function ParentInviteTargets({
  team,
  currentUid,
}: ParentInviteTargetsProps) {
  const canManage = canCoachTeam(team, currentUid);
  const [targets, setTargets] = useState<ParentInviteTarget[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [manualTargetId, setManualTargetId] = useState<string | null>(null);
  const [manualParentUid, setManualParentUid] = useState("");
  const [manualPlayerId, setManualPlayerId] = useState("");

  const parentMembers = useMemo(
    () =>
      Object.entries(team.members)
        .filter(([, role]) => role === "parent")
        .map(([uid]) => uid),
    [team.members],
  );

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        listParentInviteTargets(team.id),
        listTeamPlayers(team.id),
      ]);
      setTargets(t);
      setPlayers(p);
    } catch {
      setError("Could not load parent invite targets.");
    } finally {
      setLoading(false);
    }
  }, [canManage, team.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCopyLink = useCallback(
    async (target: ParentInviteTarget) => {
      setBusyId(target.id);
      setError(null);
      try {
        const code = await ensureParentInviteForTarget(team, target, currentUid);
        const url = joinUrl(code, origin || window.location.origin);
        await navigator.clipboard.writeText(url);
        setCopiedId(`${target.id}:link`);
        setTimeout(() => setCopiedId(null), 1500);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not copy invite link.");
      } finally {
        setBusyId(null);
      }
    },
    [team, currentUid, origin, refresh],
  );

  const handleCopyMessage = useCallback(
    async (target: ParentInviteTarget) => {
      setBusyId(target.id);
      setError(null);
      try {
        const code = await ensureParentInviteForTarget(team, target, currentUid);
        const url = joinUrl(code, origin || window.location.origin);
        const msg = parentInviteMessage(team.name, url);
        await navigator.clipboard.writeText(msg);
        setCopiedId(`${target.id}:msg`);
        setTimeout(() => setCopiedId(null), 1500);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not copy message.");
      } finally {
        setBusyId(null);
      }
    },
    [team, currentUid, origin, refresh],
  );

  const handleIgnore = useCallback(
    async (targetId: string) => {
      setBusyId(targetId);
      setError(null);
      try {
        await setParentTargetIgnored(team.id, targetId);
        await refresh();
      } catch {
        setError("Could not update target.");
      } finally {
        setBusyId(null);
      }
    },
    [team.id, refresh],
  );

  const handleManualLink = useCallback(async () => {
    if (!manualTargetId || !manualParentUid || !manualPlayerId) return;
    setBusyId(manualTargetId);
    setError(null);
    try {
      await manualLinkParentToTarget(
        team.id,
        manualTargetId,
        manualParentUid,
        manualPlayerId,
      );
      setManualTargetId(null);
      setManualParentUid("");
      setManualPlayerId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link parent.");
    } finally {
      setBusyId(null);
    }
  }, [team.id, manualTargetId, manualParentUid, manualPlayerId, refresh]);

  if (!canManage) {
    return null;
  }

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Parent invite targets
      </p>
      <p className="mb-3 text-[10px] leading-snug text-zinc-500">
        Imported parents from your roster. Copy a join link to onboard them into
        Game Cap — no email is sent automatically.
      </p>

      {loading ? (
        <p className="text-[11px] text-zinc-500">Loading targets…</p>
      ) : targets.length === 0 ? (
        <p className="text-[10px] leading-snug text-zinc-500">
          No parent targets yet. Import a roster CSV above to add parents.
        </p>
      ) : (
        <ul className="space-y-2">
          {targets.map((target) => {
            const status = target.status ?? "not_invited";
            const showManual = manualTargetId === target.id;
            return (
              <li
                key={target.id}
                className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-zinc-200">
                      {target.parentName}
                    </p>
                    <p className="font-mono text-[10px] text-zinc-500">
                      {target.email}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-400">
                      Player: {target.playerName ?? "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_BADGE[status] ?? STATUS_BADGE.not_invited}`}
                  >
                    {parentInviteStatusLabel(status)}
                  </span>
                </div>

                {status !== "joined" && status !== "ignored" ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyLink(target)}
                      disabled={busyId === target.id}
                      className={primaryBtn}
                    >
                      {copiedId === `${target.id}:link`
                        ? "Copied"
                        : "Copy invite link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyMessage(target)}
                      disabled={busyId === target.id}
                      className={ghostBtn}
                    >
                      {copiedId === `${target.id}:msg`
                        ? "Copied"
                        : "Copy message"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setManualTargetId(showManual ? null : target.id)
                      }
                      className={ghostBtn}
                    >
                      {showManual ? "Cancel link" : "Link manually"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleIgnore(target.id)}
                      disabled={busyId === target.id}
                      className={ghostBtn}
                    >
                      Ignore
                    </button>
                  </div>
                ) : null}

                {showManual ? (
                  <div className="mt-2 space-y-1.5 rounded-md border border-white/[0.06] bg-black/30 p-2">
                    <p className="text-[10px] text-zinc-500">
                      Link a parent who already joined with a different Google
                      email.
                    </p>
                    <select
                      value={manualParentUid}
                      onChange={(e) => setManualParentUid(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
                    >
                      <option value="">Select joined parent…</option>
                      {parentMembers.map((uid) => (
                        <option key={uid} value={uid}>
                          {uid}
                        </option>
                      ))}
                    </select>
                    <select
                      value={manualPlayerId}
                      onChange={(e) => setManualPlayerId(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
                    >
                      <option value="">Select player…</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.jerseyNumber ? ` #${p.jerseyNumber}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleManualLink()}
                      disabled={
                        !manualParentUid || !manualPlayerId || busyId === target.id
                      }
                      className={primaryBtn}
                    >
                      Save link
                    </button>
                  </div>
                ) : null}
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
