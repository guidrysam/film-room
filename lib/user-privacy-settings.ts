import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { GameVisibility } from "@/lib/games";

export const USER_PRIVACY_SETTINGS_SCHEMA = 1 as const;

/** YouTube sideline uploads — only unlisted works for team Film Room playback. */
export type YouTubeUploadPrivacyPreference = "unlisted";

export type UserPrivacySettings = {
  schemaVersion: typeof USER_PRIVACY_SETTINGS_SCHEMA;
  /** Upload to user's YouTube as unlisted + embeddable (required for in-app playback). */
  youtubeUploadPrivacy: YouTubeUploadPrivacyPreference;
  /** New team-linked games stay private (team members only). */
  defaultGameVisibility: Extract<GameVisibility, "private" | "link">;
  /** Team join links expire after N days. 0 = never (not recommended). */
  teamInviteExpiresDays: number;
  /** Game contributor invite links expire after N days. 0 = never. */
  gameInviteExpiresDays: number;
  /** Public highlight reel watch links expire after N days. 0 = never. */
  reelShareExpiresDays: number;
  /** Prompt before creating a world-readable reel watch link. */
  confirmBeforeReelShare: boolean;
  /** Prefer team membership over anonymous link access (policy default). */
  preferTeamOnlyAccess: boolean;
  /**
   * Future: scope parent/player views to linked roster players only.
   * Stored now so coaches can set intent before enforcement ships.
   */
  limitAccessToLinkedPlayers: boolean;
  updatedAt?: Timestamp | null;
};

export const DEFAULT_USER_PRIVACY_SETTINGS: UserPrivacySettings = {
  schemaVersion: USER_PRIVACY_SETTINGS_SCHEMA,
  youtubeUploadPrivacy: "unlisted",
  defaultGameVisibility: "private",
  teamInviteExpiresDays: 30,
  gameInviteExpiresDays: 14,
  reelShareExpiresDays: 7,
  confirmBeforeReelShare: true,
  preferTeamOnlyAccess: true,
  limitAccessToLinkedPlayers: false,
};

function userDoc(uid: string) {
  return doc(firestore, "users", uid);
}

function clampDays(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.round(value);
  if (n < 0) return 0;
  if (n > 365) return 365;
  return n;
}

function clampBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseUserPrivacySettings(
  raw: unknown,
): UserPrivacySettings {
  const base = { ...DEFAULT_USER_PRIVACY_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const visibility =
    o.defaultGameVisibility === "link" ? "link" : "private";
  return {
    schemaVersion: USER_PRIVACY_SETTINGS_SCHEMA,
    youtubeUploadPrivacy: "unlisted",
    defaultGameVisibility: visibility,
    teamInviteExpiresDays: clampDays(
      o.teamInviteExpiresDays,
      base.teamInviteExpiresDays,
    ),
    gameInviteExpiresDays: clampDays(
      o.gameInviteExpiresDays,
      base.gameInviteExpiresDays,
    ),
    reelShareExpiresDays: clampDays(
      o.reelShareExpiresDays,
      base.reelShareExpiresDays,
    ),
    confirmBeforeReelShare: clampBool(
      o.confirmBeforeReelShare,
      base.confirmBeforeReelShare,
    ),
    preferTeamOnlyAccess: clampBool(
      o.preferTeamOnlyAccess,
      base.preferTeamOnlyAccess,
    ),
    limitAccessToLinkedPlayers: clampBool(
      o.limitAccessToLinkedPlayers,
      base.limitAccessToLinkedPlayers,
    ),
    ...(o.updatedAt instanceof Timestamp ? { updatedAt: o.updatedAt } : {}),
  };
}

export async function loadUserPrivacySettings(
  uid: string,
): Promise<UserPrivacySettings> {
  if (!uid.trim()) return { ...DEFAULT_USER_PRIVACY_SETTINGS };
  try {
    const snap = await getDoc(userDoc(uid));
    if (!snap.exists()) return { ...DEFAULT_USER_PRIVACY_SETTINGS };
    const data = snap.data() as Record<string, unknown>;
    return parseUserPrivacySettings(data.privacySettings);
  } catch {
    return { ...DEFAULT_USER_PRIVACY_SETTINGS };
  }
}

export async function saveUserPrivacySettings(
  uid: string,
  settings: UserPrivacySettings,
): Promise<UserPrivacySettings> {
  if (!uid.trim()) {
    throw new Error("Sign in to save privacy settings.");
  }
  const normalized = parseUserPrivacySettings(settings);
  await setDoc(
    userDoc(uid),
    {
      privacySettings: {
        ...normalized,
        updatedAt: serverTimestamp(),
      },
    },
    { merge: true },
  );
  return normalized;
}

/** Epoch ms for an invite/share expiry, or null when days is 0 (never). */
export function expiresAtFromDays(
  expiresInDays: number,
  nowMs: number = Date.now(),
): number | null {
  const days = clampDays(expiresInDays, 0);
  if (days <= 0) return null;
  return nowMs + days * 86_400_000;
}

export function expiresTimestampFromDays(
  expiresInDays: number,
  nowMs: number = Date.now(),
): Timestamp | null {
  const ms = expiresAtFromDays(expiresInDays, nowMs);
  return ms == null ? null : Timestamp.fromMillis(ms);
}

export function isPastExpiry(
  expiresAt: Timestamp | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const ms = expiresAt?.toMillis?.();
  return typeof ms === "number" && ms <= nowMs;
}

export function formatExpiresDaysLabel(days: number): string {
  if (days <= 0) return "Never expires";
  if (days === 1) return "1 day";
  if (days === 7) return "1 week";
  if (days === 14) return "2 weeks";
  if (days === 30) return "30 days";
  if (days === 90) return "90 days";
  return `${days} days`;
}

export const INVITE_EXPIRY_OPTIONS = [7, 14, 30, 90, 0] as const;
export const REEL_SHARE_EXPIRY_OPTIONS = [3, 7, 14, 30, 0] as const;
