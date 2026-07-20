import {
  collection,
  getDocs,
  writeBatch,
  type CollectionReference,
  type DocumentData,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export const TEAM_ACADEMY_COLLECTIONS = {
  plans: "academyPlans",
  assignments: "academyAssignments",
  quizAssignments: "academyQuizAssignments",
  goalEvidence: "academyGoalEvidence",
  filmEvidence: "academyFilmEvidence",
  templates: "academyTemplates",
  recommendationState: "academyRecommendationState",
} as const;

export const ACADEMY_PLAN_SUBCOLLECTIONS = [
  "blocks",
  "weeks",
  "practices",
] as const;

async function deleteCollection(
  ref: CollectionReference<DocumentData>,
): Promise<void> {
  const snapshot = await getDocs(ref);
  if (snapshot.empty) return;
  const batch = writeBatch(firestore);
  for (const document of snapshot.docs) batch.delete(document.ref);
  await batch.commit();
}

/** Removes team-owned Academy records without touching built-in app content. */
export async function deleteAllTeamAcademyData(teamId: string): Promise<void> {
  const plans = await getDocs(
    collection(firestore, "teams", teamId, TEAM_ACADEMY_COLLECTIONS.plans),
  );
  for (const plan of plans.docs) {
    for (const subcollection of ACADEMY_PLAN_SUBCOLLECTIONS) {
      await deleteCollection(collection(plan.ref, subcollection));
    }
  }
  await deleteCollection(
    collection(firestore, "teams", teamId, TEAM_ACADEMY_COLLECTIONS.plans),
  );
  for (const collectionName of [
    TEAM_ACADEMY_COLLECTIONS.assignments,
    TEAM_ACADEMY_COLLECTIONS.quizAssignments,
    TEAM_ACADEMY_COLLECTIONS.goalEvidence,
    TEAM_ACADEMY_COLLECTIONS.filmEvidence,
    TEAM_ACADEMY_COLLECTIONS.templates,
    TEAM_ACADEMY_COLLECTIONS.recommendationState,
  ]) {
    await deleteCollection(
      collection(firestore, "teams", teamId, collectionName),
    );
  }
}
