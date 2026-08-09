import "server-only";

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { decryptSecret, encryptSecret } from "@/lib/drive/crypto";
import {
  driveClientId,
  driveClientSecret,
  refreshDriveAccessToken,
  type GoogleTokenResponse,
} from "@/lib/drive/oauth";

/** Upload + read channel metadata. Keep separate from Drive scopes. */
export const YOUTUBE_UPLOAD_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

type OAuthState = {
  uid: string;
  nonce: string;
  exp: number;
};

function stateSigningKey(): Buffer {
  const raw =
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (!raw) throw new Error("Missing key for YouTube OAuth state signing.");
  return Buffer.from(raw, "utf8");
}

export function youtubeUploadOAuthRedirectUri(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/api/youtube/oauth/callback`;
}

export function signYouTubeUploadOAuthState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", stateSigningKey())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyYouTubeUploadOAuthState(raw: string): OAuthState {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) throw new Error("Invalid OAuth state.");
  const expected = createHmac("sha256", stateSigningKey())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature.");
  }
  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as Partial<OAuthState>;
  if (
    typeof parsed.uid !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.exp !== "number"
  ) {
    throw new Error("Invalid OAuth state payload.");
  }
  if (Date.now() > parsed.exp) throw new Error("OAuth state expired.");
  return {
    uid: parsed.uid,
    nonce: parsed.nonce,
    exp: parsed.exp,
  };
}

export function buildYouTubeUploadAuthorizeUrl(opts: {
  appBaseUrl: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: driveClientId(),
    redirect_uri: youtubeUploadOAuthRedirectUri(opts.appBaseUrl),
    response_type: "code",
    scope: YOUTUBE_UPLOAD_OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeUploadAuthCode(opts: {
  code: string;
  appBaseUrl: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: driveClientId(),
    client_secret: driveClientSecret(),
    redirect_uri: youtubeUploadOAuthRedirectUri(opts.appBaseUrl),
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `YouTube token exchange failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as GoogleTokenResponse;
}

export type UserYouTubeUploadConfig = {
  connectedAt: string;
  channelId?: string;
  channelTitle?: string;
};

function secretsRef(uid: string) {
  return adminFirestore
    .collection("users")
    .doc(uid)
    .collection("secrets")
    .doc("youtubeUpload");
}

async function fetchMineChannel(accessToken: string): Promise<{
  channelId?: string;
  channelTitle?: string;
}> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return {};
  const json = (await res.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
  };
  const item = json.items?.[0];
  const channelId = item?.id?.trim();
  const channelTitle = item?.snippet?.title?.trim();
  return {
    ...(channelId ? { channelId } : {}),
    ...(channelTitle ? { channelTitle } : {}),
  };
}

export async function connectUserYouTubeUpload(opts: {
  uid: string;
  refreshToken: string;
  accessToken: string;
}): Promise<UserYouTubeUploadConfig> {
  const channel = await fetchMineChannel(opts.accessToken);
  const blob = encryptSecret(opts.refreshToken);
  const connectedAt = new Date().toISOString();
  await secretsRef(opts.uid).set(
    {
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      tag: blob.tag,
      updatedAt: FieldValue.serverTimestamp(),
      connectedByUid: opts.uid,
    },
    { merge: true },
  );
  const youtubeUpload: UserYouTubeUploadConfig = {
    connectedAt,
    ...channel,
  };
  await adminFirestore.collection("users").doc(opts.uid).set(
    {
      youtubeUpload,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return youtubeUpload;
}

export async function clearUserYouTubeUpload(uid: string): Promise<void> {
  await secretsRef(uid).delete().catch(() => undefined);
  await adminFirestore.collection("users").doc(uid).set(
    {
      youtubeUpload: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadUserYouTubeUploadRefreshToken(
  uid: string,
): Promise<string | null> {
  const snap = await secretsRef(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  if (
    typeof data.ciphertext !== "string" ||
    typeof data.iv !== "string" ||
    typeof data.tag !== "string"
  ) {
    return null;
  }
  return decryptSecret({
    ciphertext: data.ciphertext,
    iv: data.iv,
    tag: data.tag,
  });
}

export async function getUserYouTubeUploadAccessToken(uid: string): Promise<{
  accessToken: string;
  expiresInSec: number;
  channelTitle?: string;
  channelId?: string;
}> {
  const refreshToken = await loadUserYouTubeUploadRefreshToken(uid);
  if (!refreshToken) throw new Error("YOUTUBE_UPLOAD_NOT_CONNECTED");

  const tokens = await refreshDriveAccessToken(refreshToken);
  if (!tokens.access_token) throw new Error("YOUTUBE_TOKEN_REFRESH_FAILED");

  const userSnap = await adminFirestore.collection("users").doc(uid).get();
  const raw = userSnap.data()?.youtubeUpload;
  const yt =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    accessToken: tokens.access_token,
    expiresInSec:
      typeof tokens.expires_in === "number" && tokens.expires_in > 0
        ? Math.max(60, tokens.expires_in - 60)
        : 3500,
    ...(typeof yt.channelTitle === "string"
      ? { channelTitle: yt.channelTitle }
      : {}),
    ...(typeof yt.channelId === "string" ? { channelId: yt.channelId } : {}),
  };
}

export async function readUserYouTubeUploadPublic(
  uid: string,
): Promise<UserYouTubeUploadConfig | null> {
  const snap = await adminFirestore.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const raw = snap.data()?.youtubeUpload;
  if (!raw || typeof raw !== "object") return null;
  const yt = raw as Record<string, unknown>;
  const connectedAt =
    typeof yt.connectedAt === "string" ? yt.connectedAt.trim() : "";
  if (!connectedAt) return null;
  return {
    connectedAt,
    ...(typeof yt.channelId === "string" ? { channelId: yt.channelId } : {}),
    ...(typeof yt.channelTitle === "string"
      ? { channelTitle: yt.channelTitle }
      : {}),
  };
}

export function newYouTubeUploadOAuthNonce(): string {
  return randomBytes(16).toString("hex");
}
