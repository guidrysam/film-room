import assert from "node:assert/strict";
import test from "node:test";
import { ACADEMY_DRILL_CATALOG } from "@/lib/academy/drill-catalog";
import {
  enhanceGamePlanLanguage,
  enhancePracticeLanguage,
} from "@/lib/academy/plan-enhancement";
import {
  generateDeterministicGamePlan,
  generateDeterministicPractice,
} from "@/lib/academy/plan-generation";
import { recommendAcademyContent } from "@/lib/academy/recommendations";
import { U12_ACADEMY_GOAL_CATALOG } from "@/lib/academy/u12-goal-catalog";

const catalog = U12_ACADEMY_GOAL_CATALOG;

test("every existing practice drill has complete Academy metadata", () => {
  assert.equal(ACADEMY_DRILL_CATALOG.length, 15);
  for (const drill of ACADEMY_DRILL_CATALOG) {
    assert.equal(drill.id, drill.sourcePresetId);
    assert.ok(drill.developmentGoalIds.length > 0);
    assert.ok(drill.ageRange.min <= 12 && drill.ageRange.max >= 11);
    assert.ok(drill.players.minimumRoster >= 2);
    assert.ok(drill.players.groupSize >= drill.players.minimumRoster);
    assert.ok(drill.minimumFieldSize.length > 0);
    assert.ok(drill.minimumFieldSize.width > 0);
    assert.ok(drill.durationMinutes > 0);
    assert.ok(drill.coachingCues.length > 0);
    assert.ok(drill.commonErrors.length > 0);
    assert.ok(drill.progressions.length > 0);
    assert.ok(drill.regressions.length > 0);
    assert.ok(drill.suitableSections.length > 0);
  }
});

test("recommendations are deterministic and filter by goal and constraints", () => {
  const request = {
    selectedGoalIds: ["u12-scan-before-receiving"],
    age: 12,
    rosterSize: 14,
    goalkeeperCount: 1,
    fieldSize: { length: 40, width: 30, unit: "yards" as const },
    availableEquipment: ["balls", "cones", "pinnies", "mini goals", "goals"],
    section: "warm_up" as const,
  };
  const first = recommendAcademyContent(catalog, request);
  const second = recommendAcademyContent(catalog, request);
  assert.deepEqual(
    first.drills.map((drill) => drill.id),
    second.drills.map((drill) => drill.id),
  );
  assert.equal(first.drills[0]?.id, "drill-passing-gates-pairs");
  assert.ok(
    first.drills.every((drill) =>
      drill.developmentGoalIds.includes("u12-scan-before-receiving"),
    ),
  );
});

test("practice generator creates all six sections with exact duration", () => {
  const practice = generateDeterministicPractice(catalog, {
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    durationMinutes: 75,
    playerCount: 14,
    goalkeeperCount: 1,
    primaryGoalIds: ["u12-scan-before-receiving"],
    supportingGoalIds: ["u12-receive-open-body"],
    availableEquipment: ["balls", "cones", "pinnies", "mini goals", "goals"],
    fieldSize: { length: 50, width: 35, unit: "yards" },
  });
  assert.deepEqual(
    practice.sections.map((section) => section.kind),
    [
      "warm_up",
      "technical",
      "small_group",
      "conditioned_game",
      "scrimmage",
      "reflection",
    ],
  );
  assert.equal(
    practice.sections.reduce(
      (sum, section) => sum + section.durationMinutes,
      0,
    ),
    75,
  );
  assert.ok(
    practice.sections
      .filter((section) => section.kind !== "reflection")
      .every((section) => Boolean(section.drillId)),
  );
  assert.equal(practice.generatedBy, "deterministic");
});

test("practice generator does not recommend unavailable equipment", () => {
  const practice = generateDeterministicPractice(catalog, {
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    durationMinutes: 60,
    playerCount: 12,
    goalkeeperCount: 0,
    primaryGoalIds: ["u12-control-across-surfaces"],
    availableEquipment: ["balls", "cones"],
    fieldSize: { length: 20, width: 20, unit: "yards" },
  });
  const selectedDrills = practice.sections
    .map((section) =>
      ACADEMY_DRILL_CATALOG.find((drill) => drill.id === section.drillId),
    )
    .filter((drill) => Boolean(drill));
  assert.ok(
    selectedDrills.every((drill) =>
      drill!.equipment.every((item) => ["balls", "cones"].includes(item)),
    ),
  );
});

test("game plan uses selected goals and confirmed previous evidence", () => {
  const plan = generateDeterministicGamePlan(catalog, {
    ageBand: "U11-U12",
    selectedGoalIds: ["u12-support-angle-distance"],
    previousGameEvidenceTagIds: [
      "u12-scan-before-receiving-evidence-improvement",
    ],
    opponentNotes: "Opponent presses with two players.",
    formationName: "3-2-3",
  });
  assert.deepEqual(plan.selectedGoalIds, ["u12-support-angle-distance"]);
  assert.deepEqual(plan.evidenceGoalIds, ["u12-scan-before-receiving"]);
  assert.ok(plan.pregameObjectives.length > 0);
  assert.ok(plan.coachingFocus.length > 0);
  assert.ok(plan.warmUpFocus.length > 0);
  assert.ok(plan.transitionEmphasis.length > 0);
  assert.ok(plan.benchReminders.length > 0);
  assert.ok(plan.halftimeDiscussionPoints.length > 0);
  assert.ok(plan.postgameReflectionPrompts.length > 0);
  assert.match(plan.formationNotes?.[0] ?? "", /3-2-3/);
});

test("optional language enhancement cannot change graph authority", async () => {
  const practice = generateDeterministicPractice(catalog, {
    academyPresetId: "u12-9v9",
    ageBand: "U11-U12",
    durationMinutes: 45,
    playerCount: 12,
    goalkeeperCount: 1,
    primaryGoalIds: ["u12-pass-weight-accuracy"],
  });
  const rewritten = await enhancePracticeLanguage(
    practice,
    async (draft) => ({ ...draft, title: `Coach version · ${draft.title}` }),
    { audience: "coach", tone: "concise" },
  );
  assert.match(rewritten.title, /Coach version/);
  await assert.rejects(
    enhancePracticeLanguage(
      practice,
      async (draft) => ({
        ...draft,
        primaryGoalIds: ["u12-delay-and-show"],
      }),
      { audience: "coach" },
    ),
    /authoritative/,
  );

  const gamePlan = generateDeterministicGamePlan(catalog, {
    ageBand: "U11-U12",
    selectedGoalIds: ["u12-pass-weight-accuracy"],
  });
  await assert.rejects(
    enhanceGamePlanLanguage(
      gamePlan,
      async (draft) => ({ ...draft, selectedGoalIds: [] }),
      { audience: "coach" },
    ),
    /authoritative/,
  );
});

