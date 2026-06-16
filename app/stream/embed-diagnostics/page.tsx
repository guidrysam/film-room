"use client";

import { useMemo } from "react";
import { YouTubeEmbedDiagnostics } from "@/components/YouTubeEmbedDiagnostics";

const CAMERAS_STORAGE_KEY = "filmRoomYouTubeCameras";

function readFirstReusableStreamId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(CAMERAS_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    const first = parsed[0] as { streamId?: unknown };
    const sid =
      typeof first.streamId === "string" ? first.streamId.trim() : "";
    return sid || undefined;
  } catch {
    return undefined;
  }
}

export default function EmbedDiagnosticsPage() {
  const reusableStreamId = useMemo(() => readFirstReusableStreamId(), []);

  return (
    <div className="min-h-screen px-4 py-14 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <YouTubeEmbedDiagnostics reusableStreamId={reusableStreamId} />
      </div>
    </div>
  );
}
