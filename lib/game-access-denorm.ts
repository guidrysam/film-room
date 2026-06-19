import type { Game } from "@/lib/games";

/** Denormalized access fields copied onto game subdocs for query-safe rules. */
export type GameAccessDenorm = {
  gameOwnerId: string;
  gameMemberUids: string[];
  gameTeamId?: string;
};

export function gameAccessDenormFromGame(game: Game): GameAccessDenorm {
  const memberUids =
    game.memberUids.length > 0 ? game.memberUids : Object.keys(game.contributors);
  return {
    gameOwnerId: game.ownerId,
    gameMemberUids: memberUids,
    ...(game.teamId ? { gameTeamId: game.teamId } : {}),
  };
}

/** Minimal denorm when the parent game doc cannot be read (attach path). */
export function gameAccessDenormFromUid(
  uid: string,
  teamId?: string,
): GameAccessDenorm {
  return {
    gameOwnerId: uid,
    gameMemberUids: [uid],
    ...(teamId ? { gameTeamId: teamId } : {}),
  };
}

/** Parse contributor role from flat string or nested `{ role: "owner" }`. */
export function parseContributorRole(value: unknown): string | null {
  if (value === "owner" || value === "editor" || value === "viewer") {
    return value;
  }
  if (value && typeof value === "object" && "role" in value) {
    const role = (value as { role?: unknown }).role;
    if (role === "owner" || role === "editor" || role === "viewer") {
      return role;
    }
  }
  return null;
}

export function contributorPresent(
  contributors: Record<string, unknown> | undefined,
  uid: string,
): boolean {
  if (!contributors || typeof contributors !== "object") return false;
  return parseContributorRole(contributors[uid]) != null;
}
