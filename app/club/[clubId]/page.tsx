"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import TeamCreateFromCsv from "@/components/TeamCreateFromCsv";
import TeamCreateManual from "@/components/TeamCreateManual";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  assignCoachToClubTeam,
  canManageClub,
  getClub,
  getClubMembers,
  isClubMember,
  listClubTeams,
  type Club,
  type ClubMemberEntry,
} from "@/lib/clubs";
import {
  clubInviteJoinPath,
  createClubInvite,
  type ClubInviteRole,
} from "@/lib/club-invites";
import { teamSetupUrl } from "@/lib/team-routes";
import type { Team } from "@/lib/teams";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40";
const primaryBtn =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40";

type AddMode = "none" | "manual" | "csv";

export default function ClubHubPage() {
  const params = useParams();
  const clubId = typeof params.clubId === "string" ? params.clubId : "";
  const { user, loading: authLoading } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<ClubMemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>("none");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [assignTeamId, setAssignTeamId] = useState("");

  const refresh = useCallback(async () => {
    if (!clubId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getClub(clubId);
      if (!next || !isClubMember(next, user.uid)) {
        setError("Club not found or you do not have access.");
        setClub(null);
        setTeams([]);
        setMembers([]);
        return;
      }
      setClub(next);
      const [clubTeams, clubMembers] = await Promise.all([
        listClubTeams(clubId),
        getClubMembers(clubId),
      ]);
      setTeams(clubTeams);
      setMembers(clubMembers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load club.");
    } finally {
      setLoading(false);
    }
  }, [clubId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!assignTeamId && teams[0]) setAssignTeamId(teams[0].id);
  }, [teams, assignTeamId]);

  const isAdmin = useMemo(
    () => (club && user ? canManageClub(club, user.uid) : false),
    [club, user],
  );

  const coaches = useMemo(
    () =>
      members.filter(
        (m) => m.role === "club_coach" || m.role === "club_admin",
      ),
    [members],
  );

  async function makeInvite(role: ClubInviteRole) {
    if (!club || !user) return;
    setInviteBusy(true);
    setError(null);
    try {
      const code = await createClubInvite(club, user.uid, role);
      const path = clubInviteJoinPath(code);
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${path}`
          : path;
      setInviteUrl(url);
      await navigator.clipboard?.writeText(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invite.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function onAssignCoach(coachUid: string) {
    if (!user || !assignTeamId) return;
    setAssignBusy(coachUid);
    setError(null);
    try {
      await assignCoachToClubTeam({
        actorUid: user.uid,
        clubId,
        teamId: assignTeamId,
        coachUid,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign coach.");
    } finally {
      setAssignBusy(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading club…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-zinc-50">
        <button
          type="button"
          onClick={() => void signInWithGoogle().catch(() => {})}
          className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-zinc-50">
        <p className="text-sm text-rose-300">{error ?? "Club not found."}</p>
        <Link href="/app" className="mt-4 inline-block text-sm text-blue-300">
          ← Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="border-b border-white/[0.06] pb-5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Club
          </p>
          <h1 className="text-xl font-semibold text-white">{club.name}</h1>
          {club.sport ? (
            <p className="mt-1 text-sm text-zinc-400">{club.sport}</p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-400">
            Manage teams, invite coaches, and import rosters under this club.
          </p>
          <Link href="/app" className="mt-3 inline-block text-sm text-zinc-500 hover:text-zinc-200">
            ← Dashboard
          </Link>
        </div>

        {error ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Teams</h2>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => setAddMode(addMode === "manual" ? "none" : "manual")}
                >
                  Add team
                </button>
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => setAddMode(addMode === "csv" ? "none" : "csv")}
                >
                  Import CSV
                </button>
              </div>
            ) : null}
          </div>

          {addMode === "manual" && user ? (
            <div className="mb-4">
              <TeamCreateManual uid={user.uid} clubId={clubId} />
            </div>
          ) : null}
          {addMode === "csv" && user ? (
            <div className="mb-4">
              <TeamCreateFromCsv uid={user.uid} clubId={clubId} />
            </div>
          ) : null}

          {teams.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No teams yet. Import a TeamLinkt CSV or add a team manually.
            </p>
          ) : (
            <ul className="space-y-2">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link
                    href={teamSetupUrl(team.id)}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm hover:bg-white/[0.04]"
                  >
                    <span className="font-medium text-zinc-100">{team.name}</span>
                    <span className="text-xs text-zinc-500">Setup →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isAdmin ? (
          <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
            <h2 className="text-sm font-semibold text-white">Invite to club</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Coaches join the club first, then you assign them to teams.
              Parents join the club to see kids across teams once linked on a
              roster.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryBtn}
                disabled={inviteBusy}
                onClick={() => void makeInvite("club_coach")}
              >
                Invite coach
              </button>
              <button
                type="button"
                className={ghostBtn}
                disabled={inviteBusy}
                onClick={() => void makeInvite("club_parent")}
              >
                Invite parent
              </button>
            </div>
            {inviteUrl ? (
              <p className="mt-3 break-all rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">
                Invite copied: {inviteUrl}
              </p>
            ) : null}
          </section>
        ) : null}

        {isAdmin && coaches.length > 0 && teams.length > 0 ? (
          <section className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5">
            <h2 className="text-sm font-semibold text-white">
              Assign coaches to teams
            </h2>
            <label className="mt-3 block text-xs text-zinc-500">
              Team
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                value={assignTeamId}
                onChange={(e) => setAssignTeamId(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <ul className="mt-3 space-y-2">
              {coaches.map((coach) => (
                <li
                  key={coach.uid}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"
                >
                  <span className="text-zinc-300">
                    {coach.uid.slice(0, 8)}…{" "}
                    <span className="text-zinc-500">({coach.role})</span>
                  </span>
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={assignBusy === coach.uid || !assignTeamId}
                    onClick={() => void onAssignCoach(coach.uid)}
                  >
                    {assignBusy === coach.uid ? "Assigning…" : "Add as team coach"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
