"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import TacticsBoardCanvas from "@/components/TacticsBoardCanvas";
import {
  getTacticsBoardByShareToken,
  type TacticsBoardShareDoc,
} from "@/lib/tactics-board-share";
import type { TacticsBoardObject } from "@/lib/tactics-boards";

export default function SharedTacticsPage() {
  const params = useParams();
  const shareToken =
    typeof params.shareToken === "string" ? params.shareToken : "";

  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState<TacticsBoardShareDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setError("Invalid link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await getTacticsBoardByShareToken(shareToken);
      if (cancelled) return;
      if (result.ok) {
        setShare(result.share);
        setError(null);
      } else if (result.kind === "revoked") {
        setError("This share link has been revoked.");
      } else if (result.kind === "query_failed") {
        setError(result.message);
      } else {
        setError("Board not found.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030306] text-sm text-zinc-400">
        Loading shared board…
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030306] px-4 text-center text-zinc-50">
        <p className="text-sm text-rose-200">{error ?? "Not found."}</p>
        <Link href="/" className="mt-4 text-xs text-zinc-400 hover:text-zinc-200">
          ← Home
        </Link>
      </div>
    );
  }

  const objects = share.payload.objects as TacticsBoardObject[];

  return (
    <div className="min-h-screen bg-[#030306] px-4 py-8 text-zinc-50">
      <div className="mx-auto max-w-4xl">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          Shared tactics board
        </p>
        <h1 className="mb-1 text-xl font-semibold text-white">
          {share.payload.title}
        </h1>
        <p className="mb-5 text-xs text-zinc-500">
          {share.permission === "edit"
            ? "Link allows editing for signed-in coaches with access."
            : "View only"}
          {share.payload.updatedByName
            ? ` · Last edited by ${share.payload.updatedByName}`
            : share.payload.createdByName
              ? ` · Created by ${share.payload.createdByName}`
              : ""}
        </p>
        <TacticsBoardCanvas
          orientation={share.payload.fieldOrientation}
          objects={objects}
          tool="select"
          readOnly
        />
        <p className="mt-6 text-center text-[11px] text-zinc-600">
          Film Room · Tactics
        </p>
      </div>
    </div>
  );
}
