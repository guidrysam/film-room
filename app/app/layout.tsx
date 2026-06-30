"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { loadUserProfile, userNeedsOnboarding } from "@/lib/user-profile";

export default function AppSectionLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user || pathname === "/app/welcome") {
      setChecking(false);
      return;
    }

    let cancelled = false;
    void loadUserProfile(user.uid).then((profile) => {
      if (cancelled) return;
      if (userNeedsOnboarding(profile)) {
        router.replace("/app/welcome");
        return;
      }
      setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, pathname, router]);

  if (authLoading || (user && checking && pathname !== "/app/welcome")) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return children;
}
