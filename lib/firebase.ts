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
 * Prefer the app host as authDomain so Safari redirect sign-in stays
 * first-party (paired with `/__/auth` rewrite in next.config).
 * Override with NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN when needed.
 */
function resolveAuthDomain(): string {
  const explicit =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()
      : "";
  if (explicit) return explicit;

  const appUrl =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL?.trim()
      : "";
  if (appUrl) {
    try {
      return new URL(appUrl).hostname;
    } catch {
      /* fall through */
    }
  }

  // SSR + client must agree; use localhost in dev, production host otherwise.
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    return "localhost";
  }

  return "film-room-gray.vercel.app";
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
