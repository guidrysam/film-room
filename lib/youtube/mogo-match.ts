/** Titles/descriptions Game Cap MOGO writes (default file name or description tag). */
export function isGameCapMogoYouTubeVideo(
  title: string,
  description = "",
): boolean {
  const t = title.trim();
  const d = description.trim();
  if (!t && !d) return false;
  if (/GameCapMOGO/i.test(t)) return true;
  if (/Game\s*Cap\s*MOGO/i.test(t)) return true;
  if (/Uploaded from Game Cap MOGO/i.test(d)) return true;
  // Drive-style session name: "Main — GameCapMOGO-...."
  if (/GameCapMOGO-\d{4}-\d{2}-\d{2}/i.test(t)) return true;
  return false;
}
