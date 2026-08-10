import { initializeApp, getApps, getApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from "firebase/auth";
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

const firebaseConfig = {
  apiKey: "AIzaSyDoqx15Pb6GSHjPBACABkJaqAj6dAOlH_w",
  authDomain: "film-room-b7780.firebaseapp.com",
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

/** Keep Google sessions across reloads (Safari / ITP-safe default). */
if (typeof window !== "undefined") {
  void setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[auth:persistence]", err);
  });
}

/** Firestore — saved session templates (not live rooms). */
export const firestore = getFirestore(app);

/** Firebase Storage — team logos and uploaded assets. */
export const storage = getStorage(app);
