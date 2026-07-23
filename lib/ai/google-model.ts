/** Current stable Flash for video/tag work (new API keys reject Gemini 2.5). */
export const DEFAULT_AI_TAG_MODEL = "gemini-3.5-flash";

const ALLOWED_MODELS = new Set([
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
]);

/**
 * Resolve model id from env, upgrading retired / new-user-blocked Gemini ids
 * and rejecting unknown overrides.
 */
export function resolveAiModelId(
  preferred?: string | null,
  fallback: string = DEFAULT_AI_TAG_MODEL,
): string {
  let raw = (preferred ?? "").trim() || fallback;
  raw = raw.replace(/^models\//i, "");
  // 1.x retired; 2.0 shut down; 2.5 blocked for many new API keys.
  if (
    /gemini-1(\.|$)/i.test(raw) ||
    /^gemini-pro$/i.test(raw) ||
    /gemini-2\.0/i.test(raw) ||
    /gemini-2\.5/i.test(raw)
  ) {
    console.warn(
      `[ai] Ignoring retired/blocked model "${raw}"; using ${fallback} instead.`,
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
