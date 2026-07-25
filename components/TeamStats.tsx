"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadCsvFile,
  gameStatTypesForSport,
  gameStatsToCsv,
  statTypeLabel,
} from "@/lib/game-stats";
import {
  buildDetailedSeasonStatCsvRows,
  buildSeasonPlayerTableRows,
  buildSeasonStatSummaryCsvRows,
  buildTeamGameStatRecords,
  filterTeamGameStats,
  filterTeamStatGames,
  listSeasonOptions,
  loadTeamGameStatsBundle,
  seasonLabelFromFilters,
  seasonStatsToCsv,
  summarizeSeasonStatsByPlayerFromRecords,
  summarizeSeasonStatsByTeamFromRecords,
  type SeasonStatFilters,
  type SeasonPlayerTableRow,
} from "@/lib/season-stats";
import type { Team } from "@/lib/teams";
import { isBasketballSport, sportLabel } from "@/lib/sports";

export type TeamStatsProps = {
  team: Team;
};

const panelClass =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-5 shadow-lg shadow-black/35 ring-1 ring-white/[0.04]";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/30";

const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]";

function thClass() {
  return "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500";
}

function tdClass() {
  return "px-2 py-2 text-xs text-zinc-300";
}

export default function TeamStats({ team }: TeamStatsProps) {
  const basketball = isBasketballSport(team.sport);
  const availableStatTypes = useMemo(
    () => gameStatTypesForSport(team.sport),
    [team.sport],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [statType, setStatType] = useState("");
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [tableRows, setTableRows] = useState<SeasonPlayerTableRow[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [teamByType, setTeamByType] = useState<Record<string, number>>({});
  const [players, setPlayers] = useState<{ id: string; name: string; jerseyNumber?: string }[]>([]);
  const [filteredGames, setFilteredGames] = useState<ReturnType<typeof filterTeamStatGames>>([]);
  const [filteredRecords, setFilteredRecords] = useState<ReturnType<typeof filterTeamGameStats>>([]);

  const filters = useMemo<SeasonStatFilters>(() => {
    const next: SeasonStatFilters = {};
    if (season) next.season = season;
    if (dateFrom) next.dateFrom = dateFrom;
    if (dateTo) next.dateTo = dateTo;
    if (playerId) next.playerId = playerId;
    if (statType) next.statType = statType;
    return next;
  }, [season, dateFrom, dateTo, playerId, statType]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bundle = await loadTeamGameStatsBundle(team.id);
      setSeasonOptions(listSeasonOptions(bundle.games));
      setPlayers(bundle.players);

      const games = filterTeamStatGames(bundle.games, filters);
      const records = filterTeamGameStats(
        buildTeamGameStatRecords(games, bundle.statsByGameId),
        filters,
      );
      const summaries = summarizeSeasonStatsByPlayerFromRecords(
        records,
        bundle.players,
      );
      const teamSummary = summarizeSeasonStatsByTeamFromRecords(
        records,
        bundle.players,
        team.name,
      );

      setFilteredGames(games);
      setFilteredRecords(records);
      setTableRows(buildSeasonPlayerTableRows(summaries, bundle.players));
      setTeamTotal(teamSummary.totalStats);
      setTeamByType(teamSummary.byType);
    } catch {
      setError("Could not load team stats.");
    } finally {
      setLoading(false);
    }
  }, [team.id, team.name, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleExportSummary = useCallback(() => {
    const summaries = summarizeSeasonStatsByPlayerFromRecords(
      filteredRecords,
      players as Parameters<typeof summarizeSeasonStatsByPlayerFromRecords>[1],
    );
    const csv = seasonStatsToCsv(
      buildSeasonStatSummaryCsvRows({
        teamName: team.name,
        seasonLabel: seasonLabelFromFilters(filters),
        summaries,
        players: players as Parameters<typeof buildSeasonStatSummaryCsvRows>[0]["players"],
      }),
    );
    downloadCsvFile(`${team.name.replace(/\s+/g, "-").toLowerCase()}-season-stats.csv`, csv);
  }, [filteredRecords, players, team.name, filters]);

  const handleExportDetailed = useCallback(() => {
    const csv = gameStatsToCsv(
      buildDetailedSeasonStatCsvRows({
        teamName: team.name,
        games: filteredGames,
        records: filteredRecords,
        players: players as Parameters<typeof buildDetailedSeasonStatCsvRows>[0]["players"],
      }),
    );
    downloadCsvFile(
      `${team.name.replace(/\s+/g, "-").toLowerCase()}-season-stats-detail.csv`,
      csv,
    );
  }, [filteredGames, filteredRecords, players, team.name]);

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading team stats…</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-200">{error}</p>;
  }

  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h2 className="mb-3 text-sm font-semibold text-white">Filters</h2>
        <p className="mb-3 text-xs text-zinc-500">
          {basketball
            ? `Season totals for this ${sportLabel(team.sport)} team (buckets, assists, rebounds…).`
            : "Season totals from game timeline stats."}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] text-zinc-500">Season</span>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className={inputClass}
            >
              <option value="">All seasons</option>
              {seasonOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-zinc-500">Date from</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-zinc-500">Date to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-zinc-500">Player</span>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className={inputClass}
            >
              <option value="">All players</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.jerseyNumber ? ` #${p.jerseyNumber}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-zinc-500">Stat type</span>
            <select
              value={statType}
              onChange={(e) => setStatType(e.target.value)}
              className={inputClass}
            >
              <option value="">All stat types</option>
              {availableStatTypes.map((type) => (
                <option key={type} value={type}>
                  {statTypeLabel(type, team.sport)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-[10px] leading-snug text-zinc-500">
          Stats are calculated from game timeline events. For large clubs,
          denormalized season summaries may be added later.
        </p>
      </section>

      <section className={panelClass}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Team totals</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleExportSummary} className={ghostBtn}>
              Export summary CSV
            </button>
            <button type="button" onClick={handleExportDetailed} className={ghostBtn}>
              Export detailed CSV
            </button>
          </div>
        </div>
        <p className="mb-2 text-sm text-zinc-300">
          <span className="font-medium text-white">{teamTotal}</span> stat events
          {seasonLabelFromFilters(filters) !== "All time"
            ? ` · ${seasonLabelFromFilters(filters)}`
            : ""}
        </p>
        {Object.keys(teamByType).length > 0 ? (
          <p className="text-xs text-zinc-500">
            {Object.entries(teamByType)
              .sort((a, b) => b[1] - a[1])
              .map(
                ([type, count]) =>
                  `${count} ${statTypeLabel(type, team.sport).toLowerCase()}`,
              )
              .join(" · ")}
          </p>
        ) : (
          <p className="text-sm text-zinc-400">
            {basketball
              ? "No basketball stats yet — tag buckets and plays in Review."
              : "No stats match these filters yet."}
          </p>
        )}
      </section>

      <section className={panelClass}>
        <h2 className="mb-3 text-sm font-semibold text-white">Player stats</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className={thClass()}>Player</th>
                <th className={thClass()}>#</th>
                <th className={thClass()}>{basketball ? "Bkt" : "G"}</th>
                <th className={thClass()}>A</th>
                <th className={thClass()}>Sh</th>
                <th className={thClass()}>{basketball ? "Reb" : "SOG"}</th>
                <th className={thClass()}>{basketball ? "Blk" : "Sv"}</th>
                <th className={thClass()}>F</th>
                <th className={thClass()}>{basketball ? "Stl" : "Y"}</th>
                <th className={thClass()}>{basketball ? "TO" : "R"}</th>
                <th className={thClass()}>Other</th>
                <th className={thClass()}>Total</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.playerId} className="border-b border-white/[0.04]">
                  <td className={tdClass()}>{row.playerName}</td>
                  <td className={`${tdClass()} font-mono text-zinc-500`}>
                    {row.jerseyNumber ?? "—"}
                  </td>
                  <td className={tdClass()}>{row.goals}</td>
                  <td className={tdClass()}>{row.assists}</td>
                  <td className={tdClass()}>{row.shots}</td>
                  <td className={tdClass()}>{row.shotOnGoal}</td>
                  <td className={tdClass()}>{row.saves}</td>
                  <td className={tdClass()}>{row.fouls}</td>
                  <td className={tdClass()}>{row.yellow}</td>
                  <td className={tdClass()}>{row.red}</td>
                  <td className={tdClass()}>{row.customOther}</td>
                  <td className={`${tdClass()} font-medium text-white`}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
