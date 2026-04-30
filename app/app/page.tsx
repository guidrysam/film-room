"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle, signOutUser } from "@/lib/auth-google";
import { markRoomHost } from "@/lib/room-host";
import {
  deleteSavedSession,
  ensureSessionSharing,
  inferSavedSessionKind,
  listSavedSessions,
  savedSessionMatchesFilter,
  updateSavedSessionMetadata,
  type SavedSessionDoc,
  type SavedSessionFilterTab,
  type SavedSessionKind,
} from "@/lib/saved-sessions";
import { extractYouTubeVideoId } from "@/lib/youtube-id";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-50 placeholder:text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

const UNCATEGORIZED = "Uncategorized";

const filterTabBtn =
  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

function sessionKindBadgeClasses(kind: SavedSessionKind): string {
  switch (kind) {
    case "live_sync":
      return "border-rose-400/35 bg-rose-500/15 text-rose-100";
    case "sync":
      return "border-amber-400/30 bg-amber-500/15 text-amber-100";
    default:
      return "border-white/15 bg-white/[0.06] text-zinc-300";
  }
}

function sessionKindLabel(kind: SavedSessionKind): string {
  switch (kind) {
    case "live_sync":
      return "Live Sync";
    case "sync":
      return "Sync";
    default:
      return "Clip";
  }
}

function buildFolderGroups(
  rows: Array<{ id: string; data: SavedSessionDoc }>,
): Array<{
  folder: string;
  sessions: Array<{ id: string; data: SavedSessionDoc }>;
}> {
  const groups = new Map<
    string,
    Array<{ id: string; data: SavedSessionDoc }>
  >();
  for (const row of rows) {
    const label =
      typeof row.data.folder === "string" && row.data.folder.trim() !== ""
        ? row.data.folder.trim()
        : UNCATEGORIZED;
    const list = groups.get(label) ?? [];
    list.push(row);
    groups.set(label, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const tb = b.data.updatedAt?.toMillis?.() ?? 0;
      const ta = a.data.updatedAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
  }
  const folderNames = [...groups.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  return folderNames.map((folder) => ({
    folder,
    sessions: groups.get(folder)!,
  }));
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [sessions, setSessions] = useState<
    Array<{ id: string; data: SavedSessionDoc }>
  >([]);
  const [listLoading, setListLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [sessionFilter, setSessionFilter] =
    useState<SavedSessionFilterTab>("all");

  const filteredSessions = useMemo(
    () =>
      sessions.filter(({ data }) =>
        savedSessionMatchesFilter(data, sessionFilter),
      ),
    [sessions, sessionFilter],
  );

  const folderGroups = useMemo(
    () => buildFolderGroups(filteredSessions),
    [filteredSessions],
  );

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

  const handleShareTemplate = async (sessionId: string) => {
    if (!user) return;

    let shareId: string;
    try {
      shareId = await ensureSessionSharing(user.uid, sessionId);
    } catch (err) {
      console.error("[Share Template] ensureSessionSharing failed:", err);
      alert(
        `Could not enable sharing: ${errorMessage(err, "Unknown error while saving share settings.")}`,
      );
      return;
    }

    let shareUrl: string;
    try {
      if (typeof window === "undefined" || !window.location?.origin) {
        throw new Error("Browser location is not available.");
      }
      const origin = window.location.origin.trim();
      if (!origin) throw new Error("Empty window.location.origin.");
      shareUrl = `${origin}/shared/${encodeURIComponent(shareId)}`;
    } catch (err) {
      console.error("[Share Template] building URL failed:", err);
      alert(
        `Could not build share link: ${errorMessage(err, "Unknown error building URL.")}`,
      );
      return;
    }

    let clipboardOk = false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        clipboardOk = true;
      } catch (err) {
        console.error("[Share Template] clipboard.writeText failed:", err);
      }
    } else {
      console.warn(
        "[Share Template] navigator.clipboard.writeText not available; using prompt fallback.",
      );
    }

    if (clipboardOk) {
      alert("Template link copied");
    } else {
      window.prompt("Copy this link", shareUrl);
    }

    void refreshList();
  };

  const startEditSession = (id: string, data: SavedSessionDoc) => {
    setEditingId(id);
    setEditName(data.name);
    setEditFolder(data.folder?.trim() ?? "");
  };

  const cancelEditSession = () => {
    setEditingId(null);
    setEditName("");
    setEditFolder("");
    setEditSaving(false);
  };

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!user) return;
      if (
        !window.confirm(
          "Delete this session? This cannot be undone.",
        )
      ) {
        return;
      }
      const wasEditing = editingId === sessionId;
      try {
        await deleteSavedSession(user.uid, sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (wasEditing) {
          setEditingId(null);
          setEditName("");
          setEditFolder("");
          setEditSaving(false);
        }
      } catch (err) {
        console.error("[Dashboard] delete session failed:", err);
        alert(
          `Could not delete session: ${errorMessage(err, "Unknown error while deleting.")}`,
        );
      }
    },
    [user, editingId],
  );

  const saveEditSession = async (sessionId: string) => {
    if (!user) return;
    setEditSaving(true);
    try {
      await updateSavedSessionMetadata(user.uid, sessionId, {
        name: editName,
        folder: editFolder,
      });
      cancelEditSession();
      await refreshList();
    } catch (err) {
      console.error("[Dashboard] update session failed:", err);
      alert(
        `Could not update session: ${errorMessage(err, "Unknown error while saving.")}`,
      );
    } finally {
      setEditSaving(false);
    }
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
    const qs = new URLSearchParams();
    qs.set("video", videoId);
    qs.set("loadSaved", savedId);
    if (template.sourceType === "live") qs.set("view", "sync");
    router.push(`/room/${roomId}?${qs.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-50">
        <div className="w-full max-w-sm text-center">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Film Room
          </p>
          <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white">
            Dashboard
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-zinc-300">
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
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-6">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
              Film Room
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Your sessions
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="max-w-[180px] truncate text-zinc-400">
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Saved sessions
            </p>
            <button
              type="button"
              onClick={() => void refreshList()}
              className="text-xs font-medium text-zinc-400 transition hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm"
            >
              Refresh
            </button>
          </div>
          {listLoading ? (
            <p className="text-sm text-zinc-400">Loading list…</p>
          ) : sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-400">
              No saved sessions yet. Save one from a live room (host).
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["clip", "Clip"],
                    ["sync", "Sync"],
                    ["live_sync", "Live Sync"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSessionFilter(key)}
                    className={`${filterTabBtn} ${
                      sessionFilter === key
                        ? "border-blue-500/45 bg-blue-600/25 text-white"
                        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {filteredSessions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-400">
                  No sessions match this filter.
                </p>
              ) : (
            <div className="space-y-8">
              {folderGroups.map(({ folder, sessions: groupSessions }) => (
                <section key={folder}>
                  <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-300">
                    {folder}
                  </h2>
                  <ul className="space-y-2.5">
                    {groupSessions.map(({ id, data }) => {
                      const kind = inferSavedSessionKind(data);
                      return (
                      <li
                        key={id}
                        className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-zinc-950/50 px-4 py-3 shadow-md shadow-black/25 ring-1 ring-white/[0.03]"
                      >
                        {editingId === id ? (
                          <>
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                              Name
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className={`${inputClass} mt-1`}
                              />
                            </label>
                            <label className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                              Program / folder
                              <span className="ml-1 font-normal normal-case text-zinc-500">
                                (optional)
                              </span>
                              <input
                                type="text"
                                value={editFolder}
                                onChange={(e) => setEditFolder(e.target.value)}
                                placeholder="Leave empty for Uncategorized"
                                className={`${inputClass} mt-1`}
                              />
                            </label>
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEditSession}
                                className={ghostBtn}
                                disabled={editSaving}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveEditSession(id)}
                                disabled={editSaving}
                                className="rounded-lg border border-blue-500/35 bg-blue-600/35 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-blue-400/50 hover:bg-blue-600/55 disabled:opacity-50"
                              >
                                {editSaving ? "Saving…" : "Save changes"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-white">
                                  {data.name}
                                </p>
                                <span
                                  className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${sessionKindBadgeClasses(kind)}`}
                                >
                                  {sessionKindLabel(kind)}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400">
                                {data.updatedAt
                                  ? data.updatedAt.toDate().toLocaleString()
                                  : "—"}
                                {" · "}
                                {data.clips.length} clip
                                {data.clips.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditSession(id, data)}
                                className={ghostBtn}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleShareTemplate(id)}
                                className={ghostBtn}
                              >
                                Share Template
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteSession(id)}
                                className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => loadSavedIntoRoom(id, data)}
                                className="rounded-lg border border-blue-500/35 bg-blue-600/25 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-blue-400/50 hover:bg-blue-600/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                              >
                                Load
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                    })}
                  </ul>
                </section>
              ))}
                </div>
              )}
            </>
          )}
        </div>

        <Link href="/" className={`${linkBack} mt-12 inline-block`}>
          ← Home
        </Link>
      </div>
    </div>
  );
}
