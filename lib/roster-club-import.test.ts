import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TEAMLINKT_CLUB_ROSTER_FIXTURE_CSV } from "./roster-fixtures";
import { parseRosterCsvText } from "./roster-csv-parse";
import { buildRosterImportPreview } from "./roster-import";
import {
  buildClubImportPlan,
  classifyTeamSync,
  groupPreviewRowsByTeam,
  UNASSIGNED_TEAM_NAME,
} from "./roster-club-import";
import type { Player } from "./teams";
import type { ParentInviteTarget } from "./parent-invite-targets";
import type { Team } from "./teams";

function clubPreview() {
  const parsed = parseRosterCsvText(TEAMLINKT_CLUB_ROSTER_FIXTURE_CSV);
  assert.ok(!("error" in parsed));
  if ("error" in parsed) throw new Error("fixture failed to parse");
  return buildRosterImportPreview(parsed.parsedRows, []);
}

function stubTeam(id: string, name: string): Team {
  return {
    id,
    name,
    ownerId: "owner",
    members: { owner: "admin" },
    memberUids: ["owner"],
    createdAt: null,
    updatedAt: null,
  };
}

describe("groupPreviewRowsByTeam", () => {
  it("splits a club-wide roster into one group per team name", () => {
    const groups = groupPreviewRowsByTeam(clubPreview());

    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((g) => g.teamName),
      ["U14 Wolves", "U15 Hawks"],
    );
  });

  it("counts players and parent contacts per team", () => {
    const groups = groupPreviewRowsByTeam(clubPreview());
    const wolves = groups.find((g) => g.teamName === "U14 Wolves")!;
    const hawks = groups.find((g) => g.teamName === "U15 Hawks")!;

    // Wolves: Alex (2 contacts) + Maria (1 contact); Coach Bob is skipped.
    assert.equal(wolves.summary.playerCount, 2);
    assert.equal(wolves.summary.parentContactCount, 3);
    assert.equal(wolves.summary.skippedCount, 1);

    assert.equal(hawks.summary.playerCount, 2);
    assert.equal(hawks.summary.parentContactCount, 2);
    assert.equal(hawks.summary.skippedCount, 0);
  });

  it("preserves the same number of importable rows across all groups", () => {
    const preview = clubPreview();
    const groups = groupPreviewRowsByTeam(preview);
    const importable = preview.filter(
      (r) => r.status === "create" || r.status === "update",
    ).length;
    const grouped = groups.reduce((sum, g) => sum + g.summary.playerCount, 0);
    assert.equal(grouped, importable);
  });

  it("falls back for rows without a team name", () => {
    const groups = groupPreviewRowsByTeam(
      [
        { rowIndex: 2, playerName: "No Team", status: "create" },
        { rowIndex: 3, playerName: "Has Team", teamName: "Real", status: "create" },
      ],
      "Fallback FC",
    );
    assert.deepEqual(
      groups.map((g) => g.teamName),
      ["Fallback FC", "Real"],
    );
    assert.equal(groups[0]!.sourceTeamName, "");
    assert.equal(UNASSIGNED_TEAM_NAME, "Unassigned");
  });
});

describe("buildClubImportPlan", () => {
  it("flags teams that match existing teams (case-insensitive)", () => {
    const groups = groupPreviewRowsByTeam(clubPreview());
    const plan = buildClubImportPlan(groups, [stubTeam("t1", "u14 wolves")]);

    const wolves = plan.find((p) => p.teamName === "U14 Wolves")!;
    const hawks = plan.find((p) => p.teamName === "U15 Hawks")!;

    assert.equal(wolves.matchesExistingTeam, true);
    assert.equal(wolves.existingTeamId, "t1");
    assert.equal(hawks.matchesExistingTeam, false);
    assert.equal(hawks.existingTeamId, undefined);
  });

  it("treats every team as new when there are no existing teams", () => {
    const groups = groupPreviewRowsByTeam(clubPreview());
    const plan = buildClubImportPlan(groups, []);
    assert.equal(plan.every((p) => !p.matchesExistingTeam), true);
  });
});

function wolvesRows() {
  return groupPreviewRowsByTeam(clubPreview()).find(
    (g) => g.teamName === "U14 Wolves",
  )!.rows;
}

const ALEX: Player = {
  id: "a",
  name: "Alex Smith",
  jerseyNumber: "7",
  position: "Forward",
};
const MARIA: Player = {
  id: "m",
  name: "Maria Lopez",
  jerseyNumber: "9",
  position: "Midfield",
};

function target(
  id: string,
  parentName: string,
  email: string,
  playerId: string,
  playerName: string,
  phone: string,
): ParentInviteTarget {
  return {
    id,
    parentName,
    email,
    phone,
    playerId,
    playerName,
    status: "not_invited",
    createdAt: null,
    updatedAt: null,
    joinedAt: null,
  };
}

const WOLVES_PARENTS: ParentInviteTarget[] = [
  target("t1", "Jane Smith", "jane@example.com", "a", "Alex Smith", "555-0100"),
  target("t2", "John Smith", "john@example.com", "a", "Alex Smith", "555-0101"),
  target("t3", "Rosa Lopez", "rosa@example.com", "m", "Maria Lopez", "555-0102"),
];

describe("classifyTeamSync", () => {
  it("classifies everything as new for a brand-new team", () => {
    const sync = classifyTeamSync(wolvesRows(), [], []);
    assert.deepEqual(sync.players, { new: 2, updated: 0, unchanged: 0 });
    assert.deepEqual(sync.parents, { new: 3, updated: 0, unchanged: 0 });
    assert.equal(sync.skipped, 1); // Coach Bob
    assert.deepEqual(sync.missingPlayers, []);
  });

  it("re-importing an identical roster is fully idempotent (all unchanged)", () => {
    const sync = classifyTeamSync(
      wolvesRows(),
      [ALEX, MARIA],
      WOLVES_PARENTS,
    );
    assert.deepEqual(sync.players, { new: 0, updated: 0, unchanged: 2 });
    assert.deepEqual(sync.parents, { new: 0, updated: 0, unchanged: 3 });
    assert.deepEqual(sync.missingPlayers, []);
  });

  it("flags changed player and parent fields as updates", () => {
    const movedAlex: Player = { ...ALEX, position: "Defender" };
    const changedParents = [
      { ...WOLVES_PARENTS[0]!, phone: "555-9999" },
      WOLVES_PARENTS[1]!,
      WOLVES_PARENTS[2]!,
    ];
    const sync = classifyTeamSync(
      wolvesRows(),
      [movedAlex, MARIA],
      changedParents,
    );
    assert.deepEqual(sync.players, { new: 0, updated: 1, unchanged: 1 });
    assert.deepEqual(sync.parents, { new: 0, updated: 1, unchanged: 2 });
  });

  it("creates new players/parents while leaving existing ones unchanged", () => {
    const sync = classifyTeamSync(wolvesRows(), [ALEX], [WOLVES_PARENTS[0]!]);
    assert.deepEqual(sync.players, { new: 1, updated: 0, unchanged: 1 });
    // Alex's jane contact is unchanged; john + Maria's rosa are new.
    assert.deepEqual(sync.parents, { new: 2, updated: 0, unchanged: 1 });
  });

  it("reports existing players missing from the import without removing them", () => {
    const ghost: Player = { id: "g", name: "Old Player", jerseyNumber: "99" };
    const sync = classifyTeamSync(
      wolvesRows(),
      [ALEX, MARIA, ghost],
      WOLVES_PARENTS,
    );
    assert.deepEqual(sync.missingPlayers, ["Old Player"]);
    // No player count includes the ghost — it is simply left alone.
    assert.equal(
      sync.players.new + sync.players.updated + sync.players.unchanged,
      2,
    );
  });
});
