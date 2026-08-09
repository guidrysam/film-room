import "server-only";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  resolveActorWallet,
  type CreditWalletRef,
} from "@/lib/billing/credits";
import { canonicalizeSportForStorage } from "@/lib/sports";

export type GameBillingContext = {
  gameId: string;
  teamId?: string;
  clubId?: string;
  ownerUid?: string;
  sport?: string;
  /** Always the acting user's personal credit wallet. */
  wallet: CreditWalletRef;
};

/**
 * Load game metadata and the **actor's personal** credit wallet.
 * Club affiliation is still returned for UI, but AI spend is never club-billed.
 */
export async function loadGameBillingContext(
  gameId: string,
  actorUid: string,
): Promise<GameBillingContext | null> {
  const gameSnap = await adminFirestore.collection("games").doc(gameId).get();
  if (!gameSnap.exists) return null;
  const game = gameSnap.data() ?? {};
  const teamId =
    typeof game.teamId === "string" && game.teamId.trim()
      ? game.teamId.trim()
      : undefined;
  let clubId =
    typeof game.clubId === "string" && game.clubId.trim()
      ? game.clubId.trim()
      : undefined;
  let ownerUid =
    typeof game.ownerId === "string" && game.ownerId.trim()
      ? game.ownerId.trim()
      : undefined;
  let sportRaw =
    typeof game.sport === "string" && game.sport.trim()
      ? game.sport.trim()
      : undefined;

  if (teamId) {
    const teamSnap = await adminFirestore.collection("teams").doc(teamId).get();
    if (teamSnap.exists) {
      const team = teamSnap.data() ?? {};
      if (!clubId && typeof team.clubId === "string" && team.clubId.trim()) {
        clubId = team.clubId.trim();
      }
      if (
        !ownerUid &&
        typeof team.ownerId === "string" &&
        team.ownerId.trim()
      ) {
        ownerUid = team.ownerId.trim();
      }
      if (
        !sportRaw &&
        typeof team.sport === "string" &&
        team.sport.trim()
      ) {
        sportRaw = team.sport.trim();
      }
    }
  }

  const wallet = resolveActorWallet(actorUid);
  const sport = canonicalizeSportForStorage(sportRaw);

  return {
    gameId,
    ...(teamId ? { teamId } : {}),
    ...(clubId ? { clubId } : {}),
    ...(ownerUid ? { ownerUid } : {}),
    ...(sport ? { sport } : {}),
    wallet,
  };
}

export type AdminGameSource = {
  id: string;
  kind?: string;
  videoId?: string;
  label?: string;
  durationSec?: number;
  youtubePrivacyStatus?: string;
  offsetFromGameTime?: number;
  [key: string]: unknown;
};

export async function listGameSourcesAdmin(
  gameId: string,
): Promise<AdminGameSource[]> {
  const snap = await adminFirestore
    .collection("games")
    .doc(gameId)
    .collection("sources")
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  }));
}

export async function fetchYoutubeMetaServer(videoId: string): Promise<{
  title?: string;
  description?: string;
  durationSec?: number;
  privacyStatus?: string;
} | null> {
  const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!key || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    `?part=snippet,contentDetails,status&id=${encodeURIComponent(videoId)}` +
    `&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    items?: Array<{
      snippet?: {
        title?: string;
        description?: string;
      };
      contentDetails?: { duration?: string };
      status?: { privacyStatus?: string };
    }>;
  };
  const item = json.items?.[0];
  if (!item) return null;
  const durationSec = parseIso8601DurationToSeconds(
    item.contentDetails?.duration,
  );
  return {
    ...(item.snippet?.title ? { title: item.snippet.title } : {}),
    ...(item.snippet?.description
      ? { description: item.snippet.description }
      : {}),
    ...(durationSec != null ? { durationSec } : {}),
    ...(item.status?.privacyStatus
      ? { privacyStatus: item.status.privacyStatus }
      : {}),
  };
}

function parseIso8601DurationToSeconds(
  raw: string | undefined,
): number | undefined {
  if (!raw) return undefined;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(raw);
  if (!m) return undefined;
  const h = m[1] ? Number(m[1]) : 0;
  const min = m[2] ? Number(m[2]) : 0;
  const s = m[3] ? Number(m[3]) : 0;
  return h * 3600 + min * 60 + s;
}

export async function listTeamRosterNames(
  teamId: string,
): Promise<string[]> {
  const snap = await adminFirestore
    .collection("teams")
    .doc(teamId)
    .collection("players")
    .get();
  const names: string[] = [];
  for (const d of snap.docs) {
    const name = d.data()?.name;
    if (typeof name === "string" && name.trim()) names.push(name.trim());
  }
  return names;
}

export type AdminGameEvent = {
  id: string;
  type?: string;
  t?: number;
  label?: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function listGameEventsAdmin(
  gameId: string,
): Promise<AdminGameEvent[]> {
  const snap = await adminFirestore
    .collection("games")
    .doc(gameId)
    .collection("events")
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  }));
}
