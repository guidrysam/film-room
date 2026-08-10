import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const provider = new GoogleAuthProvider();

function authErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  return "code" in err ? String((err as { code?: unknown }).code) : "";
}

function shouldFallbackToRedirect(err: unknown): boolean {
  const code = authErrorCode(err);
  // Safari often reports a closed popup when third-party auth helpers are blocked.
  return code === "auth/popup-blocked" || code === "auth/popup-closed-by-user";
}

/** Friendlier copy for common Google sign-in failures. */
export function formatGoogleSignInError(err: unknown): string {
  const code = authErrorCode(err);
  if (code === "auth/unauthorized-domain") {
    return "This site isn’t approved for Google sign-in. Use https://film-room-gray.vercel.app (not a preview link).";
  }
  if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
    return "Safari blocked or closed the Google window. Continuing in this tab…";
  }
  if (
    code === "auth/redirect-uri-mismatch" ||
    /redirect_uri_mismatch/i.test(
      err instanceof Error ? err.message : String(err ?? ""),
    )
  ) {
    return "Google Cloud is missing redirect URI https://film-room-gray.vercel.app/__/auth/handler on the Firebase Web client.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Sign-in failed. Try again.";
}

/**
 * Google sign-in. Prefers popup; on Safari popup failures continues via
 * same-tab redirect (requires authDomain + /__/auth proxy + OAuth URI).
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    if (!shouldFallbackToRedirect(err)) throw err;
    await signInWithRedirect(auth, provider);
    return null;
  }
}

/** Resolve a pending redirect sign-in (no-op when none). */
export async function completeGoogleRedirectSignIn(): Promise<UserCredential | null> {
  try {
    return await getRedirectResult(auth);
  } catch (err) {
    console.error("[auth:redirect]", err);
    return null;
  }
}

export async function signOutUser() {
  return signOut(auth);
}

export async function getYouTubeOAuthAccessToken(): Promise<{
  user: User;
  accessToken: string;
}> {
  const ytProvider = new GoogleAuthProvider();
  ytProvider.addScope("https://www.googleapis.com/auth/youtube");
  ytProvider.setCustomParameters({
    prompt: "consent",
    include_granted_scopes: "true",
  });

  const result = await signInWithPopup(auth, ytProvider);
  const cred = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = (cred as { accessToken?: unknown } | null)?.accessToken;
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new Error(
      "Missing Google OAuth access token. Ensure the YouTube scope was granted.",
    );
  }
  return { user: result.user, accessToken: accessToken.trim() };
}

export async function getYouTubeUploadAccessToken(): Promise<{
  user: User;
  accessToken: string;
}> {
  const ytProvider = new GoogleAuthProvider();
  ytProvider.addScope("https://www.googleapis.com/auth/youtube.upload");
  ytProvider.setCustomParameters({
    prompt: "consent",
    include_granted_scopes: "true",
  });

  const result = await signInWithPopup(auth, ytProvider);
  const cred = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = (cred as { accessToken?: unknown } | null)?.accessToken;
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new Error(
      "Missing Google OAuth access token. Ensure the YouTube upload scope was granted.",
    );
  }
  return { user: result.user, accessToken: accessToken.trim() };
}
