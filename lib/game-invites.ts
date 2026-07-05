import {
  arrayUnion,
  collection,
  deleteField,
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
import type { Game } from "@/lib/games";

/**
 * Game join links / invite codes (MVP, client SDK + rules only).
 *
 * An invite lives at `gameInvites/{code}` and maps an unguessable code to a
 * game + a contributor role. Anyone with the code can read the invite (public
 * read) and self-join via the constrained `games/{gameId}` update rule.
 *
 * No one-time use, no maxUses, no email targeting, no server. Revoke by
 * setting `active: false`; optional `expiresAt` is enforced by rules.
 */

export type GameInviteRole = "editor" | "viewer";

export type GameInvite = {
  /** Unguessable invite code; also the Firestore doc id. */
  code: string;
  gameId: string;
  /** Denormalized so the join landing page can render without membership. */
  gameTitle: string;
  role: GameInviteRole;
  label?: string;
  createdBy: string;
  createdAt: Timestamp | null;
  active: boolean;
  /** Optional expiry; absent means it never expires. */
  expiresAt?: Timestamp | null;
};

export type CreateGameInviteOptions = {
  label?: string;
  /** Optional expiry as epoch ms or Date. */
  expiresAt?: number | Date;
  /** Shorthand: expire N days from now (overrides expiresAt when set). */
  expiresInDays?: number;
};

function invitesCol() {
  return collection(firestore, "gameInvites");
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** ~24-char URL-safe random code (≈144 bits of entropy). */
function generateInviteCode(): string {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseInvite(
  code: string,
  raw: Record<string, unknown>,
): GameInvite | null {
  const role = raw.role;
  if (role !== "editor" && role !== "viewer") return null;
  const gameId = trimOrUndef(raw.gameId);
  if (!gameId) return null;
  return {
    code,
    gameId,
    gameTitle: typeof raw.gameTitle === "string" ? raw.gameTitle : "Game",
    role,
    active: raw.active === true,
    ...(trimOrUndef(raw.label) ? { label: (raw.label as string).trim() } : {}),
    ...(trimOrUndef(raw.createdBy)
      ? { createdBy: (raw.createdBy as string).trim() }
      : { createdBy: "" }),
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
    ...(raw.expiresAt instanceof Timestamp ? { expiresAt: raw.expiresAt } : {}),
  };
}

/** True when the invite carries an expiry that is already in the past. */
export function isInviteExpired(invite: GameInvite, now: number = Date.now()): boolean {
  const ms = invite.expiresAt?.toMillis?.();
  return typeof ms === "number" && ms <= now;
}

/** True when an invite can currently be redeemed. */
export function isInviteRedeemable(invite: GameInvite | null): invite is GameInvite {
  return Boolean(invite && invite.active && !isInviteExpired(invite));
}

/** Create a new invite for a game. Rules require the caller to own the game. */
export async function createGameInvite(
  game: Game,
  uid: string,
  role: GameInviteRole,
  options?: CreateGameInviteOptions,
): Promise<GameInvite> {
  if (role !== "editor" && role !== "viewer") {
    throw new Error(`Invalid invite role: ${role}`);
  }
  const code = generateInviteCode();
  const ref = doc(invitesCol(), code);
  let expiresAt: Timestamp | undefined;
  if (typeof options?.expiresInDays === "number") {
    const ms =
      options.expiresInDays > 0
        ? Date.now() + options.expiresInDays * 86_400_000
        : null;
    if (ms != null) expiresAt = Timestamp.fromMillis(ms);
  } else if (options?.expiresAt != null) {
    const d =
      options.expiresAt instanceof Date
        ? options.expiresAt
        : new Date(options.expiresAt);
    if (!Number.isNaN(d.getTime())) expiresAt = Timestamp.fromDate(d);
  }
  await setDoc(ref, {
    code,
    gameId: game.id,
    gameTitle: game.title?.trim() || "Game",
    role,
    active: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
    ...(trimOrUndef(options?.label) ? { label: options!.label!.trim() } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });
  return {
    code,
    gameId: game.id,
    gameTitle: game.title?.trim() || "Game",
    role,
    active: true,
    createdBy: uid,
    createdAt: null,
    ...(trimOrUndef(options?.label) ? { label: options!.label!.trim() } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

/** Fetch a single invite by its code. */
export async function getGameInvite(code: string): Promise<GameInvite | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const snap = await getDoc(doc(invitesCol(), trimmed));
  if (!snap.exists()) return null;
  return parseInvite(snap.id, snap.data() as Record<string, unknown>);
}

/** All invites for a game (owner UI), newest first. */
export async function listGameInvites(gameId: string): Promise<GameInvite[]> {
  const q = query(invitesCol(), where("gameId", "==", gameId));
  const snap = await getDocs(q);
  const out: GameInvite[] = [];
  snap.forEach((d) => {
    const inv = parseInvite(d.id, d.data() as Record<string, unknown>);
    if (inv) out.push(inv);
  });
  out.sort(
    (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
  return out;
}

/** Activate / deactivate (revoke) an invite. Rules require game ownership. */
export async function setGameInviteActive(
  code: string,
  active: boolean,
): Promise<void> {
  await updateDoc(doc(invitesCol(), code), { active });
}

/**
 * Redeem an invite: add the current user to the game's contributors at the
 * invite's role. The constrained `games/{gameId}` update rule re-validates the
 * invite (active, not expired, role match) and that the user adds only
 * themselves. The transient `joinCode` is then cleared (best-effort).
 *
 * Returns the joined gameId and granted role.
 */
export async function redeemGameInvite(
  code: string,
  uid: string,
  userInfo?: { displayName?: string | null },
): Promise<{ gameId: string; role: GameInviteRole }> {
  const trimmed = code.trim();
  if (!trimmed) throw new Error("Missing invite code.");
  if (!uid) throw new Error("You must be signed in to join.");

  const invite = await getGameInvite(trimmed);
  if (!invite) throw new Error("This invite link is not valid.");
  if (!invite.active) throw new Error("This invite link has been deactivated.");
  if (isInviteExpired(invite)) throw new Error("This invite link has expired.");

  if (userInfo?.displayName) {
    // Reserved: contributor display-name attribution (no profile store yet).
  }

  const gameRef = doc(firestore, "games", invite.gameId);
  await updateDoc(gameRef, {
    [`contributors.${uid}`]: invite.role,
    memberUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
    joinCode: trimmed,
  });

  // Best-effort cleanup so the transient code does not linger on the game doc.
  try {
    await updateDoc(gameRef, { joinCode: deleteField() });
  } catch {
    /* Safe to leave: the self-join rule blocks role changes for existing
       contributors, so a lingering code cannot be used to escalate. */
  }

  return { gameId: invite.gameId, role: invite.role };
}
