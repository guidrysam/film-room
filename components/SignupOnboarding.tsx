"use client";

import { useCallback, useMemo, useState } from "react";
import {
  SIGNUP_ROLE_OPTIONS,
  postOnboardingPath,
  type SignupRole,
} from "@/lib/signup-roles";
import { completeUserOnboarding } from "@/lib/user-profile";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-6 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const primaryBtn =
  "w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/35 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] disabled:cursor-not-allowed disabled:opacity-50";

export type SignupOnboardingProps = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  /** Pre-checked roles (e.g. from an invite the user just accepted). */
  initialRoles?: SignupRole[];
  onComplete: (path: string) => void;
};

function roleCardClass(selected: boolean): string {
  return [
    "w-full rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
    selected
      ? "border-blue-500/50 bg-blue-950/35 ring-1 ring-blue-500/25"
      : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
  ].join(" ");
}

export default function SignupOnboarding({
  uid,
  email,
  displayName,
  initialRoles = [],
  onComplete,
}: SignupOnboardingProps) {
  const [selected, setSelected] = useState<Set<SignupRole>>(
    () => new Set(initialRoles),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedList = useMemo(() => [...selected], [selected]);

  const toggleRole = useCallback((role: SignupRole) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }, []);

  const handleContinue = useCallback(async () => {
    if (selectedList.length === 0) {
      setError("Choose at least one role.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await completeUserOnboarding({
        uid,
        roles: selectedList,
        email,
        displayName,
      });
      onComplete(postOnboardingPath(selectedList));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your preferences.",
      );
    } finally {
      setSaving(false);
    }
  }, [uid, email, displayName, selectedList, onComplete]);

  return (
    <div className={panelClass}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/90">
        Welcome
      </p>
      <h1 className="mb-2 text-xl font-semibold text-white">
        How will you use Film Room?
      </h1>
      <p className="mb-5 text-sm leading-relaxed text-zinc-400">
        Choose every role that applies. You can belong to multiple teams with
        different roles — this just personalizes your starting point.
      </p>

      <div className="mb-5 space-y-2">
        {SIGNUP_ROLE_OPTIONS.map((option) => {
          const isSelected = selected.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => toggleRole(option.id)}
              className={roleCardClass(isSelected)}
              aria-pressed={isSelected}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                    isSelected
                      ? "border-blue-400/60 bg-blue-600/40 text-white"
                      : "border-white/15 bg-black/20 text-transparent"
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">
                    {option.blurb}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mb-3 text-sm text-rose-200" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleContinue()}
        disabled={saving || selectedList.length === 0}
        className={primaryBtn}
      >
        {saving ? "Saving…" : "Continue"}
      </button>

      {selectedList.length === 0 ? (
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Select at least one role.
        </p>
      ) : null}
    </div>
  );
}
