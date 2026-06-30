"use client";

import { useState } from "react";
import { mergePersons } from "@/lib/person-merge";
import type { PersonDuplicatePair } from "@/lib/persons";

export type PersonDuplicateMergeProps = {
  uid: string;
  pair: PersonDuplicatePair;
  onMerged: () => void;
};

const mergeBtn =
  "rounded-md border border-amber-500/35 bg-amber-950/30 px-2 py-1 text-[10px] font-medium text-amber-100 transition hover:bg-amber-900/40 disabled:opacity-50";

export default function PersonDuplicateMerge({
  uid,
  pair,
  onMerged,
}: PersonDuplicateMergeProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMerge = async (keepId: string, mergeId: string) => {
    setBusy(true);
    setError(null);
    try {
      await mergePersons(uid, keepId, mergeId);
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not merge records.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2.5">
      <p className="text-xs text-amber-100/90">
        {pair.a.name} · {pair.b.name}
        <span className="ml-2 text-[10px] text-amber-200/60">
          {Math.round(pair.score * 100)}% match
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleMerge(pair.a.id, pair.b.id)}
          className={mergeBtn}
        >
          Keep {pair.a.name.split(" ")[0]}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleMerge(pair.b.id, pair.a.id)}
          className={mergeBtn}
        >
          Keep {pair.b.name.split(" ")[0]}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-[10px] text-rose-300">{error}</p> : null}
    </li>
  );
}
