"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_USER_PRIVACY_SETTINGS,
  formatExpiresDaysLabel,
  INVITE_EXPIRY_OPTIONS,
  loadUserPrivacySettings,
  REEL_SHARE_EXPIRY_OPTIONS,
  saveUserPrivacySettings,
  type UserPrivacySettings,
} from "@/lib/user-privacy-settings";

export type PrivacySettingsFormProps = {
  uid: string;
  onSaved?: (settings: UserPrivacySettings) => void;
};

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const primaryBtn =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm font-medium text-zinc-100">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">
          {description}
        </span>
      </span>
    </label>
  );
}

export default function PrivacySettingsForm({
  uid,
  onSaved,
}: PrivacySettingsFormProps) {
  const [settings, setSettings] = useState<UserPrivacySettings>(
    DEFAULT_USER_PRIVACY_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadUserPrivacySettings(uid).then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveUserPrivacySettings(uid, settings);
      setSettings(saved);
      setMessage("Privacy settings saved.");
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }, [uid, settings, onSaved]);

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading privacy settings…</p>;
  }

  return (
    <div className="space-y-6">
      <section className={panelClass}>
        <h2 className="mb-1 text-sm font-semibold text-white">
          YouTube uploads
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-zinc-400">
          Film Room cannot host raw video — sideline clips live on your YouTube
          channel. We upload as{" "}
          <span className="text-zinc-200">Unlisted + embeddable</span> so your
          team can sync and review inside the app without publishing to YouTube
          search.
        </p>
        <p className="rounded-md border border-sky-500/25 bg-sky-950/20 px-3 py-2 text-xs leading-relaxed text-sky-100/90">
          Avoid Public YouTube for youth film. Anyone with the link can still
          open an Unlisted video on youtube.com — team access in Film Room is
          controlled separately below.
        </p>
      </section>

      <section className={panelClass}>
        <h2 className="mb-1 text-sm font-semibold text-white">Who can access</h2>
        <p className="mb-3 text-xs leading-relaxed text-zinc-400">
          We are not a closed ecosystem — video stays on YouTube and you choose
          who gets into your team and games in Film Room.
        </p>
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">
              Default game visibility
            </span>
            <select
              className={inputClass}
              value={settings.defaultGameVisibility}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultGameVisibility:
                    e.target.value === "link" ? "link" : "private",
                }))
              }
            >
              <option value="private">Private — team members only</option>
              <option value="link">
                Link — anyone with a game link (use sparingly)
              </option>
            </select>
          </label>
          <ToggleRow
            label="Prefer team-only access"
            description="New invite links and shares should assume team membership first. Anonymous watch links are optional, not the default workflow."
            checked={settings.preferTeamOnlyAccess}
            onChange={(next) =>
              setSettings((prev) => ({ ...prev, preferTeamOnlyAccess: next }))
            }
          />
          <ToggleRow
            label="Limit parents and players to linked kids (coming soon)"
            description="When enabled, parents and players will only see games and highlights tied to roster players they are linked to. Save your preference now — enforcement is not live yet."
            checked={settings.limitAccessToLinkedPlayers}
            onChange={(next) =>
              setSettings((prev) => ({
                ...prev,
                limitAccessToLinkedPlayers: next,
              }))
            }
          />
        </div>
      </section>

      <section className={panelClass}>
        <h2 className="mb-1 text-sm font-semibold text-white">
          How long access lasts
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-zinc-400">
          Join links and highlight watch links can expire automatically so access
          does not linger after a season or event.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">
              Team invite links
            </span>
            <select
              className={inputClass}
              value={settings.teamInviteExpiresDays}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  teamInviteExpiresDays: Number(e.target.value),
                }))
              }
            >
              {INVITE_EXPIRY_OPTIONS.map((days) => (
                <option key={`team-${days}`} value={days}>
                  {formatExpiresDaysLabel(days)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">
              Game invite links
            </span>
            <select
              className={inputClass}
              value={settings.gameInviteExpiresDays}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  gameInviteExpiresDays: Number(e.target.value),
                }))
              }
            >
              {INVITE_EXPIRY_OPTIONS.map((days) => (
                <option key={`game-${days}`} value={days}>
                  {formatExpiresDaysLabel(days)}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-300">
              Highlight reel watch links
            </span>
            <select
              className={inputClass}
              value={settings.reelShareExpiresDays}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  reelShareExpiresDays: Number(e.target.value),
                }))
              }
            >
              {REEL_SHARE_EXPIRY_OPTIONS.map((days) => (
                <option key={`reel-${days}`} value={days}>
                  {formatExpiresDaysLabel(days)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3">
          <ToggleRow
            label="Confirm before creating a public reel watch link"
            description="Shows a reminder that anyone with the link can watch — even without a Film Room account."
            checked={settings.confirmBeforeReelShare}
            onChange={(next) =>
              setSettings((prev) => ({
                ...prev,
                confirmBeforeReelShare: next,
              }))
            }
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className={primaryBtn}
        >
          {saving ? "Saving…" : "Save privacy settings"}
        </button>
        {message ? (
          <p className="text-sm text-emerald-300">{message}</p>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}
