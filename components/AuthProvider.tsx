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

const AUTH_READY_TIMEOUT_MS = 8_000;
const REDIRECT_RESULT_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;
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

    const unsub = onAuthStateChanged(
      auth,
      (u) => finish(u),
      (err) => {
        console.error("[auth]", err);
        finish(null);
      },
    );

    void withTimeout(
      completeGoogleRedirectSignIn(),
      REDIRECT_RESULT_TIMEOUT_MS,
    ).then((cred) => {
      if (cancelled) return;
      if (cred?.user) finish(cred.user);
    });

    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        console.warn("[auth] timed out waiting for auth state");
        finish(auth.currentUser);
      }
    }, AUTH_READY_TIMEOUT_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsub();
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
