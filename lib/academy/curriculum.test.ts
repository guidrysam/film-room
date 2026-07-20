import assert from "node:assert/strict";
import test from "node:test";
import { validateAcademyCurriculum } from "@/lib/academy/curriculum-validation";
import {
  createClubCurriculumCopy,
  U12_DEVELOPMENT_CURRICULUM_SHELL,
} from "@/lib/academy/u12-curriculum-shell";
import type { AcademyCurriculum } from "@/lib/academy/types";

test("U12 curriculum shell validates with 40 core lessons and player-outcome blocks", () => {
  const validation = validateAcademyCurriculum(U12_DEVELOPMENT_CURRICULUM_SHELL);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.valid, true);

  const shell = U12_DEVELOPMENT_CURRICULUM_SHELL;
  assert.equal(shell.trainingBlocks.length, 11);
  assert.equal(shell.defaults.coreLessonCount, 40);
  assert.equal(shell.defaults.flexibleWeekCount, 10);
  assert.deepEqual(shell.defaults.clubIdentityFlexPercent, {
    min: 10,
    max: 15,
  });
  assert.deepEqual(
    shell.trainingBlocks.map((block) => block.title),
    [
      "Own the Ball",
      "See the Next Play",
      "Keep the Ball Moving",
      "Beat and Protect",
      "Create and Finish",
      "Defend with Purpose",
      "First Actions After the Ball Changes",
      "Stretch and Connect",
      "Solve the Press",
      "Read and Talk the Game",
      "Play the Game",
    ],
  );
  assert.ok(shell.conceptSpirals.length >= 8);
});

test("published open-body package is pinned as sequence lesson 5", () => {
  const block2 = U12_DEVELOPMENT_CURRICULUM_SHELL.trainingBlocks.find(
    (block) => block.id === "u12-curr-block-02-see-next-play",
  );
  const openBody = block2?.learningSequences[0]?.slots.find(
    (slot) => slot.lessonId === "academy-lesson-receive-open-body",
  );
  assert.equal(openBody?.lessonPackageId, "academy-package-receive-open-body");
  assert.match(openBody?.notes ?? "", /do not replace/i);
});

test("transition habits are woven after the first block with an emphasis period", () => {
  const [first, ...rest] = U12_DEVELOPMENT_CURRICULUM_SHELL.trainingBlocks;
  assert.ok(first.transitionHabits.length > 0);
  for (const block of rest) {
    assert.ok(block.transitionHabits.length > 0);
  }
  const emphasis = U12_DEVELOPMENT_CURRICULUM_SHELL.trainingBlocks.find(
    (block) => block.id === "u12-curr-block-07-first-actions",
  );
  assert.equal(emphasis?.title, "First Actions After the Ball Changes");
});

test("club copies carry source curriculum version identity", () => {
  const copy = createClubCurriculumCopy({
    clubId: "club-possession-fc",
    source: U12_DEVELOPMENT_CURRICULUM_SHELL,
    id: "club-possession-fc-u12-v1",
  });
  assert.deepEqual(copy.ownership, {
    kind: "club",
    clubId: "club-possession-fc",
    sourceCurriculumId: "film-room-u12-development-v1",
    sourceVersion: 1,
  });
  assert.equal(validateAcademyCurriculum(copy).valid, true);
});

test("rejects curricula below the declared core lesson count", () => {
  const broken: AcademyCurriculum = {
    ...U12_DEVELOPMENT_CURRICULUM_SHELL,
    trainingBlocks: U12_DEVELOPMENT_CURRICULUM_SHELL.trainingBlocks.slice(0, 1),
  };
  const validation = validateAcademyCurriculum(broken);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("expected 40 core")));
});

test("rejects club ownership without source version", () => {
  const broken: AcademyCurriculum = {
    ...U12_DEVELOPMENT_CURRICULUM_SHELL,
    ownership: {
      kind: "club",
      clubId: "club-x",
      sourceCurriculumId: "film-room-u12-development-v1",
      sourceVersion: 0,
    },
  };
  const validation = validateAcademyCurriculum(broken);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("sourceVersion")));
});

test("accepts optional calendar mapping over learning-sequence slots", () => {
  const withCalendar: AcademyCurriculum = {
    ...U12_DEVELOPMENT_CURRICULUM_SHELL,
    calendarSlots: [
      {
        id: "u12-cal-week-01",
        order: 1,
        label: "Week 1",
        trainingBlockId: "u12-curr-block-01-own-the-ball",
        learningSequenceId: "u12-curr-block-01-own-the-ball-seq-01",
        sequenceSlotOrder: 1,
      },
    ],
  };
  assert.equal(validateAcademyCurriculum(withCalendar).valid, true);

  const badCalendar: AcademyCurriculum = {
    ...withCalendar,
    calendarSlots: [
      {
        id: "u12-cal-bad",
        order: 1,
        label: "Week X",
        trainingBlockId: "missing-block",
        learningSequenceId: "missing-seq",
        sequenceSlotOrder: 1,
      },
    ],
  };
  assert.equal(validateAcademyCurriculum(badCalendar).valid, false);
});
