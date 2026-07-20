"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  filmReferenceFromTimelineEvent,
  recommendDevelopmentFollowUps,
  resolveGoalsForEvidenceTags,
  suggestFilmEvidence,
} from "@/lib/academy/film-evidence";
import { saveFilmEvidenceAttachment } from "@/lib/academy/film-evidence-store";
import type { AcademyGameEvidenceTag } from "@/lib/academy/types";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";
import type { GameTimelineEvent } from "@/lib/games";
import { getEventPlayerIds, getEventPersonIds } from "@/lib/timeline-players";

type CategoryFilter = "all" | "positive" | "improvement";

type AcademyFilmEvidencePickerProps = {
  gameId: string;
  teamId: string;
  currentUid: string;
  selectedEvent: GameTimelineEvent | null;
};

const catalog = U12_ACADEMY_GOAL_CATALOG;

export default function AcademyFilmEvidencePicker({
  gameId,
  teamId,
  currentUid,
  selectedEvent,
}: AcademyFilmEvidencePickerProps) {
  const [category, setCategory] = useState<CategoryFilter>("improvement");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSavedGoalIds, setLastSavedGoalIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedTagIds([]);
    setNote("");
    setMessage(null);
    setLastSavedGoalIds([]);
  }, [selectedEvent?.id]);

  const suggestion = useMemo(() => {
    if (!selectedEvent) return null;
    return suggestFilmEvidence(catalog, selectedEvent, {
      category: category === "all" ? undefined : category,
      limit: 10,
    });
  }, [category, selectedEvent]);

  const suggestedTags = useMemo((): AcademyGameEvidenceTag[] => {
    if (!suggestion) return [];
    const byId = new Map(
      catalog.evidenceTags.map((tag) => [tag.id, tag as AcademyGameEvidenceTag]),
    );
    return suggestion.suggestedTagIds.flatMap((id) => {
      const tag = byId.get(id);
      return tag ? [tag] : [];
    });
  }, [suggestion]);

  const resolvedGoals = useMemo(
    () => resolveGoalsForEvidenceTags(catalog, selectedTagIds),
    [selectedTagIds],
  );
  const followUp = useMemo(
    () => recommendDevelopmentFollowUps(catalog, selectedTagIds),
    [selectedTagIds],
  );

  function toggleTag(tagId: string): void {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );
  }

  async function handleSave(): Promise<void> {
    if (!selectedEvent || selectedTagIds.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveFilmEvidenceAttachment({
        teamId,
        createdBy: currentUid,
        catalogId: catalog.id,
        catalogVersion: catalog.version,
        filmReference: filmReferenceFromTimelineEvent(gameId, selectedEvent),
        evidenceTagIds: selectedTagIds,
        goalIds: resolvedGoals.map((goal) => goal.id),
        playerIds: getEventPlayerIds(selectedEvent),
        personIds: getEventPersonIds(selectedEvent),
        note,
      });
      setMessage(
        `Linked to ${resolvedGoals.length} development goal${
          resolvedGoals.length === 1 ? "" : "s"
        }.`,
      );
      setLastSavedGoalIds(resolvedGoals.map((goal) => goal.id));
      setSelectedTagIds([]);
      setNote("");
    } catch {
      setMessage("Could not save development evidence.");
    } finally {
      setSaving(false);
    }
  }

  if (!selectedEvent) {
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Development evidence
        </p>
        <p className="text-[11px] leading-snug text-zinc-500">
          Select a tagged play or stat on the timeline, then confirm the teaching
          tag. Suggestions never invent tactical intent.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Development evidence
      </p>
      <p className="mb-3 text-[11px] leading-snug text-zinc-500">
        Confirm what this clip teaches. Film Room suggests tags from the event
        family; you choose the development goal.
      </p>

      <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
        <p className="font-mono text-[11px] text-zinc-300">
          {selectedEvent.label?.trim() || selectedEvent.type} ·{" "}
          {Math.floor(selectedEvent.t / 60)}:
          {String(Math.floor(selectedEvent.t % 60)).padStart(2, "0")}
        </p>
        {suggestion ? (
          <p className="mt-1 text-[10px] text-zinc-500">
            Event family: {suggestion.eventTypes.join(", ")} · confidence{" "}
            {suggestion.confidence}
          </p>
        ) : null}
      </div>

      <div className="mb-3 flex gap-1">
        {(
          [
            ["improvement", "Improve"],
            ["positive", "Positive"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              category === value
                ? "border border-cyan-500/40 bg-cyan-950/30 text-cyan-100"
                : "border border-white/10 text-zinc-400 hover:bg-white/[0.04]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mb-3 max-h-48 space-y-1.5 overflow-y-auto">
        {suggestedTags.map((tag) => {
          const active = selectedTagIds.includes(tag.id);
          return (
            <li key={tag.id}>
              <button
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  active
                    ? "border-cyan-500/40 bg-cyan-950/25"
                    : "border-white/[0.08] bg-black/15 hover:bg-white/[0.04]"
                }`}
              >
                <span className="block text-[11px] font-medium text-zinc-100">
                  {tag.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  {tag.category.replaceAll("_", " ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {resolvedGoals.length > 0 ? (
        <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            Linked goals
          </p>
          <ul className="mt-1 space-y-1 text-[11px] text-zinc-300">
            {resolvedGoals.map((goal) => (
              <li key={goal.id}>• {goal.title}</li>
            ))}
          </ul>
          {followUp.coachCues[0] ? (
            <p className="mt-2 text-[10px] text-zinc-500">
              Cue: {followUp.coachCues[0]}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="mb-3 block">
        <span className="mb-1 block text-[10px] text-zinc-500">
          Note (optional)
        </span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What should the player notice?"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
        />
      </label>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || selectedTagIds.length === 0}
        className="w-full rounded-lg border border-blue-500/40 bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save development evidence"}
      </button>
      {message ? (
        <p className="mt-2 text-[11px] text-zinc-400">{message}</p>
      ) : null}
      {lastSavedGoalIds.length > 0 ? (
        <Link
          href={`/team/${teamId}/academy?goals=${encodeURIComponent(
            lastSavedGoalIds.join(","),
          )}`}
          className="mt-2 block w-full rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-1.5 text-center text-xs font-semibold text-emerald-100 hover:bg-emerald-950/35"
        >
          Generate practice or game plan
        </Link>
      ) : null}
    </div>
  );
}
