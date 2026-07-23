/** Current stable Flash for video/tag work. Never use retired 1.5 for new keys. */
export const DEFAULT_AI_TAG_MODEL = "gemini-2.5-flash";

const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-flash-latest",
]);

/**
 * Resolve model id from env, upgrading retired Gemini 1.x ids and
 * rejecting unknown / unsafe overrides.
 */
export function resolveAiModelId(
  preferred?: string | null,
  fallback: string = DEFAULT_AI_TAG_MODEL,
): string {
  let raw = (preferred ?? "").trim() || fallback;
  raw = raw.replace(/^models\//i, "");
  if (/gemini-1(\.|$)/i.test(raw) || /^gemini-pro$/i.test(raw)) {
    console.warn(
      `[ai] Ignoring retired model "${raw}"; using ${fallback} instead.`,
    );
    return fallback;
  }
  if (!ALLOWED_MODELS.has(raw)) {
    console.warn(
      `[ai] Ignoring unsupported model "${raw}"; using ${fallback} instead.`,
    );
    return fallback;
  }
  return raw;
}
