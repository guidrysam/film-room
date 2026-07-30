/** Display names for team vault folders (safe for client + server). */

export function gameFolderDisplayName(game: {
  date?: string;
  opponent?: string;
  title?: string;
  id: string;
}): string {
  const date = (game.date ?? "").trim();
  const opponent = (game.opponent ?? "").trim();
  if (date && opponent) return `${date} vs ${opponent}`;
  if (date && game.title?.trim()) return `${date} — ${game.title.trim()}`;
  if (game.title?.trim()) return game.title.trim();
  return `Game ${game.id.slice(0, 8)}`;
}
