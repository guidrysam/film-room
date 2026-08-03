"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/auth-google";

export default function MacLinkClient() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const initialCode = useMemo(
    () => (params.get("code") ?? "").trim().toUpperCase(),
    [params],
  );
  const [userCode, setUserCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (initialCode) setUserCode(initialCode);
  }, [initialCode]);

  const complete = useCallback(async () => {
    if (!user) return;
    const code = userCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Enter the code shown in Game Cap.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/mac/device?action=complete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userCode: code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Link failed.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link failed.");
    } finally {
      setBusy(false);
    }
  }, [user, userCode]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10 text-zinc-100">
      <h1 className="text-2xl font-semibold tracking-tight">Link Game Cap</h1>
      <p className="text-sm text-zinc-400">
        Sign in with the same Film Room account you use in the browser, then
        confirm the code shown in the Mac app.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Checking sign-in…</p>
      ) : !user ? (
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          onClick={() => void signInWithGoogle().catch(() => {})}
        >
          Sign in with Google
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-950/60 p-4">
          <p className="text-xs text-zinc-400">
            Signed in as {user.email ?? user.uid}
          </p>
          <label className="block text-xs uppercase tracking-wide text-zinc-500">
            Game Cap code
            <input
              className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 font-mono text-lg tracking-[0.3em] text-white uppercase"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoFocus
            />
          </label>
          {error ? (
            <p className="text-xs text-rose-300">{error}</p>
          ) : null}
          {done ? (
            <p className="text-sm text-emerald-300">
              Linked. You can return to Game Cap — it should finish signing in
              automatically.
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              onClick={() => void complete()}
            >
              {busy ? "Linking…" : "Link this Mac"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
