import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
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

/** Friendlier copy for common Google sign-in failures. */
export function formatGoogleSignInError(err: unknown): string {
  const code = authErrorCode(err);
  if (code === "auth/unauthorized-domain") {
    return "This site isn’t approved for Google sign-in. Use https://film-room-gray.vercel.app (not a preview link).";
  }
  if (code === "auth/popup-blocked") {
    return "Safari blocked the Google sign-in window. Allow popups for film-room-gray.vercel.app, then try again.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Sign-in was cancelled. Try again when you’re ready.";
  }
  if (code === "auth/redirect-uri-mismatch" || /redirect_uri_mismatch/i.test(
    err instanceof Error ? err.message : String(err ?? ""),
  )) {
    return "Google sign-in isn’t configured for this site yet. Ask the site admin to register the OAuth redirect URI.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Sign-in failed. Try again.";
}

/**
 * Google sign-in via popup. Redirect is intentionally not used: Safari blocks
 * third-party cookies on the default Firebase authDomain, and a custom
 * authDomain requires a matching Google OAuth redirect URI first.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, provider);
}

/** Resolve a pending redirect sign-in (no-op when none). Kept for older sessions. */
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

/**
 * Minimal “bridge” for server routes that need a Google OAuth access token.
 * Uses Firebase Auth popup sign-in to obtain a Google access token with the YouTube scope.
 *
 * Note: this does not redesign auth or add server-side verification; it simply returns
 * an access token for the current browser session.
 */
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

/**
 * OAuth access token scoped for uploading videos to the signed-in user's YouTube
 * channel (`youtube.upload`). Separate from the live-stream helper above.
 */
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
