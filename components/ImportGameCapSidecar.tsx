"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addGameEvent,
  type Game,
  type GameVideoSource,
} from "@/lib/games";
import {
  parseGameCapSidecar,
  sidecarEventsToTimelineInputs,
} from "@/lib/gamecap-sidecar";

export type ImportGameCapSidecarProps = {
  game: Game;
  sources: GameVideoSource[];
  currentUid: string;
  currentDisplayName?: string | null;
  onComplete?: () => void;
};

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50";
const primaryBtn =
  "rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";

/**
 * Import Game Cap recording sidecar JSON as coach_mark timeline events.
 */
export default function ImportGameCapSidecar({
  game,
  sources,
  currentUid,
  currentDisplayName,
  onComplete,
}: ImportGameCapSidecarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const mainSource = useMemo(() => {
    const bySlot = sources.find((s) => s.angleSlot === "main");
    if (bySlot) return bySlot;
    return (
      sources.find((s) => /main/i.test(s.label)) ??
      sources.find((s) => s.kind === "upload" && s.driveFileId) ??
      sources[0] ??
      null
    );
  }, [sources]);

  const importFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const text = await file.text();
        const json = JSON.parse(text) as unknown;
        const sidecar = parseGameCapSidecar(json);
        const inputs = sidecarEventsToTimelineInputs(sidecar, {
          mainOffsetFromGameTime: mainSource?.offsetFromGameTime ?? 0,
          sourceId: mainSource?.id,
          createdBy: currentUid,
          createdByName: currentDisplayName ?? undefined,
        });
        if (inputs.length === 0) {
          throw new Error("No timed events found in sidecar.");
        }
        for (const input of inputs) {
          await addGameEvent(game.id, input);
        }
        setMessage(`Imported ${inputs.length} mark${inputs.length === 1 ? "" : "s"} from Game Cap.`);
        onComplete?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      } finally {
        setBusy(false);
      }
    },
    [game.id, mainSource, currentUid, currentDisplayName, onComplete],
  );

  return (
    <div className="rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 ring-1 ring-white/[0.04]">
      <h3 className="text-sm font-semibold text-white">Import Game Cap marks</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Upload the sidecar JSON next to your Main recording (
        <span className="font-mono text-zinc-400">.mov</span> →{" "}
        <span className="font-mono text-zinc-400">.json</span>). Marks become
        cut anchors for AI propose-cut.
      </p>
      {mainSource ? (
        <p className="mt-1 text-[11px] text-zinc-500">
          Using Main offset from{" "}
          <span className="text-zinc-300">{mainSource.label}</span>
          {typeof mainSource.offsetFromGameTime === "number"
            ? ` (${mainSource.offsetFromGameTime >= 0 ? "+" : ""}${mainSource.offsetFromGameTime}s)`
            : ""}
          .
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-rose-300">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-emerald-300">{message}</p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryBtn}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Importing…" : "Choose sidecar JSON"}
        </button>
        <button
          type="button"
          className={ghostBtn}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Re-import
        </button>
      </div>
    </div>
  );
}
