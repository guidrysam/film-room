import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { normalizeEmail } from "@/lib/roster-csv";

/**
 * Parent invite targets — roster-imported contacts for future parent invites.
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
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type ParentInviteTargetInput = {
  parentName: string;
  email: string;
  phone?: string;
  playerId?: string;
  playerName?: string;
};

function targetsCol(teamId: string) {
  return collection(firestore, "teams", teamId, "parentInviteTargets");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function parseTarget(
  id: string,
  raw: Record<string, unknown>,
): ParentInviteTarget | null {
  const email = normalizeEmail(
    typeof raw.email === "string" ? raw.email : undefined,
  );
  const parentName = trimOrUndef(raw.parentName);
  if (!email || !parentName) return null;
  return {
    id,
    parentName,
    email,
    ...(trimOrUndef(raw.phone) ? { phone: raw.phone as string } : {}),
    ...(trimOrUndef(raw.playerId) ? { playerId: raw.playerId as string } : {}),
    ...(trimOrUndef(raw.playerName)
      ? { playerName: raw.playerName as string }
      : {}),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt : null,
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
    ...(trimOrUndef(input.phone) ? { phone: input.phone!.trim() } : {}),
    ...(playerId ? { playerId } : {}),
    ...(trimOrUndef(input.playerName)
      ? { playerName: input.playerName!.trim() }
      : {}),
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
