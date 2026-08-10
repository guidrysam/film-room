import { listMyClubs } from "@/lib/clubs";
import { listMyTeams } from "@/lib/teams";

export type BrandLogoOption = {
  /** Stable picker id, e.g. `club:abc` or `team:xyz`. */
  id: string;
  kind: "club" | "team";
  entityId: string;
  label: string;
  logoUrl: string;
};

/**
 * Crests the user can use on a highlight title card — any club/team they
 * belong to that already has a logo uploaded.
 */
export async function listMyBrandLogos(uid: string): Promise<BrandLogoOption[]> {
  if (!uid) return [];
  const [clubs, teams] = await Promise.all([
    listMyClubs(uid),
    listMyTeams(uid),
  ]);
  const out: BrandLogoOption[] = [];
  const seen = new Set<string>();

  for (const club of clubs) {
    const logoUrl = club.logoUrl?.trim();
    if (!logoUrl || seen.has(logoUrl)) continue;
    seen.add(logoUrl);
    out.push({
      id: `club:${club.id}`,
      kind: "club",
      entityId: club.id,
      label: club.name.trim() || "Club",
      logoUrl,
    });
  }

  for (const team of teams) {
    const logoUrl = team.logoUrl?.trim();
    if (!logoUrl || seen.has(logoUrl)) continue;
    seen.add(logoUrl);
    out.push({
      id: `team:${team.id}`,
      kind: "team",
      entityId: team.id,
      label: team.name.trim() || "Team",
      logoUrl,
    });
  }

  return out.sort((a, b) => a.label.localeCompare(b.label));
}
