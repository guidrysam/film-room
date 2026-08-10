import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Must match the Realtime Database URL in Firebase Console (Build → Realtime Database).
 * Newer projects often use `*.firebasedatabase.app` instead of `*.firebaseio.com`.
 * Set in Vercel if the default below does not match your database (sync will fail silently otherwise).
 */
const databaseURL =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim()) ||
  "https://film-room-b7780-default-rtdb.firebaseio.com";

/**
 * Must match a domain registered on the Firebase Google OAuth client’s
 * Authorized redirect URIs (…/__/auth/handler). Custom app hosts (e.g.
 * film-room-gray.vercel.app) only work after that URI is added in Google Cloud.
 * Override with NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN once registered.
 */
function resolveAuthDomain(): string {
  const explicit =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()
      : "";
  if (explicit) return explicit;

  // Default to the Firebase-hosted auth helper origin (already on the OAuth client).
  return "film-room-b7780.firebaseapp.com";
}

const firebaseConfig = {
  apiKey: "AIzaSyDoqx15Pb6GSHjPBACABkJaqAj6dAOlH_w",
  authDomain: resolveAuthDomain(),
  databaseURL,
  projectId: "film-room-b7780",
  storageBucket: "film-room-b7780.firebasestorage.app",
  messagingSenderId: "750845861116",
  appId: "1:750845861116:web:577ae5d52b942f716e4b79",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** Realtime Database — live room sync. */
export const db = getDatabase(app);

/** Firebase Auth (Google sign-in). */
export const auth = getAuth(app);

/** Firestore — saved session templates (not live rooms). */
export const firestore = getFirestore(app);

/** Firebase Storage — team logos and uploaded assets. */
export const storage = getStorage(app);
