import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

const RULES = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
const PROJECT_ID = "film-room-rules-test";
const HAS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeRules = HAS_EMULATOR ? describe : describe.skip;

let testEnv: RulesTestEnvironment | undefined;

describeRules("firestore rules (emulator)", () => {
  before(async () => {
    const [host, portRaw] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(
      ":",
    );
    const port = Number(portRaw ?? 8080);
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: RULES,
        host,
        port,
      },
    });
  });

  beforeEach(async () => {
    await testEnv!.clearFirestore();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  async function seedTeam(teamId: string, uid: string) {
    await testEnv!.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "teams", teamId), {
        name: "Test Team",
        ownerId: uid,
        members: { [uid]: "admin" },
        memberUids: [uid],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  }

  async function seedGame(
    gameId: string,
    data: Record<string, unknown>,
  ) {
    await testEnv!.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "games", gameId), {
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ...data,
      });
    });
  }

  describe("team creation", () => {
    it("allows authenticated user to create a team", async () => {
      const uid = "coach-uid";
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        setDoc(doc(db, "teams", "team-1"), {
          name: "Test Team",
          ownerId: uid,
          members: { [uid]: "admin" },
          memberUids: [uid],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );
    });

    it("denies create when ownerId does not match auth uid", async () => {
      const db = testEnv!.authenticatedContext("coach-uid").firestore();

      await assertFails(
        setDoc(doc(db, "teams", "team-1"), {
          name: "Test Team",
          ownerId: "other-uid",
          members: { "other-uid": "admin" },
          memberUids: ["other-uid"],
        }),
      );
    });

    it("denies unauthenticated team create", async () => {
      const db = testEnv!.unauthenticatedContext().firestore();

      await assertFails(
        setDoc(doc(db, "teams", "team-1"), {
          name: "Test Team",
          ownerId: "coach-uid",
          members: { "coach-uid": "admin" },
          memberUids: ["coach-uid"],
        }),
      );
    });
  });

  describe("team query reads", () => {
    it("owner can query teams by memberUids", async () => {
      const uid = "coach-uid";
      await seedTeam("team-1", uid);
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        getDocs(
          query(collection(db, "teams"), where("memberUids", "array-contains", uid)),
        ),
      );
    });

    it("non-member cannot read team doc", async () => {
      await seedTeam("team-1", "coach-uid");
      const db = testEnv!.authenticatedContext("other-uid").firestore();

      await assertFails(getDoc(doc(db, "teams", "team-1")));
    });

    it("non-member cannot query another user teams", async () => {
      await seedTeam("team-1", "coach-uid");
      const db = testEnv!.authenticatedContext("other-uid").firestore();

      await assertFails(
        getDocs(
          query(
            collection(db, "teams"),
            where("memberUids", "array-contains", "coach-uid"),
          ),
        ),
      );
    });
  });

  describe("roster import", () => {
    it("allows team owner to create players and parent invite targets", async () => {
      const uid = "coach-uid";
      const teamId = "team-1";
      await seedTeam(teamId, uid);
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        setDoc(doc(db, "teams", teamId, "players", "player-1"), {
          name: "Alex Smith",
          jerseyNumber: "7",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );

      await assertSucceeds(
        setDoc(doc(db, "teams", teamId, "parentInviteTargets", "parent-1"), {
          parentName: "Jane Smith",
          email: "jane@example.com",
          playerId: "player-1",
          playerName: "Alex Smith",
          status: "not_invited",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      );
    });
  });

  describe("game query reads", () => {
    it("contributor can query games by memberUids", async () => {
      const uid = "editor-uid";
      await seedGame("game-1", {
        title: "vs Hawks",
        ownerId: uid,
        contributors: { [uid]: "owner" },
        memberUids: [uid],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(
        getDocs(
          query(collection(db, "games"), where("memberUids", "array-contains", uid)),
        ),
      );
    });

    it("standalone game contributor can read own game", async () => {
      const uid = "editor-uid";
      await seedGame("game-1", {
        title: "vs Hawks",
        ownerId: uid,
        contributors: { [uid]: "editor" },
        memberUids: [uid],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext(uid).firestore();

      await assertSucceeds(getDoc(doc(db, "games", "game-1")));
    });

    it("authenticated user can read public game", async () => {
      await seedGame("game-public", {
        title: "Public scrimmage",
        ownerId: "owner-uid",
        contributors: { "owner-uid": "owner" },
        memberUids: ["owner-uid"],
        visibility: "public",
      });
      const db = testEnv!.authenticatedContext("viewer-uid").firestore();

      await assertSucceeds(getDoc(doc(db, "games", "game-public")));
    });

    it("authenticated user can read link game", async () => {
      await seedGame("game-link", {
        title: "Link share",
        ownerId: "owner-uid",
        contributors: { "owner-uid": "owner" },
        memberUids: ["owner-uid"],
        visibility: "link",
      });
      const db = testEnv!.authenticatedContext("viewer-uid").firestore();

      await assertSucceeds(getDoc(doc(db, "games", "game-link")));
    });

    it("non-member cannot read private game", async () => {
      await seedGame("game-private", {
        title: "Private",
        ownerId: "owner-uid",
        contributors: { "owner-uid": "owner" },
        memberUids: ["owner-uid"],
        visibility: "private",
      });
      const db = testEnv!.authenticatedContext("other-uid").firestore();

      await assertFails(getDoc(doc(db, "games", "game-private")));
    });
  });
});
