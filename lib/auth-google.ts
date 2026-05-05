import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  return signInWithPopup(auth, provider);
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
