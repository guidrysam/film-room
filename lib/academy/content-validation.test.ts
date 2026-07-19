import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAssignmentTemplate,
  validatePracticeTemplate,
  validateQuizQuestion,
} from "@/lib/academy/validation";
import type {
  AcademyAssignmentTemplate,
  AcademyPracticeTemplate,
  AcademyQuizQuestion,
} from "@/lib/academy/types";

const editorial = {
  status: "draft" as const,
  originalWording: true,
  originalDiagram: true,
  generatedWithAssistance: true,
};

test("validates a progressive practice with exact minutes and a game", () => {
  const practice: AcademyPracticeTemplate = {
    id: "practice-1",
    title: "Scan and receive",
    summary: "Progress from ball work to game decisions.",
    ageBands: ["U11-U12"],
    formats: ["9v9"],
    durationMinutes: 45,
    primaryGoalIds: ["goal-scan"],
    supportingGoalIds: ["goal-receive"],
    activities: [
      {
        id: "arrival",
        order: 0,
        role: "arrival",
        plannedMinutes: 10,
        drillId: "arrival-1",
        objective: "Scan while controlling the ball.",
      },
      {
        id: "game",
        order: 1,
        role: "small_sided_game",
        plannedMinutes: 30,
        drillId: "game-1",
        objective: "Apply scanning before receiving.",
      },
      {
        id: "review",
        order: 2,
        role: "review",
        plannedMinutes: 5,
        objective: "Reflect on useful scans.",
      },
    ],
    coachIntroduction: ["Today we scan before receiving."],
    reviewQuestions: ["What did you see before the ball arrived?"],
    requiredEquipment: ["balls", "cones"],
    editorial,
  };
  assert.equal(validatePracticeTemplate(practice).valid, true);
  practice.activities[1]!.plannedMinutes = 29;
  assert.equal(validatePracticeTemplate(practice).valid, false);
});

test("validates quiz answers and goal-linked assignments", () => {
  const question: AcademyQuizQuestion = {
    id: "question-1",
    questionType: "multiple_choice",
    prompt: "When should you scan?",
    ageBands: ["U11-U12"],
    goalIds: ["goal-scan"],
    options: [
      { id: "before", label: "Before the ball arrives" },
      { id: "after", label: "Only after controlling it" },
    ],
    correctOptionIds: ["before"],
    explanation: "Early information improves the first touch.",
    editorial,
  };
  assert.equal(validateQuizQuestion(question).valid, true);
  question.correctOptionIds = ["missing"];
  assert.equal(validateQuizQuestion(question).valid, false);

  const assignment: AcademyAssignmentTemplate = {
    id: "assignment-1",
    version: 1,
    title: "Find two scans",
    description: "Identify scanning before receiving in an assigned clip.",
    assignmentType: "watch_clip",
    ageBands: ["U11-U12"],
    goalIds: ["goal-scan"],
    instructions: ["Watch the clip.", "Record two examples."],
    sourceProvenance: [],
    editorial,
  };
  assert.equal(validateAssignmentTemplate(assignment).valid, true);
});
