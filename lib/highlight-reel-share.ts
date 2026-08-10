import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import type { ReelStep } from "@/lib/highlight-draft";
import type { Game, GameVideoSource } from "@/lib/games";
import { firestore } from "@/lib/firebase";
import { buildReelTitleCard } from "@/lib/highlight-reel-cards";
import type { Team } from "@/lib/teams";
import type { HighlightSoundtrack } from "@/lib/highlight-soundtrack";
import {
  normalizeHighlightSponsors,
  type HighlightSponsorLogo,
} from "@/lib/highlight-sponsors";
import {
  expiresTimestampFromDays,
  isPastExpiry,
} from "@/lib/user-privacy-settings";
import { gameSourceToVideoAngle } from "@/lib/video-angle";
import {
  HIGHLIGHT_REEL_SHARE_SCHEMA,
  parseHighlightReelSharePayload,
  type HighlightReelSharePayload,
  type HighlightReelShareScoreboard,
  type HighlightReelShareSource,
  type SharedHighlightReelLookupResult,
} from "@/lib/highlight-reel-share-payload";

export {
  HIGHLIGHT_REEL_SHARE_SCHEMA,
  parseHighlightReelSharePayload,
  type HighlightReelSharePayload,
  type HighlightReelShareScoreboard,
  type HighlightReelShareSource,
  type SharedHighlightReelLookupResult,
} from "@/lib/highlight-reel-share-payload";


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
  scoreboard?: HighlightReelShareScoreboard | null;
  soundtrack?: HighlightSoundtrack | null;
  sponsors?: HighlightSponsorLogo[] | null;
  club?: Pick<{ name?: string; logoUrl?: string }, "name" | "logoUrl"> | null;
  titleLogoSource?: import("@/lib/highlight-reel-cards").ReelTitleLogoSource | null;
  titleLogoUrl?: string | null;
  thankYouMessage?: string | null;
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
  const sponsors = normalizeHighlightSponsors(input.sponsors);
  const thankYouMessage = input.thankYouMessage?.trim() || "";
  return {
    schema: HIGHLIGHT_REEL_SHARE_SCHEMA,
    reelName: input.reelName.trim() || "Highlight reel",
    gameTitle: input.game.title?.trim() || "Highlights",
    titleCard: buildReelTitleCard(input.game, input.team, input.reelName, {
      club: input.club ?? null,
      logoSource: input.titleLogoSource ?? "auto",
      customLogoUrl: input.titleLogoUrl,
    }),
    steps: input.previewSteps,
    sources: shareSources,
    ...(input.scoreboard ? { scoreboard: input.scoreboard } : {}),
    ...(input.soundtrack ? { soundtrack: input.soundtrack } : {}),
    ...(sponsors.length > 0 ? { sponsors } : {}),
    ...(thankYouMessage ? { thankYouMessage } : {}),
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
  opts?: { expiresInDays?: number },
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

  const expiresInDays =
    typeof opts?.expiresInDays === "number" ? opts.expiresInDays : 0;
  const shareExpiresAt = expiresTimestampFromDays(expiresInDays);

  const shareRecord = {
    shareId: existingShareId,
    gameId,
    cutId,
    createdBy: uid,
    payload: firestoreJson(payload) as HighlightReelSharePayload,
    updatedAt: serverTimestamp(),
    ...(shareExpiresAt ? { expiresAt: shareExpiresAt } : {}),
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

function parseShareDoc(
  _shareId: string,
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
    const raw = snap.data() as Record<string, unknown>;
    if (
      isPastExpiry(
        raw.expiresAt instanceof Timestamp ? raw.expiresAt : undefined,
      )
    ) {
      return { ok: false, kind: "expired" };
    }
    const parsed = parseShareDoc(trimmed, raw);
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
