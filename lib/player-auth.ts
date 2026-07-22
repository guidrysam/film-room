/**
 * Player secondary accounts use Firebase email/password with a synthetic
 * Auth email derived from username. The household parent email is stored on
 * the profile for contact / recovery context — it is not the Auth login email
 * (Firebase requires unique emails per Auth user).
 */

export const PLAYER_AUTH_EMAIL_DOMAIN = "player.filmroom.app";

export function normalizePlayerUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 24);
}

export function validatePlayerUsername(raw: string): {
  ok: boolean;
  username: string;
  error?: string;
} {
  const username = normalizePlayerUsername(raw);
  if (username.length < 3) {
    return {
      ok: false,
      username,
      error: "Username must be at least 3 characters (letters and numbers).",
    };
  }
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]{3,24}$/.test(username)) {
    return {
      ok: false,
      username,
      error: "Use letters, numbers, dots, underscores, or hyphens.",
    };
  }
  return { ok: true, username };
}

export function validatePlayerPassword(password: string): {
  ok: boolean;
  error?: string;
} {
  if (password.length < 6) {
    return {
      ok: false,
      error: "Password must be at least 6 characters.",
    };
  }
  if (password.length > 72) {
    return { ok: false, error: "Password is too long." };
  }
  return { ok: true };
}

/** Deterministic Firebase Auth email for a player username. */
export function playerUsernameToAuthEmail(username: string): string {
  const normalized = normalizePlayerUsername(username);
  return `${normalized}@${PLAYER_AUTH_EMAIL_DOMAIN}`;
}

export function isPlayerAuthEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${PLAYER_AUTH_EMAIL_DOMAIN}`);
}
