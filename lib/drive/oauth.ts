import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const DRIVE_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

export function driveClientId(): string {
  const id = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  if (!id) throw new Error("GOOGLE_DRIVE_CLIENT_ID is not configured.");
  return id;
}

export function driveClientSecret(): string {
  const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("GOOGLE_DRIVE_CLIENT_SECRET is not configured.");
  return secret;
}

function stateSigningKey(): Buffer {
  const raw =
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (!raw) throw new Error("Missing key for Drive OAuth state signing.");
  return Buffer.from(raw, "utf8");
}

export type DriveOAuthKind = "team" | "user";

export type DriveOAuthState = {
  /** Defaults to team when omitted (legacy signed states). */
  kind: DriveOAuthKind;
  /** Empty when kind is user. */
  teamId: string;
  uid: string;
  nonce: string;
  exp: number;
};

export function signDriveOAuthState(
  state: Omit<DriveOAuthState, "kind"> & { kind?: DriveOAuthKind },
): string {
  const normalized: DriveOAuthState = {
    kind: state.kind ?? (state.teamId ? "team" : "user"),
    teamId: state.kind === "user" ? "" : state.teamId,
    uid: state.uid,
    nonce: state.nonce,
    exp: state.exp,
  };
  const payload = Buffer.from(JSON.stringify(normalized), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", stateSigningKey())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyDriveOAuthState(raw: string): DriveOAuthState {
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
  ) as Partial<DriveOAuthState>;
  if (
    typeof parsed.uid !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.exp !== "number"
  ) {
    throw new Error("Invalid OAuth state payload.");
  }
  if (Date.now() > parsed.exp) throw new Error("OAuth state expired.");

  const kind: DriveOAuthKind =
    parsed.kind === "user" || parsed.kind === "team"
      ? parsed.kind
      : typeof parsed.teamId === "string" && parsed.teamId.trim()
        ? "team"
        : "user";
  const teamId =
    kind === "user"
      ? ""
      : typeof parsed.teamId === "string"
        ? parsed.teamId.trim()
        : "";
  if (kind === "team" && !teamId) {
    throw new Error("Invalid OAuth state payload.");
  }
  return {
    kind,
    teamId,
    uid: parsed.uid,
    nonce: parsed.nonce,
    exp: parsed.exp,
  };
}

export function driveOAuthRedirectUri(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/api/drive/oauth/callback`;
}

export function buildDriveAuthorizeUrl(opts: {
  appBaseUrl: string;
  state: string;
}): string {
  // Do NOT set include_granted_scopes — this OAuth client is also used for
  // YouTube (`auth/youtube`). Google rejects requesting youtube + drive.file
  // in one consent. Drive connect must stay drive.file-only.
  const params = new URLSearchParams({
    client_id: driveClientId(),
    redirect_uri: driveOAuthRedirectUri(opts.appBaseUrl),
    response_type: "code",
    scope: DRIVE_OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export async function exchangeDriveAuthCode(opts: {
  code: string;
  appBaseUrl: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: driveClientId(),
    client_secret: driveClientSecret(),
    redirect_uri: driveOAuthRedirectUri(opts.appBaseUrl),
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
      `Drive token exchange failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshDriveAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: driveClientId(),
    client_secret: driveClientSecret(),
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Drive token refresh failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function fetchDriveAccountEmail(
  accessToken: string,
): Promise<string | undefined> {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return undefined;
  const json = (await res.json()) as {
    user?: { emailAddress?: string };
  };
  const email = json.user?.emailAddress?.trim();
  return email || undefined;
}
