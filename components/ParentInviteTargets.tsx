"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureParentInviteForTarget } from "@/lib/parent-invite-flow";
import {
  combineParentInviteMessages,
  parentInviteMailtoUrl,
  parentInviteMessage,
  parentInviteSmsUrl,
  parentInviteStatusLabel,
  parentTargetsEligibleForInvite,
  summarizeParentVideoTeam,
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

function SummaryCard({
  summary,
}: {
  summary: ReturnType<typeof summarizeParentVideoTeam>;
}) {
  const items = [
    { label: "Players imported", value: summary.playersImported },
    { label: "Parent contacts imported", value: summary.parentContactsImported },
    { label: "Parents invited", value: summary.parentsInvited },
    { label: "Parents joined", value: summary.parentsJoined },
    { label: "Video contributors", value: summary.videoContributors },
  ];

  return (
    <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(({ label, value }) => (
        <li
          key={label}
          className="rounded-md border border-white/[0.06] bg-black/25 px-2 py-2 text-center"
        >
          <p className="text-lg font-semibold text-white">{value}</p>
          <p className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Coach/admin UI for inviting parents to upload video and build highlights.
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
  const [copyAllBusy, setCopyAllBusy] = useState(false);
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

  const summary = useMemo(
    () => summarizeParentVideoTeam(players.length, targets, team.members),
    [players.length, targets, team.members],
  );

  const eligibleTargets = useMemo(
    () => parentTargetsEligibleForInvite(targets),
    [targets],
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
      setError("Could not load parent contacts.");
    } finally {
      setLoading(false);
    }
  }, [canManage, team.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const buildInviteUrl = useCallback(
    async (target: ParentInviteTarget) => {
      const code = await ensureParentInviteForTarget(team, target, currentUid);
      return joinUrl(code, origin || window.location.origin);
    },
    [team, currentUid, origin],
  );

  const handleCopyLink = useCallback(
    async (target: ParentInviteTarget) => {
      setBusyId(target.id);
      setError(null);
      try {
        const url = await buildInviteUrl(target);
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
    [buildInviteUrl, refresh],
  );

  const handleCopyMessage = useCallback(
    async (target: ParentInviteTarget) => {
      setBusyId(target.id);
      setError(null);
      try {
        const url = await buildInviteUrl(target);
        const msg = parentInviteMessage(target.parentName, team.name, url);
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
    [buildInviteUrl, team.name, refresh],
  );

  const handleCopyAllMessages = useCallback(async () => {
    if (eligibleTargets.length === 0) return;
    setCopyAllBusy(true);
    setError(null);
    try {
      const messages: string[] = [];
      for (const target of eligibleTargets) {
        const url = await buildInviteUrl(target);
        messages.push(parentInviteMessage(target.parentName, team.name, url));
      }
      await navigator.clipboard.writeText(combineParentInviteMessages(messages));
      setCopiedId("all:msg");
      setTimeout(() => setCopiedId(null), 1500);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy messages.");
    } finally {
      setCopyAllBusy(false);
    }
  }, [eligibleTargets, buildInviteUrl, team.name, refresh]);

  const handleOpenEmail = useCallback(
    async (target: ParentInviteTarget) => {
      setBusyId(target.id);
      setError(null);
      try {
        const url = await buildInviteUrl(target);
        const mailto = parentInviteMailtoUrl(
          target.email,
          target.parentName,
          team.name,
          url,
        );
        window.location.href = mailto;
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open email.");
      } finally {
        setBusyId(null);
      }
    },
    [buildInviteUrl, team.name, refresh],
  );

  const handleOpenText = useCallback(
    async (target: ParentInviteTarget) => {
      if (!target.phone?.trim()) {
        setError("No phone number on file for this contact.");
        return;
      }
      setBusyId(target.id);
      setError(null);
      try {
        const url = await buildInviteUrl(target);
        const sms = parentInviteSmsUrl(
          target.phone,
          target.parentName,
          team.name,
          url,
        );
        if (!sms) {
          setError("Phone number is not valid for texting.");
          return;
        }
        window.location.href = sms;
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open Messages.");
      } finally {
        setBusyId(null);
      }
    },
    [buildInviteUrl, team.name, refresh],
  );

  const handleIgnore = useCallback(
    async (targetId: string) => {
      setBusyId(targetId);
      setError(null);
      try {
        await setParentTargetIgnored(team.id, targetId);
        await refresh();
      } catch {
        setError("Could not update contact.");
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
      {loading ? (
        <p className="text-[11px] text-zinc-500">Loading parent contacts…</p>
      ) : targets.length === 0 ? (
        <p className="text-[10px] leading-snug text-zinc-500">
          No parent contacts yet. Import a roster CSV above to add parents you can
          invite to upload video.
        </p>
      ) : (
        <>
          <SummaryCard summary={summary} />

          <div className="mb-4">
            <button
              type="button"
              onClick={() => void handleCopyAllMessages()}
              disabled={copyAllBusy || eligibleTargets.length === 0}
              className={`${primaryBtn} w-full sm:w-auto`}
            >
              {copiedId === "all:msg"
                ? "Copied all messages"
                : copyAllBusy
                  ? "Preparing messages…"
                  : "Copy all invite messages"}
            </button>
            <p className="mt-2 text-[10px] leading-snug text-zinc-500">
              Open email or text opens your mail/Messages app with the invite
              pre-filled — tap Send there. Automated blast sending is coming
              next.
            </p>
          </div>

          <ul className="space-y-2">
            {targets.map((target) => {
              const status = target.status ?? "not_invited";
              const showManual = manualTargetId === target.id;
              const canInvite = status !== "joined" && status !== "ignored";

              return (
                <li
                  key={target.id}
                  className="rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[11px] font-medium text-zinc-200">
                        {target.parentName}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        {target.email}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Player linked: {target.playerName ?? "—"}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        Status: {parentInviteStatusLabel(status)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_BADGE[status] ?? STATUS_BADGE.not_invited}`}
                    >
                      {parentInviteStatusLabel(status)}
                    </span>
                  </div>

                  {canInvite ? (
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
                        onClick={() => void handleOpenEmail(target)}
                        disabled={busyId === target.id}
                        className={ghostBtn}
                      >
                        Open email
                      </button>
                      {target.phone?.trim() ? (
                        <button
                          type="button"
                          onClick={() => void handleOpenText(target)}
                          disabled={busyId === target.id}
                          className={ghostBtn}
                        >
                          Open text
                        </button>
                      ) : null}
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
                        Already joined with another email? Link them manually.
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
        </>
      )}

      {error ? (
        <p className="mt-2 text-[10px] leading-snug text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
