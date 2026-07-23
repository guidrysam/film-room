import { createGoogleGenerativeAI } from "@ai-sdk/google";

/** Current stable Flash for video/tag work. Never use retired 1.5 for new keys. */
export const DEFAULT_AI_TAG_MODEL = "gemini-2.5-flash";

/**
 * Resolve model id from env, upgrading retired Gemini 1.x ids.
 */
export function resolveAiModelId(
  preferred?: string | null,
  fallback: string = DEFAULT_AI_TAG_MODEL,
): string {
  const raw = (preferred ?? "").trim() || fallback;
  if (/gemini-1(\.|$)/i.test(raw) || /gemini-pro$/i.test(raw)) {
    console.warn(
      `[ai] Ignoring retired model "${raw}"; using ${fallback} instead.`,
    );
    return fallback;
  }
  return raw;
}

export function createGoogleTagModel(modelId?: string | null) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MISSING_AI_API_KEY");
  }
  const google = createGoogleGenerativeAI({ apiKey });
  const id = resolveAiModelId(
    modelId ?? process.env.AI_TAG_MODEL,
    DEFAULT_AI_TAG_MODEL,
  );
  return { model: google(id), modelId: id };
}
