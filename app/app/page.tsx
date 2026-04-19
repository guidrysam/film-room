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

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const linkBack =
  "text-sm text-zinc-500 transition hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

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
      <div className="flex min-h-screen items-center justify-center text-zinc-400">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-100">
        <div className="w-full max-w-sm text-center">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Film Room
          </p>
          <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-zinc-400">
            Sign in with Google to save sessions and open your dashboard.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle().catch(() => {})}
            className="mb-8 w-full rounded-xl border border-white/10 bg-white py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/30 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]"
          >
            Sign in with Google
          </button>
          <Link href="/" className={linkBack}>
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-6">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Film Room
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Your sessions
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="max-w-[180px] truncate text-zinc-500">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className={ghostBtn}
            >
              Sign out
            </button>
          </div>
        </div>

        <div className={`${panelClass} mb-8`}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Start new session
          </p>
          <input
            type="text"
            placeholder="Paste YouTube link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`${inputClass} mb-4`}
          />
          <button type="button" onClick={startNewSession} className={primaryBtn}>
            Start Film Session
          </button>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Saved sessions
            </p>
            <button
              type="button"
              onClick={() => void refreshList()}
              className="text-xs font-medium text-zinc-500 transition hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm"
            >
              Refresh
            </button>
          </div>
          {listLoading ? (
            <p className="text-sm text-zinc-500">Loading list…</p>
          ) : sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-500">
              No saved sessions yet. Save one from a live room (host).
            </p>
          ) : (
            <ul className="space-y-2.5">
              {sessions.map(({ id, data }) => (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-zinc-950/50 px-4 py-3 shadow-md shadow-black/25 ring-1 ring-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {data.name}
                    </p>
                    <p className="text-xs text-zinc-500">
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
                    className="shrink-0 rounded-lg border border-blue-500/35 bg-blue-600/25 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-blue-400/50 hover:bg-blue-600/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link href="/" className={`${linkBack} mt-12 inline-block`}>
          ← Home
        </Link>
      </div>
    </div>
  );
}
