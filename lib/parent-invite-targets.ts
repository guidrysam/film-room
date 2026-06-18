import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { findParentTargetsToLink } from "@/lib/parent-onboarding";
import type { ParentInviteTargetStatus } from "@/lib/parent-onboarding";
import { normalizeEmail } from "@/lib/roster-csv";
import { addParentUidToPlayer } from "@/lib/teams";

/**
 * Parent invite targets — roster-imported contacts for parent onboarding.
 * No email is sent automatically.
 *
 * Layout: teams/{teamId}/parentInviteTargets/{targetId}
 */

export type ParentInviteTarget = {
  id: string;
  parentName: string;
  email: string;
  phone?: string;
  playerId?: string;
  playerName?: string;
  status?: ParentInviteTargetStatus;
  inviteCode?: string;
  joinedUid?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  joinedAt?: Timestamp | null;
};

export type ParentInviteTargetInput = {
  parentName: string;
  email: string;
  phone?: string;
  playerId?: string;
  playerName?: string;
};

export type ParentInviteTargetPatch = {
  parentName?: string;
  email?: string;
  phone?: string;
  playerId?: string;
  playerName?: string;
  status?: ParentInviteTargetStatus;
  inviteCode?: string;
  joinedUid?: string;
};

function targetsCol(teamId: string) {
  return collection(firestore, "teams", teamId, "parentInviteTargets");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

const TARGET_STATUSES: ParentInviteTargetStatus[] = [
  "not_invited",
  "invited",
  "joined",
  "ignored",
];

function parseTarget(
  id: string,
  raw: Record<string, unknown>,
): ParentInviteTarget | null {
  const email = normalizeEmail(
    typeof raw.email === "string" ? raw.email : undefined,
  );
  const parentName = trimOrUndef(raw.parentName);
  if (!email || !parentName) return null;
  const statusRaw = raw.status;
  const status = TARGET_STATUSES.includes(statusRaw as ParentInviteTargetStatus)
    ? (statusRaw as ParentInviteTargetStatus)
    : "not_invited";
  return {
    id,
    parentName,
    email,
    status,
    ...(trimOrUndef(raw.phone) ? { phone: raw.phone as string } : {}),
    ...(trimOrUndef(raw.playerId) ? { playerId: raw.playerId as string } : {}),
    ...(trimOrUndef(raw.playerName)
      ? { playerName: raw.playerName as string }
      : {}),
    ...(trimOrUndef(raw.inviteCode)
      ? { inviteCode: raw.inviteCode as string }
      : {}),
    ...(trimOrUndef(raw.joinedUid) ? { joinedUid: raw.joinedUid as string } : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
    joinedAt: raw.joinedAt instanceof Timestamp ? raw.joinedAt : null,
  };
}

export function parentInviteTargetKey(
  email: string,
  playerId: string,
): string {
  return `${email.trim().toLowerCase()}|${playerId}`;
}

export async function listParentInviteTargets(
  teamId: string,
): Promise<ParentInviteTarget[]> {
  const snap = await getDocs(targetsCol(teamId));
  const out: ParentInviteTarget[] = [];
  snap.forEach((d) => {
    const t = parseTarget(d.id, d.data() as Record<string, unknown>);
    if (t) out.push(t);
  });
  out.sort((a, b) => a.parentName.localeCompare(b.parentName));
  return out;
}

export async function getParentInviteTarget(
  teamId: string,
  targetId: string,
): Promise<ParentInviteTarget | null> {
  const snap = await getDoc(doc(targetsCol(teamId), targetId));
  if (!snap.exists()) return null;
  return parseTarget(snap.id, snap.data() as Record<string, unknown>);
}

export async function listMyParentInviteTargets(
  teamId: string,
  uid: string,
): Promise<ParentInviteTarget[]> {
  const q = query(targetsCol(teamId), where("joinedUid", "==", uid));
  const snap = await getDocs(q);
  const out: ParentInviteTarget[] = [];
  snap.forEach((d) => {
    const t = parseTarget(d.id, d.data() as Record<string, unknown>);
    if (t) out.push(t);
  });
  return out;
}

export async function updateParentInviteTarget(
  teamId: string,
  targetId: string,
  patch: ParentInviteTargetPatch,
): Promise<void> {
  await updateDoc(doc(targetsCol(teamId), targetId), {
    updatedAt: serverTimestamp(),
    ...(patch.parentName !== undefined
      ? { parentName: patch.parentName.trim() }
      : {}),
    ...(patch.email !== undefined
      ? { email: normalizeEmail(patch.email) ?? patch.email.trim() }
      : {}),
    ...(patch.phone !== undefined
      ? patch.phone.trim()
        ? { phone: patch.phone.trim() }
        : { phone: "" }
      : {}),
    ...(patch.playerId !== undefined ? { playerId: patch.playerId } : {}),
    ...(patch.playerName !== undefined
      ? { playerName: patch.playerName.trim() }
      : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.inviteCode !== undefined ? { inviteCode: patch.inviteCode } : {}),
    ...(patch.joinedUid !== undefined ? { joinedUid: patch.joinedUid } : {}),
  });
}

export async function markParentTargetInvited(
  teamId: string,
  targetId: string,
  inviteCode: string,
): Promise<void> {
  await updateDoc(doc(targetsCol(teamId), targetId), {
    inviteCode,
    status: "invited",
    updatedAt: serverTimestamp(),
  });
}

export async function markParentTargetJoined(
  teamId: string,
  targetId: string,
  joinedUid: string,
): Promise<void> {
  const now = serverTimestamp();
  await updateDoc(doc(targetsCol(teamId), targetId), {
    joinedUid,
    status: "joined",
    joinedAt: now,
    updatedAt: now,
  });
}

export async function setParentTargetIgnored(
  teamId: string,
  targetId: string,
): Promise<void> {
  await updateDoc(doc(targetsCol(teamId), targetId), {
    status: "ignored",
    updatedAt: serverTimestamp(),
  });
}

export async function upsertParentInviteTarget(
  teamId: string,
  input: ParentInviteTargetInput,
  existingByKey?: Map<string, ParentInviteTarget>,
): Promise<ParentInviteTarget> {
  const email = normalizeEmail(input.email);
  const parentName = trimOrUndef(input.parentName);
  if (!email || !parentName) {
    throw new Error("Parent name and a valid email are required.");
  }

  const playerId = trimOrUndef(input.playerId);
  const key = playerId ? parentInviteTargetKey(email, playerId) : null;
  const existing =
    key && existingByKey ? existingByKey.get(key) : undefined;

  const ref = existing
    ? doc(targetsCol(teamId), existing.id)
    : doc(targetsCol(teamId));

  const now = serverTimestamp();
  const payload = {
    parentName,
    email,
    status: existing?.status ?? "not_invited",
    ...(trimOrUndef(input.phone) ? { phone: input.phone!.trim() } : {}),
    ...(playerId ? { playerId } : {}),
    ...(trimOrUndef(input.playerName)
      ? { playerName: input.playerName!.trim() }
      : {}),
    updatedAt: now,
    ...(!existing ? { createdAt: now } : {}),
  };

  await setDoc(ref, payload, { merge: true });

  return {
    id: ref.id,
    parentName,
    email,
    status: existing?.status ?? "not_invited",
    ...(trimOrUndef(input.phone) ? { phone: input.phone!.trim() } : {}),
    ...(playerId ? { playerId } : {}),
    ...(trimOrUndef(input.playerName)
      ? { playerName: input.playerName!.trim() }
      : {}),
    ...(existing?.inviteCode ? { inviteCode: existing.inviteCode } : {}),
    ...(existing?.joinedUid ? { joinedUid: existing.joinedUid } : {}),
  };
}

export function indexParentInviteTargets(
  targets: ParentInviteTarget[],
): Map<string, ParentInviteTarget> {
  const map = new Map<string, ParentInviteTarget>();
  for (const t of targets) {
    if (t.playerId) {
      map.set(parentInviteTargetKey(t.email, t.playerId), t);
    }
  }
  return map;
}

/** After a parent redeems a team invite, link targets and players. */
export async function linkParentOnTeamJoin(
  teamId: string,
  uid: string,
  opts: { email?: string | null; inviteCode?: string },
): Promise<number> {
  const targets = await listParentInviteTargets(teamId);
  const toLink = findParentTargetsToLink(
    targets,
    opts.email ?? undefined,
    opts.inviteCode,
  );
  let linked = 0;
  for (const target of toLink) {
    await markParentTargetJoined(teamId, target.id, uid);
    if (target.playerId) {
      await addParentUidToPlayer(teamId, target.playerId, uid);
    }
    linked++;
  }
  return linked;
}

/** Coach manually links a joined parent to a roster target and player. */
export async function manualLinkParentToTarget(
  teamId: string,
  targetId: string,
  parentUid: string,
  playerId: string,
): Promise<void> {
  const target = await getParentInviteTarget(teamId, targetId);
  if (!target) throw new Error("Parent invite target not found.");
  await markParentTargetJoined(teamId, targetId, parentUid);
  await updateParentInviteTarget(teamId, targetId, { playerId });
  await addParentUidToPlayer(teamId, playerId, parentUid);
}
