"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  isPlayerAccount,
  loadUserProfile,
  userNeedsOnboarding,
} from "@/lib/user-profile";

/**
 * Do not block the dashboard on profile reads. That gate caused successful
 * Google sign-ins to look stuck / bounce back to the signed-out screen while
 * Firestore redirects were pending.
 */
export default function AppSectionLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || !user || pathname === "/app/welcome") return;

    let cancelled = false;
    void loadUserProfile(user.uid)
      .then((profile) => {
        if (cancelled) return;
        if (isPlayerAccount(profile)) {
          router.replace("/player");
          return;
        }
        if (userNeedsOnboarding(profile)) {
          router.replace("/app/welcome");
        }
      })
      .catch((err) => {
        console.error("[app-layout:profile]", err);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, pathname, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return children;
}
