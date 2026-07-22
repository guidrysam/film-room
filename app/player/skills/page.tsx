"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import PlayerSkillsLadder from "@/components/PlayerSkillsLadder";
import { isPlayerAccount, loadUserProfile } from "@/lib/user-profile";

export default function PlayerSkillsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/player/sign-in");
      return;
    }
    let cancelled = false;
    void loadUserProfile(user.uid).then((profile) => {
      if (cancelled) return;
      if (!isPlayerAccount(profile)) {
        router.replace("/app");
        return;
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, router]);

  if (loading || !ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50">
      <div className="mx-auto max-w-lg">
        <PlayerSkillsLadder uid={user.uid} />
      </div>
    </div>
  );
}
