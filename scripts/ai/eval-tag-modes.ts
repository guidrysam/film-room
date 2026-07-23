/**
 * Offline eval: run Gemini tag modes against a public YouTube video.
 *
 * Usage:
 *   npx tsx scripts/ai/eval-tag-modes.ts --video VIDEO_ID [--mode basic|advanced|pro]
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY (or AI_GATEWAY_API_KEY).
 * Video should be public for the YouTube URL path.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { aiTagResultSchema } from "../../lib/ai/tag-schema";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

const MODES: Record<string, { model: string; label: string }> = {
  basic: { model: "gemini-2.5-flash", label: "Flash basic (primary events)" },
  advanced: {
    model: "gemini-2.5-flash",
    label: "Flash advanced (allow bonus events)",
  },
  pro: { model: "gemini-2.5-pro", label: "Pro full" },
};

async function main(): Promise<void> {
  const videoId = arg("video")?.trim();
  const modeKey = (arg("mode")?.trim() || "basic").toLowerCase();
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    console.error("Usage: --video <11-char YouTube id> [--mode basic|advanced|pro]");
    process.exit(1);
  }
  const mode = MODES[modeKey];
  if (!mode) {
    console.error(`Unknown mode ${modeKey}. Use basic|advanced|pro.`);
    process.exit(1);
  }

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    console.error("Set GOOGLE_GENERATIVE_AI_API_KEY or AI_GATEWAY_API_KEY.");
    process.exit(1);
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google(mode.model);

  const bonus =
    modeKey === "advanced" || modeKey === "pro"
      ? "Include extended events when clear: shot, save, corner, defensive_stop, offensive_opportunity, turnover, coach_mark."
      : "Primary: kickoff, half_end, half_start, full_time, goal. Also include clear extended events (shot, save, corner, defensive_stop, offensive_opportunity, turnover) when confidence is high.";

  const started = Date.now();
  console.log(`Mode: ${mode.label} (${mode.model})`);
  console.log(`Video: https://www.youtube.com/watch?v=${videoId}`);

  const result = await generateObject({
    model,
    schema: aiTagResultSchema,
    system: `You tag soccer game film. ${bonus} Timestamps are seconds from video start.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Tag primary timeline events for this match video.",
          },
          {
            type: "file",
            data: new URL(`https://www.youtube.com/watch?v=${videoId}`),
            mediaType: "video/mp4",
          },
        ],
      },
    ],
  });

  const elapsedMs = Date.now() - started;
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: modeKey,
        model: mode.model,
        elapsedMs,
        draftCount: result.object.drafts.length,
        result: result.object,
        usage: result.usage,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
