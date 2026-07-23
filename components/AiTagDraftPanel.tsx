"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  addGameEvent,
  updateGameSourceSync,
  type Game,
  type GameVideoSource,
} from "@/lib/games";
import {
  isPrimaryTagKind,
  type AiSyncDraft,
  type AiTagDraft,
  type AiTagKind,
} from "@/lib/ai/tag-schema";
import {
  SYNC_CREDITS_PER_ANGLE,
  tagCreditsForDurationSec,
} from "@/lib/billing/pricing";
import { isAiCreditsPurchaseEnabledPublic } from "@/lib/billing/flags";
import { formatTimelineSeconds } from "@/lib/game-timeline";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";
const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "rounded-lg border border-rose-500/25 bg-rose-950/20 px-2 py-1 text-[10px] font-medium text-rose-200 transition hover:border-rose-500/40 disabled:opacity-50";

export type AiTagDraftPanelProps = {
  game: Game;
  sources: GameVideoSource[];
  currentUid: string;
  currentDisplayName?: string | null;
  canEdit: boolean;
  selectedSourceId: string | null;
  onSeekGameTime: (tSec: number) => void;
  onRefresh: () => void;
};

type DraftRow = AiTagDraft & { key: string; status: "pending" | "approved" | "rejected" };

function kindLabel(kind: AiTagKind): string {
  switch (kind) {
    case "kickoff":
      return "Kickoff";
    case "half_end":
      return "Half end";
    case "half_start":
      return "Half start";
    case "full_time":
      return "Full time";
    case "goal":
      return "Goal";
    default:
      return kind;
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export default function AiTagDraftPanel({
  game,
  sources,
  currentUid,
  currentDisplayName,
  canEdit,
  selectedSourceId,
  onSeekGameTime,
  onRefresh,
}: AiTagDraftPanelProps) {
  const purchaseEnabled = isAiCreditsPurchaseEnabledPublic();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<"tag" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagJobId, setTagJobId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [syncDrafts, setSyncDrafts] = useState<AiSyncDraft[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [selectedSyncIds, setSelectedSyncIds] = useState<string[]>([]);

  const youtubeSources = useMemo(
    () =>
      sources.filter(
        (s) =>
          (s.kind === "youtube" || s.kind === "youtube_live") &&
          typeof s.videoId === "string" &&
          s.videoId.length === 11,
      ),
    [sources],
  );

  const primary =
    youtubeSources.find((s) => s.id === selectedSourceId) ??
    youtubeSources[0] ??
    null;

  const secondaries = useMemo(
    () => youtubeSources.filter((s) => s.id !== primary?.id),
    [youtubeSources, primary?.id],
  );

  const tagEstimate = tagCreditsForDurationSec(
    primary?.durationSec && primary.durationSec > 0
      ? primary.durationSec
      : 5400,
  );
  const syncEstimate =
    (selectedSyncIds.length || secondaries.length) * SYNC_CREDITS_PER_ANGLE;

  const refreshBalance = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const qs = game.clubId
        ? `clubId=${encodeURIComponent(game.clubId)}`
        : `gameId=${encodeURIComponent(game.id)}`;
      const res = await fetch(`/api/billing/balance?${qs}`, { headers });
      const data = (await res.json()) as {
        balance?: number;
        error?: string;
      };
      if (res.ok && typeof data.balance === "number") {
        setBalance(data.balance);
      }
    } catch {
      /* ignore */
    }
  }, [game.clubId, game.id]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    setSelectedSyncIds(secondaries.map((s) => s.id));
  }, [secondaries]);

  const runTag = useCallback(async () => {
    if (!canEdit || !primary) return;
    setBusy("tag");
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/ai/tag-game", {
        method: "POST",
        headers,
        body: JSON.stringify({
          gameId: game.id,
          sourceId: primary.id,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        jobId?: string;
        drafts?: AiTagDraft[];
        notes?: string;
        balance?: number;
        estimate?: number;
      };
      if (!res.ok) {
        throw new Error(data.message || data.error || "Tag failed.");
      }
      setTagJobId(data.jobId ?? null);
      setDrafts(
        (data.drafts ?? []).map((d, i) => ({
          ...d,
          key: `${d.kind}-${d.tSec}-${i}`,
          status: "pending" as const,
        })),
      );
      setNotes(data.notes ?? null);
      if (typeof data.balance === "number") setBalance(data.balance);
      else void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tag failed.");
    } finally {
      setBusy(null);
    }
  }, [canEdit, primary, game.id, refreshBalance]);

  const runSync = useCallback(async () => {
    if (!canEdit || !primary) return;
    const ids =
      selectedSyncIds.length > 0
        ? selectedSyncIds
        : secondaries.map((s) => s.id);
    if (ids.length === 0) {
      setError("Add another YouTube angle before syncing.");
      return;
    }
    const landmarks = drafts
      .filter((d) => d.status !== "rejected")
      .map(({ key: _k, status: _s, ...rest }) => rest);
    if (landmarks.length === 0 && !tagJobId) {
      setError("Run AI Tag first (or keep draft landmarks) before sync.");
      return;
    }
    setBusy("sync");
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/ai/sync-angles", {
        method: "POST",
        headers,
        body: JSON.stringify({
          gameId: game.id,
          primarySourceId: primary.id,
          sourceIds: ids,
          ...(tagJobId ? { tagJobId } : {}),
          ...(landmarks.length ? { landmarks } : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        drafts?: AiSyncDraft[];
        notes?: string;
        balance?: number;
      };
      if (!res.ok) {
        throw new Error(data.message || data.error || "Sync failed.");
      }
      setSyncDrafts(data.drafts ?? []);
      if (data.notes) setNotes(data.notes);
      if (typeof data.balance === "number") setBalance(data.balance);
      else void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(null);
    }
  }, [
    canEdit,
    primary,
    selectedSyncIds,
    secondaries,
    drafts,
    tagJobId,
    game.id,
    refreshBalance,
  ]);

  const approveDraft = useCallback(
    async (row: DraftRow) => {
      if (!canEdit) return;
      const label =
        row.kind === "goal"
          ? row.opponent
            ? `Goal (opponent): ${row.label}`
            : `Goal: ${row.label}`
          : row.label || kindLabel(row.kind);
      await addGameEvent(
        game.id,
        {
          type: row.kind === "goal" ? "coach_mark" : "coach_mark",
          t: Math.max(0, Math.round(row.tSec)),
          label,
          sourceId: primary?.id,
          payload: {
            aiKind: row.kind,
            confidence: row.confidence,
            ...(row.opponent ? { opponent: true } : {}),
            ...(row.kind === "goal" ? { statType: "goal" } : {}),
            ...(row.lowEvidence ? { lowEvidence: true } : {}),
          },
          createdBy: currentUid,
          createdByName: currentDisplayName ?? undefined,
        },
        { actorUid: currentUid },
      );
      setDrafts((prev) =>
        prev.map((d) =>
          d.key === row.key ? { ...d, status: "approved" } : d,
        ),
      );
      onRefresh();
    },
    [
      canEdit,
      game.id,
      primary?.id,
      currentUid,
      currentDisplayName,
      onRefresh,
    ],
  );

  const rejectDraft = useCallback((row: DraftRow) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.key === row.key ? { ...d, status: "rejected" } : d,
      ),
    );
  }, []);

  const applySyncDraft = useCallback(
    async (draft: AiSyncDraft) => {
      if (!canEdit) return;
      await updateGameSourceSync(game.id, draft.sourceId, {
        offsetFromGameTime: draft.offsetFromGameTime,
        syncStatus: "manually_synced",
        syncConfidence:
          draft.confidence >= 0.75
            ? "high"
            : draft.confidence >= 0.45
              ? "medium"
              : "low",
      });
      setSyncDrafts((prev) =>
        prev.filter((d) => d.sourceId !== draft.sourceId),
      );
      onRefresh();
    },
    [canEdit, game.id, onRefresh],
  );

  if (!canEdit) return null;

  return (
    <section className={panelClass}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          AI Tag / Sync
        </p>
        {!purchaseEnabled ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
            Test mode
          </span>
        ) : null}
      </div>

      <p className="mb-3 text-[11px] leading-snug text-zinc-500">
        Tag one primary angle (kickoff, half, end, goals), then skim-sync other
        parent cams. Credits debit on success.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
        <span>
          Balance:{" "}
          <span className="font-mono text-zinc-200">
            {balance == null ? "…" : balance}
          </span>
        </span>
        <span>
          Tag ≈{" "}
          <span className="font-mono text-zinc-200">{tagEstimate}</span> cr
        </span>
        <span>
          Sync ≈{" "}
          <span className="font-mono text-zinc-200">{syncEstimate}</span> cr
        </span>
      </div>

      {!purchaseEnabled ? (
        <p className="mb-3 text-[10px] leading-snug text-amber-200/90">
          Purchase is off. Club admins can grant test credits from the club hub
          or{" "}
          <code className="text-amber-100">
            npx tsx scripts/ai/grant-test-credits.ts
          </code>
          .
        </p>
      ) : null}

      {youtubeSources.length === 0 ? (
        <p className="text-[11px] text-zinc-500">
          Add a YouTube source before running AI Tag.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryBtn}
            disabled={busy !== null || !primary}
            onClick={() => void runTag()}
          >
            {busy === "tag" ? "Tagging…" : "AI Tag primary"}
          </button>
          <button
            type="button"
            className={ghostBtn}
            disabled={busy !== null || secondaries.length === 0}
            onClick={() => void runSync()}
          >
            {busy === "sync" ? "Syncing…" : "AI Sync angles"}
          </button>
        </div>
      )}

      {secondaries.length > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-medium text-zinc-500">
            Sync targets ({selectedSyncIds.length})
          </p>
          {secondaries.map((s) => {
            const checked = selectedSyncIds.includes(s.id);
            return (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelectedSyncIds((prev) =>
                      checked
                        ? prev.filter((id) => id !== s.id)
                        : [...prev, s.id],
                    );
                  }}
                />
                <span className="truncate">{s.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-[11px] text-rose-300">{error}</p>
      ) : null}
      {notes ? (
        <p className="mt-2 text-[10px] text-zinc-500">{notes}</p>
      ) : null}

      {drafts.length > 0 ? (
        <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
          {drafts.map((d) => (
            <li
              key={d.key}
              className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => onSeekGameTime(d.tSec)}
                >
                  <span className="block text-xs font-medium text-white">
                    {kindLabel(d.kind)}
                    {isPrimaryTagKind(d.kind) ? "" : " · bonus"}
                    {d.lowEvidence ? " · low evidence" : ""}
                  </span>
                  <span className="block font-mono text-[10px] text-zinc-500">
                    {formatTimelineSeconds(d.tSec)} · conf{" "}
                    {Math.round(d.confidence * 100)}%
                  </span>
                  <span className="block truncate text-[10px] text-zinc-400">
                    {d.label}
                  </span>
                </button>
                {d.status === "pending" ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={primaryBtn}
                      onClick={() => void approveDraft(d)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={dangerBtn}
                      onClick={() => rejectDraft(d)}
                    >
                      Reject
                    </button>
                  </span>
                ) : (
                  <span className="text-[10px] capitalize text-zinc-500">
                    {d.status}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {syncDrafts.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          <p className="text-[10px] font-medium text-zinc-500">Sync drafts</p>
          {syncDrafts.map((d) => {
            const src = sources.find((s) => s.id === d.sourceId);
            return (
              <li
                key={d.sourceId}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-white">
                    {src?.label ?? d.sourceId}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    offset {d.offsetFromGameTime >= 0 ? "+" : ""}
                    {d.offsetFromGameTime}s · conf{" "}
                    {Math.round(d.confidence * 100)}%
                  </p>
                  {d.note ? (
                    <p className="text-[10px] text-zinc-400">{d.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={() => void applySyncDraft(d)}
                >
                  Apply
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
