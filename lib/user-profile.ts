import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  normalizeSignupRoles,
  type SignupRole,
} from "@/lib/signup-roles";

export type UserAccountKind = "standard" | "player";

export type UserProfile = {
  uid: string;
  email?: string;
  displayName?: string;
  signupRoles: SignupRole[];
  onboardingCompletedAt: Timestamp | null;
  /** Household / contact email (parent). Auth email may be synthetic for players. */
  parentEmail?: string;
  parentUid?: string;
  username?: string;
  accountKind?: UserAccountKind;
  linkedTeamId?: string;
  linkedPlayerId?: string;
};

function userDoc(uid: string) {
  return doc(firestore, "users", uid);
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export function parseUserProfile(
  uid: string,
  raw: Record<string, unknown>,
): UserProfile {
  const accountKind =
    raw.accountKind === "player" ? "player" : ("standard" as UserAccountKind);
  return {
    uid,
    ...(trimOrUndef(raw.email) ? { email: raw.email as string } : {}),
    ...(trimOrUndef(raw.displayName)
      ? { displayName: raw.displayName as string }
      : {}),
    signupRoles: normalizeSignupRoles(raw.signupRoles),
    onboardingCompletedAt:
      raw.onboardingCompletedAt instanceof Timestamp
        ? raw.onboardingCompletedAt
        : null,
    ...(trimOrUndef(raw.parentEmail)
      ? { parentEmail: raw.parentEmail as string }
      : {}),
    ...(trimOrUndef(raw.parentUid) ? { parentUid: raw.parentUid as string } : {}),
    ...(trimOrUndef(raw.username) ? { username: raw.username as string } : {}),
    ...(trimOrUndef(raw.linkedTeamId)
      ? { linkedTeamId: raw.linkedTeamId as string }
      : {}),
    ...(trimOrUndef(raw.linkedPlayerId)
      ? { linkedPlayerId: raw.linkedPlayerId as string }
      : {}),
    accountKind,
  };
}

export function userNeedsOnboarding(profile: UserProfile | null): boolean {
  if (profile?.accountKind === "player") return false;
  return profile == null || profile.onboardingCompletedAt == null;
}

export function isPlayerAccount(
  profile: UserProfile | null,
): profile is UserProfile & { accountKind: "player" } {
  return profile?.accountKind === "player";
}

export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid.trim()) return null;
  try {
    const snap = await getDoc(userDoc(uid));
    if (!snap.exists()) return null;
    return parseUserProfile(uid, snap.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

export type CompleteOnboardingInput = {
  uid: string;
  roles: SignupRole[];
  email?: string | null;
  displayName?: string | null;
};

/** Save role choices and mark onboarding complete (merge, idempotent). */
export async function completeUserOnboarding(
  input: CompleteOnboardingInput,
): Promise<UserProfile> {
  const roles = normalizeSignupRoles(input.roles);
  if (roles.length === 0) {
    throw new Error("Choose at least one role to continue.");
  }

  const payload: Record<string, unknown> = {
    signupRoles: roles,
    onboardingCompletedAt: serverTimestamp(),
    accountKind: "standard",
    ...(trimOrUndef(input.email) ? { email: input.email!.trim() } : {}),
    ...(trimOrUndef(input.displayName)
      ? { displayName: input.displayName!.trim() }
      : {}),
  };

  await setDoc(userDoc(input.uid), payload, { merge: true });

  return {
    uid: input.uid,
    signupRoles: roles,
    onboardingCompletedAt: null,
    accountKind: "standard",
    ...(trimOrUndef(input.email) ? { email: input.email!.trim() } : {}),
    ...(trimOrUndef(input.displayName)
      ? { displayName: input.displayName!.trim() }
      : {}),
  };
}
