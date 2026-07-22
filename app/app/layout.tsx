"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  isPlayerAccount,
  loadUserProfile,
  userNeedsOnboarding,
} from "@/lib/user-profile";

export default function AppSectionLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const skipProfileGate = !user || pathname === "/app/welcome";
  const [allowedUid, setAllowedUid] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || skipProfileGate || !user) return;

    let cancelled = false;
    void loadUserProfile(user.uid).then((profile) => {
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
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, skipProfileGate, user, router]);

  const profileReady = skipProfileGate || allowedUid === user?.uid;

  if (authLoading || !profileReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return children;
}
