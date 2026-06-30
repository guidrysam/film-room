import { loadUserProfile, userNeedsOnboarding } from "@/lib/user-profile";
import { signupRoleFromTeamInviteRole, type SignupRole } from "@/lib/signup-roles";

/** If onboarding is incomplete, send the user to role selection first. */
export async function pathAfterAuthOrWelcome(
  uid: string,
  defaultPath: string,
  preselectedRole?: SignupRole,
): Promise<string> {
  const profile = await loadUserProfile(uid);
  if (!userNeedsOnboarding(profile)) return defaultPath;
  if (!preselectedRole) return "/app/welcome";
  return `/app/welcome?role=${preselectedRole}`;
}

export function signupRoleFromInviteRole(
  role: "coach" | "parent" | "player" | "viewer",
): SignupRole {
  return signupRoleFromTeamInviteRole(role);
}
