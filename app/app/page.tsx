"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle, signOutUser } from "@/lib/auth-google";
import { markRoomHost } from "@/lib/room-host";
import {
  listSavedSessions,
  type SavedSessionDoc,
} from "@/lib/saved-sessions";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [sessions, setSessions] = useState<
    Array<{ id: string; data: SavedSessionDoc }>
  >([]);
  const [listLoading, setListLoading] = useState(false);

  const refreshList = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    try {
      const rows = await listSavedSessions(user.uid);
      setSessions(rows);
    } finally {
      setListLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const startNewSession = () => {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      alert("Invalid YouTube link");
      return;
    }
    const roomId = Math.random().toString(36).substring(2, 8);
    markRoomHost(roomId);
    router.push(`/room/${roomId}?video=${encodeURIComponent(videoId)}`);
  };

  const loadSavedIntoRoom = (savedId: string, template: SavedSessionDoc) => {
    if (!template.clips.length) return;
    const idx = Math.min(
      Math.max(0, template.currentClipIndex),
      template.clips.length - 1,
    );
    const videoId = template.clips[idx]?.videoId;
    if (!videoId) return;
    const roomId = Math.random().toString(36).substring(2, 8);
    markRoomHost(roomId);
    router.push(
      `/room/${roomId}?video=${encodeURIComponent(videoId)}&loadSaved=${encodeURIComponent(savedId)}`,
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-white">
        <h1 className="mb-4 text-2xl font-semibold">Film Room</h1>
        <p className="mb-6 max-w-sm text-center text-sm text-gray-400">
          Sign in with Google to save sessions and open your dashboard.
        </p>
        <button
          type="button"
          onClick={() => void signInWithGoogle().catch(() => {})}
          className="mb-6 rounded-lg border border-white/20 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-100"
        >
          Sign in with Google
        </button>
        <Link
          href="/"
          className="text-sm text-gray-500 underline-offset-4 hover:text-gray-400 hover:underline"
        >
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Your sessions</h1>
          <div className="flex items-center gap-2 text-xs">
            <span className="truncate text-gray-400">{user.email}</span>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="rounded border border-white/15 px-2 py-1 text-gray-300 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mb-8 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs font-medium text-gray-400">
            Start new session
          </p>
          <input
            type="text"
            placeholder="Paste YouTube link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mb-3 w-full rounded border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={startNewSession}
            className="w-full rounded bg-blue-600 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            Start Film Session
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-400">Saved sessions</p>
            <button
              type="button"
              onClick={() => void refreshList()}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Refresh
            </button>
          </div>
          {listLoading ? (
            <p className="text-sm text-gray-500">Loading list…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No saved sessions yet. Save one from a live room (host).
            </p>
          ) : (
            <ul className="space-y-2">
              {sessions.map(({ id, data }) => (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{data.name}</p>
                    <p className="text-xs text-gray-500">
                      {data.updatedAt
                        ? data.updatedAt.toDate().toLocaleString()
                        : "—"}
                      {" · "}
                      {data.clips.length} clip
                      {data.clips.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadSavedIntoRoom(id, data)}
                    className="rounded border border-blue-500/40 bg-blue-600/30 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600/50"
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link
          href="/"
          className="mt-10 inline-block text-sm text-gray-500 underline-offset-4 hover:text-gray-400 hover:underline"
        >
          ← Home
        </Link>
      </div>
    </div>
  );
}
