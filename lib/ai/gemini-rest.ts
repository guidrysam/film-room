import "server-only";

import { z } from "zod";
import { DEFAULT_AI_TAG_MODEL } from "@/lib/ai/google-model";
import {
  aiTagResultSchema,
  ALL_AI_TAG_KINDS,
  type AiTagResult,
} from "@/lib/ai/tag-schema";

function apiKey(): string {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) throw new Error("MISSING_AI_API_KEY");
  return key;
}

/** Prefer current Flash; retry on high-demand / not-found. Never use Gemini 1.x. */
const MODEL_FALLBACKS = [
  DEFAULT_AI_TAG_MODEL,
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
] as const;

function shouldRetryWithNextModel(message: string): boolean {
  return /high demand|resource.?exhausted|unavailable|not found|NOT_FOUND|404|429|503|overloaded|quota|currently experiencing/i.test(
    message,
  );
}

type GeminiPart =
  | { text: string }
  | {
      fileData: { fileUri: string; mimeType?: string };
      videoMetadata?: {
        startOffset?: string;
        endOffset?: string;
        fps?: number;
      };
    };

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; status?: string; code?: number };
};

async function geminiGenerateOnce<T>(input: {
  modelId: string;
  system: string;
  userText: string;
  youtubeVideoId?: string;
  extraYoutubeVideoIds?: string[];
  videoClip?: { startSec: number; endSec: number };
  schema: z.ZodType<T>;
  responseJsonSchema: Record<string, unknown>;
}): Promise<{ object: T; modelId: string }> {
  const modelPath = `models/${input.modelId.replace(/^models\//, "")}`;
  const parts: GeminiPart[] = [{ text: input.userText }];
  const youtubeIds = [
    ...(input.youtubeVideoId ? [input.youtubeVideoId] : []),
    ...(input.extraYoutubeVideoIds ?? []),
  ]
    .map((id) => id.trim())
    .filter(
      (id, i, all) =>
        /^[a-zA-Z0-9_-]{11}$/.test(id) && all.indexOf(id) === i,
    )
    .slice(0, 4);

  const clip = input.videoClip;
  youtubeIds.forEach((id, index) => {
    const part: GeminiPart = {
      fileData: {
        fileUri: `https://www.youtube.com/watch?v=${id}`,
      },
    };
    if (index === 0 && clip && clip.endSec > clip.startSec) {
      part.videoMetadata = {
        startOffset: `${Math.max(0, Math.floor(clip.startSec))}s`,
        endOffset: `${Math.max(1, Math.ceil(clip.endSec))}s`,
        fps: 1,
      };
    }
    parts.push(part);
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey())}`;
  const body = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: input.responseJsonSchema,
      maxOutputTokens: 8192,
      ...(youtubeIds.length > 0
        ? { mediaResolution: "MEDIA_RESOLUTION_LOW" }
        : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GeminiGenerateResponse;
  if (!res.ok) {
    const msg = json.error?.message || `Gemini HTTP ${res.status}`;
    throw new Error(`[${modelPath}] ${msg}`);
  }
  const text = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new Error(`Empty Gemini response from ${modelPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON from ${modelPath}`);
  }
  const object = input.schema.parse(parsed);
  return { object, modelId: input.modelId.replace(/^models\//, "") };
}

/**
 * Call Gemini generateContent with current Flash models + automatic fallback.
 * Never calls retired gemini-1.x.
 */
export async function geminiGenerateObject<T>(input: {
  /** Ignored — models come from MODEL_FALLBACKS / DEFAULT_AI_TAG_MODEL. */
  modelId?: string | null;
  system: string;
  userText: string;
  youtubeVideoId?: string;
  extraYoutubeVideoIds?: string[];
  videoClip?: { startSec: number; endSec: number };
  schema: z.ZodType<T>;
  responseJsonSchema: Record<string, unknown>;
}): Promise<{ object: T; modelId: string }> {
  const tried: string[] = [];
  let lastError: Error | null = null;

  for (const modelId of MODEL_FALLBACKS) {
    if (tried.includes(modelId)) continue;
    tried.push(modelId);
    try {
      return await geminiGenerateOnce({ ...input, modelId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(message);
      if (!shouldRetryWithNextModel(message)) throw lastError;
      console.warn(
        `[ai/gemini] ${modelId} failed (${message.slice(0, 160)}); trying next model`,
      );
    }
  }

  throw lastError ?? new Error("Gemini request failed on all models.");
}

/** Minimal JSON Schema for our tag result (Gemini responseJsonSchema). */
export const TAG_RESULT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tSec: { type: "number" },
          kind: {
            type: "string",
            enum: [...ALL_AI_TAG_KINDS],
          },
          label: { type: "string" },
          confidence: { type: "number" },
          opponent: { type: "boolean" },
          lowEvidence: { type: "boolean" },
          playerHints: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["tSec", "kind", "label", "confidence"],
      },
    },
    notes: { type: "string" },
    suggestedKickoffOffsetSec: { type: "number" },
  },
  required: ["drafts"],
};

export const SYNC_RESULT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceId: { type: "string" },
          offsetFromGameTime: { type: "number" },
          confidence: { type: "number" },
          note: { type: "string" },
        },
        required: ["sourceId", "offsetFromGameTime", "confidence"],
      },
    },
    notes: { type: "string" },
  },
  required: ["drafts"],
};

export async function geminiTagGame(input: {
  system: string;
  userText: string;
  youtubeVideoId?: string;
  videoClip?: { startSec: number; endSec: number };
}): Promise<{ object: AiTagResult; modelId: string }> {
  return geminiGenerateObject({
    system: input.system,
    userText: input.userText,
    youtubeVideoId: input.youtubeVideoId,
    videoClip: input.videoClip,
    schema: aiTagResultSchema,
    responseJsonSchema: TAG_RESULT_JSON_SCHEMA,
  });
}
