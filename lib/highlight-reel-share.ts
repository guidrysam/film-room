import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { ReelStep } from "@/lib/highlight-draft";
import type { Game, GameVideoSource } from "@/lib/games";
import { firestore } from "@/lib/firebase";
import type { ReelTitleCard } from "@/lib/highlight-reel-cards";
import { buildReelTitleCard } from "@/lib/highlight-reel-cards";
import type { Team } from "@/lib/teams";
import { gameSourceToVideoAngle } from "@/lib/video-angle";

export const HIGHLIGHT_REEL_SHARE_SCHEMA = "highlight_reel_share_v1" as const;

export type HighlightReelShareSource = {
  id: string;
  videoId: string;
  label?: string;
};

export type HighlightReelSharePayload = {
  schema: typeof HIGHLIGHT_REEL_SHARE_SCHEMA;
  reelName: string;
  gameTitle: string;
  titleCard: ReelTitleCard;
  steps: ReelStep[];
  sources: HighlightReelShareSource[];
};

export type SharedHighlightReelLookupResult =
  | {
      ok: true;
      gameId: string;
      cutId: string;
      payload: HighlightReelSharePayload;
      createdByName?: string;
    }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "query_failed"; message: string; code?: string };

function generateShareId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function firestoreErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown };
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    const code = typeof o.code === "string" ? o.code : "";
    if (msg && code) return `${msg} (${code})`;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function firestoreErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string" && c.trim() !== "") return c;
  }
  return undefined;
}

function firestoreJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => firestoreJson(item))
      .filter((item) => item !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const next = firestoreJson(val);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function cutsDoc(gameId: string, cutId: string) {
  return doc(firestore, "games", gameId, "cuts", cutId);
}

function shareDoc(shareId: string) {
  return doc(firestore, "highlightReelShares", shareId);
}

/** Public watch URL for a shared highlight reel. */
export function highlightReelWatchPath(shareId: string): string {
  const id = shareId.trim();
  return id ? `/reel/${encodeURIComponent(id)}` : "/reel";
}

export function highlightReelWatchUrl(shareId: string, origin?: string): string {
  const path = highlightReelWatchPath(shareId);
  const base =
    origin?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

export function buildHighlightReelSharePayload(input: {
  reelName: string;
  game: Game;
  team: Pick<Team, "name" | "logoUrl"> | null;
  previewSteps: ReelStep[];
  sources: GameVideoSource[];
}): HighlightReelSharePayload {
  const playable = input.sources.filter((s) => gameSourceToVideoAngle(s) != null);
  const shareSources: HighlightReelShareSource[] = [];
  for (const s of playable) {
    const videoId = s.videoId?.trim();
    if (!videoId) continue;
    shareSources.push({
      id: s.id,
      videoId,
      ...(s.label?.trim() ? { label: s.label.trim() } : {}),
    });
  }
  return {
    schema: HIGHLIGHT_REEL_SHARE_SCHEMA,
    reelName: input.reelName.trim() || "Highlight reel",
    gameTitle: input.game.title?.trim() || "Highlights",
    titleCard: buildReelTitleCard(input.game, input.team, input.reelName),
    steps: input.previewSteps,
    sources: shareSources,
  };
}

export function parseHighlightReelSharePayload(
  raw: unknown,
): HighlightReelSharePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (v.schema !== HIGHLIGHT_REEL_SHARE_SCHEMA) return null;
  if (typeof v.reelName !== "string" || typeof v.gameTitle !== "string") return null;
  if (!v.titleCard || typeof v.titleCard !== "object") return null;
  const titleCard = v.titleCard as Record<string, unknown>;
  if (typeof titleCard.headline !== "string") return null;
  const steps = Array.isArray(v.steps) ? (v.steps as ReelStep[]) : null;
  if (!steps || steps.length === 0) return null;
  const sourcesRaw = Array.isArray(v.sources) ? v.sources : [];
  const sources: HighlightReelShareSource[] = [];
  for (const row of sourcesRaw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.videoId !== "string") continue;
    sources.push({
      id: o.id,
      videoId: o.videoId,
      ...(typeof o.label === "string" && o.label.trim()
        ? { label: o.label.trim() }
        : {}),
    });
  }
  if (sources.length === 0) return null;
  return {
    schema: HIGHLIGHT_REEL_SHARE_SCHEMA,
    reelName: v.reelName.trim() || "Highlight reel",
    gameTitle: v.gameTitle.trim() || "Highlights",
    titleCard: {
      headline: titleCard.headline,
      ...(typeof titleCard.subtitle === "string" && titleCard.subtitle.trim()
        ? { subtitle: titleCard.subtitle.trim() }
        : {}),
      ...(typeof titleCard.logoUrl === "string" && titleCard.logoUrl.trim()
        ? { logoUrl: titleCard.logoUrl.trim() }
        : {}),
    },
    steps,
    sources,
  };
}

function parseShareDoc(
  shareId: string,
  raw: Record<string, unknown>,
): SharedHighlightReelLookupResult | null {
  const payload = parseHighlightReelSharePayload(raw.payload);
  if (!payload) return null;
  const gameId = typeof raw.gameId === "string" ? raw.gameId.trim() : "";
  const cutId = typeof raw.cutId === "string" ? raw.cutId.trim() : "";
  if (!gameId || !cutId) return null;
  return {
    ok: true,
    gameId,
    cutId,
    payload,
    ...(typeof raw.createdByName === "string" && raw.createdByName.trim()
      ? { createdByName: raw.createdByName.trim() }
      : {}),
  };
}

/**
 * Ensures a reel has a public watch link and refreshes the denormalized playback
 * payload so anonymous viewers do not need game source reads.
 */
export async function ensureHighlightReelSharing(
  gameId: string,
  cutId: string,
  payload: HighlightReelSharePayload,
  sharerUid: string,
): Promise<string> {
  const uid = sharerUid.trim();
  if (!uid) {
    throw new Error("Sign in to create a watch link.");
  }
  const ref = cutsDoc(gameId, cutId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    throw new Error(
      firestoreErrorMessage(err, "Could not read this reel from Firestore."),
    );
  }
  if (!snap.exists()) {
    throw new Error("Reel not found.");
  }
  const raw = snap.data() as Record<string, unknown>;
  if (raw.kind !== "highlight") {
    throw new Error("Only highlight reels can be shared with a watch link.");
  }

  const existingShareId =
    raw.isShared === true &&
    typeof raw.shareId === "string" &&
    raw.shareId.trim() !== ""
      ? raw.shareId.trim()
      : generateShareId();

  const shareRecord = {
    shareId: existingShareId,
    gameId,
    cutId,
    createdBy: uid,
    payload: firestoreJson(payload) as HighlightReelSharePayload,
    updatedAt: serverTimestamp(),
    ...(typeof raw.createdByName === "string" && raw.createdByName.trim()
      ? { createdByName: raw.createdByName.trim() }
      : {}),
  };

  try {
    await setDoc(shareDoc(existingShareId), shareRecord, { merge: true });
    await updateDoc(ref, {
      shareId: existingShareId,
      isShared: true,
      sharePayload: firestoreJson(payload),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw new Error(
      firestoreErrorMessage(err, "Could not save the watch link for this reel."),
    );
  }
  return existingShareId;
}

/** Fetch a shared highlight reel by public share id (top-level public doc). */
export async function getHighlightReelByShareId(
  shareId: string,
): Promise<SharedHighlightReelLookupResult> {
  const trimmed = shareId.trim();
  if (!trimmed) return { ok: false, kind: "not_found" };

  try {
    const snap = await getDoc(shareDoc(trimmed));
    if (!snap.exists()) {
      return { ok: false, kind: "not_found" };
    }
    const parsed = parseShareDoc(trimmed, snap.data() as Record<string, unknown>);
    if (!parsed) return { ok: false, kind: "not_found" };
    return parsed;
  } catch (err) {
    return {
      ok: false,
      kind: "query_failed",
      message: firestoreErrorMessage(
        err,
        "Could not load this highlight reel (check network or permissions).",
      ),
      code: firestoreErrorCode(err),
    };
  }
}
