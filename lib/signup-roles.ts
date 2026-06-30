/**
 * Roles a person selects when they first join Film Room. These express intent
 * and personalize onboarding — team permissions still come from invites.
 */

export type SignupRole =
  | "club_operator"
  | "coach"
  | "parent"
  | "player"
  | "viewer";

export const SIGNUP_ROLES: SignupRole[] = [
  "club_operator",
  "coach",
  "parent",
  "player",
  "viewer",
];

export type SignupRoleOption = {
  id: SignupRole;
  title: string;
  blurb: string;
};

export const SIGNUP_ROLE_OPTIONS: SignupRoleOption[] = [
  {
    id: "club_operator",
    title: "Club admin / media",
    blurb:
      "Import rosters, set up teams, attach film, and invite coaches and parents.",
  },
  {
    id: "coach",
    title: "Coach",
    blurb:
      "Review game film, tag plays, add coach marks, and track season stats.",
  },
  {
    id: "parent",
    title: "Parent",
    blurb:
      "Upload video from your phone, sync angles, and build player highlights.",
  },
  {
    id: "player",
    title: "Player",
    blurb: "Watch your games, coach marks, and personal highlight reels.",
  },
  {
    id: "viewer",
    title: "Viewer",
    blurb: "Watch shared games and perspectives — no setup required.",
  },
];

export function isSignupRole(value: unknown): value is SignupRole {
  return (
    typeof value === "string" &&
    (SIGNUP_ROLES as string[]).includes(value)
  );
}

/** Normalize and dedupe role selections. */
export function normalizeSignupRoles(roles: unknown): SignupRole[] {
  if (!Array.isArray(roles)) return [];
  const out: SignupRole[] = [];
  const seen = new Set<SignupRole>();
  for (const role of roles) {
    if (!isSignupRole(role) || seen.has(role)) continue;
    seen.add(role);
    out.push(role);
  }
  return out;
}

export function signupRoleFromTeamInviteRole(
  role: "coach" | "parent" | "player" | "viewer",
): SignupRole {
  return role;
}

/** Suggested landing path after onboarding completes. */
export function postOnboardingPath(roles: SignupRole[]): string {
  if (roles.includes("club_operator") && roles.length === 1) {
    return "/team/new";
  }
  if (roles.includes("parent") && !roles.includes("coach")) {
    return "/game-cap";
  }
  return "/app";
}
