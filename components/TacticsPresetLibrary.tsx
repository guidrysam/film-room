"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TacticsPresetPreview from "@/components/TacticsPresetPreview";
import TacticsPresetThumbnail from "@/components/TacticsPresetThumbnail";
import { tacticsBoardEditorUrl } from "@/lib/tactics-board-share";
import { createBoardFromPreset } from "@/lib/tactics-preset-copy";
import {
  BUILT_IN_TACTICS_PRESETS,
} from "@/lib/tactics-presets";
import { filterTacticsPresets } from "@/lib/tactics-presets/filter";
import {
  PRESET_CATEGORY_LABELS,
  PRESET_DIFFICULTY_LABELS,
  PRESET_FORMAT_LABELS,
  type TacticsPreset,
  type TacticsPresetCategory,
  type TacticsPresetDifficulty,
  type TacticsPresetFormat,
  type TacticsPresetSourceType,
  type TeamTacticsPreset,
} from "@/lib/tactics-presets/types";
import {
  deleteTeamTacticsPreset,
  duplicateTeamTacticsPreset,
  listTeamTacticsPresets,
  updateTeamTacticsPreset,
} from "@/lib/tactics-team-presets";
import type { Team } from "@/lib/teams";

const chip =
  "min-h-11 rounded-xl border px-3 text-xs font-semibold transition";
const button =
  "min-h-11 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.08]";
const primary =
  "min-h-11 rounded-xl border border-blue-500/40 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500";

type CatalogItem = {
  preset: TacticsPreset;
  sourceType: TacticsPresetSourceType;
};

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export default function TacticsPresetLibrary({
  team,
  currentUid,
  displayName,
  onClose,
  modal = false,
}: {
  team: Team;
  currentUid: string;
  displayName?: string | null;
  onClose: () => void;
  modal?: boolean;
}) {
  const router = useRouter();
  const [teamPresets, setTeamPresets] = useState<TeamTacticsPreset[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [query, setQuery] = useState("");
  const [formats, setFormats] = useState<TacticsPresetFormat[]>([]);
  const [categories, setCategories] = useState<TacticsPresetCategory[]>([]);
  const [difficulties, setDifficulties] = useState<
    TacticsPresetDifficulty[]
  >([]);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const refreshTeamPresets = async () => {
    setLoadingTeam(true);
    try {
      setTeamPresets(
        await listTeamTacticsPresets(team.id, currentUid),
      );
    } catch {
      setTeamPresets([]);
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    void refreshTeamPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, currentUid]);

  const items = useMemo<CatalogItem[]>(() => {
    const all: CatalogItem[] = [
      ...BUILT_IN_TACTICS_PRESETS.map((preset) => ({
        preset,
        sourceType: "built_in" as const,
      })),
      ...teamPresets.map((preset) => ({
        preset,
        sourceType: "team" as const,
      })),
    ];
    const filtered = filterTacticsPresets(
      all.map((item) => item.preset),
      { query, formats, categories, difficulties },
    );
    const ids = new Set(filtered.map((preset) => preset.id));
    return all.filter((item) => ids.has(item.preset.id));
  }, [categories, difficulties, formats, query, teamPresets]);

  const handleUsePreset = async (item: CatalogItem) => {
    setCreatingId(item.preset.id);
    try {
      const board = await createBoardFromPreset(
        team.id,
        currentUid,
        item.preset,
        item.sourceType,
        displayName,
      );
      router.push(tacticsBoardEditorUrl(team.id, board.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not use preset.");
      setCreatingId(null);
    }
  };

  const handleTeamPresetAction = async (
    action: () => Promise<unknown>,
  ) => {
    try {
      await action();
      await refreshTeamPresets();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Team preset action failed.",
      );
    }
  };

  return (
    <section
      className={
        modal
          ? "fixed inset-0 z-40 space-y-4 overflow-y-auto bg-zinc-950 p-4 sm:p-6"
          : "space-y-4 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-4 sm:p-5"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300">
            Preset Library
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Soccer teaching examples
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-400">
            Presets are editable teaching examples. Adapt field size, numbers,
            rules, and difficulty to your players.
          </p>
        </div>
        <button type="button" className={button} onClick={onClose}>
          Close
        </button>
      </div>

      <label className="block">
        <span className="sr-only">Search presets</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, tags, objectives, or coaching points"
          className="min-h-11 w-full rounded-xl border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500/45"
        />
      </label>

      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["9v9", "11v11", "small_sided"] as const).map((format) => (
            <button
              key={format}
              type="button"
              className={`${chip} ${
                formats.includes(format)
                  ? "border-blue-500/50 bg-blue-600/25 text-white"
                  : "border-white/10 bg-white/[0.03] text-zinc-300"
              }`}
              onClick={() => setFormats(toggleValue(formats, format))}
            >
              {PRESET_FORMAT_LABELS[format]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            Object.keys(PRESET_CATEGORY_LABELS) as TacticsPresetCategory[]
          ).map((category) => (
            <button
              key={category}
              type="button"
              className={`${chip} shrink-0 ${
                categories.includes(category)
                  ? "border-blue-500/50 bg-blue-600/25 text-white"
                  : "border-white/10 bg-white/[0.03] text-zinc-300"
              }`}
              onClick={() =>
                setCategories(toggleValue(categories, category))
              }
            >
              {PRESET_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            Object.keys(
              PRESET_DIFFICULTY_LABELS,
            ) as TacticsPresetDifficulty[]
          ).map((difficulty) => (
            <button
              key={difficulty}
              type="button"
              className={`${chip} ${
                difficulties.includes(difficulty)
                  ? "border-blue-500/50 bg-blue-600/25 text-white"
                  : "border-white/10 bg-white/[0.03] text-zinc-300"
              }`}
              onClick={() =>
                setDifficulties(toggleValue(difficulties, difficulty))
              }
            >
              {PRESET_DIFFICULTY_LABELS[difficulty]}
            </button>
          ))}
          {(formats.length > 0 ||
            categories.length > 0 ||
            difficulties.length > 0 ||
            query) && (
            <button
              type="button"
              className={`${chip} border-white/10 text-zinc-400`}
              onClick={() => {
                setFormats([]);
                setCategories([]);
                setDifficulties([]);
                setQuery("");
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loadingTeam ? (
        <p className="text-xs text-zinc-500">Loading team presets…</p>
      ) : null}

      <p className="text-xs text-zinc-500">
        {items.length} {items.length === 1 ? "preset" : "presets"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const { preset, sourceType } = item;
          return (
            <article
              key={`${sourceType}-${preset.id}`}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 [content-visibility:auto] [contain-intrinsic-size:420px]"
            >
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => setSelected(item)}
              >
                <TacticsPresetThumbnail preset={preset} />
              </button>
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-300">
                  {sourceType === "built_in"
                    ? "Film Room Preset"
                    : "Team Preset"}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-white">
                  {preset.title}
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {PRESET_FORMAT_LABELS[preset.format]} ·{" "}
                  {PRESET_CATEGORY_LABELS[preset.category]} ·{" "}
                  {preset.steps.length} steps
                  {preset.estimatedMinutes
                    ? ` · ${preset.estimatedMinutes} min`
                    : ""}
                </p>
                <p className="mt-1 text-[10px] font-medium text-zinc-400">
                  {PRESET_DIFFICULTY_LABELS[preset.difficulty]}
                </p>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">
                  {preset.shortDescription}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    onClick={() => setSelected(item)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={primary}
                    disabled={creatingId === preset.id}
                    onClick={() => void handleUsePreset(item)}
                  >
                    {creatingId === preset.id ? "Creating…" : "Use Preset"}
                  </button>
                </div>
                {sourceType === "team" ? (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-white/[0.06] pt-2">
                    <button
                      type="button"
                      className={button}
                      onClick={() => void handleUsePreset(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        const title = window.prompt(
                          "Rename team preset",
                          preset.title,
                        );
                        if (!title?.trim()) return;
                        void handleTeamPresetAction(() =>
                          updateTeamTacticsPreset(
                            team.id,
                            preset.id,
                            currentUid,
                            { title },
                          ),
                        );
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className={button}
                      onClick={() =>
                        void handleTeamPresetAction(() =>
                          duplicateTeamTacticsPreset(
                            team.id,
                            preset.id,
                            currentUid,
                          ),
                        )
                      }
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className={`${button} !text-rose-300`}
                      onClick={() => {
                        if (!window.confirm(`Delete “${preset.title}”?`)) return;
                        void handleTeamPresetAction(() =>
                          deleteTeamTacticsPreset(
                            team.id,
                            preset.id,
                            currentUid,
                          ),
                        );
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {selected ? (
        <TacticsPresetPreview
          preset={selected.preset}
          sourceType={selected.sourceType}
          onClose={() => setSelected(null)}
          onUse={() => handleUsePreset(selected)}
        />
      ) : null}
    </section>
  );
}
