"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  addGameEvent,
  updateGameSourceSync,
  updateGameSourceYouTubeMetadata,
  type Game,
  type GameVideoSource,
} from "@/lib/games";
import {
  isPrimaryTagKind,
  type AiSyncDraft,
  type AiTagDraft,
  type AiTagKind,
  statTypeForAiTagKind,
} from "@/lib/ai/tag-schema";
import { isBasketballSport } from "@/lib/sports";
import {
  SYNC_CREDITS_PER_ANGLE,
  tagCreditsForDurationSec,
} from "@/lib/billing/pricing";
import { isAiCreditsPurchaseEnabledPublic } from "@/lib/billing/flags";
import { formatTimelineSeconds } from "@/lib/game-timeline";
import {
  GEMINI_YOUTUBE_PUBLIC_REQUIRED,
  normalizeYoutubePrivacy,
} from "@/lib/ai/youtube-gemini-access";
import { youtubeVideoIdForAnalysis } from "@/lib/ai/youtube-source";
import { buildTagAnchorHints } from "@/lib/ai/tag-anchors";
import {
  fetchYouTubeVideoMeta,
  metaToSourcePatch,
} from "@/lib/youtube-video-meta-client";

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
  events?: Array<{
    t: number;
    type?: string;
    label?: string;
    payload?: Record<string, unknown> | null;
  }>;
  currentUid: string;
  currentDisplayName?: string | null;
  canEdit: boolean;
  selectedSourceId: string | null;
  onSeekGameTime: (tSec: number) => void;
  /** Refresh timeline after approving a draft (do not remount the page). */
  onEventsChanged: () => void;
  onRefresh: () => void;
};

type DraftRow = AiTagDraft & { key: string; status: "pending" | "approved" | "rejected" };

function kindLabel(kind: AiTagKind, basketball: boolean): string {
  if (basketball) {
    switch (kind) {
      case "tipoff":
        return "Tipoff";
      case "period_end":
        return "Period end";
      case "period_start":
        return "Period start";
      case "full_time":
        return "Full time";
      case "field_goal":
      case "goal":
        return "Bucket";
      case "three_pointer":
        return "3PT";
      case "shot":
        return "Shot";
      case "rebound":
        return "Rebound";
      case "block":
      case "save":
        return "Block";
      case "steal":
      case "defensive_stop":
        return "Steal";
      case "assist":
        return "Assist";
      case "foul":
        return "Foul";
      case "open_look":
      case "offensive_opportunity":
        return "Open look";
      case "turnover":
        return "Turnover";
      case "coach_mark":
        return "Coach mark";
      default:
        return kind.replace(/_/g, " ");
    }
  }
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
    case "shot":
      return "Shot";
    case "save":
      return "Save";
    case "corner":
      return "Corner";
    case "defensive_stop":
      return "Defensive stop";
    case "offensive_opportunity":
      return "Offensive opportunity";
    case "turnover":
      return "Turnover";
    default:
      return kind.replace(/_/g, " ");
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

function draftMatchesEvent(
  draft: AiTagDraft,
  events: Array<{ t: number; payload?: Record<string, unknown> | null }>,
): boolean {
  return events.some((ev) => {
    if (Math.abs(ev.t - draft.tSec) > 2) return false;
    const aiKind = ev.payload?.aiKind;
    return typeof aiKind === "string" && aiKind === draft.kind;
  });
}

function rowsFromDrafts(
  list: AiTagDraft[],
  events: Array<{ t: number; payload?: Record<string, unknown> | null }>,
): DraftRow[] {
  return list.map((d, i) => ({
    ...d,
    key: `${d.kind}-${d.tSec}-${i}`,
    status: draftMatchesEvent(d, events) ? ("approved" as const) : ("pending" as const),
  }));
}

export default function AiTagDraftPanel({
  game,
  sources,
  events = [],
  currentUid,
  currentDisplayName,
  canEdit,
  selectedSourceId,
  onSeekGameTime,
  onEventsChanged,
  onRefresh,
}: AiTagDraftPanelProps) {
  const basketball = isBasketballSport(game.sport);
  const purchaseEnabled = isAiCreditsPurchaseEnabledPublic();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<"tag" | "sync" | "grant" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagJobId, setTagJobId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [syncDrafts, setSyncDrafts] = useState<AiSyncDraft[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [selectedSyncIds, setSelectedSyncIds] = useState<string[]>([]);
  const [livePrivacyBySourceId, setLivePrivacyBySourceId] = useState<
    Record<string, string>
  >({});
  const [privacyRefreshing, setPrivacyRefreshing] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);

  const youtubeSources = useMemo(
    () => sources.filter((s) => youtubeVideoIdForAnalysis(s) != null),
    [sources],
  );

  const primary =
    youtubeSources.find((s) => s.id === selectedSourceId) ??
    youtubeSources[0] ??
    null;

  const knownMarkCount = useMemo(() => {
    const offset =
      typeof primary?.offsetFromGameTime === "number" &&
      Number.isFinite(primary.offsetFromGameTime)
        ? primary.offsetFromGameTime
        : 0;
    return buildTagAnchorHints(events, {
      sourceOffsetFromGameTime: offset,
    }).length;
  }, [events, primary?.offsetFromGameTime]);

  const gameCapMarkCount = useMemo(() => {
    const offset =
      typeof primary?.offsetFromGameTime === "number" &&
      Number.isFinite(primary.offsetFromGameTime)
        ? primary.offsetFromGameTime
        : 0;
    return buildTagAnchorHints(events, {
      sourceOffsetFromGameTime: offset,
    }).filter((a) => a.source === "gamecap").length;
  }, [events, primary?.offsetFromGameTime]);

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

  const nonPublicAngles = useMemo(() => {
    return youtubeSources.filter((s) => {
      const live = livePrivacyBySourceId[s.id];
      const p = normalizeYoutubePrivacy(live ?? s.youtubePrivacyStatus);
      return p === "unlisted" || p === "private";
    });
  }, [youtubeSources, livePrivacyBySourceId]);

  const refreshLivePrivacy = useCallback(async () => {
    if (youtubeSources.length === 0) return;
    setPrivacyRefreshing(true);
    try {
      const next: Record<string, string> = {};
      for (const s of youtubeSources) {
        const videoId = youtubeVideoIdForAnalysis(s);
        if (!videoId) continue;
        const meta = await fetchYouTubeVideoMeta(videoId);
        const privacy = meta?.privacyStatus;
        if (
          privacy === "public" ||
          privacy === "unlisted" ||
          privacy === "private"
        ) {
          next[s.id] = privacy;
          if (privacy !== s.youtubePrivacyStatus) {
            const patch = metaToSourcePatch(meta!);
            if (patch.youtubePrivacyStatus) {
              await updateGameSourceYouTubeMetadata(game.id, s.id, patch).catch(
                () => {},
              );
            }
          }
        }
      }
      setLivePrivacyBySourceId(next);
      if (Object.keys(next).length > 0) onRefresh();
    } finally {
      setPrivacyRefreshing(false);
    }
  }, [youtubeSources, game.id, onRefresh]);

  const refreshBalance = useCallback(async () => {
    try {
      const headers = await authHeaders();
      // Personal wallet — AI is never billed to the club.
      const res = await fetch(`/api/billing/balance`, { headers });
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
  }, []);

  const grantTestCredits = useCallback(async () => {
    if (!canEdit || purchaseEnabled) return;
    setBusy("grant");
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in required.");
      const headers = await authHeaders();
      const res = await fetch("/api/billing/grant-test", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: user.uid, amount: 500 }),
      });
      const data = (await res.json()) as {
        balance?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Grant failed.");
      if (typeof data.balance === "number") setBalance(data.balance);
      else void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grant failed.");
    } finally {
      setBusy(null);
    }
  }, [canEdit, purchaseEnabled, refreshBalance]);

  const matchSidecarsFromDrive = useCallback(async () => {
    if (!canEdit || !game.teamId) return;
    setAttachBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/drive/attach-sidecars", {
        method: "POST",
        headers,
        body: JSON.stringify({
          gameId: game.id,
          createdByName: currentDisplayName ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        scannedJson?: number;
        marksImported?: number;
        matched?: unknown[];
      };
      if (!res.ok) throw new Error(data.error || "Drive match failed.");
      if (!data.matched?.length) {
        throw new Error(
          data.scannedJson
            ? `Found ${data.scannedJson} JSON in Drive but none matched a YouTube name.`
            : "No sidecar JSON in this game’s Drive vault.",
        );
      }
      onEventsChanged();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drive match failed.");
    } finally {
      setAttachBusy(false);
    }
  }, [
    canEdit,
    game.teamId,
    game.id,
    currentDisplayName,
    onEventsChanged,
    onRefresh,
  ]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    void refreshLivePrivacy();
  }, [refreshLivePrivacy]);

  useEffect(() => {
    setSelectedSyncIds(secondaries.map((s) => s.id));
  }, [secondaries]);

  /** Restore latest ready tag drafts after a remount / page reload. */
  useEffect(() => {
    if (!canEdit || drafts.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(
          `/api/ai/jobs?gameId=${encodeURIComponent(game.id)}`,
          { headers },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          jobs?: Array<{
            kind?: string;
            status?: string;
            id?: string;
            drafts?: AiTagDraft[];
            notes?: string;
          }>;
        };
        const job = (data.jobs ?? []).find(
          (j) =>
            j.kind === "tag" &&
            j.status === "ready" &&
            Array.isArray(j.drafts) &&
            j.drafts.length > 0,
        );
        if (!job || cancelled) return;
        setTagJobId(job.id ?? null);
        setDrafts(rowsFromDrafts(job.drafts ?? [], events));
        if (job.notes) setNotes(job.notes);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only hydrate when empty; don't re-run when local drafts change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot restore
  }, [canEdit, game.id]);

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
      setDrafts(rowsFromDrafts(data.drafts ?? [], events));
      setNotes(data.notes ?? null);
      if (typeof data.balance === "number") setBalance(data.balance);
      else void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tag failed.");
    } finally {
      setBusy(null);
    }
  }, [canEdit, primary, game.id, refreshBalance, events]);

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
      const scoring =
        row.kind === "goal" ||
        row.kind === "field_goal" ||
        row.kind === "three_pointer";
      const scoreWord = basketball
        ? row.kind === "three_pointer"
          ? "3PT"
          : "Bucket"
        : "Goal";
      const label = scoring
        ? row.opponent
          ? `${scoreWord} (opponent): ${row.label}`
          : `${scoreWord}: ${row.label}`
        : row.label || kindLabel(row.kind, basketball);
      const statType = statTypeForAiTagKind(row.kind);
      await addGameEvent(
        game.id,
        {
          type: "coach_mark",
          t: Math.max(0, Math.round(row.tSec)),
          label,
          sourceId: primary?.id,
          payload: {
            aiKind: row.kind,
            confidence: row.confidence,
            ...(row.opponent ? { opponent: true } : {}),
            ...(statType ? { statType } : {}),
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
      onEventsChanged();
    },
    [
      canEdit,
      game.id,
      primary?.id,
      currentUid,
      currentDisplayName,
      onEventsChanged,
      basketball,
    ],
  );

  const approveAllPending = useCallback(async () => {
    const pending = drafts.filter((d) => d.status === "pending");
    for (const row of pending) {
      await approveDraft(row);
    }
  }, [drafts, approveDraft]);

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
        AI Tag watches the film in half-windows for denser events. For lining up
        cams, use <span className="text-zinc-300">Sync angles → Audio sync</span>{" "}
        — AI Sync is best-effort only. Credits debit on AI success.
        {knownMarkCount > 0 ? (
          <>
            {" "}
            Using{" "}
            <span className="text-zinc-300">
              {knownMarkCount} timeline mark
              {knownMarkCount === 1 ? "" : "s"}
              {gameCapMarkCount > 0
                ? ` (${gameCapMarkCount} from Game Cap)`
                : ""}
            </span>{" "}
            as accuracy priors.
          </>
        ) : (
          <>
            {" "}
            No Game Cap marks yet — match vault{" "}
            <span className="font-mono">.json</span> to the same-name YouTube,
            then re-run AI Tag.
            {canEdit && game.teamId ? (
              <>
                {" "}
                <button
                  type="button"
                  className="text-zinc-300 underline decoration-white/20 underline-offset-2 hover:text-white"
                  disabled={attachBusy}
                  onClick={() => void matchSidecarsFromDrive()}
                >
                  {attachBusy ? "Matching Drive…" : "Match sidecars from Drive"}
                </button>
              </>
            ) : null}
          </>
        )}
      </p>

      {nonPublicAngles.length > 0 ? (
        <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-950/30 px-2.5 py-2 text-[11px] leading-snug text-amber-100/90">
          <p>
            {nonPublicAngles.map((s) => s.label).join(", ")}{" "}
            {nonPublicAngles.length === 1 ? "looks" : "look"} unlisted/private
            to Film Room
            {nonPublicAngles.some(
              (s) => !livePrivacyBySourceId[s.id],
            )
              ? " (cached). If you already set Public on YouTube, refresh privacy."
              : `. ${GEMINI_YOUTUBE_PUBLIC_REQUIRED}`}
          </p>
          <button
            type="button"
            className={`${ghostBtn} mt-2`}
            disabled={privacyRefreshing}
            onClick={() => void refreshLivePrivacy()}
          >
            {privacyRefreshing ? "Checking YouTube…" : "Refresh privacy from YouTube"}
          </button>
        </div>
      ) : null}

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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-[10px] leading-snug text-zinc-500">
            Test mode — these are your personal credits (not the club pool).
          </p>
          <button
            type="button"
            className={ghostBtn}
            disabled={busy !== null}
            onClick={() => void grantTestCredits()}
          >
            {busy === "grant" ? "Granting…" : "Grant me 500"}
          </button>
        </div>
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
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-zinc-500">
              Drafts ({drafts.filter((d) => d.status === "pending").length}{" "}
              pending)
            </p>
            {drafts.some((d) => d.status === "pending") ? (
              <button
                type="button"
                className={ghostBtn}
                disabled={busy !== null}
                onClick={() => void approveAllPending()}
              >
                Approve all pending
              </button>
            ) : null}
          </div>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
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
                    {kindLabel(d.kind, basketball)}
                    {isPrimaryTagKind(d.kind)
                      ? ""
                      : " · extended"}
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
        </div>
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
