import "server-only";

import { z } from "zod";
import {
  DEFAULT_AI_TAG_MODEL,
  resolveAiModelId,
} from "@/lib/ai/google-model";
import {
  aiTagResultSchema,
  type AiTagResult,
} from "@/lib/ai/tag-schema";

function apiKey(): string {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) throw new Error("MISSING_AI_API_KEY");
  return key;
}

function modelResourceName(preferred?: string | null): string {
  const id = resolveAiModelId(preferred, DEFAULT_AI_TAG_MODEL);
  return id.startsWith("models/") ? id : `models/${id}`;
}

type GeminiPart =
  | { text: string }
  | { fileData: { fileUri: string; mimeType: string } };

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; status?: string; code?: number };
};

/**
 * Call Gemini generateContent with an explicit model resource name.
 * Avoids AI SDK / env surprises that were still hitting retired gemini-1.5-flash.
 */
export async function geminiGenerateObject<T>(input: {
  modelId?: string | null;
  system: string;
  userText: string;
  youtubeVideoId?: string;
  schema: z.ZodType<T>;
  /** JSON Schema object for responseJsonSchema (Gemini structured output). */
  responseJsonSchema: Record<string, unknown>;
}): Promise<{ object: T; modelId: string }> {
  const modelPath = modelResourceName(input.modelId);
  const modelId = modelPath.replace(/^models\//, "");
  const parts: GeminiPart[] = [{ text: input.userText }];
  if (input.youtubeVideoId) {
    parts.push({
      fileData: {
        fileUri: `https://www.youtube.com/watch?v=${input.youtubeVideoId}`,
        mimeType: "video/mp4",
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey())}`;
  const body = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: input.responseJsonSchema,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GeminiGenerateResponse;
  if (!res.ok) {
    const msg =
      json.error?.message ||
      `Gemini HTTP ${res.status} for ${modelPath}`;
    throw new Error(msg);
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
  return { object, modelId };
}

/** Minimal JSON Schema for our tag result (Gemini responseJsonSchema). */
export const TAG_RESULT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      maxItems: 120,
      items: {
        type: "object",
        properties: {
          tSec: { type: "number" },
          kind: {
            type: "string",
            enum: [
              "kickoff",
              "half_end",
              "half_start",
              "full_time",
              "goal",
              "shot",
              "save",
              "corner",
              "defensive_stop",
              "offensive_opportunity",
              "turnover",
              "coach_mark",
            ],
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
      maxItems: 20,
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
}): Promise<{ object: AiTagResult; modelId: string }> {
  return geminiGenerateObject({
    modelId: process.env.AI_TAG_MODEL,
    system: input.system,
    userText: input.userText,
    youtubeVideoId: input.youtubeVideoId,
    schema: aiTagResultSchema,
    responseJsonSchema: TAG_RESULT_JSON_SCHEMA,
  });
}
