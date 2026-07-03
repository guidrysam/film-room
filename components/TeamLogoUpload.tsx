"use client";

import { useRef, useState } from "react";
import { uploadTeamLogo } from "@/lib/team-logo";
import type { Team } from "@/lib/teams";

export type TeamLogoUploadProps = {
  team: Team;
  onUpdated?: (logoUrl: string) => void;
};

export default function TeamLogoUpload({ team, onUpdated }: TeamLogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(team.logoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/25 p-3">
      <p className="text-xs font-semibold text-zinc-100">Team logo</p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Used on highlight reel title screens. Square PNG or JPG works best.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`${team.name} logo`}
            className="h-14 w-14 rounded-full object-cover ring-1 ring-white/15"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-[10px] text-zinc-500">
            No logo
          </div>
        )}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              setMessage(null);
              void uploadTeamLogo(team.id, file)
                .then((url) => {
                  setLogoUrl(url);
                  onUpdated?.(url);
                  setMessage("Logo saved.");
                })
                .catch((err) => {
                  const text =
                    err instanceof Error ? err.message : "Could not upload logo.";
                  setMessage(text);
                })
                .finally(() => setUploading(false));
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
          </button>
        </div>
      </div>
      {message ? (
        <p className="mt-2 text-[10px] text-zinc-400">{message}</p>
      ) : null}
    </div>
  );
}
