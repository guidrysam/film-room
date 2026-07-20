export type AcademyEditorialAuthResult =
  | { authorized: true; actor: string }
  | { authorized: false; error: string };

/**
 * CLI write authorization for Academy editorial actions.
 * Requires ACADEMY_EDITOR_ACTOR and membership in ACADEMY_EDITOR_ALLOWLIST.
 */
export function authorizeAcademyEditor(
  env: NodeJS.ProcessEnv = process.env,
): AcademyEditorialAuthResult {
  const actor = env.ACADEMY_EDITOR_ACTOR?.trim();
  if (!actor) {
    return {
      authorized: false,
      error: "ACADEMY_EDITOR_ACTOR is required for Academy editorial writes.",
    };
  }
  const allowlist = (env.ACADEMY_EDITOR_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!allowlist.length) {
    return {
      authorized: false,
      error: "ACADEMY_EDITOR_ALLOWLIST is required for Academy editorial writes.",
    };
  }
  if (!allowlist.includes(actor)) {
    return {
      authorized: false,
      error: `Actor "${actor}" is not listed in ACADEMY_EDITOR_ALLOWLIST.`,
    };
  }
  return { authorized: true, actor };
}

export function requireAcademyEditor(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = authorizeAcademyEditor(env);
  if (!result.authorized) throw new Error(result.error);
  return result.actor;
}
