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

function isPopupBlockedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code) : "";
  return code === "auth/popup-blocked";
}

/**
 * Google sign-in. Prefers popup; falls back to full-page redirect when Safari
 * (or another browser) blocks the popup.
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    if (!isPopupBlockedError(err)) throw err;
    await signInWithRedirect(auth, provider);
    // Page navigates away; callers should treat null as "redirect in progress".
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

  try {
    const result = await signInWithPopup(auth, ytProvider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = (cred as { accessToken?: unknown } | null)?.accessToken;
    if (typeof accessToken !== "string" || accessToken.trim() === "") {
      throw new Error(
        "Missing Google OAuth access token. Ensure the YouTube scope was granted.",
      );
    }
    return { user: result.user, accessToken: accessToken.trim() };
  } catch (err) {
    if (!isPopupBlockedError(err)) throw err;
    throw new Error(
      "Google sign-in popup was blocked. Allow popups for this site, then try again.",
    );
  }
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

  try {
    const result = await signInWithPopup(auth, ytProvider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = (cred as { accessToken?: unknown } | null)?.accessToken;
    if (typeof accessToken !== "string" || accessToken.trim() === "") {
      throw new Error(
        "Missing Google OAuth access token. Ensure the YouTube upload scope was granted.",
      );
    }
    return { user: result.user, accessToken: accessToken.trim() };
  } catch (err) {
    if (!isPopupBlockedError(err)) throw err;
    throw new Error(
      "Google sign-in popup was blocked. Allow popups for this site, then try again.",
    );
  }
}
