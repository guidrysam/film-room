import path from "node:path";

export function sourceIdFromFilename(filename: string): string {
  const basename = path.basename(filename, path.extname(filename));
  const slug = basename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "source";
}

export function sourceTitleFromFilename(filename: string): string {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
