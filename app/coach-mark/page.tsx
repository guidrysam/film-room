"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SPORTS,
  getSportById,
  readPreferredSportId,
  writePreferredSportId,
} from "@/lib/sports";
import {
  type CoachTimeline,
  type CoachTimelineEvent,
  clearDraft,
  formatClock,
  newId,
  readDraft,
  saveTimeline,
  writeDraft,
} from "@/lib/timelines";
import { useHydrated } from "@/lib/use-hydrated";

const cardClass =
  "w-full rounded-2xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-6";

const selectClass =
  "w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/35";

const ghostLink =
  "text-sm text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm";

function buzz(ms = 18): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(ms);
    }
  } catch {
    /* unsupported */
  }
}

export default function CoachMarkPage() {
  const hydrated = useHydrated();
  // Resume any in-progress draft (survives refresh / accidental close).
  const [sportId, setSportId] = useState<string>(
    () => readDraft()?.sportId ?? readPreferredSportId(),
  );
  const [startedAt, setStartedAt] = useState<number | null>(
    () => readDraft()?.startedAt ?? null,
  );
  const [events, setEvents] = useState<CoachTimelineEvent[]>(
    () => readDraft()?.events ?? [],
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [saved, setSaved] = useState<CoachTimeline | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Persist the live draft whenever it changes.
  useEffect(() => {
    if (saved) return;
    if (startedAt === null && events.length === 0) {
      clearDraft();
      return;
    }
    writeDraft({ sportId, startedAt, events });
  }, [sportId, startedAt, events, saved]);

  // Tick the clock while recording.
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // Keep the screen awake during a live game (best effort).
  useEffect(() => {
    if (startedAt === null) return;
    let cancelled = false;
    const request = async () => {
      try {
        const wl = (navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
        }).wakeLock;
        if (!wl) return;
        const sentinel = await wl.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        /* denied / unsupported */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [startedAt]);

  const sport = getSportById(sportId);
  const elapsedSec = startedAt === null ? 0 : (now - startedAt) / 1000;
  const recording = startedAt !== null;

  const handleSportChange = useCallback((id: string) => {
    setSportId(id);
    writePreferredSportId(id);
  }, []);

  const handleStart = useCallback(() => {
    buzz();
    setStartedAt(Date.now());
    setNow(Date.now());
  }, []);

  const handleMark = useCallback(
    (label: string) => {
      buzz();
      const ts = startedAt ?? Date.now();
      // Auto-start the clock on the first mark if the coach forgot to press Start.
      if (startedAt === null) {
        setStartedAt(ts);
        setNow(ts);
      }
      const offsetSec = Math.max(0, (Date.now() - ts) / 1000);
      setEvents((prev) => [...prev, { id: newId("ev"), label, offsetSec }]);
    },
    [startedAt],
  );

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleDiscard = useCallback(() => {
    if (events.length > 0 && !window.confirm("Discard this timeline?")) return;
    setStartedAt(null);
    setEvents([]);
    clearDraft();
  }, [events.length]);

  const handleFinish = useCallback(() => {
    if (events.length === 0) {
      window.alert("Mark at least one event before saving.");
      return;
    }
    const sportName = getSportById(sportId).name;
    const dateLabel = new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const suggested = `${sportName} • ${dateLabel}`;
    const name = window.prompt("Name this timeline", suggested);
    if (name === null) return;
    const finalName = name.trim() || suggested;
    const durationSec = Math.max(
      elapsedSec,
      ...events.map((e) => e.offsetSec),
      0,
    );
    const timeline: CoachTimeline = {
      id: newId("tl"),
      name: finalName,
      sportId,
      createdAt: startedAt ?? Date.now(),
      savedAt: Date.now(),
      durationSec,
      events: [...events].sort((a, b) => a.offsetSec - b.offsetSec),
    };
    saveTimeline(timeline);
    clearDraft();
    setSaved(timeline);
    setStartedAt(null);
    setEvents([]);
  }, [events, sportId, startedAt, elapsedSec]);

  const recent = [...events].reverse();

  if (!hydrated) {
    return <main className="min-h-screen" aria-hidden />;
  }

  if (saved) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-12 text-white">
        <div className={cardClass}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/90">
            Timeline saved
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{saved.name}</h1>
          <p className="mt-2 text-sm text-white/70">
            {saved.events.length} marks · {formatClock(saved.durationSec)} long
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Next, open Line Up Videos, paste the recorded video link, and line
            it up with this timeline.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href={`/timeline-sync?timeline=${encodeURIComponent(saved.id)}`}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500"
            >
              Sync with a video
            </Link>
            <button
              type="button"
              onClick={() => setSaved(null)}
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.10]"
            >
              Record another timeline
            </button>
          </div>
        </div>
        <div className="text-center">
          <Link href="/" className={ghostLink}>
            Back to Film Room
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-8 text-white">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tag Plays</h1>
          <p className="text-sm text-white/65">
            Tap an event the moment it happens. Line it up with the video later.
          </p>
        </div>
        <Link href="/" className={ghostLink}>
          Exit
        </Link>
      </header>

      <section className={cardClass}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/55">
              Sport
            </span>
            <select
              value={sportId}
              onChange={(e) => handleSportChange(e.target.value)}
              className={selectClass}
            >
              {SPORTS.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-900">
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col items-center rounded-xl border border-white/10 bg-black/30 px-5 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
              {recording ? "Recording" : "Game clock"}
            </span>
            <span className="font-mono text-3xl font-semibold tabular-nums text-white">
              {formatClock(elapsedSec)}
            </span>
          </div>
        </div>

        {!recording ? (
          <button
            type="button"
            onClick={handleStart}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            Start timeline
          </button>
        ) : (
          <div className="mt-5 flex items-center gap-2">
            <span className="flex items-center gap-2 text-xs font-medium text-emerald-300">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
              Live · {events.length} marks
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.10]"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="rounded-lg border border-blue-500/45 bg-blue-600/90 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
              >
                Finish &amp; save
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-white/55">
          {sport.name} events
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sport.events.map((ev) => (
            <button
              key={ev.label}
              type="button"
              onClick={() => handleMark(ev.label)}
              className="flex min-h-[72px] items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-4 text-center text-base font-semibold text-white shadow-sm transition active:scale-[0.97] active:bg-blue-600/30 hover:border-white/25 hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
            >
              {ev.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/45">
          No video needed — just mark events as they happen.
        </p>
      </section>

      <section className={cardClass}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            Marks ({events.length})
          </div>
        </div>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">
            No marks yet. Tap an event button above.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {recent.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2"
              >
                <span className="font-medium text-white">{e.label}</span>
                <span className="ml-auto font-mono text-sm tabular-nums text-white/60">
                  {formatClock(e.offsetSec)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveEvent(e.id)}
                  aria-label={`Remove ${e.label}`}
                  className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-white/55 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-white"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="text-center">
        <Link href="/timeline-sync" className={ghostLink}>
          Open Line Up Videos
        </Link>
      </div>
    </main>
  );
}
