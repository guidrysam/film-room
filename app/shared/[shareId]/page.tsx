"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";
import {
  duplicateSessionToMyLibrary,
  getSavedSessionByShareId,
  type SavedClip,
  type SavedSessionDoc,
} from "@/lib/saved-sessions";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-sm";

const primaryBtn =
  "rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

function formatClipLabel(clip: SavedClip, index: number): string {
  const t = clip.label?.trim();
  if (t) return t;
  return `Clip ${index + 1}`;
}

function formatChapterTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function SharedTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const shareId = typeof params.shareId === "string" ? params.shareId : "";
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<SavedSessionDoc | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shareId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const row = await getSavedSessionByShareId(shareId);
        if (cancelled) return;
        if (!row) {
          setNotFound(true);
          setTemplate(null);
        } else {
          setTemplate(row.data);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setTemplate(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const handleSaveToLibrary = useCallback(async () => {
    if (!user || !template) return;
    setSaving(true);
    try {
      await duplicateSessionToMyLibrary(user.uid, template);
      alert("Saved to your library");
      router.push("/app");
    } catch {
      alert("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [user, template, router]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030306] text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (notFound || !template) {
    return (
      <div className="min-h-screen bg-[#030306] px-4 py-16 text-zinc-50">
        <div className="mx-auto w-full max-w-lg">
          <div className={panelClass}>
            <h1 className="mb-2 text-lg font-semibold text-white">
              Template not found
            </h1>
            <p className="mb-6 text-sm text-zinc-400">
              This link may be invalid or sharing may have been turned off.
            </p>
            <Link href="/" className={linkBack}>
              ← Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030306] px-4 py-10 text-zinc-50">
      <div className="mx-auto w-full max-w-lg">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
          Shared template
        </p>
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-white">
          {template.name}
        </h1>

        <div className={`${panelClass} mb-6`}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Clips
          </p>
          {template.clips.length === 0 ? (
            <p className="text-sm text-zinc-500">No clips</p>
          ) : (
            <ul className="space-y-2">
              {template.clips.map((c, i) => (
                <li
                  key={`${c.videoId}-${i}`}
                  className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-zinc-100">
                    {formatClipLabel(c, i)}
                  </span>
                  <span className="ml-2 font-mono text-xs text-zinc-500">
                    {c.videoId}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${panelClass} mb-8`}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Chapters
          </p>
          {template.chapters.length === 0 ? (
            <p className="text-sm text-zinc-500">No chapters</p>
          ) : (
            <ul className="space-y-2">
              {template.chapters.map((ch, i) => (
                <li
                  key={`${ch.videoId}-${ch.time}-${ch.label}-${i}`}
                  className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-zinc-200"
                >
                  <span className="font-medium text-white">{ch.label}</span>
                  <span className="ml-2 font-mono text-xs text-zinc-400">
                    {formatChapterTime(ch.time)}
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-zinc-500">
                    {ch.videoId.slice(0, 8)}…
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveToLibrary()}
              className={primaryBtn}
            >
              {saving ? "Saving…" : "Save to My Library"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void signInWithGoogle().catch(() => {})}
                className={primaryBtn}
              >
                Sign in to save
              </button>
              <p className="text-xs text-zinc-500">
                Sign in with Google to copy this template into your library.
              </p>
            </>
          )}
        </div>

        <Link href="/" className={`${linkBack} mt-10 inline-block`}>
          ← Home
        </Link>
      </div>
    </div>
  );
}
