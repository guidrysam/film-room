"use client";

import { useCallback, useState } from "react";
import {
  eventInviteEmailMessage,
  eventInviteSmsMessage,
} from "@/lib/parent-onboarding";
import { createStaffInvite, type StaffInviteRole } from "@/lib/staff-invites";
import { canManageTeam, type Team } from "@/lib/teams";

export type BatchEventInviteProps = {
  teams: Team[];
  eventLabel: string;
  currentUid: string;
  role: Extract<StaffInviteRole, "coach" | "parent">;
};

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/30";

const COPY: Record<
  BatchEventInviteProps["role"],
  { button: string; title: string; description: (count: number, label: string) => string; label: string }
> = {
  coach: {
    button: "Invite coach",
    title: "Coach invite link",
    label: "coach access",
    description: (count, label) =>
      `One link adds them as coach on all ${count} teams in ${label}. They'll see the same teams and games on their dashboard.`,
  },
  parent: {
    button: "Invite parents",
    title: "Parent invite link",
    label: "parent access",
    description: (count, label) =>
      `One link adds parents on all ${count} teams in ${label}. They can upload video in Game Cap and view team games. Roster email matches link them to their player when possible.`,
  },
};

export default function BatchEventInvite({
  teams,
  eventLabel,
  currentUid,
  role,
}: BatchEventInviteProps) {
  const copy = COPY[role];
  const manageable = teams.filter((t) => canManageTeam(t, currentUid));
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    setCopied(null);
    try {
      const code = await createStaffInvite({
        teams: manageable,
        actorUid: currentUid,
        eventLabel,
        role,
        label: `${eventLabel} ${copy.label}`,
      });
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setJoinUrl(`${origin}/join/staff/${code}`);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invite.");
    } finally {
      setCreating(false);
    }
  }, [manageable, currentUid, eventLabel, role, copy.label]);

  const handleCopy = useCallback(async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied("link");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy link.");
    }
  }, [joinUrl]);

  const handleCopyMessage = useCallback(async () => {
    if (!joinUrl) return;
    try {
      const text = eventInviteEmailMessage(eventLabel, joinUrl, role);
      await navigator.clipboard.writeText(text);
      setCopied("message");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy message.");
    }
  }, [joinUrl, eventLabel, role]);

  const handleCopySms = useCallback(async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(
        eventInviteSmsMessage(eventLabel, joinUrl, role),
      );
      setCopied("message");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy text message.");
    }
  }, [joinUrl, eventLabel, role]);

  if (manageable.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={creating}
        className={ghostBtn}
        title={`${copy.button} for all ${manageable.length} teams in this event`}
      >
        {creating ? "Creating…" : copy.button}
      </button>
      {open && joinUrl ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-white/10 bg-zinc-950 p-3 shadow-xl shadow-black/50">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            {copy.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {copy.description(manageable.length, eventLabel)}
          </p>
          <input
            readOnly
            value={joinUrl}
            className={inputClass}
            onFocus={(e) => e.target.select()}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={ghostBtn}
            >
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopyMessage()}
              className={ghostBtn}
            >
              {copied === "message" ? "Copied" : "Copy email text"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopySms()}
              className={ghostBtn}
            >
              Copy SMS text
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={ghostBtn}
            >
              Close
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            Paste into TeamLinkt, group email, or group text. Per-parent email
            and text buttons are on each team&apos;s setup page.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="absolute right-0 top-full mt-1 text-[10px] text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
