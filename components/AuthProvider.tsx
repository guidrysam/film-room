"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { completeGoogleRedirectSignIn } from "@/lib/auth-google";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const AUTH_READY_TIMEOUT_MS = 10_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;
    let unsub: (() => void) | undefined;
    let timeoutId: number | undefined;
    let cancelled = false;

    const finish = (next: User | null) => {
      if (settled) {
        setUser(next);
        return;
      }
      settled = true;
      setUser(next);
      setLoading(false);
    };

    void (async () => {
      try {
        await completeGoogleRedirectSignIn();
      } catch (err) {
        console.error("[auth:redirect-init]", err);
      }
      if (cancelled) return;

      unsub = onAuthStateChanged(
        auth,
        (u) => finish(u),
        (err) => {
          console.error("[auth]", err);
          finish(null);
        },
      );

      timeoutId = window.setTimeout(() => {
        if (!settled) {
          console.warn("[auth] timed out waiting for auth state");
          finish(auth.currentUser);
        }
      }, AUTH_READY_TIMEOUT_MS);
    })();

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      unsub?.();
    };
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
