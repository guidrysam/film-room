"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  isPlayerAccount,
  loadUserProfile,
  userNeedsOnboarding,
} from "@/lib/user-profile";

const PROFILE_LOAD_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("PROFILE_LOAD_TIMEOUT"));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export default function AppSectionLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const skipProfileGate = !user || pathname === "/app/welcome";
  const [allowedUid, setAllowedUid] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowedUid(null);
      setGateError(null);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || skipProfileGate || !user) return;

    let cancelled = false;
    setGateError(null);

    void withTimeout(loadUserProfile(user.uid), PROFILE_LOAD_TIMEOUT_MS)
      .then((profile) => {
        if (cancelled) return;
        if (isPlayerAccount(profile)) {
          router.replace("/player");
          return;
        }
        if (userNeedsOnboarding(profile)) {
          router.replace("/app/welcome");
          return;
        }
        setAllowedUid(user.uid);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[app-layout:profile]", err);
        // Fail open so sign-in is never stuck on Loading forever.
        setAllowedUid(user.uid);
        setGateError(
          "Could not verify your profile quickly — continuing to the dashboard.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, skipProfileGate, user, router]);

  const profileReady = skipProfileGate || allowedUid === user?.uid;

  if (authLoading || !profileReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-zinc-300">
        <p className="text-sm">Loading…</p>
        <p className="text-[11px] text-zinc-600">Signing you in</p>
      </div>
    );
  }

  return (
    <>
      {gateError ? (
        <div className="border-b border-amber-500/30 bg-amber-950/40 px-4 py-2 text-center text-[11px] text-amber-100">
          {gateError}
        </div>
      ) : null}
      {children}
    </>
  );
}
