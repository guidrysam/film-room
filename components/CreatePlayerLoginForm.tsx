"use client";

import { type FormEvent, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  teamId: string;
  playerId: string;
  playerName: string;
  alreadyLinked?: boolean;
  onCreated?: (username: string) => void;
};

const inputClass =
  "w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25";

export default function CreatePlayerLoginForm({
  teamId,
  playerId,
  playerName,
  alreadyLinked = false,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (alreadyLinked) {
    return (
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-100">
        This player already has a username login. They can sign in at{" "}
        <span className="font-medium">/player/sign-in</span>.
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!user) {
      setError("Sign in as the parent first.");
      return;
    }
    setSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/auth/create-player-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          username,
          password,
          displayName: playerName,
          teamId,
          playerId,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        username?: string;
        parentEmail?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not create login.");
      }
      const createdUsername = data.username ?? username;
      setSuccess(
        `Login ready. ${playerName} signs in with username “${createdUsername}”. Parent contact email: ${data.parentEmail ?? "your account email"}.`,
      );
      setPassword("");
      setConfirm("");
      onCreated?.(createdUsername);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create login.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
    >
      <h3 className="text-sm font-semibold text-white">
        Create player username &amp; password
      </h3>
      <p className="mt-1 text-xs leading-5 text-zinc-400">
        Your email stays the household contact. {playerName} gets a simple
        username so they can sign in without using your Google account.
      </p>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
            Username
          </span>
          <input
            className={inputClass}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="samsoccer"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
            Password
          </span>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
            Confirm password
          </span>
          <input
            className={inputClass}
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={6}
            required
          />
        </label>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-200">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-3 text-sm text-emerald-200">{success}</p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="mt-4 w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create player login"}
      </button>
    </form>
  );
}
