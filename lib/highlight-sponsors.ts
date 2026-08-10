/** Per-reel sponsor logos for the thank-you end card. */

export const MAX_REEL_SPONSORS = 6;

export type HighlightSponsorLogo = {
  id: string;
  logoUrl: string;
  name?: string;
};

export function newSponsorId(): string {
  return `sp_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeHighlightSponsors(
  raw: unknown,
): HighlightSponsorLogo[] {
  if (!Array.isArray(raw)) return [];
  const out: HighlightSponsorLogo[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const logoUrl = typeof o.logoUrl === "string" ? o.logoUrl.trim() : "";
    if (!id || !logoUrl.startsWith("data:image/")) continue;
    out.push({
      id,
      logoUrl,
      ...(typeof o.name === "string" && o.name.trim()
        ? { name: o.name.trim().slice(0, 80) }
        : {}),
    });
    if (out.length >= MAX_REEL_SPONSORS) break;
  }
  return out;
}
