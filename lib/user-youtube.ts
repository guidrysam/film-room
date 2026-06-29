/**
 * Per-user YouTube onboarding state, stored on the `users/{uid}` profile doc so
 * a parent only sets up their channel once and we don't nag them again.
 */

import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { MyYouTubeChannel } from "@/lib/youtube-channel";

export type YouTubeOnboarding = {
  channelId: string;
  channelTitle: string;
  customUrl?: string;
  onboardedAt?: Timestamp | null;
};

function userDoc(uid: string) {
  return doc(firestore, "users", uid);
}

/** Read a user's saved YouTube channel, or null if not yet onboarded. */
export async function loadYouTubeOnboarding(
  uid: string,
): Promise<YouTubeOnboarding | null> {
  try {
    const snap = await getDoc(userDoc(uid));
    if (!snap.exists()) return null;
    const raw = snap.data() as Record<string, unknown>;
    const channelId =
      typeof raw.youtubeChannelId === "string" ? raw.youtubeChannelId.trim() : "";
    if (!channelId) return null;
    const channelTitle =
      typeof raw.youtubeChannelTitle === "string" &&
      raw.youtubeChannelTitle.trim() !== ""
        ? raw.youtubeChannelTitle.trim()
        : "Your channel";
    const customUrl =
      typeof raw.youtubeChannelCustomUrl === "string" &&
      raw.youtubeChannelCustomUrl.trim() !== ""
        ? raw.youtubeChannelCustomUrl.trim()
        : undefined;
    return {
      channelId,
      channelTitle,
      ...(customUrl ? { customUrl } : {}),
      onboardedAt:
        raw.youtubeOnboardedAt instanceof Timestamp
          ? raw.youtubeOnboardedAt
          : null,
    };
  } catch {
    return null;
  }
}

/** Persist the detected channel on the user's profile (merge, non-destructive). */
export async function saveYouTubeChannel(
  uid: string,
  channel: MyYouTubeChannel,
): Promise<void> {
  await setDoc(
    userDoc(uid),
    {
      youtubeChannelId: channel.id,
      youtubeChannelTitle: channel.title,
      ...(channel.customUrl
        ? { youtubeChannelCustomUrl: channel.customUrl }
        : {}),
      youtubeOnboardedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
